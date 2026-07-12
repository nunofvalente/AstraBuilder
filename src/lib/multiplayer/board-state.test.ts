import { describe, expect, it } from 'vitest';

import type { MatchDeckSnapshot, PlayerSetupState } from './match-setup';
import { buildMultiplayerBoardState, projectBoardState, projectViewerGameState, swapGameStatePerspective } from './board-state';
import { applyCardAction } from '@/app/[locale]/play/game-actions';

const card = { id: 'IMP001', name: 'Hidden card' };
const snapshot = { id: 'deck', title: 'Deck', entries: [{ card, count: 2 }] } as MatchDeckSnapshot;
function setup(prefix: string): PlayerSetupState {
  return { deck: [{ instanceId: `${prefix}-deck`, cardId: card.id }], hand: [], supply: [{ instanceId: `${prefix}-supply`, cardId: card.id }], openingHandConfirmed: true };
}

describe('multiplayer board state', () => {
  it('starts the canonical board with the rolled player', () => {
    const state = buildMultiplayerBoardState(snapshot, snapshot, setup('host'), setup('guest'), 'guest');
    expect(state.turn).toBe(1);
    expect(state.activePlayer).toBe('opponent');
    expect(state.zones.supply[0].owner).toBe('player');
    expect(state.opponentZones.supply[0].owner).toBe('opponent');
  });

  it('does not expose opponent deck cards in a perspective projection', () => {
    const state = buildMultiplayerBoardState(snapshot, snapshot, setup('host'), setup('guest'), 'host');
    const view = projectBoardState(state, 'host');
    expect(view.opponent.deckCount).toBe(1);
    expect(JSON.stringify(view.opponent)).not.toContain('Hidden card');
  });

  it('orients guest state as player and redacts the host private deck', () => {
    const state = buildMultiplayerBoardState(snapshot, snapshot, setup('host'), setup('guest'), 'guest');
    const view = projectViewerGameState(state, 'guest');
    expect(view.activePlayer).toBe('player');
    expect(view.zones.supply[0].owner).toBe('player');
    expect(view.opponentZones.deck[0].card.id).toBe('hidden-card');
  });

  it('round trips the canonical state through the guest perspective', () => {
    const state = buildMultiplayerBoardState(snapshot, snapshot, setup('host'), setup('guest'), 'guest');
    expect(swapGameStatePerspective(swapGameStatePerspective(state))).toEqual(state);
  });

  it('runs a guest action through player rules and maps it back to opponent zones', () => {
    const guestSetup = setup('guest');
    guestSetup.hand = [{ instanceId: 'guest-hand', cardId: card.id }];
    const state = buildMultiplayerBoardState(snapshot, snapshot, setup('host'), guestSetup, 'guest');
    const guestState = swapGameStatePerspective(state);
    const result = applyCardAction(guestState, { owner: 'player', instanceId: 'guest-hand', fromZone: 'hand', toZone: 'supply' });
    expect(result.applied).toBe(true);
    const canonical = swapGameStatePerspective(result.state);
    expect(canonical.opponentZones.supply.some((entry) => entry.instanceId === 'guest-hand')).toBe(true);
    expect(canonical.zones.supply.some((entry) => entry.instanceId === 'guest-hand')).toBe(false);
  });

});
