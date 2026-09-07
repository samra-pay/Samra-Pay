import { readFile, unlink } from "node:fs/promises";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT?.trim();
const port = rawPort ? Number(rawPort) : 5000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH?.trim() || "/";
const webSurface = process.env.SAMRA_WEB_SURFACE?.trim() || "public";

if (webSurface !== "public" && webSurface !== "legacy") {
  throw new Error('SAMRA_WEB_SURFACE must be either "public" or "legacy".');
}

const legacyEntryPlugin = {
  name: "samra-web-surface-entry",
  async generateBundle() {
    if (webSurface !== "legacy") return;
    // This notice belongs to the customer wallet composition. Do not copy
    // customer-only artifacts into the isolated public marketing bundle.
    this.emitFile({
      type: "asset",
      fileName: "licenses/crossmint-fintech-starter.txt",
      source: await readFile(
        path.resolve(
          import.meta.dirname,
          "licenses/crossmint-fintech-starter.txt",
        ),
        "utf8",
      ),
    });
  },
  transformIndexHtml: {
    order: "pre" as const,
    handler(html: string) {
      if (webSurface === "public") {
        const publicHtml = html.replace(
          /^\s*<script src="\/samra-runtime-config\.js"><\/script>\s*$/mu,
          "",
        );
        if (publicHtml === html) {
          throw new Error(
            "Public build could not remove the legacy runtime-config script.",
          );
        }
        return publicHtml;
      }
      return html.replace('src="/src/main.tsx"', 'src="/src/main-legacy.tsx"');
    },
  },
  async writeBundle(outputOptions) {
    if (webSurface === "legacy") return;
    if (!outputOptions.dir) {
      throw new Error("Public build requires a directory output.");
    }

    try {
      await unlink(path.resolve(outputOptions.dir, "samra-runtime-config.js"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  },
} satisfies Plugin;

const publicBundleBoundaryPlugin = {
  name: "samra-public-bundle-boundary",
  generateBundle(
    _options: unknown,
    bundle: Record<string, { type: string; modules?: Record<string, unknown> }>,
  ) {
    if (webSurface === "legacy") return;
    const forbiddenModules = [
      /\/lib\/launch-updates\//u,
      /\/src\/App\.tsx$/u,
      /\/src\/main-legacy\.tsx$/u,
      /\/src\/pages\/onboarding\.tsx$/u,
      /\/src\/lib\/customer-auth\.tsx$/u,
      /\/node_modules\/@auth0\/auth0-spa-js\//u,
    ];
    const violations = Object.values(bundle)
      .filter((output) => output.type === "chunk")
      .flatMap((output) => Object.keys(output.modules ?? {}))
      .filter((moduleId) =>
        forbiddenModules.some((pattern) => pattern.test(moduleId)),
      );
    if (violations.length > 0) {
      throw new Error(
        `Public bundle includes forbidden legacy modules:\n${violations.join("\n")}`,
      );
    }
  },
};

const publicPreloadPlugin = {
  name: "samra-public-preloads",
  transformIndexHtml: {
    order: "post",
    handler(html, context) {
      if (webSurface === "legacy") return html;
      if (!context.bundle) return html;

      const outputs = Object.values(context.bundle);
      const homeChunks = outputs.filter(
        (output) =>
          output.type === "chunk" &&
          output.facadeModuleId?.endsWith("/src/pages/home.tsx"),
      );
      if (homeChunks.length !== 1) {
        throw new Error(
          `Public build requires exactly one home route chunk; found ${homeChunks.length}.`,
        );
      }

      const resolveHeroAsset = (width: number) => {
        const sourceName = `hero-woman-coffee-${width}.avif`;
        const matches = outputs.filter(
          (output) =>
            output.type === "asset" &&
            (output.names.includes(sourceName) ||
              output.originalFileNames.some((fileName) =>
                fileName.endsWith(
                  `/src/assets/coming-soon/generated/${sourceName}`,
                ),
              )),
        );
        if (matches.length !== 1) {
          throw new Error(
            `Public build requires exactly one ${sourceName} asset; found ${matches.length}.`,
          );
        }
        return matches[0]!.fileName;
      };

      const publicUrl = (fileName: string) =>
        `${basePath.endsWith("/") ? basePath : `${basePath}/`}${fileName.replace(/^\/+/, "")}`;
      const heroAssets = [640, 960, 1200].map((width) => ({
        width,
        url: publicUrl(resolveHeroAsset(width)),
      }));

      return {
        html,
        tags: [
          {
            tag: "link",
            attrs: {
              rel: "preload",
              as: "image",
              type: "image/avif",
              fetchpriority: "high",
              href: heroAssets.at(-1)!.url,
              imagesrcset: heroAssets
                .map(({ width, url }) => `${url} ${width}w`)
                .join(", "),
              imagesizes: "(max-width: 860px) 100vw, 50vw",
            },
            injectTo: "head-prepend",
          },
          {
            tag: "link",
            attrs: {
              rel: "modulepreload",
              crossorigin: true,
              href: publicUrl(homeChunks[0]!.fileName),
            },
            injectTo: "head",
          },
        ],
      };
    },
  },
} satisfies Plugin;

export default defineConfig({
  base: basePath,
  plugins: [
    legacyEntryPlugin,
    publicBundleBoundaryPlugin,
    publicPreloadPlugin,
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions:
      webSurface === "legacy"
        ? {
            output: {
              manualChunks: {
                "auth0-client": ["@auth0/auth0-spa-js"],
              },
            },
          }
        : undefined,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
