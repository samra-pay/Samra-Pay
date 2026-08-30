import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT?.trim();
const port = rawPort ? Number(rawPort) : 5000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH?.trim() || '/';
const webSurface = process.env.SAMRA_WEB_SURFACE?.trim() || 'public';

if (webSurface !== 'public' && webSurface !== 'legacy') {
  throw new Error('SAMRA_WEB_SURFACE must be either "public" or "legacy".');
}

const legacyEntryPlugin = {
  name: 'samra-web-surface-entry',
  transformIndexHtml: {
    order: 'pre' as const,
    handler(html: string) {
      if (webSurface === 'public') return html;
      return html.replace('src="/src/main.tsx"', 'src="/src/main-legacy.tsx"');
    },
  },
};

const publicBundleBoundaryPlugin = {
  name: 'samra-public-bundle-boundary',
  generateBundle(
    _options: unknown,
    bundle: Record<string, { type: string; modules?: Record<string, unknown> }>,
  ) {
    if (webSurface === 'legacy') return;
    const forbiddenModules = [
      /\/src\/App\.tsx$/u,
      /\/src\/main-legacy\.tsx$/u,
      /\/src\/pages\/onboarding\.tsx$/u,
      /\/src\/lib\/customer-auth\.tsx$/u,
      /\/node_modules\/@auth0\/auth0-spa-js\//u,
    ];
    const violations = Object.values(bundle)
      .filter((output) => output.type === 'chunk')
      .flatMap((output) => Object.keys(output.modules ?? {}))
      .filter((moduleId) =>
        forbiddenModules.some((pattern) => pattern.test(moduleId)),
      );
    if (violations.length > 0) {
      throw new Error(
        `Public bundle includes forbidden legacy modules:\n${violations.join('\n')}`,
      );
    }
  },
};

export default defineConfig({
  base: basePath,
  plugins: [
    legacyEntryPlugin,
    publicBundleBoundaryPlugin,
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions:
      webSurface === 'legacy'
        ? {
            output: {
              manualChunks: {
                'auth0-client': ['@auth0/auth0-spa-js'],
              },
            },
          }
        : undefined,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
