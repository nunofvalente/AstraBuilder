import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getStaticCards } from '../../create/deck-builder/data';
import { isLocale } from '@/i18n/config';
import { getCardSetName, groupCardsBySet } from '@/lib/cards/card-sets';
import { buildNoIndexMetadata } from '@/lib/metadata/locale';
import { getCollectionCopy } from '../collection-localization';
import { CollectionSetClient } from './set-client';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; setId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, setId } = await params;
  if (!isLocale(locale)) notFound();
  return buildNoIndexMetadata(locale, ['my-collection', setId]);
}

export default async function CollectionSetPage({ params }: Props) {
  const { locale, setId } = await params;
  if (!isLocale(locale)) notFound();
  const normalizedSetId = decodeURIComponent(setId).toUpperCase();
  const { cards } = await getStaticCards();
  const set = groupCardsBySet(cards).find((candidate) => candidate.id === normalizedSetId);
  if (!set) notFound();

  return <CollectionSetClient locale={locale} set={{ ...set, name: getCardSetName(set.id) }} copy={getCollectionCopy(locale)} />;
}
