export type DesignTokenName =
  | "background"
  | "foreground"
  | "surface"
  | "surfaceMuted"
  | "surfaceOverlay"
  | "border"
  | "textPrimary"
  | "textSecondary"
  | "accent"
  | "textOnAccent"
  | "bannerBackground"
  | "bannerTextGradient"
  | "bannerOverlay";

export type DesignTokens = Record<DesignTokenName, string>;

export const DESIGN_TOKENS: Record<"light" | "dark", DesignTokens> = {
  light: {
    background: "#fafaf7",
    foreground: "#292826",
    surface: "#ffffff",
    surfaceMuted: "#f0efe9",
    surfaceOverlay: "rgba(250, 250, 247, 0.9)",
    border: "#d9d6d0",
    textPrimary: "#292826",
    textSecondary: "#5f5c58",
    accent: "#9c3f1d",
    textOnAccent: "#fafaf7",
    bannerBackground: "#2e2d2a",
    bannerTextGradient: "linear-gradient(135deg, #f8f8f8 0%, #c4c4c4 50%, #f0f0f0 100%)",
    bannerOverlay: "rgba(46, 45, 42, 0.78)",
  },
  dark: {
    background: "#363432",
    foreground: "#ebb871",
    surface: "#2c2a28",
    surfaceMuted: "#413f3d",
    surfaceOverlay: "rgba(54, 52, 50, 0.92)",
    border: "#4a4643",
    textPrimary: "#ebb871",
    textSecondary: "#d9ad65",
    accent: "#f18f3b",
    textOnAccent: "#1f1c1a",
    bannerBackground: "#222e38",
    bannerTextGradient: "linear-gradient(135deg, #cf9c1b 0%, #e3c249 100%)",
    bannerOverlay: "rgba(34, 46, 56, 0.78)",
  },
} as const;

export const DESIGN_TOKEN_KEYS = Object.keys(DESIGN_TOKENS.light) as DesignTokenName[];
