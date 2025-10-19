import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale, type Locale } from '@/i18n/config';
import { getPublicDeckSummaryById } from '@/lib/supabase/decks';
import { buildCanonicalMetadata } from '@/lib/metadata/locale';

import { DeckDetailClient } from './deck-detail-client';

export const dynamic = 'force-dynamic';

interface DeckDetailsParams {
  locale: Locale | string;
  deckId: string;
}

interface DeckDetailsPageProps {
  params: Promise<DeckDetailsParams>;
}

export async function generateMetadata({ params }: DeckDetailsPageProps): Promise<Metadata> {
  const { locale, deckId } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  if (!deckId || deckId.trim().length === 0) {
    notFound();
  }

  return buildCanonicalMetadata(locale, ['decks', deckId]);
}

export default async function DeckDetailsPage({ params }: DeckDetailsPageProps) {
  const { locale, deckId } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const initialSummary = await getPublicDeckSummaryById(deckId);

  return (
    <DeckDetailClient
      locale={locale}
      deckId={deckId}
      labels={{ deckDetails: dictionary.deckDetails, myDecks: dictionary.myDecks, publicProfile: dictionary.publicProfile }}
      emptyDeckLabel={dictionary.builder.emptyDeck}
      initialSummary={initialSummary ?? undefined}
    />
  );
}
