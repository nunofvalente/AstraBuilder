import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { getRegisteredCardAbilities } from './card-abilities';
import {
  activateCardAbility,
  buildInitialGameState,
  resolvePendingChoice,
  scoreBattlefieldVictoryPoints,
  triggerCardAbilities,
  type GameCardInstance,
  type GameState,
  type SavedDeck,
} from './game-rules';

function makeDeck(): SavedDeck {
  return { id: 'neutral-test', title: 'Neutral Test', cardCount: 0, entries: [] };
}

function makeState(): GameState {
  return {
    ...buildInitialGameState(makeDeck(), makeDeck()),
    phase: 'main',
    activePlayer: 'player',
    firstPlayer: 'player',
    hasFirstPlayerSkippedDraw: true,
    log: [],
  };
}

function makeCard(
  id: string,
  owner: 'player' | 'opponent' = 'player',
  overrides: Partial<GameCardInstance> = {}
): GameCardInstance {
  return {
    instanceId: `${owner}-${id}`,
    owner,
    card: overrides.card ?? createTestCard({
      id,
      name: id,
      type: 'Unit',
      cost: 2,
      attack: 2,
      health: 3,
      influence: 1,
      affinity: 'Neutral',
    }),
    ready: overrides.ready ?? true,
    faceDown: overrides.faceDown ?? false,
    attachedToInstanceId: overrides.attachedToInstanceId ?? null,
    damage: overrides.damage ?? 0,
    retreatLockedUntilNextTurn: overrides.retreatLockedUntilNextTurn ?? false,
    ...overrides,
  };
}

