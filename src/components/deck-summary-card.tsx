import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import type { Locale } from '@/i18n/config';
import { getAffinityBaseColor, getAffinityIconPath, normalizeAffinity } from '@/lib/cards/affinity';

type DeckSummaryCardDeck = {
  id: string;
  title: string | null;
  description: string | null;
  affinities: string[];
  cardCount: number;
  viewsTotal: number;
  favoritesTotal: number;
  createdAt: string | null;
  isPublic?: boolean;
  authorId?: string | null;
  authorName?: string | null;
  displayCardImageSrc?: string | null;
  displayCardName?: string | null;
};

type DeckSummaryCardLabels = {
  author?: string;
  cards: string;
  untitled: string;
  publicTag: string;
  privateTag: string;
};

type DeckSummaryCardProps = {
  locale: Locale;
  deck: DeckSummaryCardDeck;
  detailHref: string;
  labels: DeckSummaryCardLabels;
  showPrivacyTag?: boolean;
  author?: {
    label: string;
    href?: string | null;
  };
  onEdit?: () => void;
  editLabel?: string;
  mutedMetrics?: boolean;
  variant?: 'default' | 'compact' | 'compactDetailed';
};

function formatDate(value: string | null, locale: Locale): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  } catch (error) {
    return date.toLocaleDateString();
  }
}

const pillBaseClassName =
  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide';
const statPillClassName = `${pillBaseClassName} border border-white/40 bg-white/10 text-white`;
const mutedStatPillClassName = `${pillBaseClassName} border border-white/20 bg-white/10 text-white/80`;
const privacyTagClassName =
  'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide bg-white/15 text-white';

function getDeckIdentityAffinities(affinities: string[]): string[] {
  const uniqueAffinities: string[] = [];

  for (const affinity of affinities) {
    const normalized = normalizeAffinity(affinity);
    if (!normalized || normalized === 'Neutral' || uniqueAffinities.includes(normalized)) {
      continue;
    }
    uniqueAffinities.push(normalized);
  }

  return uniqueAffinities;
}

