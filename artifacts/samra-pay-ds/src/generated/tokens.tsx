/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#faf9f4",
      "foreground": "#1a1505",
      "border": "#d4c99a",
      "card": "#ffffff",
      "cardForeground": "#1a1505",
      "popover": "#ffffff",
      "popoverForeground": "#1a1505",
      "primary": "#d4af37",
      "primaryForeground": "#171717",
      "secondary": "#f0ecdc",
      "secondaryForeground": "#1a1505",
      "muted": "#e8e2cc",
      "mutedForeground": "#6b5d3a",
      "accent": "#f5edcc",
      "accentForeground": "#7a6020",
      "destructive": "#b83232",
      "destructiveForeground": "#ffffff",
      "input": "#cec49e",
      "ring": "#d4af37",
      "chart1": "#d4af37",
      "chart2": "#405943",
      "chart3": "#80423a",
      "chart4": "#b3943d",
      "chart5": "#666666",
      "sidebar": "#faf9f4",
      "sidebarForeground": "#1a1505",
      "sidebarBorder": "#d4c99a",
      "sidebarPrimary": "#d4af37",
      "sidebarPrimaryForeground": "#171717",
      "sidebarAccent": "#f0ecdc",
      "sidebarAccentForeground": "#1a1505",
      "sidebarRing": "#d4af37"
    },
    "dark": {
      "background": "#0a0a0a",
      "foreground": "#f5f5f5",
      "border": "#1f1f1f",
      "card": "#0f0f0f",
      "cardForeground": "#f5f5f5",
      "popover": "#121212",
      "popoverForeground": "#f5f5f5",
      "primary": "#d4af37",
      "primaryForeground": "#171717",
      "secondary": "#1a1a1a",
      "secondaryForeground": "#f5f5f5",
      "muted": "#1f1f1f",
      "mutedForeground": "#adadad",
      "accent": "#3f3610",
      "accentForeground": "#e9d99a",
      "destructive": "#803636",
      "destructiveForeground": "#fafafa",
      "input": "#262626",
      "ring": "#d4af37",
      "chart1": "#d4af37",
      "chart2": "#405943",
      "chart3": "#80423a",
      "chart4": "#b3943d",
      "chart5": "#666666",
      "sidebar": "#0f0f0f",
      "sidebarForeground": "#f5f5f5",
      "sidebarBorder": "#1f1f1f",
      "sidebarPrimary": "#d4af37",
      "sidebarPrimaryForeground": "#171717",
      "sidebarAccent": "#1a1a1a",
      "sidebarAccentForeground": "#f5f5f5",
      "sidebarRing": "#d4af37"
    }
  },
  "fontFamily": {
    "sans": [
      "Outfit",
      "sans-serif"
    ],
    "serif": [
      "EB Garamond",
      "serif"
    ],
    "mono": [
      "ui-monospace",
      "SFMono-Regular",
      "Menlo",
      "Monaco",
      "Consolas",
      "Liberation Mono",
      "Courier New",
      "monospace"
    ]
  },
  "radius": "0.75rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