describe('Neutral card abilities', () => {
  it('registers the neutral non-token cards', () => {
    expect(getRegisteredCardAbilities('IMP159')).not.toBeNull();
    expect(getRegisteredCardAbilities('IMP160')).not.toBeNull();
    expect(getRegisteredCardAbilities('IMP164')).not.toBeNull();
    expect(getRegisteredCardAbilities('IMP165')).not.toBeNull();
  });

  it('lets Excavator destroy a territory in its combat zone on attack', () => {
    const excavator = makeCard('IMP159', 'player', {
      card: createTestCard({
        id: 'IMP159',
        name: 'Excavator',
        type: 'Unit',
        affinity: 'Neutral',
        rulesText: 'On Attack: You may destroy a territory in the same combat zone as this unit.',
      }),
    });
    const territory = makeCard('territory', 'opponent', {
      card: createTestCard({ id: 'territory', name: 'Target Territory', type: 'Territory', affinity: 'Neutral' }),
    });
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, battlefieldLeft: [excavator, territory] },
    };

    const pending = triggerCardAbilities(state, 'onAttack', {
      source: excavator,
      controller: 'player',
      zone: 'battlefieldLeft',
    });
    expect(pending.pendingChoice).toMatchObject({
      kind: 'neutralTarget',
      effect: 'excavatorDestroy',
      availableInstanceIds: [territory.instanceId],
    });

    const destroyed = resolvePendingChoice(pending, [territory.instanceId]);
    expect('error' in destroyed ? null : destroyed.opponentZones.graveyard[0]?.instanceId).toBe(territory.instanceId);
    expect('error' in destroyed ? [] : destroyed.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ suffix: 'Excavator destroyed Target Territory.' }),
      ])
    );
  });

  it('activates Supply Carrier for temporary supply and exhausts it', () => {
    const carrier = makeCard('IMP160', 'player', {
      card: createTestCard({
        id: 'IMP160',
        name: 'Supply Carrier',
        type: 'Unit',
        affinity: 'Neutral',
        rulesText: '{Exhaust}: Add 1 supply until end of turn.',
      }),
    });
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, staging: [carrier] },
    };

    const activated = activateCardAbility(state, 'player', carrier.instanceId, carrier.instanceId);
    expect(activated).not.toHaveProperty('error');
    expect('state' in activated ? activated.state.playerTemporarySupply : null).toBe(1);
    expect('state' in activated ? activated.state.zones.staging[0]?.ready : null).toBe(false);
    expect('state' in activated ? activated.state.log : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ suffix: 'Supply Carrier added 1 temporary supply until end of turn.' }),
      ])
    );
  });

  it('reveals then optionally draws the top card with War Banner only when it is a unit', () => {
    const scorer = makeCard('scorer', 'player', {
      card: createTestCard({ id: 'scorer', name: 'Scorer', type: 'Unit', influence: 1 }),
    });
    const banner = makeCard('IMP164', 'player', {
      attachedToInstanceId: scorer.instanceId,
      card: createTestCard({ id: 'IMP164', name: 'War Banner', type: 'Item', influence: 1 }),
    });
    const topUnit = makeCard('top-unit', 'player', {
      card: createTestCard({ id: 'top-unit', name: 'Top Unit', type: 'Unit' }),
    });
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, deck: [topUnit], battlefieldLeft: [scorer, banner] },
    };

    const scored = scoreBattlefieldVictoryPoints(state, 'player');
    expect(scored.pendingChoice).toMatchObject({ kind: 'neutralTarget', effect: 'warBannerReveal' });

    const revealed = resolvePendingChoice(scored, [banner.instanceId]);
    expect('error' in revealed ? null : revealed.pendingChoice).toMatchObject({
      kind: 'neutralTarget',
      effect: 'warBannerDraw',
      availableInstanceIds: [topUnit.instanceId],
    });
    if ('error' in revealed) return;

    const resolved = resolvePendingChoice(revealed, [topUnit.instanceId]);
    expect('error' in resolved ? null : resolved.zones.hand[0]?.instanceId).toBe(topUnit.instanceId);
  });

  it('can decline drawing a unit revealed by War Banner', () => {
    const scorer = makeCard('scorer', 'player', {
      card: createTestCard({ id: 'scorer', name: 'Scorer', type: 'Unit', influence: 1 }),
    });
    const banner = makeCard('IMP164', 'player', {
      attachedToInstanceId: scorer.instanceId,
      card: createTestCard({ id: 'IMP164', name: 'War Banner', type: 'Item', influence: 1 }),
    });
    const topUnit = makeCard('top-unit', 'player', {
      card: createTestCard({ id: 'top-unit', name: 'Top Unit', type: 'Unit' }),
    });
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, deck: [topUnit], battlefieldLeft: [scorer, banner] },
    };

    const scored = scoreBattlefieldVictoryPoints(state, 'player');
    const revealed = resolvePendingChoice(scored, [banner.instanceId]);
    expect('error' in revealed ? null : revealed.pendingChoice).toMatchObject({ effect: 'warBannerDraw' });
    if ('error' in revealed) return;

    const declined = resolvePendingChoice(revealed, []);
    expect('error' in declined ? null : declined.zones.hand).toEqual([]);
    expect('error' in declined ? null : declined.zones.deck[0]?.instanceId).toBe(topUnit.instanceId);
  });

  it('flips Minefield to damage all units in its zone and sacrifice itself', () => {
    const minefield = makeCard('IMP165', 'player', {
      card: createTestCard({ id: 'IMP165', name: 'Minefield', type: 'Territory' }),
    });
    const survivor = makeCard('survivor', 'player', {
      card: createTestCard({ id: 'survivor', name: 'Survivor', type: 'Unit', health: 4 }),
    });
    const destroyed = makeCard('destroyed', 'opponent', {
      card: createTestCard({ id: 'destroyed', name: 'Destroyed', type: 'Unit', health: 3 }),
    });
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, battlefieldLeft: [minefield, survivor, destroyed] },
    };

    const resolved = triggerCardAbilities(state, 'onFlip', {
      source: minefield,
      controller: 'player',
      zone: 'battlefieldLeft',
    });

    expect(resolved.zones.battlefieldLeft.some((card) => card.instanceId === minefield.instanceId)).toBe(false);
    expect(resolved.zones.battlefieldLeft.find((card) => card.instanceId === survivor.instanceId)?.damage).toBe(3);
    expect(resolved.opponentZones.graveyard[0]?.instanceId).toBe(destroyed.instanceId);
    expect(resolved.zones.graveyard[0]?.instanceId).toBe(minefield.instanceId);
    expect(resolved.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suffix: 'Minefield dealt 3 damage to all units in Battlefield 1 and was sacrificed.',
        }),
      ])
    );
  });

  it('flips Minefield to damage a pending attacker entering its zone', () => {
    const minefield = makeCard('IMP165', 'player', {
      card: createTestCard({ id: 'IMP165', name: 'Minefield', type: 'Territory' }),
    });
    const attacker = makeCard('attacker', 'opponent', {
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', health: 4 }),
    });
    const state = {
      ...makeState(),
      pendingCombat: {
        attackerInstanceId: attacker.instanceId,
        attackerOwner: 'opponent' as const,
        defenderInstanceId: null,
        targetZone: 'battlefieldLeft' as const,
        priorityOwner: 'player' as const,
        lastPassedOwner: null,
        counterStack: [],
      },
      zones: { ...makeState().zones, battlefieldLeft: [minefield] },
      opponentZones: { ...makeState().opponentZones, staging: [attacker] },
    };

    const resolved = triggerCardAbilities(state, 'onFlip', {
      source: minefield,
      controller: 'player',
      zone: 'battlefieldLeft',
    });

    expect(resolved.opponentZones.staging.find((card) => card.instanceId === attacker.instanceId)?.damage).toBe(3);
    expect(resolved.zones.battlefieldLeft.some((card) => card.instanceId === minefield.instanceId)).toBe(false);
    expect(resolved.zones.graveyard[0]?.instanceId).toBe(minefield.instanceId);
  });
});
