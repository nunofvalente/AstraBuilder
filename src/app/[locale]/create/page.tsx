import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';
import { buildNoIndexMetadata } from '@/lib/metadata/locale';

import { DeckBuilder } from './deck-builder-client';
import { getStaticCards } from './deck-builder/data';

export const dynamic = 'force-dynamic';

type LocaleParams = {
  locale: string;
};

type CreateDeckPageProps = {
  params: Promise<LocaleParams>;
};

export async function generateMetadata({ params }: CreateDeckPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return buildNoIndexMetadata(locale, ['create']);
}

export default async function CreateDeckPage({ params }: CreateDeckPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const { cards, error } = await getStaticCards();

  return (
    <div className="flex h-full flex-1 min-h-0 flex-col overflow-hidden">
      <DeckBuilder dictionary={dictionary} initialCards={cards} initialError={error} locale={locale} />
    </div>
  );
}
