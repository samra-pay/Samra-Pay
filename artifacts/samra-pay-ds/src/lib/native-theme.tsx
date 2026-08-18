import { tokens } from "../generated/tokens";

/**
 * Native (React Native / Expo) theme derived from the portable design tokens.
 *
 * Web consumes the theme through `src/index.css`; native code cannot use CSS,
 * so this module reshapes the same generated `tokens` object into values React
 * Native understands: flat hex color palettes, numeric radius/spacing, and the
 * registered Expo font names that back each token font family.
 *
 * This is the single conversion point for CSS lengths — do not re-derive radius
 * or spacing in consuming apps.
 */

/** Convert a CSS length token (e.g. "0.75rem" or "12px") to a number of px. */
function toPx(length: string): number {
  const value = Number.parseFloat(length);
  if (Number.isNaN(value)) return 0;
  return length.trim().endsWith("rem") ? value * 16 : value;
}

export type NativeColorScheme = "light" | "dark";
/** Color token keys are shared across schemes; values are hex strings. */
export type NativeColors = Record<keyof (typeof tokens)["color"]["light"], string>;

/** Flat light/dark color palettes (the generated tokens are already flat hex). */
export const colors: Record<NativeColorScheme, NativeColors> = {
  light: tokens.color.light,
  dark: tokens.color.dark,
};

/**
 * Numeric radius scale in px. The base radius token is 0.75rem → 12; the
 * remaining steps follow the tokens.json radius description
 * (sm = base - 4, md = base - 2, lg = base, xl = base + 4).
 */
const baseRadius = toPx(tokens.radius);
export const radius = {
  sm: baseRadius - 4,
  md: baseRadius - 2,
  lg: baseRadius,
  xl: baseRadius + 4,
  base: baseRadius,
} as const;

/** Spacing helper: multiply the base spacing token (0.25rem → 4px) by `steps`. */
const baseSpacing = toPx(tokens.spacing);
export function spacing(steps: number): number {
  return baseSpacing * steps;
}

/**
 * Registered Expo font names mapped from the token font families. `tokens`
 * names CSS font stacks; native code must reference the exact registered names
 * loaded by `useDesignSystemFonts`. Keys mirror `tokens.fontFamily`.
 */
export const fontFamily = {
  sans: {
    regular: "Outfit_400Regular",
    medium: "Outfit_500Medium",
    semibold: "Outfit_600SemiBold",
    bold: "Outfit_700Bold",
    extrabold: "Outfit_800ExtraBold",
  },
  serif: {
    medium: "EBGaramond_500Medium",
    mediumItalic: "EBGaramond_500Medium_Italic",
    semibold: "EBGaramond_600SemiBold",
  },
  ethiopic: {
    regular: "NotoSerifEthiopic_400Regular",
    semibold: "NotoSerifEthiopic_600SemiBold",
  },
  /** System monospace stack — used for reference IDs, account numbers, transfer IDs. */
  mono: "ui-monospace, 'Courier New', monospace",
} as const;

export const nativeTheme = {
  colors,
  radius,
  spacing,
  fontFamily,
} as const;

export type NativeTheme = typeof nativeTheme;

export default nativeTheme;
