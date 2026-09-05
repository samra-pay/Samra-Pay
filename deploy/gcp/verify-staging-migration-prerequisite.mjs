import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyPublicationManifest } from "./record-staging-image-publication.mjs";
import { verifyGitHubUpstreamArtifact } from "./verify-github-upstream-artifact.mjs";
import {
  hash,
  verifyMigrationManifest,
} from "./staging-migration-evidence.mjs";

try {
  const e = process.env;
  const publication = await verifyPublicationManifest(
    e.SAMRA_STAGING_PUBLICATION_MANIFEST,
    e.SAMRA_STAGING_PUBLICATION_HASH,
  );
  assert(
    publication.candidateSha === e.SAMRA_GCP_EXPECTED_SHA,
    "Wrong publication candidate",
  );
  await verifyGitHubUpstreamArtifact({
    kind: "staging-migration",
    candidateSha: e.SAMRA_GCP_EXPECTED_SHA,
    runId: e.SAMRA_PREREQUISITE_RUN_ID,
    runAttempt: e.SAMRA_PREREQUISITE_RUN_ATTEMPT,
    artifactName: e.SAMRA_PREREQUISITE_ARTIFACT_NAME,
  });
  await verifyMigrationManifest(
    e.SAMRA_STAGING_PREREQUISITE_MANIFEST,
    e.SAMRA_STAGING_PREREQUISITE_HASH,
    {
      publication,
      publicationHash: hash(
        await readFile(e.SAMRA_STAGING_PUBLICATION_MANIFEST),
      ),
      candidateSha: e.SAMRA_GCP_EXPECTED_SHA,
      runId: e.SAMRA_PREREQUISITE_RUN_ID,
      runAttempt: e.SAMRA_PREREQUISITE_RUN_ATTEMPT,
    },
  );
  console.log(
    "Governed same-candidate migration prerequisite verified; deployment remains separately authorized.",
  );
} catch {
  console.error(
    "STOP: migration prerequisite does not match this staging candidate, publication, or governed run.",
  );
  process.exitCode = 1;
}
