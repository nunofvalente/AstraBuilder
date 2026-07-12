import { randomInt, randomUUID } from 'node:crypto';

import type { DeckDetailData } from '@/lib/supabase/decks';

export type MatchDeckSnapshot = Pick<DeckDetailData, 'id' | 'title' | 'entries'>;
export type SetupCard = { instanceId: string; cardId: string };
export type PlayerSetupState = {
  deck: SetupCard[];
  hand: SetupCard[];
  supply: SetupCard[];
  openingHandConfirmed: boolean;
};

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createPlayerSetup(deck: MatchDeckSnapshot): PlayerSetupState {
  const cards = shuffle(deck.entries.flatMap((entry) =>
    Array.from({ length: entry.count }, () => ({ instanceId: randomUUID(), cardId: entry.card.id }))
  ));
  return { deck: cards.slice(6), hand: cards.slice(0, 6), supply: [], openingHandConfirmed: false };
}

export function resolveMultiplayerOpeningHand(setup: PlayerSetupState, mulligan: boolean): PlayerSetupState {
  if (setup.openingHandConfirmed) return setup;
  if (!mulligan) return { ...setup, openingHandConfirmed: true };
  const cards = shuffle([...setup.deck, ...setup.hand]);
  return { ...setup, deck: cards.slice(6), hand: cards.slice(0, 6), openingHandConfirmed: true };
}

export function placeMultiplayerStartingSupply(setup: PlayerSetupState, instanceId: string): PlayerSetupState | null {
  if (!setup.openingHandConfirmed || setup.supply.length > 0) return null;
  const selected = setup.hand.find((card) => card.instanceId === instanceId);
  if (!selected) return null;
  const replacement = setup.deck.slice(0, 1);
  return {
    ...setup,
    deck: setup.deck.slice(replacement.length),
    hand: [...setup.hand.filter((card) => card.instanceId !== instanceId), ...replacement],
    supply: [selected],
  };
}

export function getSetupView(snapshot: MatchDeckSnapshot, setup: PlayerSetupState) {
  const cardsById = new Map(snapshot.entries.map((entry) => [entry.card.id, entry.card]));
  return {
    openingHandConfirmed: setup.openingHandConfirmed,
    startingSupplyPlaced: setup.supply.length > 0,
    hand: setup.hand.map((instance) => ({ ...instance, card: cardsById.get(instance.cardId) })).filter((entry) => entry.card),
  };
}
