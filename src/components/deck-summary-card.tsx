import Image from 'next/image';
import Link from 'next/link';

import type { Locale } from '@/i18n/config';
import { buildAffinityGradient, getAffinityIconPath, normalizeAffinity } from '@/lib/cards/affinity';

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
};

type DeckSummaryCardLabels = {
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

const statPillClassName =
  'inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-transparent px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]';

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
}: DeckSummaryCardProps) {
  const displayAffinities = deck.affinities.filter((affinity) => normalizeAffinity(affinity) !== 'Neutral');
  const gradient = buildAffinityGradient(displayAffinities);
  const backgroundImage = `linear-gradient(rgba(12, 15, 21, 0.45), rgba(12, 15, 21, 0.45)), ${gradient}`;
  const title = deck.title && deck.title.trim().length > 0 ? deck.title.trim() : labels.untitled;
  const description = deck.description?.trim();
  const titleDisplay = title.length > 20 ? `${title.slice(0, 20)}…` : title;
  const descriptionDisplay =
    description && description.length > 100 ? `${description.slice(0, 100)}…` : description ?? '';
  const formattedCreatedAt = formatDate(deck.createdAt, locale);
  const metricPillClassName = showPrivacyTag || mutedMetrics
    ? 'inline-flex items-center gap-1 rounded-md border border-[color:var(--surface-muted)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]'
    : statPillClassName;
  const privacyTagClassName = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide bg-[color:var(--surface-muted)] text-[color:var(--text-secondary)]';

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <Link href={detailHref} className="group block h-full">
        <article
          className="flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-[color:var(--border)] p-5 shadow-md transition hover:shadow-lg"
          style={{ backgroundImage }}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="block break-words text-lg font-semibold text-[color:var(--text-primary)] group-hover:underline">
                  {titleDisplay}
                </span>
                {displayAffinities.length > 0 ? (
                  <span className="flex items-center gap-1">
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
                          className="h-5 w-5"
                        />
                      );
                    })}
                  </span>
                ) : null}
                {showPrivacyTag ? (
                  <span className={privacyTagClassName}>{deck.isPublic ? labels.publicTag : labels.privateTag}</span>
                ) : null}
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
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

            <p className="min-h-[3.5rem] break-words text-sm text-[color:var(--text-secondary)] line-clamp-3">
              {descriptionDisplay || ' '}
            </p>
          </div>

          <div className="mt-auto flex items-center justify-between text-xs text-[color:var(--text-secondary)]">
            <span className="font-semibold text-[color:var(--text-primary)]">
              {labels.cards}: <span className="font-normal text-[color:var(--text-secondary)]">{deck.cardCount}</span>
            </span>
            <div className="flex items-center gap-2">
              {formattedCreatedAt ? (
                <span className="font-semibold text-[color:var(--text-primary)]">{formattedCreatedAt}</span>
              ) : null}
              {onEdit ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onEdit();
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-muted)] bg-[color:var(--surface)] text-[color:var(--text-secondary)] transition hover:-translate-y-0.5 hover:text-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
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
