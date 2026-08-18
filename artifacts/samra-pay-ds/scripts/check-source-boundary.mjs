import { execFileSync } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const designRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function listPackageFiles(directory, root = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listPackageFiles(entryPath, root)));
    } else {
      files.push(path.relative(root, entryPath).replaceAll("\\", "/"));
    }
  }
  return files;
}

let boundaryMode = "git";
let inspectedFiles;
try {
  const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: designRoot,
    encoding: "utf8",
  }).trim();
  const designRelative = path
    .relative(repositoryRoot, designRoot)
    .replaceAll("\\", "/");
  inspectedFiles = execFileSync("git", ["ls-files", "--", designRelative], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .map((file) => path.posix.relative(designRelative, file));
} catch {
  boundaryMode = "filesystem";
  inspectedFiles = await listPackageFiles(designRoot);
}

const prohibited = inspectedFiles.filter((file) => {
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
    boundaryMode,
    explicitExports: explicitExports.length,
    inspectedFiles: inspectedFiles.length,
  }),
);
