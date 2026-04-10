import { cache } from 'react';

import type { Card } from '@/app/[locale]/create/deck-builder/types';
import { normaliseCard } from '@/app/[locale]/create/deck-builder/utils';

import { fetchAstraCardCatalog } from './astra-card-catalog';
import { mapAstraCardsToCardRows } from './astra-card-mapper';

const getCachedAstraCards = cache(async (): Promise<Card[]> => {
  const astraCards = await fetchAstraCardCatalog();
  const rows = mapAstraCardsToCardRows(astraCards);

  return rows.map((row, index) => normaliseCard(row, index));
});

const getCachedAstraCardLookup = cache(async (): Promise<Map<string, Card>> => {
  const cards = await getCachedAstraCards();
  return new Map(cards.map((card) => [card.id, card]));
});

export async function getAstraCards(): Promise<Card[]> {
  return getCachedAstraCards();
}

export async function getAstraCardLookup(): Promise<Map<string, Card>> {
  return getCachedAstraCardLookup();
}

export async function getAstraCardsByIds(cardIds: string[]): Promise<Card[]> {
  const lookup = await getCachedAstraCardLookup();
  const uniqueCardIds = Array.from(new Set(cardIds.filter(Boolean)));

  return uniqueCardIds
    .map((cardId) => lookup.get(cardId))
    .filter((card): card is Card => Boolean(card));
}
