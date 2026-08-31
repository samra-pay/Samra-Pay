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
});
