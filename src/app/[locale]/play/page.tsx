import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isLocale } from '@/i18n/config';
import { buildCanonicalMetadata } from '@/lib/metadata/locale';
import { isSimulatorEnabled } from '@/lib/features';

import { getStaticCards } from '../create/deck-builder/data';
import { GameClient } from './game-client';

export const dynamic = 'force-dynamic';

type LocaleParams = {
  locale: string;
};

type SimulatorPageProps = {
  params: Promise<LocaleParams>;
};

export async function generateMetadata({ params }: SimulatorPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale) || !isSimulatorEnabled()) {
    notFound();
  }

  return buildCanonicalMetadata(locale, ['play']);
}

export default async function SimulatorPage({ params }: SimulatorPageProps) {
  const { locale } = await params;

  if (!isLocale(locale) || !isSimulatorEnabled()) {
    notFound();
  }

  const { cards, error } = await getStaticCards();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <GameClient locale={locale} initialCards={cards} initialError={error} />
    </div>
  );
}
