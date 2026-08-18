import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const designRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: designRoot,
  encoding: "utf8",
}).trim();
const designRelative = path
  .relative(repositoryRoot, designRoot)
  .replaceAll("\\", "/");
const tracked = execFileSync("git", ["ls-files", "--", designRelative], {
  cwd: repositoryRoot,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .map((file) => path.posix.relative(designRelative, file));

const prohibited = tracked.filter((file) => {
  const normalized = file.toLowerCase();
  return (
    normalized.endsWith(".tsbuildinfo") ||
    normalized.startsWith("dist/") ||
    normalized.endsWith(".zip") ||
    normalized.endsWith(".tgz") ||
    normalized.endsWith(".tar.gz")
  );
});

if (prohibited.length > 0) {
  throw new Error(
    `Generated or archived design files are tracked:\n${prohibited
      .map((file) => `- ${file}`)
      .join("\n")}`,
  );
}

const required = [
  "tokens.json",
  "src/index.css",
  "src/preview/DesignSystemBrowser.tsx",
  "scripts/build-tokens.mjs",
];

for (const file of required) {
  await access(path.join(designRoot, file));
}

const packageJson = JSON.parse(
  await readFile(path.join(designRoot, "package.json"), "utf8"),
);
const explicitExports = Object.entries(packageJson.exports ?? {}).filter(
  ([key, target]) =>
    !key.includes("*") && typeof target === "string" && !target.includes("*"),
);

for (const [key, target] of explicitExports) {
  if (!target.startsWith("./") || target.startsWith("./dist/")) {
    throw new Error(
      `Design-system export ${key} has an invalid target: ${target}`,
    );
  }
  const resolvedTarget = path.resolve(designRoot, target);
  if (!resolvedTarget.startsWith(`${designRoot}${path.sep}`)) {
    throw new Error(
      `Design-system export ${key} escapes the package: ${target}`,
    );
  }
  await access(resolvedTarget);
}

console.log(
  JSON.stringify({
    event: "design_source_boundary_verified",
    explicitExports: explicitExports.length,
    trackedFiles: tracked.length,
  }),
);
