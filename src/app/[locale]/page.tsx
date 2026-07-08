import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';

export const revalidate = 60;

import { isLocale } from '@/i18n/config';
import { getPublicAssetUrl } from '@/lib/storage/public-asset-url';
import { getDictionary } from '@/i18n/get-dictionary';
import { getAllPublicDeckSummaries } from '@/lib/supabase/decks';
import { sortDecksByTrending } from '@/lib/decks/rankings';
import { getAffinityBaseColor, getAffinityIconPath, normalizeAffinity } from '@/lib/cards/affinity';
import {
  buildAffinityPairingStats,
  isUnknownPairing,
  type AffinityPairingStat,
} from '@/lib/decks/affinity-pairings';
import { isSimulatorEnabled } from '@/lib/features';
import { buildCanonicalMetadata } from '@/lib/metadata/locale';
import { DeckSummaryCard } from '@/components/deck-summary-card';

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
  const showBattlefieldBanner = isSimulatorEnabled();
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
  let trendingDecks: Awaited<ReturnType<typeof getAllPublicDeckSummaries>>;

  try {
    // Fetch enough public decks to keep affinity pairing stats accurate; paginate in the helper to avoid stale counts.
    const decks = await getAllPublicDeckSummaries();
    affinityPairings = buildAffinityPairingStats(decks).slice(0, HOME_AFFINITY_PAIRING_LIMIT);
    trendingDecks = sortDecksByTrending(decks).slice(0, HOME_TRENDING_LIMIT);
  } catch (error) {
    console.error('Failed to load decks for home page', error);
    trendingDecks = [];
  }

  const numberFormatter = new Intl.NumberFormat(locale);

  const heroCards = [
    {
      src: '/images/home/cards/celeste-concord-paladin.png',
      alt: 'Celeste, Concord Paladin card',
      className: 'home-hero-card home-hero-card-primary',
    },
    {
      src: '/images/home/cards/calico-blood-witch.png',
      alt: 'Calico, the Blood Witch card',
      className: 'home-hero-card home-hero-card-secondary',
    },
    {
      src: '/images/home/cards/varenthus-skyscourge.png',
      alt: 'Varenthus, the Skyscourge card',
      className: 'home-hero-card home-hero-card-tertiary',
    },
  ];
  const heroAffinityIcons = ['caelum', 'solara', 'lux', 'neutral', 'terra', 'nox']
    .map((affinity) => ({
      affinity,
      src: getAffinityIconPath(affinity),
    }))
    .filter((icon): icon is { affinity: string; src: string } => Boolean(icon.src));
  const showcaseLinks = [
    {
      href: `/${locale}/create`,
      label: home.showcaseActions.build,
      accentClass: 'home-showcase-link-valeria',
    },
    {
      href: `/${locale}/decks`,
      label: home.showcaseActions.decks,
      accentClass: 'home-showcase-link-nerezza',
    },
    {
      href: `/${locale}/collection`,
      label: home.showcaseActions.catalog,
      accentClass: 'home-showcase-link-akeno',
    },
  ];
  const sectionRibbonCards = [
    {
      src: '/images/home/cards/gaia-lord-of-nature.png',
      objectPosition: '47% 23%',
    },
    {
      src: '/images/home/cards/renata-skyborne-orphan.png',
      objectPosition: '50% 19%',
    },
    {
      src: '/images/home/cards/ruins-looter.png',
      objectPosition: '48% 22%',
    },
    {
      src: '/images/home/cards/seraphiel-herald-of-light.png',
      objectPosition: '49% 24%',
    },
    {
      src: '/images/home/cards/jormun-feldragon-of-wyrmscar.png',
      objectPosition: '50% 24%',
    },
    {
      src: '/images/home/cards/yako-illusionist.png',
      objectPosition: '50% 19%',
    },
  ];

  return (
    <main
      className={`home-page flex w-full flex-col items-center pb-12 text-[color:var(--text-primary)] ${
        showBattlefieldBanner ? 'gap-16 md:gap-20' : 'gap-12'
      }`}
    >
      <section
        className="banner-section home-hero relative left-1/2 mt-[-1px] flex w-screen max-w-none -translate-x-1/2 items-center overflow-hidden px-6 py-16 md:min-h-[34rem] md:py-24"
        style={bannerStyle}
      >
        <div className="home-hero-card-stage" aria-hidden="true">
          {heroCards.map((card) => (
            <Image
              key={card.src}
              src={card.src}
              alt=""
              width={1500}
              height={2100}
              priority
              className={card.className}
            />
          ))}
        </div>
        <div className="home-hero-content mx-auto flex w-full max-w-6xl flex-col items-center gap-6 text-center md:items-start md:text-left">
          <div className="flex max-w-2xl flex-col items-center gap-4 md:items-start">
            <h1 className="banner-text-gradient text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              {home.title}
            </h1>
            {taglineIntro.length > 0 ? (
              <p className="mt-3 text-sm font-medium uppercase tracking-[0.2em] text-white/80 sm:text-base">{taglineIntro}</p>
            ) : null}
            {taglineHighlight.length > 0 ? (
              <p className="text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">{taglineHighlight}</p>
            ) : null}
            {taglineIntro.length === 0 && taglineHighlight.length === 0 && subtitle.length > 0 ? (
              <p className="banner-text-gradient text-4xl font-bold leading-tight sm:text-5xl">{subtitle}</p>
            ) : null}
          </div>
          <div className="home-hero-affinity-row mt-3" aria-hidden="true">
            {heroAffinityIcons.map((icon) => (
              <span key={icon.affinity} className="home-hero-affinity-mark">
                <Image
                  src={icon.src}
                  alt=""
                  width={28}
                  height={28}
                  className="home-hero-affinity-icon"
                />
              </span>
            ))}
          </div>
        </div>
        <div className="home-hero-bottom-fade" aria-hidden="true" />
      </section>

      {showBattlefieldBanner ? (
        <>
          <section className="home-battlefield-banner mx-auto w-full max-w-6xl px-4">
            <div className="home-battlefield-banner-panel">
              <div className="home-battlefield-banner-copy">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--accent)]">
                  {dictionary.topBar.play}
                </p>
                <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
                  {home.battlefieldBanner.title}
                </h2>
                <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-white/76 sm:text-base">
                  {home.battlefieldBanner.description}
                </p>
                <Link
                  href={`/${locale}/play`}
                  className="mt-6 inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-5 py-3 text-sm font-bold text-[color:var(--text-on-accent)] shadow-lg shadow-black/25 transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#24211e]"
                >
                  {home.battlefieldBanner.action}
                </Link>
              </div>
              <div className="home-battlefield-banner-cards" aria-hidden="true">
                <Image
                  src="/images/home/cards/lingyi-the-gilded-prophet.png"
                  alt=""
                  width={420}
                  height={588}
                  className="home-battlefield-banner-card home-battlefield-banner-card-left"
                />
                <Image
                  src="/images/home/cards/vero-captain-of-the-guard.png"
                  alt=""
                  width={420}
                  height={588}
                  className="home-battlefield-banner-card home-battlefield-banner-card-right"
                />
              </div>
            </div>
          </section>

          <section className="home-showcase mx-auto w-full max-w-6xl px-4">
            <div className="home-showcase-grid">
              {showcaseLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`home-showcase-link ${item.accentClass} group focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]`}
                >
                  <span className="home-showcase-link-accent block" aria-hidden="true" />
                  <span className="home-showcase-link-copy flex min-w-0 flex-1 items-center">
                    <span className="home-showcase-link-label text-2xl font-bold sm:text-3xl">{item.label}</span>
                  </span>
                  <span className="home-showcase-link-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="home-showcase home-showcase-legacy mx-auto grid w-full max-w-6xl gap-8 px-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="home-showcase-sticky">
            <div className="home-showcase-stage">
              <Image
                src="/images/home/cards/valeria-dragoon-knight.png"
                alt=""
                width={600}
                height={840}
                className="home-showcase-card home-showcase-card-left"
              />
              <Image
                src="/images/home/cards/nerezza-umbrasco-scion.png"
                alt=""
                width={750}
                height={1050}
                className="home-showcase-card home-showcase-card-center"
              />
              <Image
                src="/images/home/cards/akeno-noble-samurai.png"
                alt=""
                width={600}
                height={840}
                className="home-showcase-card home-showcase-card-right"
              />
            </div>
          </div>
          <div className="flex flex-col gap-4 md:py-8">
            {showcaseLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`home-showcase-link ${item.accentClass} group focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]`}
              >
                <span className="home-showcase-link-accent block" aria-hidden="true" />
                <span className="home-showcase-link-copy flex min-w-0 flex-1 items-center">
                  <span className="home-showcase-link-label text-2xl font-bold sm:text-3xl">{item.label}</span>
                </span>
                <span className="home-showcase-link-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="home-community-section relative left-1/2 w-screen max-w-none -translate-x-1/2">
        <div className="home-community-ribbon" aria-hidden="true">
          {sectionRibbonCards.map((card, index) => (
            <div key={`${card.src}-${index}`} className="home-community-ribbon-tile">
              <Image
                src={card.src}
                alt=""
                width={600}
                height={840}
                className="h-full w-full object-cover"
                style={{ objectPosition: card.objectPosition }}
              />
            </div>
          ))}
        </div>
        <div className="home-community-rule" aria-hidden="true" />
        <div className="home-community-band">
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
                  const countLabel =
                    pairing.count === 1 ? home.sections.affinityPairings.deckLabel : home.sections.affinityPairings.decksLabel;
                  const accentAffinity = pairing.affinities.find((affinity) => normalizeAffinity(affinity) !== 'Neutral');
                  const pairingStyle = {
                    '--pairing-accent': getAffinityBaseColor(accentAffinity),
                  } as CSSProperties;

                  const card = (
                    <div className="home-affinity-pairing-card overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm transition hover:shadow-md" style={pairingStyle}>
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="flex items-center gap-3">
                          {pairing.affinities.length > 0 ? (
                            <span className="home-affinity-pairing-icons flex items-center gap-2">
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
                                    className="home-affinity-pairing-icon h-6 w-6"
                                  />
                                );
                              })}
                            </span>
                          ) : null}
                          <span className="home-affinity-pairing-label text-sm font-medium text-[color:var(--text-secondary)]">{pairingLabel}</span>
                        </div>
                        <div className="home-affinity-pairing-count text-right">
                          <span className="block text-xl font-semibold text-[color:var(--text-primary)]">
                            {numberFormatter.format(pairing.count)}
                          </span>
                          <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                            {countLabel}
                          </span>
                        </div>
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
        </div>
      </section>
    </main>
  );
}
