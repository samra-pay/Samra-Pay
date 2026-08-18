/**
 * Generates the consumable web theme (src/index.css) and the portable token
 * object (src/generated/tokens.tsx) from tokens.json.
 *
 * tokens.json (DTCG) is the single source of truth. This runs on dev start and
 * on every tokens.json change (see vite.config.ts) and before build/typecheck
 * (see package.json). Do not edit the generated files by hand.
 *
 * - src/index.css        the design system's theme. The preview app imports it,
 *                        and consuming apps import this same file (web).
 * - src/generated/tokens.tsx  hex token object for mobile (Expo) and any other
 *                             platform, so web + mobile share one source.
 * - src/generated/semantic-tokens.tsx  portable typed object containing
 *                             textStyle, interaction, layout, motion, elevation,
 *                             status entries for use on any platform.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tokensPath = join(root, "tokens.json");
const templatePath = join(here, "theme-template.css");
const cssOut = join(root, "src", "index.css");
const tsOutDir = join(root, "src", "generated");
const indexHtmlPath = join(root, "index.html");
const faviconOut = join(root, "public", "favicon.svg");

/** Resolve a DTCG node's $value, following {alias} references. */
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

function hexToHslChannels(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  const H = Math.round(hue * 360);
  const S = Math.round(s * 1000) / 10;
  const L = Math.round(l * 1000) / 10;
  return `${H} ${S}% ${L}%`;
}

function toFontStack(value) {
  return Array.isArray(value) ? value.join(", ") : value;
}

