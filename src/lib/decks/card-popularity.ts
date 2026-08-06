import type { Card } from '@/app/[locale]/create/deck-builder/types';

export type PublicDeckCardUsageInput = {
  deckId: string;
  cards: Array<{
    cardId: string;
    quantity: number;
  }>;
};

export type PopularPublicDeckCard = {
  card: Card;
  deckCount: number;
  copyCount: number;
  usagePercentage: number;
};

export function rankCardsByPublicDeckUsage(
  decks: PublicDeckCardUsageInput[],
  cardLookup: Map<string, Card>
): PopularPublicDeckCard[] {
  const usage = new Map<string, { deckCount: number; copyCount: number }>();

  for (const deck of decks) {
    const copiesInDeck = new Map<string, number>();

    for (const entry of deck.cards) {
      const cardId = entry.cardId.trim();
      const quantity = Math.max(0, Number(entry.quantity));
      if (!cardId || quantity <= 0 || !cardLookup.has(cardId)) {
        continue;
      }

      copiesInDeck.set(cardId, (copiesInDeck.get(cardId) ?? 0) + quantity);
    }

    for (const [cardId, copyCount] of copiesInDeck) {
      const previous = usage.get(cardId) ?? { deckCount: 0, copyCount: 0 };
      usage.set(cardId, {
        deckCount: previous.deckCount + 1,
        copyCount: previous.copyCount + copyCount,
      });
    }
  }

  const publicDeckCount = decks.length;

  return Array.from(usage.entries())
    .map(([cardId, totals]) => ({
      card: cardLookup.get(cardId) as Card,
      deckCount: totals.deckCount,
      copyCount: totals.copyCount,
      usagePercentage:
        publicDeckCount > 0 ? Math.round((totals.deckCount / publicDeckCount) * 100) : 0,
    }))
    .sort((a, b) => {
      const deckCountDifference = b.deckCount - a.deckCount;
      if (deckCountDifference !== 0) {
        return deckCountDifference;
      }

      const copyCountDifference = b.copyCount - a.copyCount;
      if (copyCountDifference !== 0) {
        return copyCountDifference;
      }

      const nameDifference = a.card.name.localeCompare(b.card.name);
      return nameDifference !== 0 ? nameDifference : a.card.id.localeCompare(b.card.id);
    });
}
