"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { DESIGN_TOKEN_KEYS, DESIGN_TOKENS, type DesignTokenName } from "./design-tokens";

type Theme = "light" | "dark";

const DEFAULT_THEME: Theme = "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "astrabuilder-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch (error) {
    console.warn("Unable to access theme in localStorage", error);
  }

  return DEFAULT_THEME;
}

const TOKEN_VARIABLES = DESIGN_TOKEN_KEYS.reduce<Record<DesignTokenName, string>>((accumulator, token) => {
  const cssVariable = `--${token.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
  accumulator[token] = cssVariable;
  return accumulator;
}, {} as Record<DesignTokenName, string>);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const body = document.body;
  const tokens = DESIGN_TOKENS[theme];

  root.dataset.theme = theme;
  body.dataset.theme = theme;
  root.style.colorScheme = theme;

  DESIGN_TOKEN_KEYS.forEach((token) => {
    root.style.setProperty(TOKEN_VARIABLES[token], tokens[token]);
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);

    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      console.warn("Unable to persist theme in localStorage", error);
    }
  }, [theme]);

  useEffect(() => {
    applyTheme(theme);
  }, []);

  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((previous) => (previous === "light" ? "dark" : "light"));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
