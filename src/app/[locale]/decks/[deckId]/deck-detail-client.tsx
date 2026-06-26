'use client';

import { useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';

import type { Locale } from '@/i18n/config';
import type { Card, DeckEntry } from '@/app/[locale]/create/deck-builder/types';
import { DeckExportModal } from '@/app/[locale]/create/deck-builder/components/deck-export-modal';
import { DeckShareModal } from '@/app/[locale]/create/deck-builder/components/deck-share-modal';
import { ZoomOverlay } from '@/app/[locale]/create/deck-builder/components/zoom-overlay';
import type { ZoomAnchor } from '@/app/[locale]/create/deck-builder/components/zoom-overlay';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { DeckDetailData } from '@/lib/supabase/decks';
import { buildAffinityGradient, getAffinityIconPath, normalizeAffinity } from '@/lib/cards/affinity';
import { getAffinityColorScheme } from '@/app/[locale]/create/deck-builder/constants';

const CARD_TYPE_ORDER = ['Unit', 'Renowned Unit', 'Tactic', 'Territory'];
const FALLBACK_SECTION_LABEL = 'Other';

function ensureHttps(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

type DeckDetailsClientProps = {
  locale: Locale;
  deckId: string;
  deck: DeckDetailData | null;
  labels: {
    deckDetails: {
      heading: string;
      description: string;
      sectionsHeading: string;
      notesHeading: string;
      privateNotice: string;
      publicNotice: string;
      backButton: string;
      favoriteAdd: string;
      favoriteRemove: string;
      favoriteSignIn: string;
      favoriteError: string;
    };
    myDecks: {
      publicTag: string;
      privateTag: string;
      cardsLabel: string;
      createdLabel: string;
      favoritesLabel: string;
      viewsLabel: string;
      untitledLabel: string;
      openButton: string;
      loading: string;
      error: string;
    };
    publicProfile: {
      socialsHeading: string;
      socialsEmpty: string;
      xLabel: string;
      youtubeLabel: string;
      unknownUser: string;
    };
  };
  emptyDeckLabel: string;
  exportLabels: {
    exportHeading: string;
    exportOptionTTS: string;
    exportOptionText: string;
    emptyDeck: string;
    exportCopy: string;
    exportCopySuccess: string;
    exportCopyError: string;
  };
  shareLabels: {
    deckHeading: string;
    totalCardsLabel: string;
    shareButton: string;
    shareGenerating: string;
    shareDownload: string;
    shareCopy: string;
    shareCopySuccess: string;
    shareCopyError: string;
    shareEmpty: string;
    shareError: string;
  };
};

type Section = {
  label: string;
  entries: DeckEntry[];
  total: number;
};

type DeckStatsOverride = {
  viewsTotal?: number;
  favoritesTotal?: number;
};

type PreviewEvent = ReactMouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>;

type DeckMetaState = {
  id: string;
  title: string | null;
  description: string | null;
  isPublic: boolean;
  createdAt: string | null;
  favoritesTotal: number;
  viewsTotal: number;
  authorName: string | null;
  authorId: string | null;
  authorXLink: string | null;
  authorYoutubeLink: string | null;
};

function readDeckStatsOverride(deckId: string): DeckStatsOverride | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const key = `deck-stats:${deckId}`;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as DeckStatsOverride;
  } catch {
    return null;
  }
}

function persistDeckStatsOverride(deckId: string, updates: DeckStatsOverride) {
  if (typeof window === 'undefined') {
    return;
  }

  const key = `deck-stats:${deckId}`;
  try {
    const existingRaw = window.sessionStorage.getItem(key);
    const existing = existingRaw ? (JSON.parse(existingRaw) as DeckStatsOverride) : {};
    const next = { ...existing, ...updates };
    window.sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Ignore storage errors (quota exceeded, invalid JSON, etc.).
  }
}

