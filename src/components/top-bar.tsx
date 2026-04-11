'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';

import { PrimaryButton } from '@/components/primary-button';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/get-dictionary';
import { supabase } from '@/lib/supabase/supabaseClient';
import { ensureProfileForUser, type Profile } from '@/lib/supabase/profiles';

type TopBarProps = {
  locale?: Locale;
  labels: Dictionary['topBar'];
  onSettings?: () => void;
};

const RESET_FLAG_STORAGE_KEY = 'astrabuilder-auth-reset';

export function TopBar({ locale = DEFAULT_LOCALE, labels, onSettings }: TopBarProps) {
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
  const builderHref = `/${locale}/create`;
  const decksHref = `/${locale}/decks`;
  const collectionHref = `/${locale}/collection`;
  const isBuilderRoute = pathname === builderHref || pathname?.startsWith(`${builderHref}/`);
  const isDecksRoute = pathname === decksHref || pathname?.startsWith(`${decksHref}/`);
  const isCollectionRoute = pathname === collectionHref || pathname?.startsWith(`${collectionHref}/`);

  const shouldShowSignInButton = isAuthReady && !user;
  const shouldShowProfileButton = isAuthReady && !!user;
  const profileFallbackLabel = user?.email ?? labels.accountFallback;
  const profileName =
    profile?.username && profile.username.trim().length > 0
      ? profile.username.trim()
      : profileFallbackLabel;
  const profileDisplayLabel = isProfileLoading ? '...' : profileName;
  const profileButtonTitle = profileName;
  const signOutLabel = isSigningOut ? labels.signingOut : labels.signOut;

  return (
    <header className="sticky top-0 z-50 border-b border-transparent bg-[#2b2927] backdrop-blur">
      <div className="flex h-16 w-full items-center gap-4 px-4 sm:px-6">
        <span className={`shrink-0 text-lg font-semibold ${toolbarTextClass}`}>
          <Link href={`/${locale}`} className="flex items-center">
            <Image
              src="/images/astrabuilder_logo.png"
              alt="AstraBuilder Logo"
              width={120}
              height={32}
              priority
            />
          </Link>
        </span>
        <nav className="flex min-w-0 flex-1 items-center justify-center overflow-x-auto px-2 [scrollbar-width:none]">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={builderHref}
              className={`border-b-[3px] px-3 py-2 text-base font-semibold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                isBuilderRoute
                  ? 'border-[color:var(--accent)] text-white'
                  : 'border-transparent text-white/85 hover:border-[color:var(--accent)] hover:text-white'
              }`}
            >
              {labels.builder}
            </Link>
            <Link
              href={decksHref}
              className={`border-b-[3px] px-3 py-2 text-base font-semibold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                isDecksRoute
                  ? 'border-[color:var(--accent)] text-white'
                  : 'border-transparent text-white/85 hover:border-[color:var(--accent)] hover:text-white'
              }`}
            >
              {labels.decks}
            </Link>
            <Link
              href={collectionHref}
              className={`border-b-[3px] px-3 py-2 text-base font-semibold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                isCollectionRoute
                  ? 'border-[color:var(--accent)] text-white'
                  : 'border-transparent text-white/85 hover:border-[color:var(--accent)] hover:text-white'
              }`}
            >
              {labels.collection}
            </Link>
          </div>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-4">
          {shouldShowSignInButton ? (
            <PrimaryButton className="px-4" type="button" href={`/${locale}/sign-in`}>
              {labels.signIn}
            </PrimaryButton>
          ) : null}
          {shouldShowProfileButton ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
                aria-busy={isProfileLoading}
                aria-label={labels.profile}
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
                    {labels.myDecks}
                  </button>
                  <div className="border-t border-[color:var(--border)]" />
                  <button
                    type="button"
                    onClick={handleProfileNavigate}
                    className={`block w-full px-4 py-2 text-left text-sm transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${menuTextClass}`}
                    role="menuitem"
                  >
                    {labels.profile}
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
              <span className="sr-only">{labels.toggleSettingsMenu}</span>
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
                  {labels.settings}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
