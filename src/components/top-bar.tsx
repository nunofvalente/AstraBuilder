"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/i18n/config";
import { useTheme } from "@/theme/theme-provider";

type TopBarProps = {
  locale?: Locale;
  onSettings?: () => void;
};

const LANGUAGE_LABELS: Record<Locale, string> = {
  de: "German",
  en: "English",
  fr: "French",
  ms: "Malay",
};

export function TopBar({ locale = DEFAULT_LOCALE, onSettings }: TopBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isMenuOpen && !isLanguageMenuOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (isMenuOpen && settingsMenuRef.current && !settingsMenuRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
      if (isLanguageMenuOpen && languageMenuRef.current && !languageMenuRef.current.contains(target)) {
        setIsLanguageMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isMenuOpen) {
          setIsMenuOpen(false);
        }
        if (isLanguageMenuOpen) {
          setIsLanguageMenuOpen(false);
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLanguageMenuOpen, isMenuOpen]);

  function toggleMenu() {
    setIsLanguageMenuOpen(false);
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

  function toggleLanguageMenu() {
    setIsMenuOpen(false);
    setIsLanguageMenuOpen((previous) => !previous);
  }

  function buildLocaleHref(targetLocale: Locale) {
    if (!pathname || pathname === "/") {
      return `/${targetLocale}`;
    }

    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return `/${targetLocale}`;
    }

    const [firstSegment, ...rest] = segments;
    if (SUPPORTED_LOCALES.includes(firstSegment as Locale)) {
      return `/${[targetLocale, ...rest].join("/")}`;
    }

    return `/${targetLocale}/${segments.join("/")}`;
  }

  function handleLanguageSelect(targetLocale: Locale) {
    setIsLanguageMenuOpen(false);

    if (targetLocale === locale) {
      return;
    }

    const href = buildLocaleHref(targetLocale);
    router.push(href);
  }

  const isDark = theme === "dark";
  const themeLabel = isDark ? "Dark Mode" : "Light Mode";
  const trackClasses = `relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
    isDark ? "bg-[color:var(--accent)]/80" : "bg-[color:var(--surface-muted)]"
  }`;
  const thumbStyle: CSSProperties = {
    transform: isDark ? "translateX(16px)" : "translateX(2px)",
  };
  const languageLabel = LANGUAGE_LABELS[locale];

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--border)] bg-[var(--surface-overlay)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <span className="text-lg font-semibold text-[color:var(--text-primary)]">Logo Placeholder</span>
        <div className="flex items-center gap-4">
          <div className="relative" ref={languageMenuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isLanguageMenuOpen}
              onClick={toggleLanguageMenu}
              className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            >
              <span>{languageLabel}</span>
              <span aria-hidden="true" className="text-xs text-[color:var(--text-secondary)]">
                {isLanguageMenuOpen ? "^" : "v"}
              </span>
            </button>
            {isLanguageMenuOpen ? (
              <div
                className="absolute right-0 mt-2 w-40 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg"
                role="menu"
              >
                {SUPPORTED_LOCALES.map((supportedLocale) => {
                  const label = LANGUAGE_LABELS[supportedLocale];
                  const isActive = supportedLocale === locale;

                  return (
                    <button
                      key={supportedLocale}
                      type="button"
                      onClick={() => handleLanguageSelect(supportedLocale)}
                      className={`block w-full px-4 py-2 text-left text-sm transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${
                        isActive ? "font-semibold text-[color:var(--text-primary)]" : "text-[color:var(--text-secondary)]"
                      }`}
                      role="menuitemradio"
                      aria-checked={isActive}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            Sign in
          </button>
          <div className="relative" ref={settingsMenuRef}>
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
