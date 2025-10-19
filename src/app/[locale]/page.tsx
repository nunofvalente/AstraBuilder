import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isLocale } from '@/i18n/config';
import { PrimaryButton } from '@/components/primary-button';
import { SecondaryButton } from '@/components/secondary-button';
import { getPublicAssetUrl } from '@/lib/storage/public-asset-url';
import { getDictionary } from '@/i18n/get-dictionary';
import { getPublicDeckSummaries } from '@/lib/supabase/decks';
import { sortDecksByTrending } from '@/lib/decks/rankings';
import { getAffinityIconPath } from '@/lib/cards/affinity';
import {
  buildAffinityPairingStats,
  isUnknownPairing,
  type AffinityPairingStat,
} from '@/lib/decks/affinity-pairings';
import { buildCanonicalMetadata } from '@/lib/metadata/locale';
import { DeckSummaryCard } from '@/components/deck-summary-card';

const HOME_DECK_SAMPLE_LIMIT = 24;
const HOME_TRENDING_LIMIT = 4;
const HOME_AFFINITY_PAIRING_LIMIT = 6;

type LocaleParams = {
  locale: string;
};

type LocalePageProps = {
  params: Promise<LocaleParams>;
};

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return buildCanonicalMetadata(locale);
}

export default async function HomePage({ params }: LocalePageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const { home, myDecks, deckFeed } = dictionary;
  const bannerImageUrl = getPublicAssetUrl('images', 'banner-cropped.png');
  const bannerStyle = bannerImageUrl
    ? {
        backgroundImage: `linear-gradient(0deg, var(--banner-overlay), var(--banner-overlay)), url('${bannerImageUrl}')`,
      }
    : undefined;
  const subtitle = typeof home.subtitle === 'string' ? home.subtitle.trim() : '';
  const taglineIntro = typeof home.tagline?.intro === 'string' ? home.tagline.intro.trim() : '';
  const taglineHighlight = typeof home.tagline?.highlight === 'string' ? home.tagline.highlight.trim() : '';
  const deckCardLabels = {
    cards: deckFeed.cardsLabel,
    untitled: myDecks.untitledLabel,
    publicTag: myDecks.publicTag,
    privateTag: myDecks.privateTag,
  };

  let affinityPairings: AffinityPairingStat[] = [];
  let trendingDecks: Awaited<ReturnType<typeof getPublicDeckSummaries>>;

  try {
    const decks = await getPublicDeckSummaries(HOME_DECK_SAMPLE_LIMIT);
    affinityPairings = buildAffinityPairingStats(decks).slice(0, HOME_AFFINITY_PAIRING_LIMIT);
    trendingDecks = sortDecksByTrending(decks).slice(0, HOME_TRENDING_LIMIT);
  } catch (error) {
    console.error('Failed to load decks for home page', error);
    trendingDecks = [];
  }

  const numberFormatter = new Intl.NumberFormat(locale);
  const maxPairingCount = affinityPairings.reduce((max, entry) => (entry.count > max ? entry.count : max), 0);

  return (
    <main className="flex w-full flex-col items-center gap-12 pb-12 text-[color:var(--text-primary)]">
      <section
        className="banner-section relative left-1/2 flex w-screen max-w-none -translate-x-1/2 items-center px-6 py-14 md:py-20 mt-[-1px]"
        style={bannerStyle}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 text-center">
          <h1 className="banner-text-gradient text-3xl font-semibold tracking-tight sm:text-4xl">
            {home.title}
          </h1>
          {subtitle.length > 0 ? (
            <p className="banner-text-gradient text-4xl font-bold leading-tight sm:text-5xl">{subtitle}</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {taglineIntro.length > 0 ? (
                <p className="mt-2 text-sm font-medium text-white sm:text-base">{taglineIntro}</p>
              ) : null}
              {taglineHighlight.length > 0 ? (
                <p className="text-4xl font-bold text-white sm:text-5xl">{taglineHighlight}</p>
              ) : null}
            </div>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <SecondaryButton className="w-full sm:w-auto" href={`/${locale}/decks`}>
              {home.actions.browse}
            </SecondaryButton>
            <PrimaryButton
              className="w-full sm:w-auto"
              href={`/${locale}/create`}
            >
              {home.actions.create}
            </PrimaryButton>
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-4">
        <section className="grid w-full gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">
                {home.sections.affinityPairings.title}
              </h2>
              <div className="mt-2 h-px w-full bg-[color:var(--border)]" />
            </div>
            {affinityPairings.length > 0 ? (
              <div className="flex flex-col gap-3">
                {affinityPairings.map((pairing) => {
                  const pairingLabel = pairing.isUnknown ? home.sections.affinityPairings.unknownLabel : pairing.label;
                  const ratio = maxPairingCount > 0 ? (pairing.count / maxPairingCount) * 100 : 0;
                  const progressWidth = ratio > 0 ? Math.max(8, Math.min(100, ratio)) : 0;
                  const countLabel =
                    pairing.count === 1 ? home.sections.affinityPairings.deckLabel : home.sections.affinityPairings.decksLabel;

                  const card = (
                    <div className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm transition hover:shadow-md">
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="flex items-center gap-3">
                          {pairing.affinities.length > 0 ? (
                            <span className="flex items-center gap-2">
                              {pairing.affinities.map((affinity) => {
                                const iconSrc = getAffinityIconPath(affinity);
                                if (!iconSrc) {
                                  return null;
                                }
                                return (
                                  <Image
                                    key={`${pairing.slug}-${affinity}`}
                                    src={iconSrc}
                                    alt={`${affinity} icon`}
                                    width={24}
                                    height={24}
                                    className="h-6 w-6"
                                  />
                                );
                              })}
                            </span>
                          ) : null}
                          <span className="text-sm font-medium text-[color:var(--text-secondary)]">{pairingLabel}</span>
                        </div>
                        <div className="text-right">
                          <span className="block text-xl font-semibold text-[color:var(--text-primary)]">
                            {numberFormatter.format(pairing.count)}
                          </span>
                          <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                            {countLabel}
                          </span>
                        </div>
                      </div>
                      <div className="h-1 w-full bg-[color:var(--surface-muted)]/50">
                        <div className="h-full bg-[color:var(--accent)]" style={{ width: `${progressWidth.toFixed(2)}%` }} />
                      </div>
                    </div>
                  );

                  const slug = pairing.slug;
                  const isUnknown = pairing.isUnknown || isUnknownPairing(slug);
                  const href = !isUnknown && slug ? `/${locale}/affinity/${slug}` : null;

                  if (!href) {
                    return (
                      <div key={slug} className="cursor-default">
                        {card}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={slug}
                      href={href}
                      className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)]"
                    >
                      {card}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[8rem] items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-6 text-center text-sm text-[color:var(--text-secondary)]">
                {home.sections.affinityPairings.placeholder}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">
                {home.sections.trending.title}
              </h2>
              <div className="mt-2 h-px w-full bg-[color:var(--border)]" />
            </div>
            {trendingDecks.length > 0 ? (
              <div className="grid gap-4">
                {trendingDecks.map((deck) => (
                  <DeckSummaryCard
                    key={deck.id}
                    locale={locale}
                    deck={deck}
                    detailHref={`/${locale}/decks/${encodeURIComponent(deck.id)}`}
                    labels={deckCardLabels}
                    mutedMetrics
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[8rem] items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-6 text-center text-sm text-[color:var(--text-secondary)]">
                {home.sections.trending.placeholder}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
