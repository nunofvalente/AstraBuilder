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

const CARD_TYPE_ORDER = ['Unit', 'Tactic', 'Territory'];
const FALLBACK_SECTION_LABEL = 'Other';

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
  } | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadDeck() {
      setStatus('loading');
      setErrorMessage(null);

      const select =
        'id,title,description,created_at,is_public,deck_cards(quantity,cards(*)),deck_stats(favorites_total,views_total)';

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

  function handleZoom(nextCard: Card | null, variant: 'default' | 'compact' = 'default', anchor: ZoomAnchor | null = null) {
    setZoomCard(nextCard);
    setZoomVariant(variant);
    setZoomAnchor(anchor);
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-10 text-[color:var(--text-secondary)]">
        <Link
          href={`/${locale}/my-decks`}
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
          href={`/${locale}/my-decks`}
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
          href={`/${locale}/my-decks`}
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

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-[color:var(--text-primary)]">{title}</h1>
            <p className="text-sm text-[color:var(--text-secondary)]">{labels.deckDetails.description}</p>
            {description ? (
              <div className="mt-4 space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {labels.deckDetails.notesHeading}
                </h2>
                <p className="text-sm leading-6 text-[color:var(--text-primary)] whitespace-pre-line">{description}</p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-start gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                deckMeta.isPublic
                  ? 'bg-[color:var(--accent)]/15 text-[color:var(--accent)]'
                  : 'bg-[color:var(--surface-muted)] text-[color:var(--text-secondary)]'
              }`}
            >
              {deckMeta.isPublic ? labels.myDecks.publicTag : labels.myDecks.privateTag}
            </span>
            <p className="max-w-xs text-xs text-[color:var(--text-secondary)]">
              {deckMeta.isPublic ? labels.deckDetails.publicNotice : labels.deckDetails.privateNotice}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm text-[color:var(--text-secondary)] sm:grid-cols-4">
          <div>
            <dt className="mb-1 text-xs uppercase tracking-wide">{labels.myDecks.cardsLabel}</dt>
            <dd className="text-base font-semibold text-[color:var(--text-primary)]">{totalCards}</dd>
          </div>
          <div>
            <dt className="mb-1 text-xs uppercase tracking-wide">{labels.myDecks.favoritesLabel}</dt>
            <dd className="text-base font-semibold text-[color:var(--text-primary)]">{deckMeta.favoritesTotal}</dd>
          </div>
          <div>
            <dt className="mb-1 text-xs uppercase tracking-wide">{labels.myDecks.viewsLabel}</dt>
            <dd className="text-base font-semibold text-[color:var(--text-primary)]">{deckMeta.viewsTotal}</dd>
          </div>
          <div>
            <dt className="mb-1 text-xs uppercase tracking-wide">{labels.myDecks.createdLabel}</dt>
            <dd className="text-base font-semibold text-[color:var(--text-primary)]">{formattedCreatedAt ?? '—'}</dd>
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