function buildDeckMetaState(deck: DeckDetailData): DeckMetaState {
  let favoritesTotal = deck.favoritesTotal;
  let viewsTotal = deck.viewsTotal;

  const override = readDeckStatsOverride(deck.id);
  if (override) {
    if (typeof override.favoritesTotal === 'number') {
      favoritesTotal = Math.max(favoritesTotal, Number(override.favoritesTotal));
    }
    if (typeof override.viewsTotal === 'number') {
      viewsTotal = Math.max(viewsTotal, Number(override.viewsTotal));
    }
  }

  return {
    id: deck.id,
    title: deck.title,
    description: deck.description,
    isPublic: deck.isPublic,
    createdAt: deck.createdAt,
    favoritesTotal,
    viewsTotal,
    authorName: deck.authorName,
    authorId: deck.authorId,
    authorXLink: deck.authorXLink,
    authorYoutubeLink: deck.authorYoutubeLink,
  };
}

function resolveDatabaseDeckId(value: string | null | undefined): string | number | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  return trimmed;
}

export function DeckDetailClient({
  locale,
  deckId,
  deck,
  labels,
  emptyDeckLabel,
  exportLabels,
  shareLabels,
}: DeckDetailsClientProps) {
  const [zoomCard, setZoomCard] = useState<Card | null>(null);
  const [zoomVariant, setZoomVariant] = useState<'default' | 'compact'>('default');
  const [zoomAnchor, setZoomAnchor] = useState<ZoomAnchor | null>(null);
  const [deckEntries, setDeckEntries] = useState<DeckEntry[]>(deck?.entries ?? []);
  const [deckMeta, setDeckMeta] = useState<DeckMetaState | null>(() => (deck ? buildDeckMetaState(deck) : null));
  const [isDeckLoading, setIsDeckLoading] = useState(!deck);
  const [deckLoadError, setDeckLoadError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null | undefined>(undefined);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isFavoriteLoaded, setIsFavoriteLoaded] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [favoriteErrorMessage, setFavoriteErrorMessage] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const hasLoggedViewRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const fallbackPath = `/${locale}/decks/${encodeURIComponent(deckId)}`;
  const redirectPath = pathname ?? fallbackPath;
  const signInHref = `/${locale}/sign-in?redirect=${encodeURIComponent(redirectPath)}`;

  useEffect(() => {
    let isActive = true;

    async function loadDeck() {
      if (deck) {
        if (!isActive) {
          return;
        }

        setDeckEntries(deck.entries);
        setDeckMeta(buildDeckMetaState(deck));
        setDeckLoadError(null);
        setIsDeckLoading(false);
        return;
      }

      setIsDeckLoading(true);
      setDeckLoadError(null);

      try {
        const headers: HeadersInit = {};
        const { data: sessionResult } = await supabase.auth.getSession();
        const accessToken = sessionResult.session?.access_token?.trim();
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }

        const response = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, {
          headers,
          cache: 'no-store',
        });

        const result = (await response.json().catch(() => null)) as
          | { deck?: DeckDetailData; message?: string }
          | null;

        if (!response.ok || !result?.deck) {
          throw new Error(result?.message ?? labels.myDecks.error);
        }

        if (!isActive) {
          return;
        }

        setDeckEntries(result.deck.entries);
        setDeckMeta(buildDeckMetaState(result.deck));
        setDeckLoadError(null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        console.error('Failed to load deck details', error);
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? String((error as { message?: unknown }).message)
              : null;
        setDeckEntries([]);
        setDeckMeta(null);
        setDeckLoadError(message ?? labels.myDecks.error);
      } finally {
        if (isActive) {
          setIsDeckLoading(false);
        }
      }
    }

    void loadDeck();

    return () => {
      isActive = false;
    };
  }, [deck, deckId, labels.myDecks.error]);

  useEffect(() => {
    if (!deckMeta?.id) {
      return;
    }
    persistDeckStatsOverride(deckMeta.id, {
      favoritesTotal: deckMeta.favoritesTotal,
      viewsTotal: deckMeta.viewsTotal,
    });
  }, [deckMeta?.favoritesTotal, deckMeta?.id, deckMeta?.viewsTotal]);

  useEffect(() => {
    let isMounted = true;

    async function fetchCurrentUser() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!isMounted) {
          return;
        }
        if (error) {
          console.error('Failed to fetch current user', error);
          setCurrentUserId(null);
          return;
        }
        setCurrentUserId(data?.user?.id ?? null);
      } catch (error) {
        console.error('Failed to fetch current user', error);
        if (isMounted) {
          setCurrentUserId(null);
        }
      }
    }

    void fetchCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (currentUserId === undefined) {
      return;
    }

    if (!deckMeta?.id) {
      setIsFavorite(false);
      setIsFavoriteLoaded(true);
      setFavoriteErrorMessage(null);
      return;
    }

    if (!currentUserId) {
      setIsFavorite(false);
      setIsFavoriteLoaded(true);
      setFavoriteErrorMessage(null);
      return;
    }

    const deckIdValue = deckMeta.id;
    if (!deckIdValue) {
      setIsFavorite(false);
      setIsFavoriteLoaded(true);
      setFavoriteErrorMessage(null);
      return;
    }

    const databaseDeckId = resolveDatabaseDeckId(deckIdValue);
    if (databaseDeckId === null) {
      setIsFavorite(false);
      setIsFavoriteLoaded(true);
      setFavoriteErrorMessage(labels.deckDetails.favoriteError);
      return;
    }

    let isActive = true;
    setIsFavoriteLoaded(false);

    async function loadFavoriteState() {
      try {
        const { data, error, status } = await supabase
          .from('deck_favorite_events')
          .select('deck_id')
          .eq('deck_id', databaseDeckId)
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (!isActive) {
          return;
        }

        if (error && status !== 406) {
          console.error('Failed to load favorite state', error);
          setFavoriteErrorMessage(labels.deckDetails.favoriteError);
          setIsFavorite(false);
        } else {
          setIsFavorite(Boolean(data));
          setFavoriteErrorMessage(null);
        }
      } catch (error) {
        if (!isActive) {
          return;
        }
        console.error('Failed to load favorite state', error);
        setFavoriteErrorMessage(labels.deckDetails.favoriteError);
        setIsFavorite(false);
      } finally {
        if (isActive) {
          setIsFavoriteLoaded(true);
        }
      }
    }

    void loadFavoriteState();

    return () => {
      isActive = false;
    };
  }, [currentUserId, deckMeta?.id, labels.deckDetails.favoriteError]);

  useEffect(() => {
    if (!deckMeta?.id || currentUserId === undefined) {
      return;
    }

    if (hasLoggedViewRef.current) {
      return;
    }

    const deckIdValue = deckMeta.id;
    if (!deckIdValue) {
      return;
    }

    const databaseDeckId = resolveDatabaseDeckId(deckIdValue);
    if (databaseDeckId === null) {
      return;
    }

    hasLoggedViewRef.current = true;

    async function recordView() {
      try {
        const headers: HeadersInit = {};
        const { data: sessionResult } = await supabase.auth.getSession();
        const accessToken = sessionResult.session?.access_token?.trim();
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }

        const response = await fetch(`/api/decks/${encodeURIComponent(String(databaseDeckId))}/view`, {
          method: 'POST',
          headers,
        });

        const result = (await response.json().catch(() => null)) as
          | { message?: string; counted?: boolean; viewsTotal?: number }
          | null;

        if (!response.ok) {
          console.error('Failed to record deck view', result ?? {});
          hasLoggedViewRef.current = false;
          return;
        }

        setDeckMeta((previous) =>
          previous
            ? {
                ...previous,
                viewsTotal:
                  typeof result?.viewsTotal === 'number'
                    ? Math.max(previous.viewsTotal, Number(result.viewsTotal))
                    : result?.counted
                      ? previous.viewsTotal + 1
                      : previous.viewsTotal,
              }
            : previous
        );
        if (typeof result?.viewsTotal === 'number') {
          persistDeckStatsOverride(deckIdValue, { viewsTotal: Number(result.viewsTotal) });
        } else if (result?.counted) {
          persistDeckStatsOverride(deckIdValue, { viewsTotal: (deckMeta?.viewsTotal ?? 0) + 1 });
        }
      } catch (error) {
        console.error('Failed to record deck view', error);
        hasLoggedViewRef.current = false;
      }
    }

    void recordView();
  }, [currentUserId, deckMeta?.id, deckMeta?.viewsTotal]);

  const totalCards = useMemo(() => deckEntries.reduce((sum, entry) => sum + entry.count, 0), [deckEntries]);

  const sections = useMemo<Section[]>(() => {
    if (deckEntries.length === 0) {
      return [];
    }

    const groups = new Map<string, { label: string; entries: DeckEntry[] }>();

    for (const entry of deckEntries) {
      const rawType = entry.card.type?.trim();
      let label = rawType && rawType.length > 0 ? rawType : FALLBACK_SECTION_LABEL;
      const normalizedLabel = label.toLowerCase();
      if (normalizedLabel.includes('renowned') && normalizedLabel.includes('unit')) {
        label = 'Unit';
      }
      const key = label.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.entries.push(entry);
      } else {
        groups.set(key, { label, entries: [entry] });
      }
    }

    const getPriority = (label: string) => {
      const normalized = CARD_TYPE_ORDER.findIndex((type) => type.toLowerCase() === label.toLowerCase());
      return normalized === -1 ? CARD_TYPE_ORDER.length : normalized;
    };

    return Array.from(groups.values())
      .map(({ label, entries }) => {
        const sortedEntries = [...entries].sort((a, b) => {
          const aCost = Number.isFinite(a.card.cost) ? a.card.cost : Number.POSITIVE_INFINITY;
          const bCost = Number.isFinite(b.card.cost) ? b.card.cost : Number.POSITIVE_INFINITY;
          if (aCost !== bCost) {
            return aCost - bCost;
          }
          const aNumber = a.card.number ?? Number.POSITIVE_INFINITY;
          const bNumber = b.card.number ?? Number.POSITIVE_INFINITY;
          if (aNumber !== bNumber) {
            return aNumber - bNumber;
          }
          return a.card.name.localeCompare(b.card.name);
        });
        return {
          label,
          entries: sortedEntries,
          total: sortedEntries.reduce((sum, item) => sum + item.count, 0),
        };
      })
      .sort((a, b) => {
        const priorityDiff = getPriority(a.label) - getPriority(b.label);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return a.label.localeCompare(b.label);
      });
  }, [deckEntries]);

  const bannerAffinities = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const entry of deckEntries) {
      const normalized = normalizeAffinity(entry.card.affinity);
      if (!normalized || normalized === 'Neutral' || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      result.push(normalized);
    }
    return result;
  }, [deckEntries]);

  const formattedCreatedAt = useMemo(() => {
    if (!deckMeta?.createdAt) {
      return null;
    }
    const date = new Date(deckMeta.createdAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
    } catch {
      return date.toLocaleDateString();
    }
  }, [deckMeta?.createdAt, locale]);

  const authorSocials = useMemo(() => {
    if (!deckMeta) {
      return [];
    }
    const socials = [
      { label: labels.publicProfile.xLabel, href: ensureHttps(deckMeta.authorXLink) },
      { label: labels.publicProfile.youtubeLabel, href: ensureHttps(deckMeta.authorYoutubeLink) },
    ];
    return socials.filter((entry): entry is { label: string; href: string } => Boolean(entry.href));
  }, [deckMeta?.authorXLink, deckMeta?.authorYoutubeLink, labels.publicProfile.xLabel, labels.publicProfile.youtubeLabel]);

  const effectiveAuthorName = deckMeta?.authorName ?? null;
  const effectiveAuthorId = deckMeta?.authorId ?? null;

  const authorDisplayName = useMemo(() => {
    const trimmedName = effectiveAuthorName?.trim();
    if (trimmedName && trimmedName.length > 0) {
      return trimmedName;
    }

    return labels.publicProfile.unknownUser;
  }, [effectiveAuthorName, labels.publicProfile.unknownUser]);

  function handleZoom(nextCard: Card | null, variant: 'default' | 'compact' = 'default', anchor: ZoomAnchor | null = null) {
    setZoomCard(nextCard);
    setZoomVariant(variant);
    setZoomAnchor(anchor);
  }

  function handleCardPreview(card: Card, event: PreviewEvent) {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : rect.right;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : rect.bottom;

    let pointerX = rect.left + rect.width / 2;
    let pointerY = rect.top + rect.height / 2;

    if ('clientX' in event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
      pointerX = event.clientX;
      pointerY = event.clientY;
    } else if (
      event.nativeEvent &&
      typeof (event.nativeEvent as MouseEvent).clientX === 'number' &&
      typeof (event.nativeEvent as MouseEvent).clientY === 'number'
    ) {
      const native = event.nativeEvent as globalThis.MouseEvent;
      pointerX = native.clientX;
      pointerY = native.clientY;
    }

    handleZoom(card, 'compact', {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      viewportWidth,
      viewportHeight,
      pointerX,
      pointerY,
    });
  }

  async function handleFavoriteToggle() {
    if (!deckMeta) {
      return;
    }

    if (currentUserId === undefined) {
      return;
    }

    if (!currentUserId) {
      router.push(signInHref);
      return;
    }

    if (isTogglingFavorite) {
      return;
    }

    const deckIdValue = deckMeta.id;
    if (!deckIdValue) {
      return;
    }

    const databaseDeckId = resolveDatabaseDeckId(deckIdValue);
    if (databaseDeckId === null) {
      setFavoriteErrorMessage(labels.deckDetails.favoriteError);
      return;
    }

    setIsTogglingFavorite(true);
    setFavoriteErrorMessage(null);

    try {
      const favoriteKey = { deck_id: databaseDeckId, user_id: currentUserId };

      if (isFavorite) {
        const { error } = await supabase.from('deck_favorite_events').delete().match(favoriteKey);

        if (error) {
          throw error;
        }

        setIsFavorite(false);
        setDeckMeta((previous) =>
          previous
            ? { ...previous, favoritesTotal: Math.max(0, previous.favoritesTotal - 1) }
            : previous
        );
        persistDeckStatsOverride(deckIdValue, {
          favoritesTotal: Math.max(0, (deckMeta?.favoritesTotal ?? 0) - 1),
        });
      } else {
        const { error } = await supabase.from('deck_favorite_events').insert(favoriteKey);

        if (error) {
          throw error;
        }

        setIsFavorite(true);
        setDeckMeta((previous) =>
          previous ? { ...previous, favoritesTotal: previous.favoritesTotal + 1 } : previous
        );
        persistDeckStatsOverride(deckIdValue, {
          favoritesTotal: (deckMeta?.favoritesTotal ?? 0) + 1,
        });
      }
    } catch (error) {
      console.error('Failed to toggle favorite', error);
      setFavoriteErrorMessage(labels.deckDetails.favoriteError);
    } finally {
      setIsTogglingFavorite(false);
    }
  }

  const backHref = `/${locale}/decks`;

  if (isDeckLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 text-[color:var(--text-primary)]">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--accent)] transition hover:text-[color:var(--accent)]/80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>{labels.deckDetails.backButton}</span>
        </Link>
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
          <p className="text-sm text-[color:var(--text-secondary)]">{labels.myDecks.loading}</p>
        </div>
      </div>
    );
  }

  if (deckLoadError || !deckMeta) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 text-[color:var(--text-primary)]">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--accent)] transition hover:text-[color:var(--accent)]/80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>{labels.deckDetails.backButton}</span>
        </Link>
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 shadow-sm">
          <p className="text-sm text-red-200">{deckLoadError ?? labels.myDecks.error}</p>
        </div>
      </div>
    );
  }

  const title = deckMeta.title && deckMeta.title.trim().length > 0 ? deckMeta.title.trim() : labels.myDecks.untitledLabel;
  const description = deckMeta.description?.trim();
  const favoriteButtonLabel = isFavorite ? labels.deckDetails.favoriteRemove : labels.deckDetails.favoriteAdd;
  const isFavoriteButtonDisabled = !isFavoriteLoaded || isTogglingFavorite;
  const favoriteButtonClassName = [
    'inline-flex h-10 w-10 items-center justify-center rounded-full border transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]',
    isFavorite
      ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--accent)]'
      : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-secondary)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]',
    isFavoriteButtonDisabled ? 'opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const favoriteSupportMessage =
    favoriteErrorMessage ?? (currentUserId === null ? labels.deckDetails.favoriteSignIn : null);
  const favoriteSupportClassName = favoriteErrorMessage
    ? 'text-xs text-red-400'
    : 'text-xs text-[color:var(--text-secondary)]';

  const chips = sections.length === 0 ? (
    <p className="text-sm text-[color:var(--text-secondary)]">{emptyDeckLabel}</p>
  ) : (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.label} className="flex flex-col gap-3">
          <header className="flex items-center justify-between border-b border-[color:var(--border)] pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
              {section.label}
            </h3>
            <span className="text-xs text-[color:var(--text-secondary)]">x{section.total}</span>
          </header>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {section.entries.map(({ card, count }) => {
              const scheme = getAffinityColorScheme(card.affinity);

              return (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => handleZoom(card)}
                    onMouseEnter={(event) => handleCardPreview(card, event)}
                    onFocus={(event) => handleCardPreview(card, event)}
                    onMouseLeave={() => handleZoom(null)}
                    onBlur={() => handleZoom(null)}
                    className="group relative block w-full overflow-hidden rounded-[18px] border shadow-[0_10px_20px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(0,0,0,0.28)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                    style={{
                      borderColor: scheme.borderColor,
                      background: 'linear-gradient(180deg, rgba(15,23,42,0.65) 0%, rgba(15,23,42,0.9) 100%)',
                    }}
                    aria-label={`View details for ${card.name}`}
                  >
                    <div className="relative aspect-[3/4] w-full">
                      {card.imageSrc ? (
                        <img
                          src={card.imageSrc}
                          alt={card.name}
                          className="block h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[color:var(--surface-muted)] text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                          No Art
                        </div>
                      )}
                      <span
                        className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'var(--text-on-accent)',
                          border: '1px solid rgba(0,0,0,0.25)',
                        }}
                      >
                        x{count}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 text-[color:var(--text-primary)]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--accent)] transition hover:text-[color:var(--accent)]/80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>{labels.deckDetails.backButton}</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              disabled={deckEntries.length === 0}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-secondary)] shadow-sm transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              title={shareLabels.shareButton}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M6 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                <path d="M18 20a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                <path d="M18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                <path d="M7.5 9.5 16.5 6.5" />
                <path d="M7.5 12.5 16.5 15.5" />
              </svg>
              <span className="sr-only">{shareLabels.shareButton}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleFavoriteToggle()}
              aria-pressed={isFavorite}
              disabled={isFavoriteButtonDisabled}
              className={favoriteButtonClassName}
              title={favoriteButtonLabel}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill={isFavorite ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.8"
                className={`h-4 w-4 ${isFavorite ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-secondary)]'}`}
              >
                <path d="M12 21.35 10.55 20C5.4 15.36 2 12.27 2 8.5 2 6.5 3.5 5 5.5 5c1.54 0 2.85.99 3.57 2.36h1.87C13.75 5.99 15.06 5 16.6 5 18.6 5 20 6.5 20 8.5c0 3.77-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span className="sr-only">{favoriteButtonLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              disabled={deckEntries.length === 0}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-secondary)] shadow-sm transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              title={exportLabels.exportHeading}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M12 4v10" />
                <path d="m8 10 4 4 4-4" />
                <path d="M5 18h14" />
              </svg>
              <span className="sr-only">{exportLabels.exportHeading}</span>
            </button>
            <Link
              href={`/${locale}/create?deck=${encodeURIComponent(deckMeta.id)}`}
              className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            >
              {labels.myDecks.openButton}
            </Link>
        </div>
      </div>

      <DeckExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        deckEntries={deckEntries}
        labels={exportLabels}
      />

      <DeckShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        deckEntries={deckEntries}
        totalCards={totalCards}
        deckTitle={title}
        labels={{
          deckHeading: shareLabels.deckHeading,
          totalCardsLabel: shareLabels.totalCardsLabel,
          shareButton: shareLabels.shareButton,
          shareGenerating: shareLabels.shareGenerating,
          shareDownload: shareLabels.shareDownload,
          shareCopy: shareLabels.shareCopy,
          shareCopySuccess: shareLabels.shareCopySuccess,
          shareCopyError: shareLabels.shareCopyError,
          shareEmpty: shareLabels.shareEmpty,
          shareError: shareLabels.shareError,
        }}
      />
        {favoriteSupportMessage ? (
          <p className={`${favoriteSupportClassName} text-right`}>{favoriteSupportMessage}</p>
        ) : null}
      </div>

      {authorDisplayName ? (
        <div className="flex flex-col items-center gap-3 text-center">
          {effectiveAuthorId ? (
            <Link
              href={`/${locale}/players/${encodeURIComponent(effectiveAuthorId)}`}
              className="text-xl font-semibold uppercase tracking-wide text-[color:var(--text-secondary)] underline decoration-[color:var(--text-secondary)] transition hover:text-[color:var(--accent)]"
            >
              {authorDisplayName}
            </Link>
          ) : (
            <span className="text-xl font-semibold uppercase tracking-wide text-[color:var(--text-secondary)] underline decoration-[color:var(--text-secondary)]">
              {authorDisplayName}
            </span>
          )}
          {authorSocials.length > 0 ? (
            <div className="flex flex-col items-center gap-2 text-xs text-[color:var(--text-secondary)]">
              <span className="font-semibold uppercase tracking-wide">{labels.publicProfile.socialsHeading}</span>
              <div className="flex flex-wrap justify-center gap-3">
                {authorSocials.map((social) => (
                  <Link
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--accent)] hover:underline"
                  >
                    {social.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="relative space-y-3 rounded-2xl border border-[color:var(--border)] p-6 shadow-sm text-white"
        style={{
          backgroundImage: `linear-gradient(rgba(12, 15, 21, 0.35), rgba(12, 15, 21, 0.35)), ${buildAffinityGradient(
            bannerAffinities
          )}`,
        }}
      >
        <div className="absolute right-6 top-6 flex flex-wrap justify-end gap-3 text-xs font-semibold uppercase tracking-wide text-white md:flex-nowrap">
          <span className="inline-flex items-center gap-1 rounded-md border border-white/40 bg-white/10 px-2.5 py-1">
            <span className="sr-only">{labels.myDecks.viewsLabel}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4"
            >
              <path d="M1.5 12C3.5 7 7.5 4 12 4s8.5 3 10.5 8c-2 5-6 8-10.5 8s-8.5-3-10.5-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {deckMeta?.viewsTotal ?? 0}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-white/40 bg-white/10 px-2.5 py-1">
            <span className="sr-only">{labels.myDecks.favoritesLabel}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4 text-[color:var(--accent)]"
            >
              <path d="M12 21.35 10.55 20C5.4 15.36 2 12.27 2 8.5 2 6.5 3.5 5 5.5 5c1.54 0 2.85.99 3.57 2.36h1.87C13.75 5.99 15.06 5 16.6 5 18.6 5 20 6.5 20 8.5c0 3.77-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            {deckMeta?.favoritesTotal ?? 0}
          </span>
        </div>
        {formattedCreatedAt ? (
          <div className="absolute bottom-6 right-6 text-sm font-semibold text-white">{formattedCreatedAt}</div>
        ) : null}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3 pr-20 md:pr-0 md:max-w-[80%]">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="w-full break-words text-3xl font-semibold text-white">{title}</h1>
              {bannerAffinities.length > 0 ? (
                <span className="flex items-center gap-1">
                  {bannerAffinities.map((affinity) => {
                    const iconSrc = getAffinityIconPath(affinity);
                    if (!iconSrc) {
                      return null;
                    }
                    return (
                      <Image
                        key={affinity}
                        src={iconSrc}
                        alt={`${affinity} affinity`}
                        width={20}
                        height={20}
                        className="h-5 w-5"
                      />
                    );
                  })}
                </span>
              ) : null}
            </div>
            {description ? (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
                  {labels.deckDetails.notesHeading}
                </h2>
                <p className="break-words text-sm leading-6 text-white/80 whitespace-pre-line">{description}</p>
              </div>
            ) : null}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm text-white/80">
          <div>
            <dt className="mb-1 text-xs uppercase tracking-wide">{labels.myDecks.cardsLabel}</dt>
            <dd className="text-base font-semibold text-white">{totalCards}</dd>
          </div>
        </dl>
      </div>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">{labels.deckDetails.sectionsHeading}</h2>
          <span className="text-sm text-[color:var(--text-secondary)]">
            {labels.myDecks.cardsLabel}: {totalCards}
          </span>
        </header>
        {chips}
      </section>

      <ZoomOverlay card={zoomCard} variant={zoomVariant} anchor={zoomAnchor} onClose={() => handleZoom(null)} />
    </div>
  );
}