function normalizeHex(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${h}`;
}

/** Pick black or white text for best contrast on the given background hex. */
function contrastColor(hex) {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

/** Compute WCAG relative luminance of a hex color. */
function relativeLuminance(hex) {
  const h = normalizeHex(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Compute WCAG 2.1 contrast ratio between two hex colors. */
function wcagContrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** First alphanumeric character of the design system's title, uppercased. */
function faviconLetter() {
  let title = "";
  try {
    const html = readFileSync(indexHtmlPath, "utf8");
    title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
  } catch {
    title = "";
  }
  const match = title.match(/[A-Za-z0-9]/);
  return (match?.[0] ?? "D").toUpperCase();
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildFavicon(tokens) {
  const primary = normalizeHex(resolveValue(tokens.color.light.primary, tokens));
  const letter = escapeXml(faviconLetter());
  const fg = contrastColor(primary);
  return `<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="180" height="180" rx="36" fill="${primary}"/>
  <text x="90" y="92" fill="${fg}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="104" font-weight="700" text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>
`;
}

function colorEntries(scope, tokens) {
  const out = {};
  for (const [name, node] of Object.entries(tokens.color[scope])) {
    if (name.startsWith("$")) continue;
    out[name] = resolveValue(node, tokens);
  }
  return out;
}

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Validates token structure: required top-level keys and alias resolution.
 * Throws if required keys are missing or any alias is unresolved.
 * Returns a report object.
 */
function validateTokens(tokens) {
  const required = [
    "color.light",
    "color.dark",
    "typography.fontFamily",
    "radius.base",
    "spacing.base",
    "textStyle",
    "interaction",
    "layout",
    "motion",
    "elevation",
    "status",
  ];

  const missing = [];
  for (const path of required) {
    const parts = path.split(".");
    let cur = tokens;
    for (const part of parts) {
      if (cur == null || typeof cur !== "object" || !(part in cur)) {
        missing.push(path);
        break;
      }
      cur = cur[part];
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `tokens.json is missing required token groups:\n  ${missing.join("\n  ")}`,
    );
  }

  // Resolve all aliases and check for unresolved references
  let resolvedCount = 0;
  const unresolved = [];

  function walkAndResolve(node, path = "") {
    if (node == null || typeof node !== "object") return;
    if ("$value" in node) {
      const raw = node.$value;
      if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
        const aliasPath = raw.slice(1, -1).split(".");
        let cur = tokens;
        for (const key of aliasPath) cur = cur?.[key];
        const resolved = resolveValue(cur, tokens);
        if (resolved == null) {
          unresolved.push({ path, alias: raw });
        } else {
          resolvedCount++;
        }
      }
      return;
    }
    for (const [key, val] of Object.entries(node)) {
      if (!key.startsWith("$")) {
        walkAndResolve(val, path ? `${path}.${key}` : key);
      }
    }
  }

  walkAndResolve(tokens);

  if (unresolved.length > 0) {
    throw new Error(
      `Unresolved token aliases:\n${unresolved
        .map((u) => `  ${u.path}: ${u.alias}`)
        .join("\n")}`,
    );
  }

  return { resolvedAliasCount: resolvedCount };
}

/**
 * Validates WCAG 2.1 contrast ratios for required color pairs.
 * Throws if any pair is below 4.5:1 (WCAG AA).
 * Prints a summary table.
 */
function validateContrast(tokens) {
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

  const failures = [];
  const rows = [];

  for (const scope of ["light", "dark"]) {
    const colors = colorEntries(scope, tokens);
    for (const [bg, fg] of pairs) {
      if (!colors[bg] || !colors[fg]) continue;
      const ratio = wcagContrastRatio(colors[bg], colors[fg]);
      const pass = ratio >= 4.5;
      rows.push({ scope, bg, fg, ratio: ratio.toFixed(2), pass });
      if (!pass) {
        failures.push({ scope, bg, fg, ratio: ratio.toFixed(2) });
      }
    }
  }

  // Print summary table
  process.stdout.write("\n  Contrast Validation (WCAG AA 4.5:1 minimum)\n");
  process.stdout.write("  ┌────────────────────────────────────────────────────────────┐\n");
  process.stdout.write(`  │ ${"Mode".padEnd(6)} ${"Background".padEnd(22)} ${"Foreground".padEnd(22)} ${"Ratio".padEnd(6)} Status │\n`);
  process.stdout.write("  ├────────────────────────────────────────────────────────────┤\n");
  for (const row of rows) {
    const status = row.pass ? "✅" : "❌";
    process.stdout.write(
      `  │ ${row.scope.padEnd(6)} ${row.bg.padEnd(22)} ${row.fg.padEnd(22)} ${row.ratio.padEnd(6)} ${status}     │\n`,
    );
  }
  process.stdout.write("  └────────────────────────────────────────────────────────────┘\n");

  if (failures.length > 0) {
    throw new Error(
      `WCAG AA contrast failures (minimum 4.5:1):\n${failures
        .map((f) => `  [${f.scope}] ${f.bg}/${f.fg}: ${f.ratio}:1`)
        .join("\n")}`,
    );
  }

  return { checkedPairs: rows.length, failures: 0 };
}

// ── CSS builder ──────────────────────────────────────────────────────────────

function buildCss(tokens) {
  let css = readFileSync(templatePath, "utf8");
  const replacements = {};

  for (const scope of ["light", "dark"]) {
    for (const [name, hex] of Object.entries(colorEntries(scope, tokens))) {
      replacements[`__DS_${scope.toUpperCase()}_${name.toUpperCase()}__`] =
        hexToHslChannels(hex);
    }
  }

  replacements.__DS_FONT_SANS__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.sans, tokens),
  );
  replacements.__DS_FONT_SERIF__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.serif, tokens),
  );
  replacements.__DS_FONT_MONO__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.mono, tokens),
  );
  replacements.__DS_FONT_ETHIOPIC__ = toFontStack(
    resolveValue(
      tokens.typography.fontFamily.ethiopic ??
        tokens.typography.fontFamily.serif,
      tokens,
    ),
  );
  replacements.__DS_RADIUS__ = resolveValue(tokens.radius.base, tokens);
  replacements.__DS_SPACING__ = resolveValue(tokens.spacing.base, tokens);

  for (const [token, value] of Object.entries(replacements)) {
    css = css.split(token).join(value);
  }

  const leftover = css.match(/__DS_[A-Z0-9_]+__/g);
  if (leftover) {
    throw new Error(
      `tokens.json is missing values for: ${[...new Set(leftover)].join(", ")}`,
    );
  }
  return css;
}

// ── TS token builder ─────────────────────────────────────────────────────────

function buildTs(tokens) {
  const portable = {
    color: {
      light: colorEntries("light", tokens),
      dark: colorEntries("dark", tokens),
    },
    fontFamily: {
      sans: resolveValue(tokens.typography.fontFamily.sans, tokens),
      serif: resolveValue(tokens.typography.fontFamily.serif, tokens),
      mono: resolveValue(tokens.typography.fontFamily.mono, tokens),
      ethiopic: resolveValue(
        tokens.typography.fontFamily.ethiopic ??
          tokens.typography.fontFamily.serif,
        tokens,
      ),
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

// ── Semantic tokens builder ───────────────────────────────────────────────────

function buildSemanticTs(tokens) {
  // Extract textStyle — resolve fontFamily references to their first font name
  function resolveTextStyleFontFamily(value) {
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

  function extractTextStyles(node, path = "") {
    if (node && typeof node === "object" && "$value" in node) {
      const val = node.$value;
      return {
        fontFamily: resolveTextStyleFontFamily(val.fontFamily),
        fontSize: val.fontSize,
        fontWeight: val.fontWeight,
        lineHeight: val.lineHeight,
        letterSpacing: val.letterSpacing,
      };
    }
    const result = {};
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      result[key] = extractTextStyles(val, path ? `${path}.${key}` : key);
    }
    return result;
  }

  function extractPlain(node) {
    if (node && typeof node === "object" && "$value" in node) {
      return node.$value;
    }
    const result = {};
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      result[key] = extractPlain(val);
    }
    return result;
  }

  const semantic = {
    textStyle: extractTextStyles(tokens.textStyle),
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

// ── Main export ───────────────────────────────────────────────────────────────

export function buildTokens() {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));

  // Validate before generating
  process.stdout.write("  Validating token structure...\n");
  const validationReport = validateTokens(tokens);
  process.stdout.write(
    `  ✅ Token structure valid (${validationReport.resolvedAliasCount} aliases resolved)\n`,
  );

  // Validate contrast
  process.stdout.write("  Validating WCAG AA contrast ratios...\n");
  const contrastReport = validateContrast(tokens);
  process.stdout.write(
    `  ✅ All ${contrastReport.checkedPairs} color pairs pass WCAG AA (4.5:1 minimum)\n`,
  );

  // Generate CSS
  writeFileSync(cssOut, buildCss(tokens));

  // Generate TS outputs
  mkdirSync(tsOutDir, { recursive: true });
  writeFileSync(join(tsOutDir, "tokens.tsx"), buildTs(tokens));
  writeFileSync(join(tsOutDir, "semantic-tokens.tsx"), buildSemanticTs(tokens));

  // Generate favicon
  mkdirSync(dirname(faviconOut), { recursive: true });
  writeFileSync(faviconOut, buildFavicon(tokens));

  process.stdout.write(
    "  ✅ Generated: src/index.css, src/generated/tokens.tsx, src/generated/semantic-tokens.tsx, public/favicon.svg\n",
  );
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  buildTokens();
  process.stdout.write(
    "Generated src/index.css, src/generated/tokens.tsx, src/generated/semantic-tokens.tsx, and public/favicon.svg\n",
  );
}
