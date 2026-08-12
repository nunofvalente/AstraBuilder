import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import {
  activateCardAbility,
  buildInitialGameState,
  declareBattlefieldAttack,
  getCounterActivatableUnits,
  passCounterPriority,
  type GameCardInstance,
  type GameState,
  type Owner,
  type SavedDeck,
} from './game-rules';

function makeDeck(): SavedDeck {
  return { id: 'activated-counter-test', title: 'Activated Counter Test', cardCount: 0, entries: [] };
}

function makeUnit(
  id: string,
  owner: Owner = 'player',
  overrides: Partial<GameCardInstance> = {}
): GameCardInstance {
  return {
    instanceId: `${id}-${owner}`,
    owner,
    card: createTestCard({ id, name: id, type: 'Unit', attack: 0, health: 5 }),
    ready: true,
    faceDown: false,
    attachedToInstanceId: null,
    damage: 0,
    retreatLockedUntilNextTurn: false,
    ...overrides,
  };
}

function openPlayerCounterWindow(options: {
  staging: GameCardInstance[];
  supply?: GameCardInstance[];
  opponentVictoryPoints?: number;
}): GameState {
  const defender = makeUnit('defender');
  const attacker = makeUnit('attacker', 'opponent');
  const base = buildInitialGameState(makeDeck(), makeDeck());
  const state: GameState = {
    ...base,
    phase: 'main',
    activePlayer: 'opponent',
    firstPlayer: 'opponent',
    hasFirstPlayerSkippedDraw: true,
    opponentVictoryPoints: options.opponentVictoryPoints ?? 0,
    zones: {
      ...base.zones,
      staging: options.staging,
      supply: options.supply ?? [],
      battlefieldLeft: [defender],
    },
    opponentZones: { ...base.opponentZones, staging: [attacker] },
    log: [],
  };
  const declared = declareBattlefieldAttack(state, 'opponent', attacker.instanceId, 'battlefieldLeft');
  if ('error' in declared) throw new Error(declared.error);
  return declared.state;
}

function closeCounterWindow(state: GameState): GameState {
  const resolved = passCounterPriority(state, 'opponent');
  if ('error' in resolved) throw new Error(resolved.error);
  return resolved.state;
}

