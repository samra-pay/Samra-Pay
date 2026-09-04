import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectPublicBuild } from "../../scripts/check-public-build.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("public build boundary", () => {
  it("rejects Resend configuration, credential material and direct provider requests", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "samra-public-build-"));
    temporaryDirectories.push(root);
    await writeFile(
      path.join(root, "mail.js"),
      [
        'const RESEND_API_KEY = "re_synthetic_public_leak_test_fixture";',
        'const flag = "SAMRA_LAUNCH_UPDATES_TEST_APPROVAL_ID";',
        'fetch("https://api.resend.com/emails");',
      ].join("\n"),
    );
    await expect(inspectPublicBuild(root)).resolves.toEqual([
      "mail.js: contains \\bRESEND_API_KEY\\b",
      "mail.js: contains \\bSAMRA_LAUNCH_UPDATES_TEST_APPROVAL_ID\\b",
      "mail.js: contains Resend API credential",
      "mail.js: contains unexpected network origin https://api.resend.com",
    ]);
  });
  it("allows only the reviewed Google tag and privacy disclosure origins", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "samra-public-build-"));
    temporaryDirectories.push(root);
    await writeFile(path.join(root, "index.html"), '<script src="https://www.googletagmanager.com/gtag/js?id=G-T4THKMM4Y5"></script><a href="https://policies.google.com/technologies/partner-sites">Privacy</a>');
    await expect(inspectPublicBuild(root)).resolves.toEqual([]);
    await writeFile(path.join(root, "ads.js"), 'fetch("https://googleads.g.doubleclick.net/collect")');
    await expect(inspectPublicBuild(root)).resolves.toEqual(["ads.js: contains unexpected network origin https://googleads.g.doubleclick.net"]);
  });
  it("accepts a public-only distribution", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "samra-public-build-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "index.html"), "<main>Samra Pay</main>");
    await writeFile(
      path.join(root, "assets", "home-123.js"),
      'console.log("public preview")',
    );

    await expect(inspectPublicBuild(root)).resolves.toEqual([]);
  });

  it("rejects renamed auth code and known legacy chunks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "samra-public-build-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "assets"));
    await writeFile(
      path.join(root, "assets", "auth0-client-123.js"),
      "authentication bundle",
    );
    await writeFile(
      path.join(root, "assets", "vendor-456.js"),
      'const label = "Continue with Auth0";',
    );

    await expect(inspectPublicBuild(root)).resolves.toEqual([
      "assets/auth0-client-123.js: legacy or authentication chunk name",
      "assets/vendor-456.js: contains Continue with Auth0",
    ]);
  });

  it("rejects email collection from the static informational release", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "samra-public-build-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "assets"));
    await writeFile(
      path.join(root, "assets", "home-123.js"),
      'fetch("/api/v1/waitlist/subscriptions"); const label = "Preview Alpha signup";',
    );

    await expect(inspectPublicBuild(root)).resolves.toEqual([
      "assets/home-123.js: contains \\/api\\/v1\\/waitlist\\/subscriptions",
      "assets/home-123.js: contains Preview Alpha signup",
    ]);
  });

  it("rejects source maps, credentials, and sensitive deployment files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "samra-public-build-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "assets"));
    await writeFile(
      path.join(root, "assets", "home-123.js"),
      'const token = "ghp_123456789012345678901234567890"; //# sourceMappingURL=home.js.map',
    );
    await writeFile(path.join(root, "assets", "home.js.map"), "{}");
    await writeFile(
      path.join(root, "service-account.json"),
      '{"type":"service_account"}',
    );

    await expect(inspectPublicBuild(root)).resolves.toEqual([
      "assets/home-123.js: contains GitHub access token",
      "assets/home-123.js: contains a source-map reference",
      "assets/home.js.map: forbidden distribution path",
      "assets/home.js.map: unapproved distribution file type",
      "service-account.json: forbidden distribution path",
      "service-account.json: contains Google service-account credential",
    ]);
  });

  it("rejects unknown file types and unexpected network origins", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "samra-public-build-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "assets"));
    await writeFile(
      path.join(root, "assets", "home-123.js"),
      'fetch("https://tracking.example/collect")',
    );
    await writeFile(path.join(root, "debug.log"), "build output");

    await expect(inspectPublicBuild(root)).resolves.toEqual([
      "assets/home-123.js: contains unexpected network origin https://tracking.example",
      "debug.log: unapproved distribution file type",
    ]);
  });
});
