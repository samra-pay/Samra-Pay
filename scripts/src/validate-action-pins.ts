#!/usr/bin/env tsx

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const WORKFLOW_DIRECTORY = path.join(WORKSPACE_ROOT, ".github/workflows");
const DEPLOY_DIRECTORY = path.join(WORKSPACE_ROOT, "deploy/gcp");

const remoteActionPattern =
  /^(?<repository>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.\/-]+)?)@(?<reference>[^\s#]+)$/u;
const dockerDigestPattern = /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/u;
const imageDigestPattern = /^[^\s@]+@sha256:[0-9a-f]{64}$/u;

export type WorkflowSource = Readonly<{
  path: string;
  contents: string;
}>;

export function validateActionPins(workflows: readonly WorkflowSource[]): void {
  const violations: string[] = [];

  for (const workflow of workflows) {
    const lines = workflow.contents.split("\n");
    let dockerfileFrontendCount = 0;
    for (const [index, line] of lines.entries()) {
      const location = `${workflow.path}:${index + 1}`;
      const syntaxMatch = /^#\s*syntax=([^\s]+)/u.exec(line);
      if (syntaxMatch) {
        dockerfileFrontendCount += 1;
        if (!imageDigestPattern.test(syntaxMatch[1]!)) {
          violations.push(
            `${location}: Dockerfile frontend is not pinned by SHA-256 digest`,
          );
        }
        continue;
      }

      const fromMatch = /^\s*FROM(?:\s+--platform=[^\s]+)?\s+([^\s]+)/iu.exec(
        line,
      );
      if (fromMatch) {
        const image = fromMatch[1]!;
        if (image !== "scratch" && !imageDigestPattern.test(image)) {
          violations.push(
            `${location}: Dockerfile base image is not pinned by SHA-256 digest`,
          );
        }
        continue;
      }

      const imageMatch = /^\s*(?:image|container):\s*([^\s#]+)/u.exec(line);
      if (imageMatch) {
        const image = imageMatch[1]!;
        if (!imageDigestPattern.test(image)) {
          violations.push(
            `${location}: container image is not pinned by SHA-256 digest`,
          );
        }
        continue;
      }

      const actionMatch = /^\s*(?:-\s*)?uses:\s*([^\s#]+)/u.exec(line);
      if (!actionMatch) continue;

      const action = actionMatch[1]!;
      if (action.startsWith("./")) {
        violations.push(
          `${location}: local actions are forbidden until nested action dependencies are recursively verified`,
        );
        continue;
      }

      if (action.startsWith("docker://")) {
        if (!dockerDigestPattern.test(action)) {
          violations.push(
            `${location}: Docker action is not pinned by SHA-256 digest`,
          );
        }
        continue;
      }

      const remote = remoteActionPattern.exec(action);
      if (!remote?.groups) {
        violations.push(
          `${location}: malformed remote action reference ${action}`,
        );
        continue;
      }
      if (!/^[0-9a-f]{40}$/u.test(remote.groups.reference!)) {
        violations.push(
          `${location}: ${remote.groups.repository} is not pinned to a full commit SHA`,
        );
      }
    }

    if (/^deploy\/gcp\/Dockerfile\./u.test(workflow.path)) {
      if (dockerfileFrontendCount !== 1) {
        violations.push(
          `${workflow.path}: Dockerfile must declare exactly one digest-pinned frontend`,
        );
      } else if (!/^#\s*syntax=/u.test(lines[0] ?? "")) {
        violations.push(
          `${workflow.path}: Dockerfile frontend must be the first line so BuildKit applies it`,
        );
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Immutable workflow dependency validation failed:\n${violations.map((violation) => `- ${violation}`).join("\n")}`,
    );
  }
}

export function readWorkflowSources(
  directory = WORKFLOW_DIRECTORY,
): readonly WorkflowSource[] {
  const workflows = fs
    .readdirSync(directory)
    .filter(
      (filename) => filename.endsWith(".yml") || filename.endsWith(".yaml"),
    )
    .sort()
    .map((filename) => ({
      path: path.relative(WORKSPACE_ROOT, path.join(directory, filename)),
      contents: fs.readFileSync(path.join(directory, filename), "utf8"),
    }));
  const dockerfiles = fs
    .readdirSync(DEPLOY_DIRECTORY)
    .filter((filename) => filename.startsWith("Dockerfile."))
    .map((filename) => ({
      path: path.relative(
        WORKSPACE_ROOT,
        path.join(DEPLOY_DIRECTORY, filename),
      ),
      contents: fs.readFileSync(path.join(DEPLOY_DIRECTORY, filename), "utf8"),
    }));
  return [...workflows, ...dockerfiles].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function main(): void {
  const workflows = readWorkflowSources();
  validateActionPins(workflows);
  process.stdout.write(
    `${JSON.stringify({ status: "passed", check: "immutable-workflow-dependencies", sourceCount: workflows.length })}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
