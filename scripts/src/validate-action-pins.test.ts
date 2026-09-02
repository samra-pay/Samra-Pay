import { describe, expect, it } from "vitest";

import {
  readWorkflowSources,
  validateActionPins,
} from "./validate-action-pins";

describe("immutable GitHub Action pins", () => {
  it("accepts full commit SHAs and Docker digests", () => {
    expect(() =>
      validateActionPins([
        {
          path: ".github/workflows/example.yml",
          contents: [
            `# syntax=docker/dockerfile:1.7@sha256:${"d".repeat(64)}`,
            `FROM node:24-bookworm-slim@sha256:${"e".repeat(64)} AS build`,
            "FROM scratch AS export",
            "steps:",
            "  - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v7",
            `  - uses: docker://alpine@sha256:${"a".repeat(64)}`,
            `  image: postgres:16@sha256:${"b".repeat(64)}`,
            `container: semgrep/semgrep@sha256:${"c".repeat(64)}`,
          ].join("\n"),
        },
      ]),
    ).not.toThrow();
  });

  it("rejects local actions until their dependency graph is validated", () => {
    expect(() =>
      validateActionPins([
        {
          path: ".github/workflows/example.yml",
          contents: "steps:\n  - uses: ./custom-action",
        },
      ]),
    ).toThrow(/local actions are forbidden/u);
  });

  it("rejects mutable tags and branches", () => {
    expect(() =>
      validateActionPins([
        {
          path: ".github/workflows/example.yml",
          contents: [
            "steps:",
            "  - uses: actions/checkout@v7",
            "  - uses: owner/action@main",
            "services:",
            "  postgres:",
            "    image: postgres:16",
          ].join("\n"),
        },
      ]),
    ).toThrow(
      /checkout is not pinned[\s\S]*owner\/action is not pinned[\s\S]*container image is not pinned/u,
    );
  });

  it("rejects mutable Dockerfile frontends and base images", () => {
    expect(() =>
      validateActionPins([
        {
          path: "deploy/gcp/Dockerfile.api",
          contents:
            "# syntax=docker/dockerfile:1.7\nFROM node:24-bookworm-slim AS build",
        },
      ]),
    ).toThrow(/Dockerfile frontend/u);

    expect(() =>
      validateActionPins([
        {
          path: "deploy/gcp/Dockerfile.api",
          contents: `# syntax=docker/dockerfile:1.7@sha256:${"a".repeat(64)}\nFROM node:24-bookworm-slim AS build`,
        },
      ]),
    ).toThrow(/Dockerfile base image/u);
  });

  it("rejects a Dockerfile that relies on the runner's implicit frontend", () => {
    expect(() =>
      validateActionPins([
        {
          path: "deploy/gcp/Dockerfile.api",
          contents: `FROM node:24-bookworm-slim@sha256:${"a".repeat(64)} AS build`,
        },
      ]),
    ).toThrow(/must declare exactly one digest-pinned frontend/u);
  });

  it("keeps every checked-in workflow immutable", () => {
    expect(() => validateActionPins(readWorkflowSources())).not.toThrow();
  });
});
