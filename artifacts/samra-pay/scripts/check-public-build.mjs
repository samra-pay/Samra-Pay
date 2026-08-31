import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const forbiddenFileNames = [
  /(?:^|\/)(?:App|auth0-client|onboarding)-[^/]+\.(?:css|js)$/iu,
];

const forbiddenBundleContent = [
  /auth0-spa-js/iu,
  /Continue with Auth0/iu,
  /Loading secure onboarding/iu,
  /Start synthetic onboarding/iu,
  /Synthetic backend identity/iu,
  /\/api\/v1\/waitlist\/subscriptions/iu,
  /Email address · preview only/iu,
  /Preview Alpha signup/iu,
];

const inspectableExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".svg",
  ".txt",
  ".webmanifest",
]);

async function listFiles(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
    }),
  );
  return nested.flat();
}

export async function inspectPublicBuild(directory) {
  const root = path.resolve(directory);
  const files = await listFiles(root);
  const violations = [];

  for (const file of files) {
    const relativePath = path.relative(root, file).split(path.sep).join("/");
    if (forbiddenFileNames.some((pattern) => pattern.test(relativePath))) {
      violations.push(`${relativePath}: legacy or authentication chunk name`);
    }

    if (!inspectableExtensions.has(path.extname(file).toLowerCase())) continue;
    const contents = await readFile(file, "utf8");
    for (const pattern of forbiddenBundleContent) {
      if (pattern.test(contents)) {
        violations.push(`${relativePath}: contains ${pattern.source}`);
      }
    }
  }

  return violations;
}

async function run() {
  const directory = path.resolve(process.argv[2] || "dist/public");
  const violations = await inspectPublicBuild(directory);

  if (violations.length > 0) {
    throw new Error(
      `Public build boundary failed:\n${violations.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({ status: "passed", check: "public-build-boundary" })}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
