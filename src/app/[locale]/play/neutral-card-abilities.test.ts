import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { getRegisteredCardAbilities } from './card-abilities';
import {
  activateCardAbility,
  buildInitialGameState,
  resolvePendingChoice,
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
});