function buildDeckIdentityGradient(affinities: string[]): string {
  const colors = affinities.map((affinity) => getAffinityBaseColor(affinity));

  if (colors.length === 0) {
    return 'transparent';
  }

  if (colors.length === 1) {
    return colors[0];
  }

  const segmentSize = 100 / colors.length;
  const stops = colors.flatMap((color, index) => {
    const start = index * segmentSize;
    const end = (index + 1) * segmentSize;
    return [`${color} ${start}%`, `${color} ${end}%`];
  });

  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function DeckSummaryCard({
  locale,
  deck,
  detailHref,
  labels,
  showPrivacyTag = false,
  author,
  onEdit,
  editLabel,
  mutedMetrics = false,
  variant = 'default',
}: DeckSummaryCardProps) {
  const displayAffinities = getDeckIdentityAffinities(deck.affinities);
  const primaryDeckColor = displayAffinities[0] ? getAffinityBaseColor(displayAffinities[0]) : '#4b5563';
  const secondaryDeckColor = displayAffinities[1] ? getAffinityBaseColor(displayAffinities[1]) : primaryDeckColor;
  const articleStyle = {
    '--deck-primary': primaryDeckColor,
    '--deck-secondary': secondaryDeckColor,
    '--deck-identity-gradient': buildDeckIdentityGradient(displayAffinities),
  } as CSSProperties;
  const title = deck.title && deck.title.trim().length > 0 ? deck.title.trim() : labels.untitled;
  const description = deck.description?.trim();
  const titleDisplay = title.length > 20 ? `${title.slice(0, 20)}…` : title;
  const descriptionDisplay =
    description && description.length > 100 ? `${description.slice(0, 100)}…` : description ?? '';
  const formattedCreatedAt = formatDate(deck.createdAt, locale);
  const metricPillClassName = showPrivacyTag || mutedMetrics ? mutedStatPillClassName : statPillClassName;
  const authorName = deck.authorName?.trim();
  const displayCardImageSrc = deck.displayCardImageSrc || '/images/card-back.png';
  const displayCardAlt = deck.displayCardImageSrc ? deck.displayCardName ?? '' : '';

  if (variant === 'compactDetailed') {
    const compactAuthorLabel = author?.label ?? authorName;

    return (
      <article
        className="deck-summary-card group relative flex min-h-40 overflow-hidden rounded-r-xl p-0 transition"
        style={articleStyle}
      >
          <Link href={detailHref} aria-label={title} className="absolute inset-0 z-[2]">
            <span className="sr-only">{title}</span>
          </Link>
          <div className="relative w-28 shrink-0 overflow-hidden border-r border-white/20 bg-black/30 shadow-lg sm:w-[7.25rem]">
            <Image
              src={displayCardImageSrc}
              alt={displayCardAlt}
              fill
              sizes="96px"
              className="object-contain"
            />
          </div>

          <div className="pointer-events-none relative z-[3] flex min-w-0 flex-1 flex-col gap-2 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="deck-summary-card-title block break-words text-base font-semibold leading-5 text-white line-clamp-2">
                  {title}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-white/65">
                  {compactAuthorLabel ? (
                    author?.href ? (
                      <Link
                        href={author.href}
                        className="pointer-events-auto relative z-10 truncate transition hover:text-[color:var(--accent)] hover:underline"
                      >
                        {compactAuthorLabel}
                      </Link>
                    ) : (
                      <span className="relative z-10 truncate">{compactAuthorLabel}</span>
                    )
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-3.5 w-3.5"
                    >
                      <path d="M1.5 12C3.5 7 7.5 4 12 4s8.5 3 10.5 8c-2 5-6 8-10.5 8s-8.5-3-10.5-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {deck.viewsTotal}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                    >
                      <path d="M12 21.35 10.55 20C5.4 15.36 2 12.27 2 8.5 2 6.5 3.5 5 5.5 5c1.54 0 2.85.99 3.57 2.36h1.87C13.75 5.99 15.06 5 16.6 5 18.6 5 20 6.5 20 8.5c0 3.77-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    {deck.favoritesTotal}
                  </span>
                </div>
              </div>

              {showPrivacyTag ? (
                <span className={`${privacyTagClassName} shrink-0 px-2 py-0.5 text-[10px]`}>
                  {deck.isPublic ? labels.publicTag : labels.privateTag}
                </span>
              ) : null}
            </div>

            <p className="deck-summary-card-description min-h-10 break-words text-sm leading-5 text-white/75 line-clamp-2">
              {descriptionDisplay || ' '}
            </p>

            <div className="mt-auto flex items-center justify-between gap-3 text-[11px] font-medium text-white/65">
              <div className="flex items-center gap-2">
                <span className="flex min-h-[1.15rem] items-center gap-1">
                  {displayAffinities.slice(0, 2).map((affinity) => {
                    const iconSrc = getAffinityIconPath(affinity);
                    if (!iconSrc) {
                      return null;
                    }

                    return (
                      <Image
                        key={affinity}
                        src={iconSrc}
                        alt={`${affinity} affinity`}
                        width={18}
                        height={18}
                        className="deck-summary-card-affinity-icon"
                      />
                    );
                  })}
                </span>
                <span>
                  {labels.cards}: {deck.cardCount}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {formattedCreatedAt ? <span>{formattedCreatedAt}</span> : null}
                {onEdit ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onEdit();
                    }}
                    className="pointer-events-auto relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white transition hover:-translate-y-0.5 hover:text-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                    aria-label={editLabel ?? 'Edit deck'}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-4 w-4"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
      </article>
    );
  }

  if (variant === 'compact') {
    return (
      <Link href={detailHref} className="group block h-full">
        <article
          className="deck-summary-card flex h-32 gap-3 overflow-hidden rounded-r-xl p-0 transition"
          style={articleStyle}
        >
          <div className="relative h-full w-[5.75rem] shrink-0 overflow-hidden border-r border-white/20 bg-black/30 shadow-lg">
            <Image
              src={displayCardImageSrc}
              alt={displayCardAlt}
              fill
              sizes="92px"
              className="object-contain"
            />
          </div>
          <div className="relative z-[1] flex min-w-0 flex-1 flex-col justify-center gap-2 py-3 pr-3">
            <div className="min-w-0">
              <span className="deck-summary-card-title block truncate text-base font-semibold text-white">
                {titleDisplay}
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-white/65">
                {authorName ? (
                  <span className="truncate">
                    {labels.author ? `${labels.author}: ` : ''}{authorName}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M1.5 12C3.5 7 7.5 4 12 4s8.5 3 10.5 8c-2 5-6 8-10.5 8s-8.5-3-10.5-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {deck.viewsTotal}
                </span>
                <span className="inline-flex items-center gap-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M12 21.35 10.55 20C5.4 15.36 2 12.27 2 8.5 2 6.5 3.5 5 5.5 5c1.54 0 2.85.99 3.57 2.36h1.87C13.75 5.99 15.06 5 16.6 5 18.6 5 20 6.5 20 8.5c0 3.77-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  {deck.favoritesTotal}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-white/65">
              <span className="flex min-h-[1.15rem] items-center gap-1">
                {displayAffinities.length > 0
                  ? displayAffinities.slice(0, 2).map((affinity) => {
                      const iconSrc = getAffinityIconPath(affinity);
                      if (!iconSrc) {
                        return null;
                      }

                      return (
                        <Image
                          key={affinity}
                          src={iconSrc}
                          alt={`${affinity} affinity`}
                          width={18}
                          height={18}
                          className="deck-summary-card-affinity-icon"
                        />
                      );
                    })
                  : null}
              </span>
              {formattedCreatedAt ? <span className="shrink-0">{formattedCreatedAt}</span> : null}
            </div>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <Link href={detailHref} className="group block h-full">
        <article
          className="deck-summary-card flex h-full flex-col gap-4 overflow-hidden rounded-2xl p-5 transition"
          style={articleStyle}
        >
          <div className="deck-summary-card-identity" aria-hidden="true" />
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="deck-summary-card-title block break-words text-lg font-semibold text-white">
                  {titleDisplay}
                </span>
                {displayAffinities.length > 0 ? (
                  <span className="deck-summary-card-affinities">
                    {displayAffinities.map((affinity) => {
                      const iconSrc = getAffinityIconPath(affinity);
                      if (!iconSrc) {
                        return null;
                      }

                      return (
                        <Image
                          key={affinity}
                          src={iconSrc}
                          alt={`${affinity} affinity`}
                          width={20}
                          height={20}
                          className="deck-summary-card-affinity-icon"
                        />
                      );
                    })}
                  </span>
                ) : null}
                {showPrivacyTag ? (
                  <span className={privacyTagClassName}>{deck.isPublic ? labels.publicTag : labels.privateTag}</span>
                ) : null}
              </div>

              <div className="deck-summary-card-metrics flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white">
                <span className={metricPillClassName}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-4 w-4"
                  >
                    <path d="M1.5 12C3.5 7 7.5 4 12 4s8.5 3 10.5 8c-2 5-6 8-10.5 8s-8.5-3-10.5-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {deck.viewsTotal}
                </span>
                <span className={metricPillClassName}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4 text-[color:var(--accent)]"
                  >
                    <path d="M12 21.35 10.55 20C5.4 15.36 2 12.27 2 8.5 2 6.5 3.5 5 5.5 5c1.54 0 2.85.99 3.57 2.36h1.87C13.75 5.99 15.06 5 16.6 5 18.6 5 20 6.5 20 8.5c0 3.77-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  {deck.favoritesTotal}
                </span>
              </div>
            </div>

            <p className="deck-summary-card-description min-h-[3.5rem] break-words text-sm text-white/80 line-clamp-3">
              {descriptionDisplay || ' '}
            </p>
          </div>

          <div className="deck-summary-card-footer mt-auto flex items-center justify-between text-xs text-white/80">
            <span className="font-semibold text-white">
              {labels.cards}: <span className="font-normal text-white/75">{deck.cardCount}</span>
            </span>
            <div className="flex items-center gap-2">
              {formattedCreatedAt ? (
                <span className="font-semibold text-white">{formattedCreatedAt}</span>
              ) : null}
              {onEdit ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onEdit();
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white transition hover:-translate-y-0.5 hover:text-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                  aria-label={editLabel ?? 'Edit deck'}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-4 w-4"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        </article>
      </Link>

      {author && author.label ? (
        author.href ? (
          <Link href={author.href} className="pl-2 text-sm font-medium text-[color:var(--accent)] hover:underline">
            {author.label}
          </Link>
        ) : (
          <span className="pl-2 text-sm text-[color:var(--text-secondary)]">{author.label}</span>
        )
      ) : null}
    </div>
  );
}
