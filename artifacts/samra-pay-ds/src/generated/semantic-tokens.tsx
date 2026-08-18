/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable semantic tokens: typography roles, interaction dimensions, layout,
// motion, elevation, and financial status semantics.
// Web consumes these as JS values; native (Expo/RN) imports this object directly.
export const semanticTokens = {
  "textStyle": {
    "display": {
      "xl": {
        "fontFamily": "typography.fontFamily.serif",
        "fontSize": "4.5rem",
        "fontWeight": "400",
        "lineHeight": 1,
        "letterSpacing": "-0.02em"
      },
      "lg": {
        "fontFamily": "typography.fontFamily.serif",
        "fontSize": "3.75rem",
        "fontWeight": "400",
        "lineHeight": 1,
        "letterSpacing": "-0.02em"
      },
      "md": {
        "fontFamily": "typography.fontFamily.serif",
        "fontSize": "3rem",
        "fontWeight": "400",
        "lineHeight": 1.05,
        "letterSpacing": "-0.01em"
      }
    },
    "heading": {
      "xl": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "2.25rem",
        "fontWeight": "600",
        "lineHeight": 1.1,
        "letterSpacing": "-0.01em"
      },
      "lg": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "1.875rem",
        "fontWeight": "600",
        "lineHeight": 1.15,
        "letterSpacing": "-0.01em"
      },
      "md": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "1.5rem",
        "fontWeight": "600",
        "lineHeight": 1.2,
        "letterSpacing": "0em"
      },
      "sm": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "1.25rem",
        "fontWeight": "600",
        "lineHeight": 1.25,
        "letterSpacing": "0em"
      }
    },
    "body": {
      "lg": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "1.125rem",
        "fontWeight": "400",
        "lineHeight": 1.6,
        "letterSpacing": "0em"
      },
      "md": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "1rem",
        "fontWeight": "400",
        "lineHeight": 1.6,
        "letterSpacing": "0em"
      },
      "sm": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "0.875rem",
        "fontWeight": "400",
        "lineHeight": 1.5,
        "letterSpacing": "0em"
      }
    },
    "label": {
      "lg": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "0.875rem",
        "fontWeight": "500",
        "lineHeight": 1.4,
        "letterSpacing": "0.01em"
      },
      "md": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "0.8125rem",
        "fontWeight": "500",
        "lineHeight": 1.4,
        "letterSpacing": "0.01em"
      },
      "sm": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "0.75rem",
        "fontWeight": "500",
        "lineHeight": 1.4,
        "letterSpacing": "0.01em"
      }
    },
    "caption": {
      "fontFamily": "typography.fontFamily.sans",
      "fontSize": "0.6875rem",
      "fontWeight": "400",
      "lineHeight": 1.4,
      "letterSpacing": "0.02em"
    },
    "numeric": {
      "balance": {
        "fontFamily": "typography.fontFamily.serif",
        "fontSize": "3rem",
        "fontWeight": "500",
        "lineHeight": 1,
        "letterSpacing": "-0.02em"
      },
      "amount": {
        "fontFamily": "typography.fontFamily.sans",
        "fontSize": "1.5rem",
        "fontWeight": "600",
        "lineHeight": 1.2,
        "letterSpacing": "-0.01em"
      },
      "rate": {
        "fontFamily": "typography.fontFamily.serif",
        "fontSize": "1.875rem",
        "fontWeight": "400",
        "lineHeight": 1.1,
        "letterSpacing": "0em"
      }
    },
    "ethiopic": {
      "display": {
        "fontFamily": "typography.fontFamily.ethiopic",
        "fontSize": "3rem",
        "fontWeight": "400",
        "lineHeight": 1.2,
        "letterSpacing": "0em"
      },
      "heading": {
        "fontFamily": "typography.fontFamily.ethiopic",
        "fontSize": "1.5rem",
        "fontWeight": "400",
        "lineHeight": 1.4,
        "letterSpacing": "0em"
      },
      "body": {
        "fontFamily": "typography.fontFamily.ethiopic",
        "fontSize": "1rem",
        "fontWeight": "400",
        "lineHeight": 1.7,
        "letterSpacing": "0em"
      },
      "label": {
        "fontFamily": "typography.fontFamily.ethiopic",
        "fontSize": "0.875rem",
        "fontWeight": "400",
        "lineHeight": 1.5,
        "letterSpacing": "0em"
      }
    }
  },
  "interaction": {
    "touchTarget": {
      "ios": 44,
      "android": 48
    },
    "controlHeight": {
      "sm": 32,
      "md": 40,
      "lg": 48
    },
    "iconSize": {
      "xs": 12,
      "sm": 16,
      "md": 20,
      "lg": 24,
      "xl": 32
    },
    "focusRingWidth": 2,
    "pressedOpacity": 0.75,
    "disabledOpacity": 0.38,
    "loadingOpacity": 0.6
  },
  "layout": {
    "gutter": {
      "mobile": 16,
      "tablet": 24,
      "desktop": 32
    },
    "sectionGap": {
      "sm": 32,
      "md": 48,
      "lg": 64
    },
    "cardPadding": {
      "sm": 12,
      "md": 16,
      "lg": 24
    },
    "formSpacing": 16,
    "inlineSpacing": {
      "sm": 4,
      "md": 8,
      "lg": 12
    },
    "density": {
      "compact": 0.75,
      "standard": 1,
      "spacious": 1.375
    },
    "mobileContentWidth": {
      "max": 480
    },
    "webContentWidth": {
      "sm": 640,
      "md": 768,
      "lg": 1024,
      "xl": 1280,
      "max": 1440
    },
    "breakpoint": {
      "sm": 640,
      "md": 768,
      "lg": 1024,
      "xl": 1280,
      "xxl": 1536
    },
    "modalWidth": {
      "sm": 360,
      "md": 480,
      "lg": 640
    },
    "sheetWidth": {
      "mobile": "100%"
    },
    "headerHeight": {
      "mobile": 56,
      "desktop": 64
    },
    "bottomNavHeight": 56
  },
  "motion": {
    "swift": "150ms",
    "standard": "250ms",
    "gentle": "400ms",
    "slow": "500ms",
    "easing": {
      "standard": "cubic-bezier(0.4, 0, 0.2, 1)",
      "entrance": "cubic-bezier(0.16, 1, 0.3, 1)",
      "emphasized": "cubic-bezier(0.34, 1.3, 0.64, 1)",
      "exit": "cubic-bezier(0.4, 0, 1, 1)"
    }
  },
  "elevation": {
    "e1": {
      "light": {
        "offsetX": 0,
        "offsetY": 1,
        "blurRadius": 2,
        "color": "rgba(43,33,10,0.06)",
        "opacity": 1
      },
      "dark": {
        "offsetX": 0,
        "offsetY": 1,
        "blurRadius": 2,
        "color": "rgba(0,0,0,0.4)",
        "opacity": 1
      }
    },
    "e2": {
      "light": {
        "offsetX": 0,
        "offsetY": 2,
        "blurRadius": 6,
        "color": "rgba(43,33,10,0.07)",
        "opacity": 1
      },
      "dark": {
        "offsetX": 0,
        "offsetY": 2,
        "blurRadius": 8,
        "color": "rgba(0,0,0,0.45)",
        "opacity": 1
      }
    },
    "e3": {
      "light": {
        "offsetX": 0,
        "offsetY": 6,
        "blurRadius": 16,
        "color": "rgba(43,33,10,0.09)",
        "opacity": 1
      },
      "dark": {
        "offsetX": 0,
        "offsetY": 8,
        "blurRadius": 20,
        "color": "rgba(0,0,0,0.5)",
        "opacity": 1
      }
    },
    "e4": {
      "light": {
        "offsetX": 0,
        "offsetY": 12,
        "blurRadius": 28,
        "color": "rgba(43,33,10,0.12)",
        "opacity": 1
      },
      "dark": {
        "offsetX": 0,
        "offsetY": 16,
        "blurRadius": 36,
        "color": "rgba(0,0,0,0.55)",
        "opacity": 1
      }
    },
    "e5": {
      "light": {
        "offsetX": 0,
        "offsetY": 24,
        "blurRadius": 48,
        "color": "rgba(43,33,10,0.16)",
        "opacity": 1
      },
      "dark": {
        "offsetX": 0,
        "offsetY": 28,
        "blurRadius": 64,
        "color": "rgba(0,0,0,0.65)",
        "opacity": 1
      }
    },
    "goldSm": {
      "light": {
        "offsetX": 0,
        "offsetY": 0,
        "blurRadius": 16,
        "color": "#d4af37",
        "opacity": 0.12
      },
      "dark": {
        "offsetX": 0,
        "offsetY": 0,
        "blurRadius": 20,
        "color": "#d4af37",
        "opacity": 0.08
      }
    },
    "goldMd": {
      "light": {
        "offsetX": 0,
        "offsetY": 2,
        "blurRadius": 32,
        "color": "#d4af37",
        "opacity": 0.16
      },
      "dark": {
        "offsetX": 0,
        "offsetY": 4,
        "blurRadius": 40,
        "color": "#d4af37",
        "opacity": 0.1
      }
    },
    "goldLg": {
      "light": {
        "offsetX": 0,
        "offsetY": 8,
        "blurRadius": 56,
        "color": "#d4af37",
        "opacity": 0.22
      },
      "dark": {
        "offsetX": 0,
        "offsetY": 12,
        "blurRadius": 64,
        "color": "#d4af37",
        "opacity": 0.14
      }
    }
  },
  "status": {
    "neutral": {
      "foreground": "#adadad",
      "background": "#1f1f1f",
      "border": "#2a2a2a",
      "iconName": "circle",
      "textRequired": true,
      "accessibilityNote": "Provide aria-label or visible text describing the neutral state. Do not rely on gray color alone."
    },
    "information": {
      "foreground": "#60a5fa",
      "background": "#1e2a3a",
      "border": "#1e3a5a",
      "iconName": "info",
      "textRequired": true,
      "accessibilityNote": "Use role='status' and aria-live='polite' for informational updates. Always accompany with visible text label."
    },
    "warning": {
      "foreground": "#cf6644",
      "background": "#2a1a0f",
      "border": "#3a2010",
      "iconName": "alert-triangle",
      "textRequired": true,
      "accessibilityNote": "Use role='alert' for warnings that require immediate attention. Text must describe the warning — do not rely on amber/orange color alone."
    },
    "submitted": {
      "foreground": "#e9d99a",
      "background": "#1a1508",
      "border": "#2a2010",
      "iconName": "upload",
      "textRequired": true,
      "accessibilityNote": "Announce 'Transfer submitted — awaiting processing' to screen readers via aria-live='polite'. Submission does not guarantee completion."
    },
    "processing": {
      "foreground": "#d4af37",
      "background": "#1a1508",
      "border": "#3a2e0a",
      "iconName": "loader",
      "textRequired": true,
      "accessibilityNote": "Use aria-live='polite' and aria-busy='true' on the containing region. Announce 'Processing your transfer' — never say 'almost done' without certainty."
    },
    "completed": {
      "foreground": "#6b9a78",
      "background": "#0d1a10",
      "border": "#1a3020",
      "iconName": "check-circle",
      "textRequired": true,
      "accessibilityNote": "Announce completion with aria-live='assertive' only for the first status change to completed. Use visible text 'Transfer complete' or equivalent. Never show a checkmark without text."
    },
    "failed": {
      "foreground": "#f87171",
      "background": "#1f0a0a",
      "border": "#3a1010",
      "iconName": "x-circle",
      "textRequired": true,
      "accessibilityNote": "Use role='alert' and aria-live='assertive'. Always explain what failed and provide a path forward (retry, contact support). Never show only a red X icon."
    },
    "cancelled": {
      "foreground": "#ef4444",
      "background": "#1f0a0a",
      "border": "#3a1010",
      "iconName": "x-circle",
      "textRequired": true,
      "accessibilityNote": "Use role='alert'. Display visible text 'Transfer cancelled'. Include the cancellation reason if available. Screen readers must not convey cancellation by color alone."
    },
    "refundPending": {
      "foreground": "#cf6644",
      "background": "#1f1008",
      "border": "#3a2010",
      "iconName": "clock",
      "textRequired": true,
      "accessibilityNote": "Announce 'Refund pending — expected within X business days'. Use aria-live='polite'. Consumer must provide the estimated timeframe string."
    },
    "refunded": {
      "foreground": "#ab7549",
      "background": "#1a1008",
      "border": "#2a1a08",
      "iconName": "rotate-ccw",
      "textRequired": true,
      "accessibilityNote": "Announce 'Refund completed'. Use aria-live='polite'. Show refunded amount prominently alongside status label."
    },
    "reversed": {
      "foreground": "#ab7549",
      "background": "#1a1008",
      "border": "#2a1a08",
      "iconName": "arrow-left",
      "textRequired": true,
      "accessibilityNote": "Announce 'Transaction reversed'. Use aria-live='polite'. Always display the reversal reference number alongside status text."
    },
    "stale": {
      "foreground": "#cf6644",
      "background": "#1f1208",
      "border": "#3a2010",
      "iconName": "alert-triangle",
      "textRequired": true,
      "accessibilityNote": "Announce 'Rate data may be outdated' with aria-live='polite'. Always provide a refresh action. Never hide stale data — show it with a clear warning label."
    },
    "offline": {
      "foreground": "#adadad",
      "background": "#141414",
      "border": "#2a2a2a",
      "iconName": "wifi-off",
      "textRequired": true,
      "accessibilityNote": "Announce 'No internet connection' with aria-live='assertive' on first detection. Use role='status' for persistent offline banners. Always display 'You are offline' text — never rely solely on a wifi-off icon."
    },
    "unavailable": {
      "foreground": "#adadad",
      "background": "#141414",
      "border": "#2a2a2a",
      "iconName": "alert-circle",
      "textRequired": true,
      "accessibilityNote": "Use aria-live='polite'. Always name the unavailable service (e.g., 'Transfer service is temporarily unavailable'). Provide support contact or retry option."
    }
  }
} as const;

export type SemanticTokens = typeof semanticTokens;
export type TextStyleKey = keyof typeof semanticTokens.textStyle;
export type StatusKey = keyof typeof semanticTokens.status;
export type InteractionTokens = typeof semanticTokens.interaction;
export type LayoutTokens = typeof semanticTokens.layout;
export type MotionTokens = typeof semanticTokens.motion;
export type ElevationTokens = typeof semanticTokens.elevation;

export default semanticTokens;
