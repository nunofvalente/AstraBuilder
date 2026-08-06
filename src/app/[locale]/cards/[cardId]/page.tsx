import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getStaticCards } from '@/app/[locale]/create/deck-builder/data';
import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';
import { getAffinityBaseColor, getAffinityIconPath, normalizeAffinity } from '@/lib/cards/affinity';
import { buildPageMetadata } from '@/lib/metadata/locale';

import { CardDetailsBackButton } from './card-details-back-button';

export const dynamic = 'force-dynamic';

type CardDetailsParams = {
  locale: string;
  cardId: string;
};

type CardDetailsPageProps = {
  params: Promise<CardDetailsParams>;
  searchParams?: Promise<{ from?: string | string[] }>;
};

async function findCard(cardId: string) {
  const { cards } = await getStaticCards();
  return cards.find((card) => card.id.toLowerCase() === cardId.toLowerCase()) ?? null;
}

export async function generateMetadata({ params }: CardDetailsPageProps): Promise<Metadata> {
  const { locale, cardId } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  const card = await findCard(cardId);
  if (!card) {
    notFound();
  }

  const description = card.rulesText || card.description || card.detailLabel;
  return buildPageMetadata(locale, ['cards', card.id], {
    title: `${card.name} | AstraBuilder`,
    description,
  });
}

export default async function CardDetailsPage({ params, searchParams }: CardDetailsPageProps) {
  const { locale, cardId } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  const [dictionary, card] = await Promise.all([getDictionary(locale), findCard(cardId)]);
  if (!card) {
    notFound();
  }

  const affinity = normalizeAffinity(card.affinity) ?? card.affinity;
  const affinityIcon = getAffinityIconPath(affinity);
  const affinityColor = getAffinityBaseColor(affinity);
  const isUnit = card.type.toLowerCase().includes('unit');
  const stats = [
    { label: dictionary.cards.fields.cost, value: card.cost },
    ...(isUnit || card.attack > 0
      ? [{ label: dictionary.cards.fields.attack, value: card.attack }]
      : []),
    ...(isUnit || card.health > 0
      ? [{ label: dictionary.cards.fields.health, value: card.health }]
      : []),
    ...(card.influence != null
      ? [{ label: dictionary.cards.fields.influence, value: card.influence }]
      : []),
  ];
  const pageStyle = { '--card-affinity': affinityColor } as CSSProperties;
  const requestedReturnPath = (await searchParams)?.from;
  const returnPathValue = Array.isArray(requestedReturnPath)
    ? requestedReturnPath[0]
    : requestedReturnPath;
  const localePathPrefix = `/${locale}/`;
  const hasSafeReturnPath =
    typeof returnPathValue === 'string' &&
    (returnPathValue === `/${locale}` || returnPathValue.startsWith(localePathPrefix)) &&
    !returnPathValue.startsWith('//');
  const fallbackHref = hasSafeReturnPath ? returnPathValue : `/${locale}/collection`;

  return (
    <div
      className="relative min-h-full overflow-hidden bg-[color:var(--background)] px-4 py-8 text-[color:var(--text-primary)] sm:px-6 lg:px-10 lg:py-12"
      style={pageStyle}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(circle at 18% 18%, color-mix(in srgb, var(--card-affinity) 34%, transparent), transparent 34%), linear-gradient(130deg, transparent 48%, color-mix(in srgb, var(--card-affinity) 12%, transparent) 48%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl">
        <CardDetailsBackButton
          fallbackHref={fallbackHref}
          preferHistory={hasSafeReturnPath}
          label={dictionary.cardDetails.backToPreviousPage}
        />

        <article className="grid overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.65fr)]">
          <div className="relative flex items-center justify-center border-b border-[color:var(--border)] bg-black/20 p-6 sm:p-9 lg:border-b-0 lg:border-r">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-1"
              style={{ backgroundColor: affinityColor }}
            />
            <img
              src={card.imageSrc}
              alt={card.name}
              className="aspect-[5/7] max-h-[640px] w-full max-w-[390px] object-contain drop-shadow-[0_24px_30px_rgba(0,0,0,0.45)]"
            />
          </div>

          <div className="flex min-w-0 flex-col p-6 sm:p-9 lg:p-12">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--text-secondary)]">
              <span>{card.type}</span>
              {card.subtype ? (
                <>
                  <span aria-hidden="true">/</span>
                  <span>{card.subtype}</span>
                </>
              ) : null}
            </div>

            <h1 className="mt-3 font-serif text-4xl leading-tight text-[color:var(--text-primary)] sm:text-5xl">
              {card.name}
            </h1>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 border border-[color:var(--border)] bg-black/15 px-3 py-2 text-sm font-semibold">
                {affinityIcon ? <img src={affinityIcon} alt="" className="h-5 w-5 object-contain" /> : null}
                <span className="text-[color:var(--text-secondary)]">{dictionary.cardDetails.affinity}</span>
                <span>{affinity}</span>
              </span>
              {card.rarity ? (
                <span className="inline-flex items-center gap-2 border border-[color:var(--border)] bg-black/15 px-3 py-2 text-sm font-semibold">
                  <span className="text-[color:var(--text-secondary)]">{dictionary.cardDetails.rarity}</span>
                  <span>{card.rarity}</span>
                </span>
              ) : null}
            </div>

            <dl className="mt-8 grid grid-cols-2 gap-px border border-[color:var(--border)] bg-[color:var(--border)] sm:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-[color:var(--surface-muted)] px-4 py-4">
                  <dt className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[color:var(--text-secondary)]">
                    {stat.label}
                  </dt>
                  <dd className="mt-1 text-2xl font-bold text-[color:var(--accent)]">{stat.value}</dd>
                </div>
              ))}
            </dl>

            {card.rulesText ? (
              <section className="mt-8 border-l-2 border-[color:var(--card-affinity)] bg-black/10 px-5 py-4">
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--text-secondary)]">
                  {dictionary.cardDetails.rulesText}
                </h2>
                <p className="mt-2 whitespace-pre-line text-base leading-7">{card.rulesText}</p>
              </section>
            ) : null}

            {card.description ? (
              <section className="mt-6">
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--text-secondary)]">
                  {dictionary.cardDetails.cardStory}
                </h2>
                <p className="mt-2 whitespace-pre-line font-serif text-lg italic leading-7 text-[color:var(--text-secondary)]">
                  {card.description}
                </p>
              </section>
            ) : null}

            <dl className="mt-auto grid gap-3 border-t border-[color:var(--border)] pt-7 text-sm sm:grid-cols-2">
              {card.number != null ? (
                <div>
                  <dt className="text-[color:var(--text-secondary)]">{dictionary.cardDetails.cardNumber}</dt>
                  <dd className="mt-1 font-semibold">{card.id}</dd>
                </div>
              ) : null}
              {card.artist ? (
                <div>
                  <dt className="text-[color:var(--text-secondary)]">{dictionary.cardDetails.artist}</dt>
                  <dd className="mt-1 font-semibold">{card.artist}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </article>
      </div>
    </div>
  );
}
