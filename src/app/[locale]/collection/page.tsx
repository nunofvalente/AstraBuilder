import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';
import { buildPageMetadata } from '@/lib/metadata/locale';

import { CollectionClient } from '../collection-client';
import { getStaticCards } from '../create/deck-builder/data';

export const dynamic = 'force-dynamic';

type LocaleParams = {
  locale: string;
};

type CollectionPageProps = {
  params: Promise<LocaleParams>;
};

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);

  return buildPageMetadata(locale, ['collection'], {
    title: `${dictionary.cards.title} | AstraBuilder`,
    description: `${dictionary.cards.title} - Echoes of Astra. ${dictionary.builder.searchPlaceholder}.`,
  });
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const { cards, error } = await getStaticCards();

  return (
    <div className="flex h-full flex-1 min-h-0 flex-col overflow-hidden">
      <CollectionClient dictionary={dictionary} initialCards={cards} initialError={error} />
    </div>
  );
}
