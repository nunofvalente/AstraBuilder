'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import type { User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { PrimaryButton } from '@/components/primary-button';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/i18n/config';
import { supabase } from '@/lib/supabase/supabaseClient';
import { useTheme } from '@/theme/theme-provider';
import Link from 'next/link';

type TopBarProps = {
  locale?: Locale;
  onSettings?: () => void;
};

const LANGUAGE_LABELS: Record<Locale, string> = {
  de: 'German',
  en: 'English',
  fr: 'French',
  ms: 'Malay',
};

export function TopBar({ locale = DEFAULT_LOCALE, onSettings }: TopBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) {
          return;
        }

        setUser(session?.user ?? null);
        setIsAuthReady(true);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        console.error('Failed to fetch session', error);
        setIsAuthReady(true);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) {
          return;
        }

        setUser(session?.user ?? null);
        setIsAuthReady(true);
      }
    );

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isMenuOpen && !isLanguageMenuOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        isMenuOpen &&
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(target)
      ) {
        setIsMenuOpen(false);
      }
      if (
        isLanguageMenuOpen &&
        languageMenuRef.current &&
        !languageMenuRef.current.contains(target)
      ) {
        setIsLanguageMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (isMenuOpen) {
          setIsMenuOpen(false);
        }
        if (isLanguageMenuOpen) {
          setIsLanguageMenuOpen(false);
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
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

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Failed to sign out', error);
      }
    } catch (error) {
      console.error('Failed to sign out', error);
    } finally {
      setIsSigningOut(false);
      setIsMenuOpen(false);
    }
  }

  function toggleLanguageMenu() {
    setIsMenuOpen(false);
    setIsLanguageMenuOpen((previous) => !previous);
  }

  function buildLocaleHref(targetLocale: Locale) {
    if (!pathname || pathname === '/') {
      return `/${targetLocale}`;
    }

    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) {
      return `/${targetLocale}`;
    }

    const [firstSegment, ...rest] = segments;
    if (SUPPORTED_LOCALES.includes(firstSegment as Locale)) {
      return `/${[targetLocale, ...rest].join('/')}`;
    }

    return `/${targetLocale}/${segments.join('/')}`;
  }

  function handleLanguageSelect(targetLocale: Locale) {
    setIsLanguageMenuOpen(false);

    if (targetLocale === locale) {
      return;
    }

    const href = buildLocaleHref(targetLocale);
    router.push(href);
  }

  const isDark = theme === 'dark';
  const toolbarTextClass = 'text-white';
  const toolbarSecondaryTextClass = 'text-white/80';
  const menuTextClass = 'text-[color:var(--text-primary)]';
  const menuSecondaryTextClass = 'text-[color:var(--text-secondary)]';
  const barColorClass = 'bg-white';
  const themeLabel = isDark ? 'Dark Mode' : 'Light Mode';
  const trackClasses = `relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
    isDark ? 'bg-[color:var(--accent)]/80' : 'bg-[color:var(--surface-muted)]'
  }`;
  const thumbStyle: CSSProperties = {
    transform: isDark ? 'translateX(16px)' : 'translateX(2px)',
  };
  const languageLabel = LANGUAGE_LABELS[locale];

  const shouldShowSignInButton = isAuthReady && !user;
  const signOutLabel = isSigningOut ? 'Signing out...' : 'Sign out';
  return (
    <header className="sticky top-0 z-50 border-b border-transparent bg-[#2b2927] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <span className={`text-lg font-semibold ${toolbarTextClass}`}>
          <Link href="/" className="flex items-center">
            <Image
              src="/images/astrabuilder_logo.png"
              alt="AstraBuilder Logo"
              width={120} // adjust to fit your design
              height={32}
              priority
            />
          </Link>
        </span>
        <div className="flex items-center gap-4">
          <div className="relative" ref={languageMenuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isLanguageMenuOpen}
              onClick={toggleLanguageMenu}
              className={`group flex items-center gap-2 rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${toolbarTextClass} hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-muted)]`}
            >
              <span>{languageLabel}</span>
              <span
                aria-hidden="true"
                className={`text-xs ${toolbarSecondaryTextClass} group-hover:text-[color:var(--text-secondary)]`}
              >
                {isLanguageMenuOpen ? '^' : 'v'}
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
                        isActive
                          ? `text-sm font-semibold ${menuTextClass} bg-[color:var(--surface-muted)]`
                          : `text-sm ${menuSecondaryTextClass}`
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
          {shouldShowSignInButton ? (
            <PrimaryButton
              className="px-4"
              type="button"
              href={`/${locale}/sign-in`}
            >
              Sign in
            </PrimaryButton>
          ) : null}
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
                <span className={`block h-0.5 w-5 ${barColorClass}`}></span>
                <span className={`block h-0.5 w-5 ${barColorClass}`}></span>
                <span className={`block h-0.5 w-5 ${barColorClass}`}></span>
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
                  className={`block w-full px-4 py-2 text-left text-sm transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${menuTextClass}`}
                  role="menuitem"
                >
                  Settings
                </button>
                <div className="border-t border-[color:var(--border)]" />
                <button
                  type="button"
                  onClick={handleThemeToggle}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${menuTextClass}`}
                  role="menuitem"
                >
                  <span className={`font-semibold ${menuTextClass}`}>
                    {themeLabel}
                  </span>
                  <span className={trackClasses} aria-hidden="true">
                    <span
                      className="inline-block h-4 w-4 rounded-full bg-[color:var(--surface)] shadow transition-transform"
                      style={thumbStyle}
                    />
                  </span>
                </button>
                {user ? (
                  <>
                    <div className="border-t border-[color:var(--border)]" />
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                      className={`block w-full px-4 py-2 text-left text-sm transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${menuTextClass} disabled:opacity-70`}
                      role="menuitem"
                    >
                      {signOutLabel}
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
