'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import type { User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { PrimaryButton } from '@/components/primary-button';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/i18n/config';
import { supabase } from '@/lib/supabase/supabaseClient';
import { ensureProfileForUser, type Profile } from '@/lib/supabase/profiles';
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

const SIGN_IN_LABELS: Record<Locale, string> = {
  de: 'Anmelden',
  en: 'Sign in',
  fr: 'Se connecter',
  ms: 'Log masuk',
};

const ACCOUNT_FALLBACK_LABELS: Record<Locale, string> = {
  de: 'Konto',
  en: 'Account',
  fr: 'Compte',
  ms: 'Akaun',
};

const PROFILE_MENU_LABELS: Record<Locale, string> = {
  de: 'Profil',
  en: 'Profile',
  fr: 'Profil',
  ms: 'Profil',
};

const RESET_FLAG_STORAGE_KEY = 'astrabuilder-auth-reset';

export function TopBar({ locale = DEFAULT_LOCALE, onSettings }: TopBarProps) {
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [sessionType, setSessionType] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const userId = user?.id ?? null;

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) {
          return;
        }

        setUser(session?.user ?? null);
        setSessionType(session?.type ?? null);
        setIsAuthReady(true);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        console.error('Failed to fetch session', error);
        setIsAuthReady(true);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      if (!isMounted) {
        return;
      }

      setUser(session?.user ?? null);
      setSessionType(session?.type ?? null);
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isAuthReady) {
      return;
    }

    if (sessionType === null) {
      return;
    }

    if (sessionType === 'recovery') {
      const hasRecoveryFlag = window.localStorage.getItem(RESET_FLAG_STORAGE_KEY) === '1';
      const requiredPath = `/${locale}/reset-password`;
      if (!hasRecoveryFlag) {
        window.localStorage.removeItem(RESET_FLAG_STORAGE_KEY);
        void supabase.auth.signOut();
        router.replace(`/${locale}/sign-in?reset=expired`);
        return;
      }

      if (pathname !== requiredPath) {
        router.replace(requiredPath);
      }
    } else {
      window.localStorage.removeItem(RESET_FLAG_STORAGE_KEY);
    }
  }, [sessionType, locale, pathname, router, isAuthReady]);

  useEffect(() => {
    if (!isSettingsMenuOpen && !isLanguageMenuOpen && !isUserMenuOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        isSettingsMenuOpen &&
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(target)
      ) {
        setIsSettingsMenuOpen(false);
      }
      if (
        isLanguageMenuOpen &&
        languageMenuRef.current &&
        !languageMenuRef.current.contains(target)
      ) {
        setIsLanguageMenuOpen(false);
      }
      if (
        isUserMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(target)
      ) {
        setIsUserMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (isSettingsMenuOpen) {
          setIsSettingsMenuOpen(false);
        }
        if (isLanguageMenuOpen) {
          setIsLanguageMenuOpen(false);
        }
        if (isUserMenuOpen) {
          setIsUserMenuOpen(false);
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLanguageMenuOpen, isSettingsMenuOpen, isUserMenuOpen]);

  useEffect(() => {
    if (!user || !userId) {
      setProfile(null);
      setIsProfileLoading(false);
      return;
    }

    let isActive = true;
    setIsProfileLoading(true);

    ensureProfileForUser(user)
      .then((nextProfile) => {
        if (!isActive) {
          return;
        }
        setProfile(nextProfile);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        console.error('Failed to load profile', error);
        setProfile(null);
      })
      .finally(() => {
        if (isActive) {
          setIsProfileLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [user, userId]);

  function toggleSettingsMenu() {
    setIsLanguageMenuOpen(false);
    setIsUserMenuOpen(false);
    setIsSettingsMenuOpen((previous) => !previous);
  }

  function toggleUserMenu() {
    setIsLanguageMenuOpen(false);
    setIsSettingsMenuOpen(false);
    setIsUserMenuOpen((previous) => !previous);
  }

  function toggleLanguageMenu() {
    setIsSettingsMenuOpen(false);
    setIsUserMenuOpen(false);
    setIsLanguageMenuOpen((previous) => !previous);
  }

  function handleSettingsClick() {
    setIsSettingsMenuOpen(false);
    setIsUserMenuOpen(false);

    if (onSettings) {
      onSettings();
    }
  }

  function handleThemeToggle() {
    toggleTheme();
  }

  function handleProfileNavigate() {
    setIsUserMenuOpen(false);
    router.push(`/${locale}/profile`);
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
      setIsUserMenuOpen(false);
      setIsSettingsMenuOpen(false);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(RESET_FLAG_STORAGE_KEY);
      }
      const homepagePath = `/${locale}`;
      router.replace(homepagePath);
      router.refresh();
    }
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
    setIsSettingsMenuOpen(false);
    setIsUserMenuOpen(false);

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
  const signInLabel = SIGN_IN_LABELS[locale];
  const accountFallbackLabel = ACCOUNT_FALLBACK_LABELS[locale];
  const profileMenuLabel = PROFILE_MENU_LABELS[locale];

  const shouldShowSignInButton = isAuthReady && !user;
  const shouldShowProfileButton = isAuthReady && !!user;
  const profileFallbackLabel = user?.email ?? accountFallbackLabel;
  const profileName = profile?.username && profile.username.trim().length > 0 ? profile.username.trim() : profileFallbackLabel;
  const profileDisplayLabel = isProfileLoading ? '...' : profileName;
  const profileButtonTitle = profileName;
  const signOutLabel = isSigningOut ? 'Signing out...' : 'Sign out';

  return (
    <header className="sticky top-0 z-50 border-b border-transparent bg-[#2b2927] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <span className={`text-lg font-semibold ${toolbarTextClass}`}>
          <Link href="/" className="flex items-center">
            <Image
              src="/images/astrabuilder_logo.png"
              alt="AstraBuilder Logo"
              width={120}
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
              {signInLabel}
            </PrimaryButton>
          ) : null}
          {shouldShowProfileButton ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
                aria-busy={isProfileLoading}
                aria-label={profileMenuLabel}
                title={profileButtonTitle}
                onClick={toggleUserMenu}
                className={`max-w-[200px] truncate rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${isUserMenuOpen ? 'bg-[var(--surface-muted)]' : ''}`}
              >
                {profileDisplayLabel}
              </button>
              {isUserMenuOpen ? (
                <div
                  className="absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg"
                  role="menu"
                >
                  <button
                    type="button"
                    onClick={handleProfileNavigate}
                    className={`block w-full px-4 py-2 text-left text-sm transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${menuTextClass}`}
                    role="menuitem"
                  >
                    {profileMenuLabel}
                  </button>
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
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="relative" ref={settingsMenuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isSettingsMenuOpen}
              onClick={toggleSettingsMenu}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--border)] transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            >
              <span className="sr-only">Toggle settings menu</span>
              <span className="flex flex-col items-center justify-center gap-1">
                <span className={`block h-0.5 w-5 ${barColorClass}`}></span>
                <span className={`block h-0.5 w-5 ${barColorClass}`}></span>
                <span className={`block h-0.5 w-5 ${barColorClass}`}></span>
              </span>
            </button>
            {isSettingsMenuOpen ? (
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
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
