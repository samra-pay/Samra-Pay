/**
 * Accessibility token value tests.
 * Tests interaction tokens for accessibility compliance.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const tokensPath = join(root, "tokens.json");

function extractPlain(node) {
  if (node && typeof node === "object" && "$value" in node) return node.$value;
  const result = {};
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    result[key] = extractPlain(val);
  }
  return result;
}

const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
const interaction = extractPlain(tokens.interaction);
const status = extractPlain(tokens.status);

// Touch target tests
test("interaction.touchTarget.ios >= 44 (Apple HIG minimum)", () => {
  assert.ok(
    interaction.touchTarget.ios >= 44,
    `touchTarget.ios = ${interaction.touchTarget.ios} — must be >= 44`,
  );
});

test("interaction.touchTarget.android >= 48 (Material Design minimum)", () => {
  assert.ok(
    interaction.touchTarget.android >= 48,
    `touchTarget.android = ${interaction.touchTarget.android} — must be >= 48`,
  );
});

// Opacity tests
test("interaction.pressedOpacity < 1.0 (visible feedback)", () => {
  assert.ok(
    interaction.pressedOpacity < 1.0,
    `pressedOpacity = ${interaction.pressedOpacity} — must be < 1.0 to provide feedback`,
  );
});

test("interaction.disabledOpacity <= 0.5 (meaningful reduction)", () => {
  assert.ok(
    interaction.disabledOpacity <= 0.5,
    `disabledOpacity = ${interaction.disabledOpacity} — must be <= 0.5 for meaningful visual reduction`,
  );
});

test("interaction.disabledOpacity > 0 (not completely invisible)", () => {
  assert.ok(
    interaction.disabledOpacity > 0,
    `disabledOpacity = ${interaction.disabledOpacity} — must be > 0`,
  );
});

// Focus ring
test("interaction.focusRingWidth >= 2 (WCAG visible focus)", () => {
  assert.ok(
    interaction.focusRingWidth >= 2,
    `focusRingWidth = ${interaction.focusRingWidth} — must be >= 2 for WCAG visible focus`,
  );
});

// Status token accessibility
const statusKeys = Object.keys(status);

test("All status entries have textRequired: true", () => {
  assert.ok(statusKeys.length > 0, "status group must have at least one entry");
  for (const key of statusKeys) {
    const entry = status[key];
    assert.strictEqual(
      entry.textRequired,
      true,
      `status.${key}.textRequired must be true (color alone is insufficient)`,
    );
  }
});

test("Every status entry has accessibilityNote", () => {
  for (const key of statusKeys) {
    const entry = status[key];
    assert.ok(
      typeof entry.accessibilityNote === "string" && entry.accessibilityNote.length > 0,
      `status.${key}.accessibilityNote must be a non-empty string`,
    );
  }
});

test("Every status entry has iconName", () => {
  for (const key of statusKeys) {
    const entry = status[key];
    assert.ok(
      typeof entry.iconName === "string" && entry.iconName.length > 0,
      `status.${key}.iconName must be a non-empty string`,
    );
  }
});

test("Every status entry has foreground color", () => {
  for (const key of statusKeys) {
    const entry = status[key];
    assert.ok(
      typeof entry.foreground === "string" && entry.foreground.startsWith("#"),
      `status.${key}.foreground must be a hex color string`,
    );
  }
});

test("Every status entry has background color", () => {
  for (const key of statusKeys) {
    const entry = status[key];
    assert.ok(
      typeof entry.background === "string" && entry.background.startsWith("#"),
      `status.${key}.background must be a hex color string`,
    );
  }
});

test("status group has all 14 required statuses", () => {
  const required = [
    "neutral", "information", "warning", "submitted", "processing",
    "completed", "failed", "cancelled", "refundPending", "refunded",
    "reversed", "stale", "offline", "unavailable",
  ];
  for (const s of required) {
    assert.ok(s in status, `Missing required status: ${s}`);
  }
});
