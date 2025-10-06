import { notFound } from 'next/navigation';
import Link from 'next/link';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale, type Locale } from '@/i18n/config';
import { getPublicDeckSummaries } from '@/lib/supabase/decks';

export const dynamic = 'force-dynamic';

interface DecksPageParams {
  locale: string;
}

interface DecksPageProps {
  params: Promise<DecksPageParams>;
}

function formatDate(value: string | null, locale: Locale): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  } catch (error) {
    return date.toLocaleDateString();
  }
}

export default async function DecksPage({ params }: DecksPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const decks = await getPublicDeckSummaries();
  const { deckFeed, myDecks } = dictionary;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 text-[color:var(--text-primary)]">
      <header className="space-y-2 text-center md:text-left">
        <h1 className="text-3xl font-semibold">{deckFeed.heading}</h1>
        <p className="text-sm text-[color:var(--text-secondary)]">{deckFeed.description}</p>
      </header>

      {decks.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-10 text-center text-sm text-[color:var(--text-secondary)]">
          {deckFeed.empty}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {decks.map((deck) => {
            const createdLabel = formatDate(deck.createdAt, locale);
            const author = deck.authorName && deck.authorName.trim().length > 0
              ? deck.authorName.trim()
              : deck.authorId
                ? `${deck.authorId.slice(0, 8)}…`
                : '—';
            return (
              <Link
                key={deck.id}
                href={`/${locale}/decks/${encodeURIComponent(deck.id)}`}
                className="flex h-full flex-col gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">
                      {deck.title && deck.title.trim().length > 0 ? deck.title.trim() : myDecks.untitledLabel}
                    </h2>
                    {deck.description ? (
                      <p className="text-sm text-[color:var(--text-secondary)] line-clamp-3">{deck.description}</p>
                    ) : null}
                  </div>
                  <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide bg-[color:var(--accent)]/15 text-[color:var(--accent)]">
                    {myDecks.publicTag}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-[color:var(--text-secondary)]">
                  <span className="font-semibold text-[color:var(--text-primary)]">
                    {deckFeed.authorLabel}: <span className="font-normal text-[color:var(--text-secondary)]">{author}</span>
                  </span>
                  {createdLabel ? (
                    <span className="font-semibold text-[color:var(--text-primary)]">
                      {deckFeed.createdLabel}: <span className="font-normal text-[color:var(--text-secondary)]">{createdLabel}</span>
                    </span>
                  ) : null}
                  <span className="font-semibold text-[color:var(--text-primary)]">
                    {deckFeed.cardsLabel}: <span className="font-normal text-[color:var(--text-secondary)]">{deck.cardCount}</span>
                  </span>
                  <span className="font-semibold text-[color:var(--text-primary)]">
                    {deckFeed.favoritesLabel}: <span className="font-normal text-[color:var(--text-secondary)]">{deck.favoritesTotal}</span>
                  </span>
                  <span className="font-semibold text-[color:var(--text-primary)]">
                    {deckFeed.viewsLabel}: <span className="font-normal text-[color:var(--text-secondary)]">{deck.viewsTotal}</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
