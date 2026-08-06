import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getStaticCards } from '../create/deck-builder/data';
import { isLocale } from '@/i18n/config';
import { buildNoIndexMetadata } from '@/lib/metadata/locale';
import { groupCardsBySet } from '@/lib/cards/card-sets';
import { getCollectionCopy } from './collection-localization';
import { MyCollectionClient } from './my-collection-client';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return buildNoIndexMetadata(locale, ['my-collection']);
}

export default async function MyCollectionPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { cards } = await getStaticCards();

  return (
    <MyCollectionClient
      locale={locale}
      copy={getCollectionCopy(locale)}
      sets={groupCardsBySet(cards)}
    />
  );
}
