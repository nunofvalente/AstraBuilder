import { notFound } from 'next/navigation';

import { isLocale } from '@/i18n/config';
import { PrimaryButton } from '@/components/primary-button';
import { SecondaryButton } from '@/components/secondary-button';
import { getPublicAssetUrl } from '@/lib/storage/public-asset-url';
import { getDictionary } from '@/i18n/get-dictionary';
import { getPublicDeckSummaries } from '@/lib/supabase/decks';
import { splitDecksForHome } from '@/lib/decks/rankings';
import { DeckSummaryCard } from '@/components/deck-summary-card';

type LocaleParams = {
  locale: string;
};

type LocalePageProps = {
  params: Promise<LocaleParams>;
};

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
  const deckCardLabels = {
    cards: deckFeed.cardsLabel,
    untitled: myDecks.untitledLabel,
    publicTag: myDecks.publicTag,
    privateTag: myDecks.privateTag,
  };

  let popularDecks: Awaited<ReturnType<typeof getPublicDeckSummaries>>;
  let trendingDecks: Awaited<ReturnType<typeof getPublicDeckSummaries>>;

  try {
    const decks = await getPublicDeckSummaries(24);
    const split = splitDecksForHome(decks);
    popularDecks = split.popular;
    trendingDecks = split.trending;
  } catch (error) {
    console.error('Failed to load decks for home page', error);
    popularDecks = [];
    trendingDecks = [];
  }

  return (
    <main className="flex w-full flex-col items-center gap-12 pb-12 text-[color:var(--text-primary)]">
      <section
        className="banner-section relative left-1/2 flex w-screen max-w-none -translate-x-1/2 items-center px-6 py-14 md:py-20 mt-[-1px]"
        style={bannerStyle}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 text-center">
          <div className="flex flex-col items-center gap-4">
            <h1 className="banner-text-gradient text-3xl font-semibold tracking-tight sm:text-4xl">
              {home.title}
            </h1>
            <p className="mt-6 text-sm font-medium text-white sm:text-base">
              {home.tagline.intro}
            </p>
            <p className="text-4xl font-bold text-white sm:text-5xl">
              {home.tagline.highlight}
            </p>
          </div>
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
                {home.sections.popular.title}
              </h2>
              <div className="mt-2 h-px w-full bg-[color:var(--border)]" />
            </div>
            {popularDecks.length > 0 ? (
              <div className="grid gap-4">
                {popularDecks.map((deck) => (
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
                {home.sections.popular.placeholder}
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
