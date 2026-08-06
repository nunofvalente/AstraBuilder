import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const revalidate = 60;

import { isLocale } from '@/i18n/config';
import { getPublicAssetUrl } from '@/lib/storage/public-asset-url';
import { getDictionary } from '@/i18n/get-dictionary';
import { getAllPublicDeckSummaries, getTopCardsInPublicDecks } from '@/lib/supabase/decks';
import { sortDecksByPopularity } from '@/lib/decks/rankings';
import { getAffinityIconPath } from '@/lib/cards/affinity';
import { isSimulatorEnabled } from '@/lib/features';
import { buildPageMetadata } from '@/lib/metadata/locale';
import { DeckSummaryCard } from '@/components/deck-summary-card';

const HOME_POPULAR_LIMIT = 6;
const HOME_TOP_CARDS_LIMIT = 6;

type LocaleParams = {
  locale: string;
};

type LocalePageProps = {
  params: Promise<LocaleParams>;
};

type HomeFeatureIcon = 'builder' | 'catalog' | 'play' | 'decks';

function FeatureNodeIcon({ type }: { type: HomeFeatureIcon }) {
  if (type === 'builder') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 7 7-3 7 3-7 3-7-3Zm0 5 7 3 7-3M5 17l7 3 7-3" />
      </svg>
    );
  }

  if (type === 'catalog') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM20 13V5.5A2.5 2.5 0 0 0 17.5 3H13v16h1.5M17 17l3.5 3.5M19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" />
      </svg>
    );
  }

  if (type === 'play') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 4 12 12M18 4 6 16M5 15l-2 5 5-2M19 15l2 5-5-2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-1a2.5 2.5 0 1 0 0-5M3 20v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M15 14h1a4 4 0 0 1 4 4v2" />
    </svg>
  );
}

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const tagline = [dictionary.home.tagline?.intro, dictionary.home.tagline?.highlight]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
  const description = [tagline, dictionary.deckFeed.description].filter(Boolean).join('. ');

  return buildPageMetadata(locale, [], {
    title: `${dictionary.home.title} | ${dictionary.builder.title} - Echoes of Astra`,
    description,
  });
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
    author: deckFeed.authorLabel,
    cards: deckFeed.cardsLabel,
    untitled: myDecks.untitledLabel,
    publicTag: myDecks.publicTag,
    privateTag: myDecks.privateTag,
  };

  const [publicDecksResult, topCardsResult] = await Promise.allSettled([
    getAllPublicDeckSummaries(),
    getTopCardsInPublicDecks(HOME_TOP_CARDS_LIMIT),
  ]);
  const popularDecks =
    publicDecksResult.status === 'fulfilled'
      ? sortDecksByPopularity(publicDecksResult.value).slice(0, HOME_POPULAR_LIMIT)
      : [];
  const topCards = topCardsResult.status === 'fulfilled' ? topCardsResult.value : [];

  if (publicDecksResult.status === 'rejected') {
    console.error('Failed to load decks for home page', publicDecksResult.reason);
  }
  if (topCardsResult.status === 'rejected') {
    console.error('Failed to load top cards for home page', topCardsResult.reason);
  }

  const heroCards = [
    {
      src: 'https://assets.echoesofastra.com/cards/IMP041_Celeste,ConcordPaladin.png',
      alt: 'Celeste, Concord Paladin card',
      className: 'home-hero-card home-hero-card-primary',
    },
    {
      src: 'https://assets.echoesofastra.com/cards/IMP003_Calico,theBloodWitch.png',
      alt: 'Calico, the Blood Witch card',
      className: 'home-hero-card home-hero-card-secondary',
    },
    {
      src: 'https://assets.echoesofastra.com/cards/IMP111_Varenthus,theSkyscourge.png',
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
  const showcaseFeatures = [
    {
      href: `/${locale}/create`,
      label: home.showcaseActions.build,
      description: home.showcaseIntro.features.builder.description,
      icon: 'builder' as const,
      isBeta: false,
    },
    {
      href: `/${locale}/collection`,
      label: home.showcaseActions.catalog,
      description: home.showcaseIntro.features.catalog.description,
      icon: 'catalog' as const,
      isBeta: false,
    },
    ...(showBattlefieldBanner
      ? [
          {
            href: `/${locale}/play`,
            label: home.showcaseIntro.features.play.title,
            description: home.showcaseIntro.features.play.description,
            icon: 'play' as const,
            isBeta: true,
          },
        ]
      : []),
    {
      href: `/${locale}/decks`,
      label: home.showcaseActions.decks,
      description: home.showcaseIntro.features.decks.description,
      icon: 'decks' as const,
      isBeta: false,
    },
  ];
  const sectionRibbonCards = [
    {
      src: 'https://assets.echoesofastra.com/cards/IMP130_Gaia,LordofNature.png',
      objectPosition: '47% 23%',
    },
    {
      src: 'https://assets.echoesofastra.com/cards/IMP073_Renata,SkyborneOrphan.png',
      objectPosition: '50% 19%',
    },
    {
      src: 'https://assets.echoesofastra.com/cards/IMP109_RuinsLooter.png',
      objectPosition: '48% 22%',
    },
    {
      src: 'https://assets.echoesofastra.com/cards/IMP048_Seraphiel,HeraldofLight.png',
      objectPosition: '49% 24%',
    },
    {
      src: 'https://assets.echoesofastra.com/cards/IMP009_Jormun,FeldragonofWyrmscar.png',
      objectPosition: '50% 24%',
    },
    {
      src: 'https://assets.echoesofastra.com/cards/IMP144_YakoIllusionist.png',
      objectPosition: '50% 19%',
    },
  ];

  return (
    <main
      className={`home-page flex w-full flex-col items-center pb-0 text-[color:var(--text-primary)] ${
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
        <div className="home-hero-content mx-auto flex w-full max-w-7xl flex-col items-center text-center md:items-start md:text-left">
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
          <div className="home-hero-affinity-row mt-4" aria-hidden="true">
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
          <div className="home-hero-quick-actions">
            <Link href={`/${locale}/play`} className="home-compact-action home-compact-action-primary">
              <span>{dictionary.topBar.play}</span>
              <span className="home-hero-beta-badge">{dictionary.topBar.beta}</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link href={`/${locale}/create`} className="home-compact-action home-hero-builder-action">
              <span>{home.showcaseActions.build}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="home-discord-reference home-hero-discord">
            <span>{home.showcaseIntro.community}</span>
            <Link
              href="https://discord.gg/TPycCTkD2g"
              target="_blank"
              rel="noopener noreferrer"
              className="home-discord-button"
            >
              <svg viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
                <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69c-6.27 0-11.43-5.73-11.43-12.78s5.06-12.79 11.43-12.79 11.54 5.78 11.43 12.79-5.06 12.78-11.43 12.78Zm42.24 0c-6.27 0-11.43-5.73-11.43-12.78s5.06-12.79 11.43-12.78 11.54 5.78 11.43 12.79-5.06 12.78-11.43 12.78Z" />
              </svg>
              <span>{home.showcaseIntro.discordAction}</span>
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
        <div className="home-hero-bottom-fade" aria-hidden="true" />
      </section>

      {showBattlefieldBanner ? (
        <section className="home-showcase home-toolkit-showcase mx-auto w-full max-w-7xl px-4">
          <div className="home-showcase-layout">
            <div className="home-showcase-intro">
              <p className="home-showcase-eyebrow">{home.showcaseIntro.eyebrow}</p>
              <h2 className="home-showcase-title">{home.showcaseIntro.title}</h2>
              <p className="home-showcase-description">{home.showcaseIntro.description}</p>
            </div>

            <div className="home-showcase-content">
              <div className="home-showcase-grid">
                {showcaseFeatures.map((item, index) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="home-feature-card"
                    aria-label={item.label}
                  >
                    <div className="home-feature-card-number">
                      <FeatureNodeIcon type={item.icon} />
                      <span className="sr-only">{String(index + 1).padStart(2, '0')}</span>
                    </div>
                    <div className="home-feature-card-heading">
                      <h3>{item.label}</h3>
                      {item.isBeta ? <span className="home-beta-badge">{dictionary.topBar.beta}</span> : null}
                    </div>
                    <p>{item.description}</p>
                    <span className="home-feature-card-arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="home-showcase home-showcase-legacy mx-auto grid w-full max-w-7xl gap-8 px-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="home-showcase-sticky">
            <div className="home-showcase-stage">
              <Image
                src="https://assets.echoesofastra.com/cards/IMP078_Valeria,DragoonKnight.png"
                alt=""
                width={600}
                height={840}
                className="home-showcase-card home-showcase-card-left"
              />
              <Image
                src="https://assets.echoesofastra.com/cards/IMP011_Nerezza,UmbrascoScion.png"
                alt=""
                width={750}
                height={1050}
                className="home-showcase-card home-showcase-card-center"
              />
              <Image
                src="https://assets.echoesofastra.com/cards/IMP127_Akeno,NobleSamurai.png"
                alt=""
                width={600}
                height={840}
                className="home-showcase-card home-showcase-card-right"
              />
            </div>
          </div>
          <div className="flex flex-col gap-4 md:py-8">
            {showcaseFeatures.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="home-showcase-link home-showcase-link-valeria group focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]"
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
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4">
          <section className="w-full space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">{home.sections.trending.title}</h2>
                <p className="mt-2 text-sm text-white/70">{deckFeed.description}</p>
              </div>
              <Link
                href={`/${locale}/decks`}
                className="inline-flex shrink-0 items-center justify-center rounded-md border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-[color:var(--accent)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
              >
                {home.actions.browse}
              </Link>
            </div>
            <div className="h-px w-full bg-[color:var(--border)]" />
            {popularDecks.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {popularDecks.map((deck) => (
                  <DeckSummaryCard
                    key={deck.id}
                    locale={locale}
                    deck={deck}
                    detailHref={`/${locale}/decks/${encodeURIComponent(deck.id)}`}
                    labels={deckCardLabels}
                    mutedMetrics
                    variant="compact"
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[8rem] items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-6 text-center text-sm text-[color:var(--text-secondary)]">
                {home.sections.trending.placeholder}
              </div>
            )}
          </section>

          <section id="top-cards" className="mt-8 w-full space-y-5 pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">{home.sections.topCards.title}</h2>
                <p className="mt-2 text-sm text-white/70">{home.sections.topCards.description}</p>
              </div>
              <Link
                href={`/${locale}/collection`}
                className="inline-flex shrink-0 items-center justify-center rounded-md border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-[color:var(--accent)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
              >
                {home.sections.topCards.browseAction}
              </Link>
            </div>
            <div className="h-px w-full bg-[color:var(--border)]" />
            {topCards.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {topCards.map((entry, index) => {
                  const returnPath = `/${locale}`;
                  const cardHref = `/${locale}/cards/${encodeURIComponent(entry.card.id)}?from=${encodeURIComponent(returnPath)}`;
                  return (
                    <Link
                      key={entry.card.id}
                      href={cardHref}
                      className="group min-w-0 border border-white/10 bg-black/15 p-2 transition hover:-translate-y-1 hover:border-[color:var(--accent)] hover:bg-black/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
                    >
                      <div className="relative aspect-[5/7] overflow-hidden bg-black/20">
                        <Image
                          src={entry.card.imageSrc}
                          alt={entry.card.name}
                          width={500}
                          height={700}
                          className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.025]"
                        />
                        <span className="absolute left-2 top-2 inline-flex h-8 min-w-8 items-center justify-center border border-white/20 bg-[#191715]/90 px-2 text-xs font-bold text-[color:var(--accent)] shadow-lg">
                          #{index + 1}
                        </span>
                      </div>
                      <div className="px-1 pb-1 pt-3">
                        <h3 className="text-sm font-semibold leading-5 text-white">{entry.card.name}</h3>
                        <p className="mt-1 text-xs text-white/60">
                          {home.sections.topCards.usageLabel.replace(
                            '{percentage}',
                            String(entry.usagePercentage)
                          )}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[8rem] items-center justify-center border border-[color:var(--border)] bg-black/15 px-6 text-center text-sm text-[color:var(--text-secondary)]">
                {home.sections.topCards.placeholder}
              </div>
            )}
          </section>
        </div>
        </div>
        <footer className="w-full border-t border-white/10 bg-[#191715] text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-7 text-xs leading-5 text-white/60 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="max-w-3xl">{home.footer.disclaimer}</p>
          <div className="flex items-center gap-4 font-medium">
            <Link
              href="https://discord.gg/TPycCTkD2g"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2] text-white transition hover:bg-[#4752c4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5865f2]"
            >
              <svg aria-hidden="true" viewBox="0 0 127.14 96.36" className="h-4 w-4" fill="currentColor">
                <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69c-6.27 0-11.43-5.73-11.43-12.78s5.06-12.79 11.43-12.79 11.54 5.78 11.43 12.79-5.06 12.78-11.43 12.78Zm42.24 0c-6.27 0-11.43-5.73-11.43-12.78s5.06-12.79 11.43-12.79 11.54 5.78 11.43 12.79-5.06 12.78-11.43 12.78Z" />
              </svg>
            </Link>
            <Link
              href="https://echoesofastra.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/75 transition hover:text-white"
            >
              Echoes of Astra
            </Link>
          </div>
          <p className="w-full text-white/45">{home.footer.copyright}</p>
        </div>
        </footer>
      </section>
    </main>
  );
}
