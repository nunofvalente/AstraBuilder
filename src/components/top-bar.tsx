'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';

import { PrimaryButton } from '@/components/primary-button';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { supabase } from '@/lib/supabase/supabaseClient';
import { ensureProfileForUser, type Profile } from '@/lib/supabase/profiles';

type TopBarProps = {
  locale?: Locale;
  onSettings?: () => void;
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

const MY_DECKS_LABELS: Record<Locale, string> = {
  de: 'Meine Decks',
  en: 'My Decks',
  fr: 'Mes decks',
  ms: 'Dek Saya',
};

const RESET_FLAG_STORAGE_KEY = 'astrabuilder-auth-reset';

export function TopBar({ locale = DEFAULT_LOCALE, onSettings }: TopBarProps) {
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authEvent, setAuthEvent] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
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
        setAuthEvent(null);
        setIsAuthReady(true);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        console.error('Failed to fetch session', error);
        setIsAuthReady(true);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      setUser(session?.user ?? null);
      setAuthEvent(event ?? null);
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

    if (authEvent === 'PASSWORD_RECOVERY') {
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
  }, [authEvent, locale, pathname, router, isAuthReady]);

  useEffect(() => {
    if (!isSettingsMenuOpen && !isUserMenuOpen) {
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
  }, [isSettingsMenuOpen, isUserMenuOpen]);

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
    setIsUserMenuOpen(false);
    setIsSettingsMenuOpen((previous) => !previous);
  }

  function toggleUserMenu() {
    setIsUserMenuOpen((previous) => !previous);
  }

  function handleSettingsNavigate() {
    setIsSettingsMenuOpen(false);
    setIsUserMenuOpen(false);

    if (onSettings) {
      onSettings();
      return;
    }

    router.push(`/${locale}/settings`);
  }

  function handleProfileNavigate() {
    setIsUserMenuOpen(false);
    router.push(`/${locale}/profile`);
  }

  function handleMyDecksNavigate() {
    setIsUserMenuOpen(false);
    router.push(`/${locale}/my-decks`);
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
      setIsSettingsMenuOpen(false);
      setIsUserMenuOpen(false);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(RESET_FLAG_STORAGE_KEY);
      }
      const homepagePath = `/${locale}`;
      router.replace(homepagePath);
      router.refresh();
    }
  }

  const toolbarTextClass = 'text-white';
  const menuTextClass = 'text-[color:var(--text-primary)]';
  const barColorClass = 'bg-white';
  const signInLabel = SIGN_IN_LABELS[locale];
  const accountFallbackLabel = ACCOUNT_FALLBACK_LABELS[locale];
  const profileMenuLabel = PROFILE_MENU_LABELS[locale];
  const myDecksLabel = MY_DECKS_LABELS[locale];

  const shouldShowSignInButton = isAuthReady && !user;
  const shouldShowProfileButton = isAuthReady && !!user;
  const profileFallbackLabel = user?.email ?? accountFallbackLabel;
  const profileName =
    profile?.username && profile.username.trim().length > 0
      ? profile.username.trim()
      : profileFallbackLabel;
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
          {shouldShowSignInButton ? (
            <PrimaryButton className="px-4" type="button" href={`/${locale}/sign-in`}>
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
                className={`max-w-[200px] truncate rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60 ${isUserMenuOpen ? 'opacity-90' : ''}`}
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
                    onClick={handleMyDecksNavigate}
                    className={`block w-full px-4 py-2 text-left text-sm font-semibold transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${menuTextClass}`}
                    role="menuitem"
                  >
                    {myDecksLabel}
                  </button>
                  <div className="border-t border-[color:var(--border)]" />
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
                  onClick={handleSettingsNavigate}
                  className={`block w-full px-4 py-2 text-left text-sm transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${menuTextClass}`}
                  role="menuitem"
                >
                  Settings
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
