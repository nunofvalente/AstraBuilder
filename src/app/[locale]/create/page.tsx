import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';

import { DeckBuilder } from './deck-builder-client';

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

  return (
    <div className="flex h-full flex-1 min-h-0 flex-col overflow-hidden">
      <DeckBuilder dictionary={dictionary} />
    </div>
  );
}
