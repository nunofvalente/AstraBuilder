import type { Card } from '@/app/[locale]/create/deck-builder/types';

export type CardSet = {
  id: string;
  name: string;
  cards: Card[];
};

const SET_NAMES: Record<string, string> = {
  IMP: 'Imperion',
};

export function getCardSetId(cardId: string): string {
  const normalized = cardId.trim().toUpperCase();
  const knownSet = Object.keys(SET_NAMES).find((setId) => normalized.startsWith(setId));
  return knownSet ?? normalized.match(/^[A-Z]+/)?.[0] ?? 'OTHER';
}

export function getCardSetName(setId: string): string {
  return SET_NAMES[setId.toUpperCase()] ?? setId.toUpperCase();
}

export function groupCardsBySet(cards: Card[]): CardSet[] {
  const grouped = new Map<string, Card[]>();
  for (const card of cards) {
    const setId = getCardSetId(card.id);
    grouped.set(setId, [...(grouped.get(setId) ?? []), card]);
  }
  return [...grouped.entries()]
    .map(([id, setCards]) => ({
      id,
      name: getCardSetName(id),
      cards: [...setCards].sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
