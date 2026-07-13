import { describe, expect, it } from 'vitest';

import type { MatchDeckSnapshot, PlayerSetupState } from './match-setup';
import { buildMultiplayerBoardState, projectBoardState, projectViewerGameState, swapGameStatePerspective } from './board-state';
import { applyCardAction } from '@/app/[locale]/play/game-actions';
import { createTestCard } from '@/app/[locale]/create/deck-builder/test-utils';

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

  it('redacts supplied card names only from the opponent viewer log', () => {
    const state = buildMultiplayerBoardState(snapshot, snapshot, setup('host'), setup('guest'), 'host');
    const withSupplyLogs = {
      ...state,
      log: [
        { id: 'host-supply', turn: 1, phase: 'main' as const, activePlayer: 'player' as const, prefix: 'Supplied ', cardName: 'Host Secret', suffix: ' and drew 1 card.' },
        { id: 'guest-supply', turn: 2, phase: 'main' as const, activePlayer: 'opponent' as const, prefix: 'Supplied ', cardName: 'Guest Secret', suffix: ' and drew 1 card.' },
      ],
    };

    const hostView = projectViewerGameState(withSupplyLogs, 'host');
    expect(hostView.log[0]?.cardName).toBe('Host Secret');
    expect(hostView.log[1]).toMatchObject({ cardName: undefined, suffix: 'Bot supplied a card and drew 1 card.' });
    expect(JSON.stringify(hostView.log)).not.toContain('Guest Secret');

    const guestView = projectViewerGameState(withSupplyLogs, 'guest');
    expect(guestView.log[0]).toMatchObject({ cardName: undefined, suffix: 'You supplied a card and drew 1 card.' });
    expect(guestView.log[1]?.cardName).toBe('Guest Secret');
    expect(JSON.stringify(guestView.log)).not.toContain('Host Secret');
  });

  it('keeps face-down territory identities and logs private from both opponents', () => {
    const initial = buildMultiplayerBoardState(snapshot, snapshot, setup('host'), setup('guest'), 'host');
    const hostTerritory = {
      ...initial.zones.deck[0]!,
      instanceId: 'host-hidden-territory',
      card: createTestCard({
        id: 'host-territory',
        name: 'Host Secret Territory',
        type: 'Territory',
        cost: 2,
      }),
    };
    const hostReady = {
      ...initial,
      zones: { ...initial.zones, hand: [hostTerritory] },
    };
    const hostPlayed = applyCardAction(hostReady, {
      owner: 'player',
      instanceId: hostTerritory.instanceId,
      fromZone: 'hand',
      toZone: 'battlefieldRight',
      options: { faceDown: true },
    });
    expect(hostPlayed.applied).toBe(true);

    const guestTerritory = {
      ...initial.opponentZones.deck[0]!,
      instanceId: 'guest-hidden-territory',
      card: createTestCard({
        id: 'guest-territory',
        name: 'Guest Secret Territory',
        type: 'Territory',
        cost: 2,
      }),
    };
    const guestTurnCanonical = {
      ...hostPlayed.state,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...hostPlayed.state.opponentZones,
        hand: [guestTerritory],
      },
    };
    const guestTurn = swapGameStatePerspective(guestTurnCanonical);
    const guestPlayed = applyCardAction(guestTurn, {
      owner: 'player',
      instanceId: guestTerritory.instanceId,
      fromZone: 'hand',
      toZone: 'battlefieldLeft',
      options: { faceDown: true },
    });
    expect(guestPlayed.applied).toBe(true);
    const canonical = swapGameStatePerspective(guestPlayed.state);

    const hostView = projectBoardState(canonical, 'host');
    expect(JSON.stringify(hostView)).toContain('Host Secret Territory');
    expect(JSON.stringify(hostView)).not.toContain('Guest Secret Territory');
    expect(hostView.viewerState.zones.battlefieldLeft[0]?.card.id).toBe('hidden-card');
    expect(hostView.viewerState.zones.battlefieldLeft[0]?.card.type).toBe('Territory');
    expect(hostView.viewerState.log[0]).toMatchObject({
      cardName: undefined,
      suffix: 'Bot played a face-down territory in Battlefield 1.',
    });

    const guestView = projectBoardState(canonical, 'guest');
    expect(JSON.stringify(guestView)).toContain('Guest Secret Territory');
    expect(JSON.stringify(guestView)).not.toContain('Host Secret Territory');
    expect(guestView.viewerState.zones.battlefieldRight[0]?.card.id).toBe('hidden-card');
    expect(guestView.viewerState.zones.battlefieldRight[0]?.card.type).toBe('Territory');
    expect(guestView.viewerState.log[1]).toMatchObject({
      cardName: undefined,
      suffix: 'You played a face-down territory in Battlefield 3.',
    });

    const legacyHostEntry = canonical.log.find((entry) => entry.cardName === 'Host Secret Territory')!;
    const legacyGuestView = projectViewerGameState({
      ...canonical,
      log: [{
        ...legacyHostEntry,
        privateToOwner: undefined,
        redactedPrefix: undefined,
        redactedSuffix: undefined,
      }],
    }, 'guest');
    expect(JSON.stringify(legacyGuestView.log)).not.toContain('Host Secret Territory');
    expect(legacyGuestView.log[0]?.suffix).toBe('You played a face-down territory in Battlefield 3.');
  });

});
