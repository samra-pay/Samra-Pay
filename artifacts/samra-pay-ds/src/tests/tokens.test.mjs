/**
 * Token structure and generation tests.
 * Uses Node.js built-in test runner (node:test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const tokensPath = join(root, "tokens.json");
const generatedTokensPath = join(root, "src/generated/tokens.tsx");
const generatedSemanticPath = join(root, "src/generated/semantic-tokens.tsx");

// ── Token structure tests ──────────────────────────────────────────────────

test("tokens.json is valid JSON", () => {
  const raw = readFileSync(tokensPath, "utf8");
  assert.doesNotThrow(() => JSON.parse(raw), "tokens.json must be valid JSON");
});

test("tokens.json has all required top-level groups", () => {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  const required = [
    ["color", "light"],
    ["color", "dark"],
    ["typography", "fontFamily"],
    ["radius", "base"],
    ["spacing", "base"],
    ["textStyle"],
    ["interaction"],
    ["layout"],
    ["motion"],
    ["elevation"],
    ["status"],
  ];

  for (const path of required) {
    let cur = tokens;
    for (const key of path) {
      assert.ok(
        cur != null && typeof cur === "object" && key in cur,
        `Missing required token path: ${path.join(".")}`,
      );
      cur = cur[key];
    }
  }
});

test("textStyle group has expected roles", () => {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  const expectedRoles = [
    ["display", "xl"],
    ["display", "lg"],
    ["display", "md"],
    ["heading", "xl"],
    ["heading", "lg"],
    ["heading", "md"],
    ["heading", "sm"],
    ["body", "lg"],
    ["body", "md"],
    ["body", "sm"],
    ["label", "lg"],
    ["label", "md"],
    ["label", "sm"],
    ["caption"],
    ["numeric", "balance"],
    ["numeric", "amount"],
    ["numeric", "rate"],
    ["ethiopic", "display"],
    ["ethiopic", "heading"],
    ["ethiopic", "body"],
    ["ethiopic", "label"],
  ];

  for (const path of expectedRoles) {
    let cur = tokens.textStyle;
    for (const key of path) {
      assert.ok(
        cur != null && typeof cur === "object" && key in cur,
        `Missing textStyle role: ${path.join(".")}`,
      );
      cur = cur[key];
    }
  }
});

test("interaction group has required tokens", () => {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  const required = [
    ["touchTarget", "ios"],
    ["touchTarget", "android"],
    ["controlHeight", "md"],
    ["iconSize", "md"],
    ["focusRingWidth"],
    ["pressedOpacity"],
    ["disabledOpacity"],
    ["loadingOpacity"],
  ];

  for (const path of required) {
    let cur = tokens.interaction;
    for (const key of path) {
      assert.ok(
        cur != null && typeof cur === "object" && key in cur,
        `Missing interaction token: interaction.${path.join(".")}`,
      );
      cur = cur[key];
    }
  }
});

test("status group has all required statuses", () => {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  const required = [
    "neutral", "information", "warning", "submitted", "processing",
    "completed", "failed", "cancelled", "refundPending", "refunded",
    "reversed", "stale", "offline", "unavailable",
  ];

  for (const status of required) {
    assert.ok(status in tokens.status, `Missing status: ${status}`);
  }
});

test("all color alias references resolve", () => {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));

  function resolveValue(node, tokenRoot) {
    const raw = node?.$value;
    if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
      const path = raw.slice(1, -1).split(".");
      let cur = tokenRoot;
      for (const key of path) cur = cur?.[key];
      return resolveValue(cur, tokenRoot);
    }
    return raw;
  }

  function walkAndCheck(node, path = "") {
    if (node == null || typeof node !== "object") return;
    if ("$value" in node) {
      const raw = node.$value;
      if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
        const resolved = resolveValue(node, tokens);
        assert.notEqual(
          resolved,
          undefined,
          `Unresolved alias at ${path}: ${raw}`,
        );
      }
      return;
    }
    for (const [key, val] of Object.entries(node)) {
      if (!key.startsWith("$")) {
        walkAndCheck(val, path ? `${path}.${key}` : key);
      }
    }
  }

  walkAndCheck(tokens);
});

// ── Generated file tests ───────────────────────────────────────────────────

test("Generated tokens.tsx starts with GENERATED comment", () => {
  assert.ok(existsSync(generatedTokensPath), "src/generated/tokens.tsx must exist");
  const content = readFileSync(generatedTokensPath, "utf8");
  assert.ok(
    content.startsWith("/* GENERATED FROM tokens.json"),
    "tokens.tsx must start with GENERATED comment",
  );
});

test("Generated semantic-tokens.tsx starts with GENERATED comment", () => {
  assert.ok(existsSync(generatedSemanticPath), "src/generated/semantic-tokens.tsx must exist");
  const content = readFileSync(generatedSemanticPath, "utf8");
  assert.ok(
    content.startsWith("/* GENERATED FROM tokens.json"),
    "semantic-tokens.tsx must start with GENERATED comment",
  );
});

test("Generated semantic-tokens.tsx contains all required groups", () => {
  const content = readFileSync(generatedSemanticPath, "utf8");
  for (const group of ["textStyle", "interaction", "layout", "motion", "elevation", "status"]) {
    assert.ok(content.includes(`"${group}"`), `semantic-tokens.tsx must contain "${group}" group`);
  }
});
