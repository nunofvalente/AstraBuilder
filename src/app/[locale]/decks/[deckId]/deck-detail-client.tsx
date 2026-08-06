'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
import {
  buildAffinityGradient,
  getAffinityBaseColor,
  getAffinityIconPath,
  normalizeAffinity,
} from '@/lib/cards/affinity';

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
      analysisHeading: string;
      uniqueCardsLabel: string;
      averageCostLabel: string;
      costCurveHeading: string;
      compositionHeading: string;
      costLabel: string;
      affinityUnitsHeading: string;
      unitStatsHeading: string;
      attackLabel: string;
      healthLabel: string;
      influenceLabel: string;
      cardMenuViewDetails: string;
      cardMenuSetDisplay: string;
      cardMenuDisplaySelected: string;
      cardMenuUseAutomatic: string;
      cardMenuSaving: string;
      cardMenuError: string;
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

type CardContextMenuState = {
  card: Card;
  x: number;
  y: number;
};

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
  displayCardId: string | null;
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
    displayCardId: deck.displayCardId,
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
  const [cardContextMenu, setCardContextMenu] = useState<CardContextMenuState | null>(null);
  const [isSavingDisplayCard, setIsSavingDisplayCard] = useState(false);
  const [displayCardError, setDisplayCardError] = useState<string | null>(null);
  const hasLoggedViewRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const suppressCardClickRef = useRef(false);
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setCardContextMenu(null);
        setDisplayCardError(null);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const totalCards = useMemo(() => deckEntries.reduce((sum, entry) => sum + entry.count, 0), [deckEntries]);

  const deckAnalysis = useMemo(() => {
    const costBuckets = Array.from({ length: 7 }, (_, cost) => ({ cost, count: 0 }));
    const unitAffinityTotals = new Map<string, number>();
    const unitStatTotals = {
      attack: { total: 0, count: 0 },
      health: { total: 0, count: 0 },
      influence: { total: 0, count: 0 },
    };
    let totalCost = 0;
    let cardsWithCost = 0;

    for (const entry of deckEntries) {
      const cost = Number(entry.card.cost);
      if (Number.isFinite(cost) && cost >= 0) {
        const bucket = Math.min(6, Math.floor(cost));
        costBuckets[bucket].count += entry.count;
        totalCost += cost * entry.count;
        cardsWithCost += entry.count;
      }

      if (!entry.card.type.toLowerCase().includes('unit')) {
        continue;
      }

      const affinity = normalizeAffinity(entry.card.affinity) || 'Neutral';
      unitAffinityTotals.set(affinity, (unitAffinityTotals.get(affinity) ?? 0) + entry.count);

      for (const key of ['attack', 'health', 'influence'] as const) {
        const value = entry.card[key];
        if (value == null || !Number.isFinite(value)) {
          continue;
        }
        unitStatTotals[key].total += value * entry.count;
        unitStatTotals[key].count += entry.count;
      }
    }

    const unitAffinityCounts = Array.from(unitAffinityTotals.entries())
      .map(([affinity, count]) => ({ affinity, count }))
      .sort((a, b) => b.count - a.count || a.affinity.localeCompare(b.affinity));
    const unitStats = (['attack', 'health', 'influence'] as const).map((key) => ({
      key,
      value: unitStatTotals[key].count > 0 ? unitStatTotals[key].total / unitStatTotals[key].count : null,
    }));

    return {
      uniqueCards: deckEntries.length,
      averageCost: cardsWithCost > 0 ? totalCost / cardsWithCost : 0,
      costBuckets,
      largestCostBucket: Math.max(1, ...costBuckets.map((bucket) => bucket.count)),
      unitAffinityCounts,
      largestUnitAffinityCount: Math.max(1, ...unitAffinityCounts.map((entry) => entry.count)),
      unitStats,
      largestUnitStat: Math.max(1, ...unitStats.map((stat) => stat.value ?? 0)),
    };
  }, [deckEntries]);

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

  function openCardContextMenu(card: Card, clientX: number, clientY: number) {
    const menuWidth = 250;
    const menuHeight = 230;
    const viewportWidth = typeof window === 'undefined' ? clientX + menuWidth : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? clientY + menuHeight : window.innerHeight;
    const x = Math.max(12, Math.min(clientX, viewportWidth - menuWidth - 12));
    const y = Math.max(12, Math.min(clientY, viewportHeight - menuHeight - 12));

    handleZoom(null);
    setDisplayCardError(null);
    setCardContextMenu({ card, x, y });
  }

  function handleCardContextMenu(card: Card, event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    openCardContextMenu(card, event.clientX, event.clientY);
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }

  function handleCardPointerDown(card: Card, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== 'touch') {
      return;
    }

    clearLongPressTimer();
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    const clientX = event.clientX;
    const clientY = event.clientY;
    longPressTimerRef.current = setTimeout(() => {
      suppressCardClickRef.current = true;
      openCardContextMenu(card, clientX, clientY);
      longPressTimerRef.current = null;
      setTimeout(() => {
        suppressCardClickRef.current = false;
      }, 800);
    }, 550);
  }

  function handleCardPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const origin = longPressOriginRef.current;
    if (!origin || event.pointerType !== 'touch') {
      return;
    }

    if (Math.abs(event.clientX - origin.x) > 10 || Math.abs(event.clientY - origin.y) > 10) {
      clearLongPressTimer();
    }
  }

  async function handleSetDisplayCard(card: Card | null) {
    if (!deckMeta || !currentUserId || currentUserId !== deckMeta.authorId || isSavingDisplayCard) {
      return;
    }

    setIsSavingDisplayCard(true);
    setDisplayCardError(null);

    try {
      const { data: sessionResult } = await supabase.auth.getSession();
      const accessToken = sessionResult.session?.access_token;
      if (!accessToken) {
        throw new Error(labels.deckDetails.cardMenuError);
      }

      const response = await fetch(`/api/decks/${encodeURIComponent(deckMeta.id)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: deckMeta.title ?? '',
          description: deckMeta.description ?? '',
          is_public: deckMeta.isPublic,
          display_card_id: card?.id ?? null,
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(result?.message ?? labels.deckDetails.cardMenuError);
      }

      setDeckMeta((previous) => (previous ? { ...previous, displayCardId: card?.id ?? null } : previous));
      setCardContextMenu(null);
    } catch (error) {
      console.error('Failed to update deck display card', error);
      setDisplayCardError(labels.deckDetails.cardMenuError);
    } finally {
      setIsSavingDisplayCard(false);
    }
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
  const favoriteSupportMessage = favoriteErrorMessage;
  const favoriteSupportClassName = favoriteErrorMessage
    ? 'text-xs text-red-400'
    : 'text-xs text-[color:var(--text-secondary)]';
  const unitStatLabels = {
    attack: labels.deckDetails.attackLabel,
    health: labels.deckDetails.healthLabel,
    influence: labels.deckDetails.influenceLabel,
  };
  const canSetDisplayCard = Boolean(currentUserId && currentUserId === deckMeta.authorId);

  const deckManifest = sections.length === 0 ? (
    <p className="text-sm text-[color:var(--text-secondary)]">{emptyDeckLabel}</p>
  ) : (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <section key={section.label} className="flex flex-col gap-2.5">
          <header className="flex items-center gap-3 border-b border-[color:var(--border)] pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-primary)]">
              {section.label}
            </h3>
            <span className="h-px flex-1 bg-gradient-to-r from-[color:var(--accent)]/50 to-transparent" />
            <span className="text-xs font-semibold text-[color:var(--accent)]">{section.total}</span>
          </header>
          <ul className="grid gap-2 md:grid-cols-2">
            {section.entries.map(({ card, count }) => {
              const normalizedAffinity = normalizeAffinity(card.affinity);
              const affinityIcon = normalizedAffinity ? getAffinityIconPath(normalizedAffinity) : null;

              return (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (suppressCardClickRef.current) {
                        suppressCardClickRef.current = false;
                        return;
                      }
                      handleZoom(card);
                    }}
                    onContextMenu={(event) => handleCardContextMenu(card, event)}
                    onPointerDown={(event) => handleCardPointerDown(card, event)}
                    onPointerMove={handleCardPointerMove}
                    onPointerUp={clearLongPressTimer}
                    onPointerCancel={clearLongPressTimer}
                    onMouseEnter={(event) => handleCardPreview(card, event)}
                    onFocus={(event) => handleCardPreview(card, event)}
                    onMouseLeave={() => handleZoom(null)}
                    onBlur={() => handleZoom(null)}
                    className="group relative flex min-h-[4.5rem] w-full touch-manipulation items-center overflow-hidden border border-l-0 border-[color:var(--border)] bg-black/15 text-left shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition hover:-translate-y-px hover:border-[color:var(--accent)]/60 hover:border-l-0 hover:bg-white/[0.035] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                    aria-label={`View details for ${card.name}`}
                  >
                    <div className="relative aspect-[5/7] h-[4.5rem] shrink-0 overflow-hidden">
                      {card.imageSrc ? (
                        <img
                          src={card.imageSrc}
                          alt={card.name}
                          className="block h-full w-full object-contain transition duration-200 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full bg-[color:var(--surface-muted)]" />
                      )}
                    </div>
                    <span className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2">
                      <span className="truncate text-sm font-semibold text-[color:var(--text-primary)]">{card.name}</span>
                      <span className="flex items-center gap-2 truncate text-[11px] text-[color:var(--text-secondary)]">
                        {affinityIcon ? (
                          <Image src={affinityIcon} alt="" width={15} height={15} className="h-[15px] w-[15px]" />
                        ) : null}
                        <span className="truncate">{card.type || FALLBACK_SECTION_LABEL}</span>
                        <span aria-hidden="true">/</span>
                        <span>{labels.deckDetails.costLabel} {card.cost}</span>
                      </span>
                    </span>
                    <span className="mr-4 text-base font-semibold text-[color:var(--accent)] transition group-hover:text-[color:var(--text-primary)]">
                      x{count}
                    </span>
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
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-6 text-[color:var(--text-primary)] sm:px-6 xl:px-8">
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

      <section
        className="relative overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.2)]"
        style={{
          backgroundImage: `linear-gradient(105deg, rgba(17, 18, 18, 0.96) 0%, rgba(23, 22, 20, 0.91) 58%, rgba(17, 18, 18, 0.78) 100%), ${buildAffinityGradient(
            bannerAffinities
          )}`,
        }}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[color:var(--accent)]" />
        <div className="pointer-events-none absolute -right-20 -top-32 h-72 w-72 rotate-12 border border-white/[0.07]" />
        <div className="relative grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch lg:gap-10">
          <div className="flex min-w-0 flex-col justify-center">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className="border border-white/15 bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70"
                title={deckMeta.isPublic ? labels.deckDetails.publicNotice : labels.deckDetails.privateNotice}
              >
                {deckMeta.isPublic ? labels.myDecks.publicTag : labels.myDecks.privateTag}
              </span>
              {bannerAffinities.map((affinity) => {
                const iconSrc = getAffinityIconPath(affinity);
                return iconSrc ? (
                  <Image key={affinity} src={iconSrc} alt={`${affinity} affinity`} width={22} height={22} />
                ) : null;
              })}
            </div>

            <h1 className="break-words font-serif text-3xl font-semibold leading-tight text-white sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-white/65">
              {description || labels.deckDetails.description}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/55">
              <span>{labels.myDecks.createdLabel}: {formattedCreatedAt ?? '-'}</span>
              <span aria-hidden="true" className="text-[color:var(--accent)]">/</span>
              {effectiveAuthorId ? (
                <Link
                  href={`/${locale}/players/${encodeURIComponent(effectiveAuthorId)}`}
                  className="relative z-10 font-semibold text-white/80 transition hover:text-[color:var(--accent)] hover:underline"
                >
                  {authorDisplayName}
                </Link>
              ) : (
                <span className="font-semibold text-white/80">{authorDisplayName}</span>
              )}
              {authorSocials.map((social) => (
                <Link
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  className="relative z-10 text-[color:var(--accent)] hover:underline"
                >
                  {social.label}
                </Link>
              ))}
            </div>
          </div>

          <dl className="grid grid-cols-2 border border-white/10 bg-black/20">
            {[
              [labels.myDecks.cardsLabel, totalCards],
              [labels.deckDetails.uniqueCardsLabel, deckAnalysis.uniqueCards],
              [labels.myDecks.viewsLabel, deckMeta.viewsTotal],
              [labels.myDecks.favoritesLabel, deckMeta.favoritesTotal],
            ].map(([label, value], index) => (
              <div
                key={String(label)}
                className={`flex min-h-20 flex-col justify-center px-4 py-3 ${index % 2 === 0 ? 'border-r border-white/10' : ''} ${index < 2 ? 'border-b border-white/10' : ''}`}
              >
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-5">
          <header className="mb-5 flex items-center justify-between border-b border-[color:var(--border)] pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent)]">
                {labels.deckDetails.heading}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[color:var(--text-primary)]">
                {labels.deckDetails.sectionsHeading}
              </h2>
            </div>
            <span className="border border-[color:var(--border)] bg-black/10 px-3 py-1.5 text-sm font-semibold text-[color:var(--text-primary)]">
              {totalCards}
            </span>
          </header>
          {deckManifest}
        </section>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-24">
          <section className="border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent)]">
              {labels.deckDetails.analysisHeading}
            </p>
            <div className="mt-3 grid grid-cols-3 divide-x divide-[color:var(--border)] border-y border-[color:var(--border)] py-3 text-center">
              <div>
                <div className="text-xl font-semibold text-[color:var(--text-primary)]">{totalCards}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {labels.myDecks.cardsLabel}
                </div>
              </div>
              <div>
                <div className="text-xl font-semibold text-[color:var(--text-primary)]">{deckAnalysis.uniqueCards}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {labels.deckDetails.uniqueCardsLabel}
                </div>
              </div>
              <div>
                <div className="text-xl font-semibold text-[color:var(--text-primary)]">
                  {deckAnalysis.averageCost.toFixed(1)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {labels.deckDetails.averageCostLabel}
                </div>
              </div>
            </div>
          </section>

          <section className="border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-primary)]">
              {labels.deckDetails.costCurveHeading}
            </h3>
            <div className="mt-4 flex h-32 items-end gap-2 border-b border-[color:var(--border)] px-1">
              {deckAnalysis.costBuckets.map((bucket) => (
                <div key={bucket.cost} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] font-semibold text-[color:var(--text-secondary)]">{bucket.count}</span>
                  <span
                    className="w-full min-w-3 bg-gradient-to-t from-[color:var(--accent)]/55 to-[color:var(--accent)] transition-[height]"
                    style={{ height: `${Math.max(3, (bucket.count / deckAnalysis.largestCostBucket) * 86)}px` }}
                  />
                  <span className="text-[10px] text-[color:var(--text-secondary)]">
                    {bucket.cost === 6 ? '6+' : bucket.cost}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-primary)]">
              {labels.deckDetails.compositionHeading}
            </h3>
            <div className="mt-4 space-y-3">
              {sections.map((section) => {
                const percentage = totalCards > 0 ? (section.total / totalCards) * 100 : 0;
                return (
                  <div key={section.label}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-[color:var(--text-primary)]">{section.label}</span>
                      <span className="text-[color:var(--text-secondary)]">{section.total}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden bg-black/25">
                      <div
                        className="h-full bg-[color:var(--accent)]"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-primary)]">
              {labels.deckDetails.affinityUnitsHeading}
            </h3>
            {deckAnalysis.unitAffinityCounts.length === 0 ? (
              <p className="mt-4 text-xs text-[color:var(--text-secondary)]">{emptyDeckLabel}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {deckAnalysis.unitAffinityCounts.map(({ affinity, count }) => {
                  const iconSrc = getAffinityIconPath(affinity);
                  const percentage = (count / deckAnalysis.largestUnitAffinityCount) * 100;
                  return (
                    <div key={affinity}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2 font-medium text-[color:var(--text-primary)]">
                          {iconSrc ? <Image src={iconSrc} alt="" width={17} height={17} /> : null}
                          <span className="truncate">{affinity}</span>
                        </span>
                        <span className="font-semibold text-[color:var(--text-primary)]">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden bg-black/25">
                        <div
                          className="h-full"
                          style={{ width: `${percentage}%`, backgroundColor: getAffinityBaseColor(affinity) }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-primary)]">
              {labels.deckDetails.unitStatsHeading}
            </h3>
            <div className="mt-4 space-y-3">
              {deckAnalysis.unitStats.map((stat) => {
                const percentage = stat.value == null ? 0 : (stat.value / deckAnalysis.largestUnitStat) * 100;
                return (
                  <div key={stat.key} className="grid grid-cols-[5rem_1fr_2.5rem] items-center gap-3">
                    <span className="truncate text-xs font-medium text-[color:var(--text-secondary)]">
                      {unitStatLabels[stat.key]}
                    </span>
                    <div className="h-2 overflow-hidden bg-black/25">
                      <div
                        className="h-full bg-gradient-to-r from-[color:var(--accent)]/55 to-[color:var(--accent)]"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-right text-sm font-semibold text-[color:var(--text-primary)]">
                      {stat.value == null ? '-' : stat.value % 1 === 0 ? stat.value : stat.value.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>

      {cardContextMenu ? (
        <div
          className="fixed inset-0 z-40"
          onPointerDown={() => {
            setCardContextMenu(null);
            setDisplayCardError(null);
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            role="menu"
            aria-label={cardContextMenu.card.name}
            className="fixed z-50 w-[238px] overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl"
            style={{ left: cardContextMenu.x, top: cardContextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[color:var(--border)] bg-black/15 p-3">
              <div className="relative aspect-[5/7] h-12 shrink-0 overflow-hidden">
                <img
                  src={cardContextMenu.card.imageSrc}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </div>
              <span className="line-clamp-2 text-sm font-semibold text-[color:var(--text-primary)]">
                {cardContextMenu.card.name}
              </span>
            </div>
            <div className="p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const card = cardContextMenu.card;
                  setCardContextMenu(null);
                  const returnPath = `/${locale}/decks/${encodeURIComponent(deckId)}`;
                  router.push(
                    `/${locale}/cards/${encodeURIComponent(card.id)}?from=${encodeURIComponent(returnPath)}`
                  );
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:bg-[color:var(--surface-muted)]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-[color:var(--accent)]">
                  <path d="M1.5 12C3.5 7 7.5 4 12 4s8.5 3 10.5 8c-2 5-6 8-10.5 8s-8.5-3-10.5-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {labels.deckDetails.cardMenuViewDetails}
              </button>
              {canSetDisplayCard ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSetDisplayCard(cardContextMenu.card)}
                    disabled={isSavingDisplayCard || deckMeta.displayCardId === cardContextMenu.card.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:bg-[color:var(--surface-muted)] disabled:cursor-default disabled:text-[color:var(--text-secondary)]"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-[color:var(--accent)]">
                      <path d="M5 4h14v16H5z" />
                      <path d="m8 15 3-3 2 2 3-4 2 3" />
                    </svg>
                    {isSavingDisplayCard
                      ? labels.deckDetails.cardMenuSaving
                      : deckMeta.displayCardId === cardContextMenu.card.id
                        ? labels.deckDetails.cardMenuDisplaySelected
                        : labels.deckDetails.cardMenuSetDisplay}
                  </button>
                  {deckMeta.displayCardId ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleSetDisplayCard(null)}
                      disabled={isSavingDisplayCard}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text-primary)] focus:outline-none focus-visible:bg-[color:var(--surface-muted)]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                        <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" />
                        <path d="M4 4v4.68h4.68" />
                      </svg>
                      {labels.deckDetails.cardMenuUseAutomatic}
                    </button>
                  ) : null}
                </>
              ) : null}
              {displayCardError ? (
                <p className="px-3 py-2 text-xs text-red-400">{displayCardError}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <ZoomOverlay card={zoomCard} variant={zoomVariant} anchor={zoomAnchor} onClose={() => handleZoom(null)} />
    </div>
  );
}
