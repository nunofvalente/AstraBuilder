import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { getPublicDeckSummaries } from '@/lib/supabase/decks';
import {
  deckMatchesAffinityPairing,
  formatAffinityPairingLabel,
  parseAffinityPairingSlug,
} from '@/lib/decks/affinity-pairings';
import { CommunityDecksClient } from '@/app/[locale]/decks/community-decks-client';
import { buildPageMetadata } from '@/lib/metadata/locale';

export const dynamic = 'force-dynamic';

type AffinityPairingPageParams = {
  locale: string;
  pairingSlug: string;
};

type AffinityPairingPageProps = {
  params: Promise<AffinityPairingPageParams>;
};

export async function generateMetadata({ params }: AffinityPairingPageProps): Promise<Metadata> {
  const { locale, pairingSlug } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const pairingAffinities = parseAffinityPairingSlug(pairingSlug);
  if (!pairingAffinities) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const decks = await getPublicDeckSummaries();
  const matchingDecks = decks.filter((deck) => deckMatchesAffinityPairing(deck, pairingAffinities));
  const pairingLabel = formatAffinityPairingLabel(pairingAffinities);
  const title = dictionary.affinityPage.resultsHeading.replace('{pairing}', pairingLabel);
  const deckCountLabel = matchingDecks.length === 1
    ? dictionary.home.sections.affinityPairings.deckLabel
    : dictionary.home.sections.affinityPairings.decksLabel;

  return buildPageMetadata(locale, ['affinity', pairingSlug], {
    title: `${title} | AstraBuilder`,
    description: `${title}. ${matchingDecks.length} ${deckCountLabel}. ${dictionary.deckFeed.description}`,
    index: matchingDecks.length > 0,
  });
}

export default async function AffinityPairingPage({ params }: AffinityPairingPageProps) {
  const { locale, pairingSlug } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const pairingAffinities = parseAffinityPairingSlug(pairingSlug);
  if (!pairingAffinities) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const { affinityPage, deckFeed, myDecks } = dictionary;

  const decks = await getPublicDeckSummaries();
  const matchingDecks = decks.filter((deck) => deckMatchesAffinityPairing(deck, pairingAffinities));

  const pairingLabel = formatAffinityPairingLabel(pairingAffinities);
  const resultsHeading = affinityPage.resultsHeading.replace('{pairing}', pairingLabel);

  return (
    <main className="flex w-full flex-col gap-10 px-4 py-10 text-[color:var(--text-primary)] sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Link
          href={`/${locale}/decks`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)] transition hover:text-[color:var(--accent)]/80 hover:underline"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {affinityPage.backLink}
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{resultsHeading}</h1>
        </div>
      </div>

      <CommunityDecksClient
        locale={locale}
        decks={matchingDecks}
        deckFeedLabels={{
          empty: affinityPage.empty,
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
        showAffinityFilters={false}
      />
    </main>
  );
}
