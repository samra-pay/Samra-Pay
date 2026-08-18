/**
 * WCAG AA contrast ratio tests.
 * Tests all required background/foreground pairs in both light and dark modes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const tokensPath = join(root, "tokens.json");

// ── Contrast helpers ──────────────────────────────────────────────────────

function normalizeHex(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

function relativeLuminance(hex) {
  const h = normalizeHex(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function resolveValue(node, tokens) {
  const raw = node?.$value;
  if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
    const path = raw.slice(1, -1).split(".");
    let cur = tokens;
    for (const key of path) cur = cur?.[key];
    return resolveValue(cur, tokens);
  }
  return raw;
}

function colorEntries(scope, tokens) {
  const out = {};
  for (const [name, node] of Object.entries(tokens.color[scope])) {
    if (name.startsWith("$")) continue;
    out[name] = resolveValue(node, tokens);
  }
  return out;
}

// ── Tests ─────────────────────────────────────────────────────────────────

const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
const lightColors = colorEntries("light", tokens);
const darkColors = colorEntries("dark", tokens);

const pairs = [
  ["background", "foreground"],
  ["card", "cardForeground"],
  ["primary", "primaryForeground"],
  ["secondary", "secondaryForeground"],
  ["muted", "mutedForeground"],
  ["accent", "accentForeground"],
  ["destructive", "destructiveForeground"],
  ["coffee", "coffeeForeground"],
  ["berbere", "berbereForeground"],
  ["eucalyptus", "eucalyptusForeground"],
  ["injera", "injeraForeground"],
];

const WCAG_AA_MIN = 4.5;

// Light mode tests
for (const [bg, fg] of pairs) {
  test(`[light] ${bg}/${fg} passes WCAG AA (≥ ${WCAG_AA_MIN}:1)`, () => {
    const bgHex = lightColors[bg];
    const fgHex = lightColors[fg];
    assert.ok(bgHex, `Missing light color: ${bg}`);
    assert.ok(fgHex, `Missing light color: ${fg}`);
    const ratio = contrastRatio(bgHex, fgHex);
    assert.ok(
      ratio >= WCAG_AA_MIN,
      `[light] ${bg} (${bgHex}) / ${fg} (${fgHex}): ${ratio.toFixed(2)}:1 is below ${WCAG_AA_MIN}:1`,
    );
  });
}

// Dark mode tests
for (const [bg, fg] of pairs) {
  test(`[dark] ${bg}/${fg} passes WCAG AA (≥ ${WCAG_AA_MIN}:1)`, () => {
    const bgHex = darkColors[bg];
    const fgHex = darkColors[fg];
    assert.ok(bgHex, `Missing dark color: ${bg}`);
    assert.ok(fgHex, `Missing dark color: ${fg}`);
    const ratio = contrastRatio(bgHex, fgHex);
    assert.ok(
      ratio >= WCAG_AA_MIN,
      `[dark] ${bg} (${bgHex}) / ${fg} (${fgHex}): ${ratio.toFixed(2)}:1 is below ${WCAG_AA_MIN}:1`,
    );
  });
}
