"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useTheme } from "@/theme/theme-provider";

type TopBarProps = {
  onSettings?: () => void;
};

export function TopBar({ onSettings }: TopBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) {
        return;
      }

      const target = event.target as Node;
      if (!containerRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  function toggleMenu() {
    setIsMenuOpen((previous) => !previous);
  }

  function handleSettingsClick() {
    setIsMenuOpen(false);

    if (onSettings) {
      onSettings();
    }
  }

  function handleThemeToggle() {
    toggleTheme();
  }

  const isDark = theme === "dark";
  const themeLabel = isDark ? "Dark Mode" : "Light Mode";
  const trackClasses = `relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
    isDark ? "bg-[color:var(--accent)]/80" : "bg-[color:var(--surface-muted)]"
  }`;
  const thumbStyle: CSSProperties = {
    transform: isDark ? "translateX(16px)" : "translateX(2px)",
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--border)] bg-[var(--surface-overlay)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <span className="text-lg font-semibold text-[color:var(--text-primary)]">Logo Placeholder</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            Sign in
          </button>
          <div className="relative" ref={containerRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={toggleMenu}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--border)] transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            >
              <span className="sr-only">Toggle settings menu</span>
              <span className="flex flex-col items-center justify-center gap-1">
                <span className="block h-0.5 w-5 bg-[color:var(--text-primary)]"></span>
                <span className="block h-0.5 w-5 bg-[color:var(--text-primary)]"></span>
                <span className="block h-0.5 w-5 bg-[color:var(--text-primary)]"></span>
              </span>
            </button>
            {isMenuOpen ? (
              <div
                className="absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg"
                role="menu"
              >
                <button
                  type="button"
                  onClick={handleSettingsClick}
                  className="block w-full px-4 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)]"
                  role="menuitem"
                >
                  Settings
                </button>
                <div className="border-t border-[color:var(--border)]" />
                <button
                  type="button"
                  onClick={handleThemeToggle}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)]"
                  role="menuitem"
                >
                  <span className="font-semibold text-[color:var(--text-primary)]">{themeLabel}</span>
                  <span className={trackClasses} aria-hidden="true">
                    <span
                      className="inline-block h-4 w-4 rounded-full bg-[color:var(--surface)] shadow transition-transform"
                      style={thumbStyle}
                    />
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}