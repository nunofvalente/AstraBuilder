'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import type { Locale } from '@/i18n/config';
import type { Card, CardRow, DeckEntry } from '@/app/[locale]/create/deck-builder/types';
import { normaliseCard } from '@/app/[locale]/create/deck-builder/utils';
import { DeckCardChip } from '@/app/[locale]/create/deck-builder/components/deck-card-chip';
import { ZoomOverlay } from '@/app/[locale]/create/deck-builder/components/zoom-overlay';
import type { ZoomAnchor } from '@/app/[locale]/create/deck-builder/components/zoom-overlay';
import { supabase } from '@/lib/supabase/supabaseClient';
import Image from 'next/image';

import { buildAffinityGradient, getAffinityIconPath, normalizeAffinity } from '@/lib/cards/affinity';

const CARD_TYPE_ORDER = ['Unit', 'Tactic', 'Territory'];
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

type DeckRecord = {
  id: string;
  title: string | null;
  description: string | null;
  is_public: boolean | null;
  created_at: string | null;
  deck_cards?: Array<{
    quantity: number | null;
    cards: {
      id: string;
      name: string | null;
      affinity: string | null;
      artist: string | null;
      rarity: string | null;
      number: number | null;
      type: string | null;
      subtype: string | null;
      cost: number | null;
      attack: number | null;
      health: number | null;
      influence: number | null;
      rules_text: string | null;
      description: string | null;
      image_url: string | null;
    } | null;
  }>;
  deck_stats?: Array<{
    favorites_total?: number | null;
    views_total?: number | null;
  }> | null;
  profiles?:
    | Array<{
        id?: string | null;
        username?: string | null;
        x_link?: string | null;
        youtube_link?: string | null;
      } | null>
    | {
        id?: string | null;
        username?: string | null;
        x_link?: string | null;
        youtube_link?: string | null;
      }
    | null;
};

type DeckDetailsClientProps = {
  locale: Locale;
  deckId: string;
  labels: {
    deckDetails: {
      heading: string;
      description: string;
      sectionsHeading: string;
      notesHeading: string;
      privateNotice: string;
      publicNotice: string;
      backButton: string;
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
    };
  };
  emptyDeckLabel: string;
};

type Section = {
  label: string;
  entries: DeckEntry[];
  total: number;
};