describe('activated abilities as counter responses', () => {
  it('pays Assimilating Abomination sacrifice immediately and readies it on resolution', () => {
    const abomination = makeUnit('IMP001', 'player', {
      ready: false,
      card: createTestCard({
        id: 'IMP001',
        name: 'Assimilating Abomination',
        type: 'Unit',
        rulesText: 'Sacrifice another unit: Ready this unit.',
      }),
    });
    const sacrifice = makeUnit('abomination-sacrifice');
    const state = openPlayerCounterWindow({ staging: [abomination, sacrifice] });

    const activated = activateCardAbility(state, 'player', abomination.instanceId, sacrifice.instanceId);
    expect(activated).not.toHaveProperty('error');
    if ('error' in activated) return;
    expect(activated.state.zones.staging.some((unit) => unit.instanceId === sacrifice.instanceId)).toBe(false);
    expect(activated.state.zones.graveyard.some((unit) => unit.instanceId === sacrifice.instanceId)).toBe(true);
    expect(activated.state.zones.staging.find((unit) => unit.instanceId === abomination.instanceId)?.ready).toBe(false);

    const resolved = closeCounterWindow(activated.state);
    expect(resolved.zones.staging.find((unit) => unit.instanceId === abomination.instanceId)?.ready).toBe(true);
  });

  it('pays Commissar sacrifice and exhaust costs immediately but delays victory-point loss', () => {
    const commissar = makeUnit('IMP016', 'player', {
      card: createTestCard({
        id: 'IMP016',
        name: 'Valrathian Commissar',
        type: 'Unit',
        rulesText: '{Exhaust}, Sacrifice a unit: Target opponent loses 1 victory point.',
      }),
    });
    const sacrifice = makeUnit('commissar-sacrifice');
    const state = openPlayerCounterWindow({ staging: [commissar, sacrifice], opponentVictoryPoints: 3 });

    const activated = activateCardAbility(state, 'player', commissar.instanceId, sacrifice.instanceId);
    expect(activated).not.toHaveProperty('error');
    if ('error' in activated) return;
    expect(activated.state.zones.staging.find((unit) => unit.instanceId === commissar.instanceId)?.ready).toBe(false);
    expect(activated.state.zones.graveyard.some((unit) => unit.instanceId === sacrifice.instanceId)).toBe(true);
    expect(activated.state.opponentVictoryPoints).toBe(3);

    expect(closeCounterWindow(activated.state).opponentVictoryPoints).toBe(2);
  });

  it('pays Rallier and Renata supply costs before their buffs resolve', () => {
    const rallier = makeUnit('IMP139', 'player', {
      card: createTestCard({
        id: 'IMP139',
        name: 'Sylvan Rallier',
        type: 'Unit',
        rulesText: '{Exhaust}, {1}: Target friendly unit gets +1/+0 until end of turn.',
      }),
    });
    const ally = makeUnit('rallier-target');
    const supply = makeUnit('rallier-supply');
    const rallierState = openPlayerCounterWindow({ staging: [rallier, ally], supply: [supply] });
    expect(getCounterActivatableUnits(rallierState, 'player').map((unit) => unit.instanceId)).toEqual([
      rallier.instanceId,
    ]);

    const rallierActivated = activateCardAbility(rallierState, 'player', rallier.instanceId, ally.instanceId);
    expect(rallierActivated).not.toHaveProperty('error');
    if ('error' in rallierActivated) return;
    expect(rallierActivated.state.zones.supply[0]?.ready).toBe(false);
    expect(rallierActivated.state.zones.staging.find((unit) => unit.instanceId === ally.instanceId)?.temporaryAttackBonus).toBeUndefined();
    expect(closeCounterWindow(rallierActivated.state).zones.staging.find((unit) => unit.instanceId === ally.instanceId)?.temporaryAttackBonus).toBe(1);

    const renata = makeUnit('IMP073', 'player', {
      card: createTestCard({
        id: 'IMP073',
        name: 'Renata, Heavenbound',
        type: 'Renowned Unit',
        rulesText: '{Exhaust}, {2}: Ready target friendly Drone or Vehicle. It gets +2/+2 until end of turn.',
      }),
    });
    const drone = makeUnit('renata-target', 'player', {
      ready: false,
      card: createTestCard({ id: 'renata-target', name: 'Drone', type: 'Unit', subtype: 'Drone' }),
    });
    const renataSupply = [makeUnit('renata-supply-1'), makeUnit('renata-supply-2')];
    const renataState = openPlayerCounterWindow({ staging: [renata, drone], supply: renataSupply });

    const renataActivated = activateCardAbility(renataState, 'player', renata.instanceId, drone.instanceId);
    expect(renataActivated).not.toHaveProperty('error');
    if ('error' in renataActivated) return;
    expect(renataActivated.state.zones.supply.every((card) => !card.ready)).toBe(true);
    const stackedDrone = renataActivated.state.zones.staging.find((unit) => unit.instanceId === drone.instanceId);
    expect(stackedDrone?.ready).toBe(false);
    expect(stackedDrone?.temporaryAttackBonus).toBeUndefined();
    expect(stackedDrone?.temporaryHealthBonus).toBeUndefined();
    expect(closeCounterWindow(renataActivated.state).zones.staging.find((unit) => unit.instanceId === drone.instanceId)).toMatchObject({
      ready: true,
      temporaryAttackBonus: 2,
      temporaryHealthBonus: 2,
    });
  });

  it('exhausts Supply Carrier immediately and adds temporary supply on resolution', () => {
    const carrier = makeUnit('IMP160', 'player', {
      card: createTestCard({
        id: 'IMP160',
        name: 'Supply Carrier',
        type: 'Unit',
        rulesText: '{Exhaust}: Add 1 supply until end of turn.',
      }),
    });
    const state = openPlayerCounterWindow({ staging: [carrier] });

    const activated = activateCardAbility(state, 'player', carrier.instanceId, carrier.instanceId);
    expect(activated).not.toHaveProperty('error');
    if ('error' in activated) return;
    expect(activated.state.zones.staging[0]?.ready).toBe(false);
    expect(activated.state.playerTemporarySupply).toBe(0);

    expect(closeCounterWindow(activated.state).playerTemporarySupply).toBe(1);
  });
});
