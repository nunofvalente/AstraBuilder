import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';
import { getPublicDeckSummaries } from '@/lib/supabase/decks';
import { DeckSummaryCard } from '@/components/deck-summary-card';

export const dynamic = 'force-dynamic';

interface DecksPageParams {
  locale: string;
}

interface DecksPageProps {
  params: Promise<DecksPageParams>;
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
        <div className="grid gap-5 md:grid-cols-2 min-[2000px]:grid-cols-3">
          {decks.map((deck) => {
            const authorDisplay = deck.authorName && deck.authorName.trim().length > 0
              ? deck.authorName.trim()
              : deck.authorId
                ? `${deck.authorId.slice(0, 8)}…`
                : null;
            const authorHref = deck.authorId ? `/${locale}/players/${encodeURIComponent(deck.authorId)}` : null;

            return (
              <DeckSummaryCard
                key={deck.id}
                locale={locale}
            deck={deck}
            detailHref={`/${locale}/decks/${encodeURIComponent(deck.id)}`}
            labels={{
              cards: deckFeed.cardsLabel,
              untitled: myDecks.untitledLabel,
              publicTag: myDecks.publicTag,
              privateTag: myDecks.privateTag,
            }}
                author={authorDisplay ? { label: authorDisplay, href: authorHref } : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