export function DeckDetailClient({ locale, deckId, labels, emptyDeckLabel }: DeckDetailsClientProps) {
  const [zoomCard, setZoomCard] = useState<Card | null>(null);
  const [zoomVariant, setZoomVariant] = useState<'default' | 'compact'>('default');
  const [zoomAnchor, setZoomAnchor] = useState<ZoomAnchor | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deckEntries, setDeckEntries] = useState<DeckEntry[]>([]);
  const [deckMeta, setDeckMeta] = useState<{
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
  } | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadDeck() {
      setStatus('loading');
      setErrorMessage(null);

      const select =
        'id,title,description,created_at,is_public,deck_cards(quantity,cards(*)),deck_stats(favorites_total,views_total),profiles:profiles!decks_user_id_profiles_fkey(id,username,x_link,youtube_link)';

      const { data, error } = await supabase
        .from('decks')
        .select(select)
        .eq('id', deckId)
        .maybeSingle<DeckRecord>();

      if (!isActive) {
        return;
      }

      if (error || !data) {
        console.error('Failed to load deck detail', error);
        const message =
          error?.message ??
          (data ? 'Deck not found' : 'Unable to fetch deck. Please check your permissions.');
        setErrorMessage(message);
        setStatus('error');
        return;
      }

      const favoritesTotal = Array.isArray(data.deck_stats) && data.deck_stats.length > 0
        ? Number(data.deck_stats[0]?.favorites_total ?? 0)
        : 0;
      const viewsTotal = Array.isArray(data.deck_stats) && data.deck_stats.length > 0
        ? Number(data.deck_stats[0]?.views_total ?? 0)
        : 0;

      let authorName: string | null = null;
      let authorId: string | null = null;
      let authorXLink: string | null = null;
      let authorYoutubeLink: string | null = null;
      const profileRelation = data.profiles;
      if (Array.isArray(profileRelation) && profileRelation.length > 0) {
        authorName = profileRelation[0]?.username ?? null;
        authorId = profileRelation[0]?.id ?? null;
        authorXLink = profileRelation[0]?.x_link ?? null;
        authorYoutubeLink = profileRelation[0]?.youtube_link ?? null;
      } else if (profileRelation && profileRelation !== null && typeof profileRelation === 'object') {
        const profileObject = profileRelation as {
          id?: string | null;
          username?: string | null;
          x_link?: string | null;
          youtube_link?: string | null;
        };
        authorName = profileObject.username ?? null;
        authorId = profileObject.id ?? null;
        authorXLink = profileObject.x_link ?? null;
        authorYoutubeLink = profileObject.youtube_link ?? null;
      }

      const entries: DeckEntry[] = Array.isArray(data.deck_cards)
        ? data.deck_cards
            .filter((entry): entry is { quantity: number | null; cards: NonNullable<typeof entry.cards> } =>
              Boolean(entry.cards)
            )
            .map((entry, index) => ({
              card: normaliseCard(entry.cards as CardRow, index),
              count: Math.max(0, Number(entry.quantity ?? 0)),
            }))
        : [];

      setDeckMeta({
        id: data.id,
        title: data.title ?? null,
        description: data.description ?? null,
        isPublic: Boolean(data.is_public),
        createdAt: data.created_at ?? null,
        favoritesTotal,
        viewsTotal,
        authorName,
        authorId,
        authorXLink,
        authorYoutubeLink,
      });
      setDeckEntries(entries);
      setStatus('ready');
    }

    void loadDeck();

    return () => {
      isActive = false;
    };
  }, [deckId]);

  const totalCards = useMemo(() => deckEntries.reduce((sum, entry) => sum + entry.count, 0), [deckEntries]);

  const sections = useMemo<Section[]>(() => {
    if (deckEntries.length === 0) {
      return [];
    }

    const groups = new Map<string, { label: string; entries: DeckEntry[] }>();

    for (const entry of deckEntries) {
      const rawType = entry.card.type?.trim();
      const label = rawType && rawType.length > 0 ? rawType : FALLBACK_SECTION_LABEL;
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
      .map(({ label, entries }) => ({
        label,
        entries,
        total: entries.reduce((sum, item) => sum + item.count, 0),
      }))
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
    } catch (error) {
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

  function handleZoom(nextCard: Card | null, variant: 'default' | 'compact' = 'default', anchor: ZoomAnchor | null = null) {
    setZoomCard(nextCard);
    setZoomVariant(variant);
    setZoomAnchor(anchor);
  }

  const backHref = `/${locale}/decks`;

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-10 text-[color:var(--text-secondary)]">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[color:var(--accent)] transition hover:text-[color:var(--accent)]/80"
        >
          ← {labels.deckDetails.backButton}
        </Link>
        <div className="flex h-64 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
          {labels.myDecks.loading}
        </div>
      </div>
    );
  }

  if (status === 'error' || !deckMeta) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-10 text-[color:var(--text-secondary)]">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[color:var(--accent)] transition hover:text-[color:var(--accent)]/80"
        >
          ← {labels.deckDetails.backButton}
        </Link>
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-100">
          {errorMessage ?? labels.myDecks.error}
        </div>
      </div>
    );
  }

  const title = deckMeta.title && deckMeta.title.trim().length > 0 ? deckMeta.title.trim() : labels.myDecks.untitledLabel;
  const description = deckMeta.description?.trim();

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
          <ul className="flex flex-col gap-2">
            {section.entries.map(({ card, count }) => (
              <DeckCardChip key={card.id} card={card} count={count} onZoom={handleZoom} readOnly />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 text-[color:var(--text-primary)]">
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--accent)] transition hover:text-[color:var(--accent)]/80"
        >
          ← {labels.deckDetails.backButton}
        </Link>
        <Link
          href={`/${locale}/create?deck=${encodeURIComponent(deckMeta.id)}`}
          className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
        >
          {labels.myDecks.openButton}
        </Link>
      </div>

      {deckMeta?.authorName ? (
        <div className="flex flex-col items-center gap-3 text-center">
          {deckMeta.authorId ? (
            <Link
              href={`/${locale}/players/${encodeURIComponent(deckMeta.authorId)}`}
              className="text-xl font-semibold uppercase tracking-wide text-[color:var(--text-secondary)] underline decoration-[color:var(--text-secondary)] transition hover:text-[color:var(--accent)]"
            >
              {deckMeta.authorName}
            </Link>
          ) : (
            <span className="text-xl font-semibold uppercase tracking-wide text-[color:var(--text-secondary)] underline decoration-[color:var(--text-secondary)]">
              {deckMeta.authorName}
            </span>
          )}
          <div className="flex flex-col items-center gap-2 text-xs text-[color:var(--text-secondary)]">
            <span className="font-semibold uppercase tracking-wide">{labels.publicProfile.socialsHeading}</span>
            {authorSocials.length > 0 ? (
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
            ) : (
              <span className="text-xs text-[color:var(--text-secondary)]">{labels.publicProfile.socialsEmpty}</span>
            )}
          </div>
        </div>
      ) : null}

      <div
        className="relative space-y-3 rounded-2xl border border-[color:var(--border)] p-6 shadow-sm"
        style={{
          backgroundImage: `linear-gradient(rgba(12, 15, 21, 0.35), rgba(12, 15, 21, 0.35)), ${buildAffinityGradient(bannerAffinities)}`,
        }}
      >
        <div className="absolute right-6 top-6 flex flex-wrap justify-end gap-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)] md:flex-nowrap">
            <span className="inline-flex items-center gap-1 rounded-md border border-[color:var(--surface-muted)] bg-[color:var(--surface-muted)] px-2.5 py-1">
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
            <span className="inline-flex items-center gap-1 rounded-md border border-[color:var(--surface-muted)] bg-[color:var(--surface-muted)] px-2.5 py-1">
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
          <div className="absolute bottom-6 right-6 text-sm font-semibold text-[color:var(--text-primary)]">
            {formattedCreatedAt}
          </div>
        ) : null}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3 pr-20 md:pr-0 md:max-w-[80%]">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="w-full break-words text-3xl font-semibold text-[color:var(--text-primary)]">{title}</h1>
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
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {labels.deckDetails.notesHeading}
                </h2>
                <p className="break-words text-sm leading-6 text-[color:var(--text-primary)] whitespace-pre-line">
                  {description}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm text-[color:var(--text-secondary)]">
          <div>
            <dt className="mb-1 text-xs uppercase tracking-wide">{labels.myDecks.cardsLabel}</dt>
            <dd className="text-base font-semibold text-[color:var(--text-primary)]">{totalCards}</dd>
          </div>
        </dl>
      </div>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">{labels.deckDetails.sectionsHeading}</h2>
          <span className="text-sm text-[color:var(--text-secondary)]">{labels.myDecks.cardsLabel}: {totalCards}</span>
        </header>
        {chips}
      </section>

      <ZoomOverlay card={zoomCard} variant={zoomVariant} anchor={zoomAnchor} onClose={() => handleZoom(null)} />
    </div>
  );
}
