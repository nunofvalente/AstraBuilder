import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale, type Locale } from '@/i18n/config';

import { DeckDetailClient } from './deck-detail-client';

export const dynamic = 'force-dynamic';

interface DeckDetailsParams {
  locale: Locale | string;
  deckId: string;
}

interface DeckDetailsPageProps {
  params: Promise<DeckDetailsParams>;
}

export default async function DeckDetailsPage({ params }: DeckDetailsPageProps) {
  const { locale, deckId } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);

  return (
    <DeckDetailClient
      locale={locale}
      deckId={deckId}
      labels={{ deckDetails: dictionary.deckDetails, myDecks: dictionary.myDecks }}
      emptyDeckLabel={dictionary.builder.emptyDeck}
    />
  );
}
