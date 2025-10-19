import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';
import { getProfileById } from '@/lib/supabase/profiles';
import { getPublicDeckSummariesByAuthor } from '@/lib/supabase/decks';
import { DeckSummaryCard } from '@/components/deck-summary-card';
import { buildCanonicalMetadata } from '@/lib/metadata/locale';

interface PlayerPageParams {
  locale: string;
  profileId: string;
}

interface PlayerPageProps {
  params: Promise<PlayerPageParams>;
}

export async function generateMetadata({ params }: PlayerPageProps): Promise<Metadata> {
  const { locale, profileId } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  if (!profileId || profileId.trim().length === 0) {
    notFound();
  }

  return buildCanonicalMetadata(locale, ['players', profileId]);
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

      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-4xl font-bold tracking-tight text-[color:var(--text-primary)] sm:text-5xl">
            {username}
          </h1>
          {socials.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {socials.map((social) => (
                <Link
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  {social.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        {profile.bio ? (
          <p className="max-w-3xl whitespace-pre-line text-sm leading-6 text-[color:var(--text-primary)]">
            {profile.bio}
          </p>
        ) : (
          <p className="text-sm text-[color:var(--text-secondary)]">{publicProfile.socialsEmpty}</p>
        )}
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[color:var(--text-primary)]">{publicProfile.decksHeading}</h2>
        {decks.length === 0 ? (
          <p className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center text-sm text-[color:var(--text-secondary)]">
            {publicProfile.noDecks}
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 min-[2000px]:grid-cols-3">
            {decks.map((deck) => (
              <DeckSummaryCard
                key={deck.id}
                locale={locale}
                deck={deck}
                detailHref={`/${locale}/decks/${encodeURIComponent(deck.id)}`}
                labels={{
                  cards: deckFeed.cardsLabel,
                  untitled: myDecks.untitledLabel,
                  publicTag: myDecks.publicTag,
                  privateTag: myDecks.privateTag,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
