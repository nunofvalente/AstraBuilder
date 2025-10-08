import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';
import { getPublicDeckSummaries } from '@/lib/supabase/decks';
import { CommunityDecksClient } from './community-decks-client';

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
    <CommunityDecksClient
      locale={locale}
      decks={decks}
      deckFeedLabels={{
        empty: deckFeed.empty,
        cardsLabel: deckFeed.cardsLabel,
      }}
      myDeckLabels={{
        untitled: myDecks.untitledLabel,
        publicTag: myDecks.publicTag,
        privateTag: myDecks.privateTag,
      }}
    />
  );
}
