/**
 * Checks for drift between committed generated files and what would be
 * generated from the current tokens.json.
 *
 * Regenerates tokens in memory (does NOT write files), then compares against
 * the committed src/generated/tokens.tsx and src/index.css.
 *
 * Exits with code 1 if any difference is found.
 *
 * Usage: node scripts/check-token-drift.mjs
 * npm script: pnpm run tokens:check
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tokensPath = join(root, "tokens.json");
const templatePath = join(here, "theme-template.css");
const cssOut = join(root, "src", "index.css");
const tsOut = join(root, "src", "generated", "tokens.tsx");
const semanticOut = join(root, "src", "generated", "semantic-tokens.tsx");
const indexHtmlPath = join(root, "index.html");

// ── Shared helpers (duplicated from build-tokens.mjs to avoid module coupling) ──

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

function normalizeHex(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

function hexToHslChannels(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0, hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;
}

function toFontStack(value) {
  return Array.isArray(value) ? value.join(", ") : value;
}

function contrastColor(hex) {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

function faviconLetter() {
  let title = "";
  try {
    const html = readFileSync(indexHtmlPath, "utf8");
    title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
  } catch { title = ""; }
  const match = title.match(/[A-Za-z0-9]/);
  return (match?.[0] ?? "D").toUpperCase();
}

function colorEntries(scope, tokens) {
  const out = {};
  for (const [name, node] of Object.entries(tokens.color[scope])) {
    if (name.startsWith("$")) continue;
    out[name] = resolveValue(node, tokens);
  }
  return out;
}

function generateCss(tokens) {
  let css = readFileSync(templatePath, "utf8");
  const replacements = {};
  for (const scope of ["light", "dark"]) {
    for (const [name, hex] of Object.entries(colorEntries(scope, tokens))) {
      replacements[`__DS_${scope.toUpperCase()}_${name.toUpperCase()}__`] = hexToHslChannels(hex);
    }
  }
  replacements.__DS_FONT_SANS__ = toFontStack(resolveValue(tokens.typography.fontFamily.sans, tokens));
  replacements.__DS_FONT_SERIF__ = toFontStack(resolveValue(tokens.typography.fontFamily.serif, tokens));
  replacements.__DS_FONT_MONO__ = toFontStack(resolveValue(tokens.typography.fontFamily.mono, tokens));
  replacements.__DS_FONT_ETHIOPIC__ = toFontStack(resolveValue(tokens.typography.fontFamily.ethiopic ?? tokens.typography.fontFamily.serif, tokens));
  replacements.__DS_RADIUS__ = resolveValue(tokens.radius.base, tokens);
  replacements.__DS_SPACING__ = resolveValue(tokens.spacing.base, tokens);
  for (const [token, value] of Object.entries(replacements)) {
    css = css.split(token).join(value);
  }
  return css;
}

function generateTs(tokens) {
  const portable = {
    color: { light: colorEntries("light", tokens), dark: colorEntries("dark", tokens) },
    fontFamily: {
      sans: resolveValue(tokens.typography.fontFamily.sans, tokens),
      serif: resolveValue(tokens.typography.fontFamily.serif, tokens),
      mono: resolveValue(tokens.typography.fontFamily.mono, tokens),
      ethiopic: resolveValue(tokens.typography.fontFamily.ethiopic ?? tokens.typography.fontFamily.serif, tokens),
    },
    radius: resolveValue(tokens.radius.base, tokens),
    spacing: resolveValue(tokens.spacing.base, tokens),
  };
  return `/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = ${JSON.stringify(portable, null, 2)} as const;

export type Tokens = typeof tokens;
export default tokens;
`;
}

function resolveTextStyleFontFamily(value, tokens) {
  if (typeof value !== "object" || value === null) return value;
  const fontRef = value.fontFamily;
  if (typeof fontRef === "string" && fontRef.startsWith("typography.")) {
    const parts = fontRef.split(".");
    let cur = tokens;
    for (const p of parts) cur = cur?.[p];
    const resolved = cur?.$value ?? cur;
    if (Array.isArray(resolved)) return resolved[0];
    return resolved;
  }
  return fontRef;
}

function extractTextStyles(node, tokens) {
  if (node && typeof node === "object" && "$value" in node) {
    const val = node.$value;
    return {
      fontFamily: resolveTextStyleFontFamily(val.fontFamily, tokens),
      fontSize: val.fontSize,
      fontWeight: val.fontWeight,
      lineHeight: val.lineHeight,
      letterSpacing: val.letterSpacing,
    };
  }
  const result = {};
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    result[key] = extractTextStyles(val, tokens);
  }
  return result;
}

function extractPlain(node) {
  if (node && typeof node === "object" && "$value" in node) return node.$value;
  const result = {};
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    result[key] = extractPlain(val);
  }
  return result;
}

function generateSemanticTs(tokens) {
  const semantic = {
    textStyle: extractTextStyles(tokens.textStyle, tokens),
    interaction: extractPlain(tokens.interaction),
    layout: extractPlain(tokens.layout),
    motion: extractPlain(tokens.motion),
    elevation: extractPlain(tokens.elevation),
    status: extractPlain(tokens.status),
  };
  return `/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable semantic tokens: typography roles, interaction dimensions, layout,
// motion, elevation, and financial status semantics.
// Web consumes these as JS values; native (Expo/RN) imports this object directly.
export const semanticTokens = ${JSON.stringify(semantic, null, 2)} as const;

export type SemanticTokens = typeof semanticTokens;
export type TextStyleKey = keyof typeof semanticTokens.textStyle;
export type StatusKey = keyof typeof semanticTokens.status;
export type InteractionTokens = typeof semanticTokens.interaction;
export type LayoutTokens = typeof semanticTokens.layout;
export type MotionTokens = typeof semanticTokens.motion;
export type ElevationTokens = typeof semanticTokens.elevation;

export default semanticTokens;
`;
}

// ── Diff check ────────────────────────────────────────────────────────────────

function simpleDiff(label, expected, actual) {
  if (expected === actual) return null;
  // Find first differing line
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  let firstDiff = -1;
  const maxLen = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (expectedLines[i] !== actualLines[i]) {
      firstDiff = i + 1;
      break;
    }
  }
  return {
    label,
    firstDiffLine: firstDiff,
    committedLines: expectedLines.length,
    freshLines: actualLines.length,
    excerpt: {
      committed: expectedLines[firstDiff - 1]?.slice(0, 120) ?? "(end of file)",
      fresh: actualLines[firstDiff - 1]?.slice(0, 120) ?? "(end of file)",
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));

const freshCss = generateCss(tokens);
const freshTs = generateTs(tokens);
const freshSemanticTs = generateSemanticTs(tokens);

let committedCss, committedTs, committedSemanticTs;
try { committedCss = readFileSync(cssOut, "utf8"); } catch { committedCss = null; }
try { committedTs = readFileSync(tsOut, "utf8"); } catch { committedTs = null; }
try { committedSemanticTs = readFileSync(semanticOut, "utf8"); } catch { committedSemanticTs = null; }

const diffs = [];

if (committedCss === null) {
  diffs.push({ label: "src/index.css", error: "File does not exist — run pnpm tokens" });
} else {
  const d = simpleDiff("src/index.css", committedCss, freshCss);
  if (d) diffs.push(d);
}

if (committedTs === null) {
  diffs.push({ label: "src/generated/tokens.tsx", error: "File does not exist — run pnpm tokens" });
} else {
  const d = simpleDiff("src/generated/tokens.tsx", committedTs, freshTs);
  if (d) diffs.push(d);
}

if (committedSemanticTs === null) {
  diffs.push({ label: "src/generated/semantic-tokens.tsx", error: "File does not exist — run pnpm tokens" });
} else {
  const d = simpleDiff("src/generated/semantic-tokens.tsx", committedSemanticTs, freshSemanticTs);
  if (d) diffs.push(d);
}

if (diffs.length === 0) {
  process.stdout.write("✅ No token drift detected. Generated files match tokens.json.\n");
  process.exit(0);
} else {
  process.stderr.write(
    `❌ Token drift detected — ${diffs.length} file(s) differ from what tokens.json would generate.\n`,
  );
  process.stderr.write("   Run: pnpm run tokens\n\n");
  for (const diff of diffs) {
    if (diff.error) {
      process.stderr.write(`  • ${diff.label}: ${diff.error}\n`);
    } else {
      process.stderr.write(`  • ${diff.label} (first diff at line ${diff.firstDiffLine}):\n`);
      process.stderr.write(`    committed: ${diff.excerpt.committed}\n`);
      process.stderr.write(`    fresh:     ${diff.excerpt.fresh}\n`);
    }
  }
  process.exit(1);
}
