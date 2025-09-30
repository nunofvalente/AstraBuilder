import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';

import { DeckBuilder } from './deck-builder-client';
import { getStaticCards } from './deck-builder/data';

type LocaleParams = {
  locale: string;
};

type CreateDeckPageProps = {
  params: Promise<LocaleParams>;
};

export default async function CreateDeckPage({ params }: CreateDeckPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const { cards, error } = await getStaticCards();

  return (
    <div className="flex h-full flex-1 min-h-0 flex-col overflow-hidden">
      <DeckBuilder dictionary={dictionary} initialCards={cards} initialError={error} />
    </div>
  );
}
