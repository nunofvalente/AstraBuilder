export const MIN_DECK_CARD_COUNT = 50;

export function isConstructedDeckSize(cardCount: number): boolean {
  return cardCount >= MIN_DECK_CARD_COUNT;
}
