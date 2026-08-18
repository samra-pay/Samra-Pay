import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const artifactRoot = path.resolve(
  process.env.SAMRA_CONTAINER_SMOKE_ARTIFACTS ?? "artifacts/container-smoke",
);
const imageTag = process.env.SAMRA_CONTAINER_IMAGE_TAG ?? "unknown";

await mkdir(artifactRoot, { recursive: true });

const pendingEvidence = {
  schemaVersion: 1,
  status: "incomplete",
  imageTag,
  reason: "Container build or runtime smoke did not complete.",
};

const pendingJUnit = `<?xml version="1.0" encoding="utf-8"?>
<testsuites name="Container Portability" tests="1" failures="1" errors="0">
  <testsuite name="Google Cloud Container Portability" tests="1" failures="1" errors="0">
    <testcase classname="Google Cloud Container Portability" name="Five-image migration and runtime smoke">
      <failure message="Container build or runtime smoke did not complete"/>
    </testcase>
  </testsuite>
</testsuites>
`;

await Promise.all([
  writeFile(
    path.join(artifactRoot, "container-portability.json"),
    `${JSON.stringify(pendingEvidence, null, 2)}\n`,
  ),
  writeFile(path.join(artifactRoot, "container-portability.xml"), pendingJUnit),
]);
