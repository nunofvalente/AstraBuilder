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
  showPlay?: boolean;
  onSettings?: () => void;
};

const RESET_FLAG_STORAGE_KEY = 'astrabuilder-auth-reset';

export function TopBar({ locale = DEFAULT_LOCALE, labels, showPlay = false, onSettings }: TopBarProps) {
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isDecksMenuOpen, setIsDecksMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authEvent, setAuthEvent] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const decksMenuRef = useRef<HTMLDivElement | null>(null);
  const decksMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (!isSettingsMenuOpen && !isUserMenuOpen && !isDecksMenuOpen) {
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
      if (
        isDecksMenuOpen &&
        decksMenuRef.current &&
        !decksMenuRef.current.contains(target)
      ) {
        setIsDecksMenuOpen(false);
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
        if (isDecksMenuOpen) {
          setIsDecksMenuOpen(false);
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDecksMenuOpen, isSettingsMenuOpen, isUserMenuOpen]);

  useEffect(
    () => () => {
      if (decksMenuCloseTimerRef.current) {
        clearTimeout(decksMenuCloseTimerRef.current);
      }
    },
    []
  );

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
    setIsDecksMenuOpen(false);
    setIsSettingsMenuOpen((previous) => !previous);
  }

  function toggleUserMenu() {
    setIsDecksMenuOpen(false);
    setIsSettingsMenuOpen(false);
    setIsUserMenuOpen((previous) => !previous);
  }

  function openDecksMenu() {
    setIsSettingsMenuOpen(false);
    setIsUserMenuOpen(false);
    setIsDecksMenuOpen(true);
  }

  function handleDecksMenuMouseEnter() {
    if (decksMenuCloseTimerRef.current) {
      clearTimeout(decksMenuCloseTimerRef.current);
      decksMenuCloseTimerRef.current = null;
    }
    setIsSettingsMenuOpen(false);
    setIsUserMenuOpen(false);
    setIsDecksMenuOpen(true);
  }

  function handleDecksMenuMouseLeave() {
    decksMenuCloseTimerRef.current = setTimeout(() => {
      setIsDecksMenuOpen(false);
      decksMenuCloseTimerRef.current = null;
    }, 140);
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

  function handleCollectionNavigate() {
    setIsUserMenuOpen(false);
    router.push(`/${locale}/my-collection`);
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
      setIsDecksMenuOpen(false);
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
  const playHref = `/${locale}/play`;
  const matchHref = `/${locale}/match`;
  const decksHref = `/${locale}/decks`;
  const myDecksHref = `/${locale}/my-decks`;
  const myDecksNavigationHref = user
    ? myDecksHref
    : `/${locale}/sign-in?redirect=${encodeURIComponent(myDecksHref)}`;
  const collectionHref = `/${locale}/collection`;
  const isBuilderRoute = pathname === builderHref || pathname?.startsWith(`${builderHref}/`);
  const isPlayRoute = pathname === playHref || pathname?.startsWith(`${playHref}/`);
  const isMatchRoute = pathname === matchHref || pathname?.startsWith(`${matchHref}/`);
  const isCommunityDecksRoute = pathname === decksHref || pathname?.startsWith(`${decksHref}/`);
  const isMyDecksRoute = pathname === myDecksHref || pathname?.startsWith(`${myDecksHref}/`);
  const isDecksRoute = isCommunityDecksRoute || isMyDecksRoute;
  const isCollectionRoute = pathname === collectionHref || pathname?.startsWith(`${collectionHref}/`);
  const topLevelNavItems = [
    ...(showPlay
      ? [{ href: playHref, label: labels.play, isActive: isPlayRoute, isBeta: true, isDecksMenu: false }]
      : []),
    { href: builderHref, label: labels.builder, isActive: isBuilderRoute, isBeta: false, isDecksMenu: false },
    { href: decksHref, label: labels.decks, isActive: isDecksRoute, isBeta: false, isDecksMenu: true },
    {
      href: collectionHref,
      label: labels.collection,
      isActive: isCollectionRoute,
      isBeta: false,
      isDecksMenu: false,
    },
  ];

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

  if (isMatchRoute) {
    return null;
  }

  return (
    <header className="app-top-bar sticky top-0 z-50 border-b border-white/10 bg-[#2b2927] backdrop-blur">
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
        <nav className="hidden min-w-0 flex-1 items-center justify-center overflow-visible px-2 sm:flex">
          <div className="flex items-center gap-2 sm:gap-3">
            {topLevelNavItems.map((item) => {
              if (item.isDecksMenu) {
                return (
                  <div
                    key={item.href}
                    className="relative"
                    ref={decksMenuRef}
                    onMouseEnter={handleDecksMenuMouseEnter}
                    onMouseLeave={handleDecksMenuMouseLeave}
                  >
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={isDecksMenuOpen}
                      onClick={openDecksMenu}
                      className={`border-b-[3px] px-3 py-2 text-base font-semibold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                        item.isActive
                          ? 'border-[color:var(--accent)] text-white'
                          : 'border-transparent text-white/85 hover:border-[color:var(--accent)] hover:text-white'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {item.label}
                        <svg
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                          className={`h-4 w-4 transition-transform ${isDecksMenuOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>
                    {isDecksMenuOpen ? (
                      <div
                        className="absolute left-1/2 top-full z-50 mt-2 w-52 -translate-x-1/2 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl"
                        role="menu"
                      >
                        <Link
                          href={decksHref}
                          onClick={() => setIsDecksMenuOpen(false)}
                          className={`block px-4 py-3 text-sm font-semibold transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${
                            isCommunityDecksRoute ? `bg-[var(--surface-muted)] ${menuTextClass}` : menuTextClass
                          }`}
                          role="menuitem"
                        >
                          {labels.communityDecks}
                        </Link>
                        <div className="border-t border-[color:var(--border)]" />
                        <Link
                          href={myDecksNavigationHref}
                          onClick={() => setIsDecksMenuOpen(false)}
                          className={`block px-4 py-3 text-sm font-semibold transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${
                            isMyDecksRoute ? `bg-[var(--surface-muted)] ${menuTextClass}` : menuTextClass
                          }`}
                          role="menuitem"
                        >
                          {labels.myDecks}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`border-b-[3px] px-3 py-2 text-base font-semibold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                    item.isActive
                      ? 'border-[color:var(--accent)] text-white'
                      : 'border-transparent text-white/85 hover:border-[color:var(--accent)] hover:text-white'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {item.label}
                    {item.isBeta ? (
                      <span className="rounded-full border border-[color:var(--accent)]/55 bg-[color:var(--accent)]/15 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase leading-none tracking-[0.12em] text-[color:var(--accent)]">
                        {labels.beta}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
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
                    onClick={handleCollectionNavigate}
                    className={`block w-full px-4 py-2 text-left text-sm transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${menuTextClass}`}
                    role="menuitem"
                  >
                    {labels.myCollection}
                  </button>
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
                <div className="sm:hidden">
                  {topLevelNavItems.map((item) => {
                    if (item.isDecksMenu) {
                      return (
                        <div key={item.href}>
                          <div
                            className={`px-4 pb-1 pt-3 text-[0.65rem] font-bold uppercase tracking-[0.14em] ${
                              item.isActive ? 'text-[color:var(--accent)]' : menuTextClass
                            }`}
                          >
                            {item.label}
                          </div>
                          <Link
                            href={decksHref}
                            onClick={() => setIsSettingsMenuOpen(false)}
                            className={`block w-full py-2 pl-7 pr-4 text-left text-sm font-semibold transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${
                              isCommunityDecksRoute
                                ? `bg-[var(--surface-muted)] ${menuTextClass}`
                                : menuTextClass
                            }`}
                            role="menuitem"
                          >
                            {labels.communityDecks}
                          </Link>
                          <Link
                            href={myDecksNavigationHref}
                            onClick={() => setIsSettingsMenuOpen(false)}
                            className={`block w-full py-2 pl-7 pr-4 text-left text-sm font-semibold transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${
                              isMyDecksRoute
                                ? `bg-[var(--surface-muted)] ${menuTextClass}`
                                : menuTextClass
                            }`}
                            role="menuitem"
                          >
                            {labels.myDecks}
                          </Link>
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsSettingsMenuOpen(false)}
                        className={`block w-full px-4 py-2 text-left text-sm font-semibold transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:bg-[var(--surface-muted)] ${
                          item.isActive
                            ? 'bg-[var(--surface-muted)] text-[color:var(--accent)]'
                            : menuTextClass
                        }`}
                        role="menuitem"
                      >
                        <span className="inline-flex items-center gap-2">
                          {item.label}
                          {item.isBeta ? (
                            <span className="rounded-full bg-[color:var(--accent)]/15 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[color:var(--accent)]">
                              {labels.beta}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}
                  <div className="border-t border-[color:var(--border)]" />
                </div>
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
