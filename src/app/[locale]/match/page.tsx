import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isLocale } from '@/i18n/config';
import { buildCanonicalMetadata } from '@/lib/metadata/locale';
import { isPlaytestEnabled } from '@/lib/features';

import { getStaticCards } from '../create/deck-builder/data';
import { GameClient } from '../play/game-client';

export const dynamic = 'force-dynamic';

type LocaleParams = {
  locale: string;
};

type MatchPageProps = {
  params: Promise<LocaleParams>;
};

export async function generateMetadata({ params }: MatchPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale) || !isPlaytestEnabled()) {
    notFound();
  }

  return buildCanonicalMetadata(locale, ['match']);
}

export default async function MatchPage({ params }: MatchPageProps) {
  const { locale } = await params;

  if (!isLocale(locale) || !isPlaytestEnabled()) {
    notFound();
  }

  const { cards, error } = await getStaticCards();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <GameClient locale={locale} initialCards={cards} initialError={error} initialMode="match" />
    </div>
  );
}
