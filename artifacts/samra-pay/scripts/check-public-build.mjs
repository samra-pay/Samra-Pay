import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const forbiddenFileNames = [
  /(?:^|\/)(?:App|auth0-client|onboarding)-[^/]+\.(?:css|js)$/iu,
];

const forbiddenDistributionPaths = [
  /(?:^|\/)\.env(?:\..+)?$/iu,
  /(?:^|\/)(?:firebase|package)(?:-lock)?\.json$/iu,
  /(?:^|\/)\.firebaserc$/iu,
  /(?:^|\/)(?:credentials|secrets|service-account)(?:[^/]*)\.json$/iu,
  /(?:^|\/)firebase-adminsdk[^/]*\.json$/iu,
  /(?:^|\/)(?:id_rsa|id_ed25519)$/iu,
  /\.(?:key|map|p12|pem|pfx)$/iu,
];

const allowedDistributionExtensions = new Set([
  ".avif",
  ".css",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".png",
  ".svg",
  ".txt",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);

const forbiddenBundleContent = [
  /\bRESEND_API_KEY\b/u,
  /\bSAMRA_LAUNCH_UPDATES_TEST_APPROVAL_ID\b/u,
  /auth0-spa-js/iu,
  /Continue with Auth0/iu,
  /Loading secure onboarding/iu,
  /Start synthetic onboarding/iu,
  /Synthetic backend identity/iu,
  /Email address · preview only/iu,
  /Preview Alpha signup/iu,
];

const forbiddenCredentialContent = [
  {
    label: "Resend API credential",
    pattern: /\bre_[A-Za-z0-9_-]{20,}\b/u,
  },
  {
    label: "private key material",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/iu,
  },
  {
    label: "Google service-account credential",
    pattern: /["']type["']\s*:\s*["']service_account["']/iu,
  },
  {
    label: "GitHub access token",
    pattern: /\bgh[oprsu]_[A-Za-z0-9_]{20,}\b/u,
  },
  {
    label: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  },
  {
    label: "secret configuration",
    pattern:
      /\b(?:AUTH0_CLIENT_SECRET|CLIENT_SECRET|DATABASE_URL|FIREBASE_TOKEN|STRIPE_SECRET_KEY)\b\s*[:=]/iu,
  },
];

const allowedNetworkOrigins = new Set([
  // Verified public social profiles linked from the footer.
  "https://www.facebook.com",
  "https://www.instagram.com",
  "https://www.youtube.com",
  "https://x.com",
  "http://sodipodi.sourceforge.net",
  "http://www.inkscape.org",
  "http://www.w3.org",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://react.dev",
  "https://samrapay.com",
  "https://www.samrapay.com",
  "https://www.googletagmanager.com",
  "https://policies.google.com",
]);

const networkUrlPattern = /\bhttps?:\/\/[^\s"'<>`\\)]+/giu;

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

    if (
      forbiddenDistributionPaths.some((pattern) => pattern.test(relativePath))
    ) {
      violations.push(`${relativePath}: forbidden distribution path`);
    }

    const extension = path.extname(file).toLowerCase();
    if (!allowedDistributionExtensions.has(extension)) {
      violations.push(`${relativePath}: unapproved distribution file type`);
    }

    if (!inspectableExtensions.has(extension)) continue;
    const contents = await readFile(file, "utf8");
    for (const pattern of forbiddenBundleContent) {
      if (pattern.test(contents)) {
        violations.push(`${relativePath}: contains ${pattern.source}`);
      }
    }

    for (const { label, pattern } of forbiddenCredentialContent) {
      if (pattern.test(contents)) {
        violations.push(`${relativePath}: contains ${label}`);
      }
    }

    if (/sourceMappingURL\s*=/iu.test(contents)) {
      violations.push(`${relativePath}: contains a source-map reference`);
    }

    const unexpectedOrigins = new Set();
    for (const match of contents.matchAll(networkUrlPattern)) {
      try {
        const origin = new URL(match[0]).origin;
        if (!allowedNetworkOrigins.has(origin)) unexpectedOrigins.add(origin);
      } catch {
        violations.push(`${relativePath}: contains an invalid absolute URL`);
      }
    }
    for (const origin of [...unexpectedOrigins].sort()) {
      violations.push(
        `${relativePath}: contains unexpected network origin ${origin}`,
      );
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
