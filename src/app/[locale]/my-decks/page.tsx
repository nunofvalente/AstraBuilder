import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';
import { buildCanonicalMetadata } from '@/lib/metadata/locale';

import { MyDecksClient } from './my-decks-client';

export const dynamic = 'force-dynamic';

type LocaleParams = {
  locale: string;
};

type MyDecksPageProps = {
  params: Promise<LocaleParams>;
};

export async function generateMetadata({ params }: MyDecksPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return buildCanonicalMetadata(locale, ['my-decks']);
}

export default async function MyDecksPage({ params }: MyDecksPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);

  return <MyDecksClient locale={locale} labels={dictionary.myDecks} />;
}
