type ResolveDeckDisplayCardSelectionInput = {
  availableCardIds: Iterable<string>;
  currentDisplayCardId: string | null;
  hasRequestedDisplayCard: boolean;
  requestedDisplayCardId: string | null;
};

export type DeckDisplayCardSelection = {
  displayCardId: string | null;
  invalidRequestedCard: boolean;
};

export function resolveDeckDisplayCardSelection({
  availableCardIds,
  currentDisplayCardId,
  hasRequestedDisplayCard,
  requestedDisplayCardId,
}: ResolveDeckDisplayCardSelectionInput): DeckDisplayCardSelection {
  const availableIds = new Set(availableCardIds);
  const displayCardId = hasRequestedDisplayCard ? requestedDisplayCardId : currentDisplayCardId;

  if (!displayCardId || availableIds.has(displayCardId)) {
    return { displayCardId, invalidRequestedCard: false };
  }

  return {
    displayCardId: null,
    invalidRequestedCard: hasRequestedDisplayCard,
  };
}
