'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { Locale } from '@/i18n/config';
import { supabase } from '@/lib/supabase/supabaseClient';
import { getDeckSummariesForUser, type DeckSummary } from '@/lib/supabase/decks';
import { DeckSummaryCard } from '@/components/deck-summary-card';

export type MyDecksClientProps = {
  locale: Locale;
  labels: {
    heading: string;
    description: string;
    empty: string;
    loading: string;
    error: string;
    signInPrompt: string;
    signInButton: string;
    publicTag: string;
    privateTag: string;
    createdLabel: string;
    cardsLabel: string;
    emptyStateCta: string;
    untitledLabel: string;
    openButton: string;
    favoritesLabel: string;
    viewsLabel: string;
    retryButton: string;
  };
};

type Status = 'idle' | 'loading' | 'ready' | 'error' | 'auth';

type DeckWithMeta = DeckSummary;

export function MyDecksClient({ locale, labels }: MyDecksClientProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [decks, setDecks] = useState<DeckWithMeta[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const pathname = usePathname();
  const redirectPath = pathname ?? `/${locale}/my-decks`;
  const signInHref = `/${locale}/sign-in?redirect=${encodeURIComponent(redirectPath)}`;

  useEffect(() => {
    let isMounted = true;

    async function loadDecks() {
      setStatus('loading');
      setErrorMessage(null);

      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult?.user) {
        if (isMounted) {
          setStatus('auth');
        }
        return;
      }

      try {
        const summaries = await getDeckSummariesForUser(userResult.user.id);
        if (!isMounted) {
          return;
        }
        setDecks(summaries);
        setStatus('ready');
      } catch (error) {
        console.error('Failed to load decks', error);
        if (!isMounted) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? String((error as { message?: unknown }).message)
              : null;
        setErrorMessage(message ?? labels.error);
        setStatus('error');
      }
    }

    void loadDecks();

    return () => {
      isMounted = false;
    };
  }, [labels.error, locale, redirectPath, reloadNonce]);

  const content = useMemo(() => {
    if (status === 'loading' || status === 'idle') {
      return (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-sm text-[color:var(--text-secondary)]">
          {labels.loading}
        </div>
      );
    }

    if (status === 'auth') {
      return (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
          <p className="text-sm text-[color:var(--text-secondary)]">{labels.signInPrompt}</p>
          <Link
            href={signInHref}
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            {labels.signInButton}
          </Link>
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-100">
          <span>{errorMessage ?? labels.error}</span>
          <button
            type="button"
            onClick={() => {
              setReloadNonce((previous) => previous + 1);
            }}
            className="inline-flex w-fit items-center justify-center rounded-md border border-red-400/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-100 transition hover:bg-red-500/20 focus:outline-none focus-visible:ring focus-visible:ring-red-400"
          >
            {labels.retryButton}
          </button>
        </div>
      );
    }

    if (decks.length === 0) {
      return (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-10 text-center">
          <p className="text-sm text-[color:var(--text-secondary)]">{labels.empty}</p>
          <Link
            href={`/${locale}/create`}
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            {labels.emptyStateCta}
          </Link>
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {decks.map((deck) => (
          <DeckSummaryCard
            key={deck.id}
            locale={locale}
            deck={deck}
            detailHref={`/${locale}/decks/${encodeURIComponent(deck.id)}`}
            labels={{
              cards: labels.cardsLabel,
              untitled: labels.untitledLabel,
              publicTag: labels.publicTag,
              privateTag: labels.privateTag,
            }}
            showPrivacyTag
          />
        ))}
      </div>
    );
  }, [decks, errorMessage, labels, locale, signInHref, status]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 text-[color:var(--text-primary)]">
      <div className="space-y-2 text-center md:text-left">
        <h1 className="text-3xl font-semibold">{labels.heading}</h1>
        <p className="text-sm text-[color:var(--text-secondary)]">{labels.description}</p>
      </div>
      {content}
    </div>
  );
}
