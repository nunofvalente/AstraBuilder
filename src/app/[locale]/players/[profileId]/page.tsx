import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale, type Locale } from '@/i18n/config';
import { getProfileById } from '@/lib/supabase/profiles';
import { getPublicDeckSummariesByAuthor } from '@/lib/supabase/decks';
import { buildAffinityGradient, getAffinityIconPath, normalizeAffinity } from '@/lib/cards/affinity';
import { TertiaryButton } from '@/components/tertiary-button';

interface PlayerPageParams {
  locale: string;
  profileId: string;
}

interface PlayerPageProps {
  params: Promise<PlayerPageParams>;
}

function ensureHttps(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

export default async function PlayerProfilePage({ params }: PlayerPageProps) {
  const { locale, profileId } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const { publicProfile, deckFeed, myDecks } = dictionary;

  const profile = await getProfileById(profileId);
  if (!profile) {
    notFound();
  }

  const decks = await getPublicDeckSummariesByAuthor(profileId);

  const username = profile.username?.trim() && profile.username.trim().length > 0
    ? profile.username.trim()
    : publicProfile.unknownUser;

  const socials = [
    { label: publicProfile.xLabel, href: ensureHttps(profile.x_link) },
    { label: publicProfile.youtubeLabel, href: ensureHttps(profile.youtube_link) },
  ].filter((entry): entry is { label: string; href: string } => Boolean(entry.href));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 text-[color:var(--text-primary)]">
      <Link
        href={`/${locale}/decks`}
        className="text-sm font-medium text-[color:var(--accent)] hover:underline"
      >
        ← {publicProfile.backButton}
      </Link>

      <section className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-[color:var(--text-primary)]">{username}</h1>
          <p className="text-sm text-[color:var(--text-secondary)]">{publicProfile.subtitle}</p>
        </div>
        {profile.bio ? (
          <p className="max-w-3xl whitespace-pre-line text-sm leading-6 text-[color:var(--text-primary)]">
            {profile.bio}
          </p>
        ) : null}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
            {publicProfile.socialsHeading}
          </h2>
          {socials.length === 0 ? (
            <p className="text-sm text-[color:var(--text-secondary)]">{publicProfile.socialsEmpty}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {socials.map((social) => (
                <Link
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--accent)] hover:underline"
                >
                  {social.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[color:var(--text-primary)]">{publicProfile.decksHeading}</h2>
        {decks.length === 0 ? (
          <p className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center text-sm text-[color:var(--text-secondary)]">
            {publicProfile.noDecks}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {decks.map((deck) => {
              const createdLabel = formatDate(deck.createdAt, locale);
              const displayAffinities = deck.affinities.filter((affinity) => normalizeAffinity(affinity) !== 'Neutral');
              const gradient = buildAffinityGradient(displayAffinities);
              const backgroundImage = `linear-gradient(rgba(12, 15, 21, 0.8), rgba(12, 15, 21, 0.8)), ${gradient}`;

              return (
                <article
                  key={deck.id}
                  className="flex h-full flex-col gap-4 rounded-2xl border border-[color:var(--border)] p-5 shadow-md transition hover:shadow-lg"
                  style={{ backgroundImage }}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-col gap-2">
                        <Link
                          href={`/${locale}/decks/${encodeURIComponent(deck.id)}`}
                          className="text-lg font-semibold text-[color:var(--text-primary)] hover:underline"
                        >
                          {deck.title && deck.title.trim().length > 0 ? deck.title.trim() : myDecks.untitledLabel}
                        </Link>
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
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                        <span className="inline-flex items-center gap-1">
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
                        <TertiaryButton className="px-2 py-1">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="h-4 w-4 text-[color:var(--accent)]"
                          >
                            <path d="M12 21.35 10.55 20C5.4 15.36 2 12.27 2 8.5 2 6.5 3.5 5 5.5 5c1.54 0 2.85.99 3.57 2.36h1.87C13.75 5.99 15.06 5 16.6 5 18.6 5 20 6.5 20 8.5c0 3.77-3.4 6.86-8.55 11.54L12 21.35z" />
                          </svg>
                          {deck.favoritesTotal}
                        </TertiaryButton>
                      </div>
                    </div>
                    {deck.description ? (
                      <p className="text-sm text-[color:var(--text-secondary)] line-clamp-3">{deck.description}</p>
                    ) : null}
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-2 text-xs text-[color:var(--text-secondary)]">
                    {createdLabel ? (
                      <span className="font-semibold text-[color:var(--text-primary)]">
                        {deckFeed.createdLabel}: <span className="font-normal text-[color:var(--text-secondary)]">{createdLabel}</span>
                      </span>
                    ) : null}
                    <span className="font-semibold text-[color:var(--text-primary)]">
                      {deckFeed.cardsLabel}: <span className="font-normal text-[color:var(--text-secondary)]">{deck.cardCount}</span>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

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
