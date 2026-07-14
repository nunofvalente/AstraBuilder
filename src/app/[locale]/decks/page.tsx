import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';
import { buildPageMetadata } from '@/lib/metadata/locale';
import { getPublicDeckSummaries } from '@/lib/supabase/decks';
import { CommunityDecksClient } from './community-decks-client';

export const dynamic = 'force-dynamic';

interface DecksPageParams {
  locale: string;
}

interface DecksPageProps {
  params: Promise<DecksPageParams>;
}

export async function generateMetadata({ params }: DecksPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);

  return buildPageMetadata(locale, ['decks'], {
    title: `${dictionary.deckFeed.heading} | AstraBuilder`,
    description: dictionary.deckFeed.description,
  });
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
        sortOptions: {
          popular: deckFeed.sortOptions.popular,
          trending: deckFeed.sortOptions.trending,
          new: deckFeed.sortOptions.new,
        },
      }}
      myDeckLabels={{
        untitled: myDecks.untitledLabel,
        publicTag: myDecks.publicTag,
        privateTag: myDecks.privateTag,
      }}
    />
  );
}
