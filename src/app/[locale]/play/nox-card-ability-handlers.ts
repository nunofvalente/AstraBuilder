import type { Card } from '../create/deck-builder/types';
import cardData from '../../../data/cards.json';
import type {
  AbilityContext,
  AbilityEvent,
  AbilityHandler,
  AbilityResolution,
} from './card-abilities';
import {
  BATTLEFIELD_ZONE_IDS,
  addLogEntry,
  adjustVictoryPoints,
  getCardController,
  getFriendlyUnitsInPlay,
  getRenownedUnitLimitError,
  getUnitsInPlay,
  moveCardsToOwnerGraveyards,
  recordCardsDrawn,
  removeUnitFromPlay,
  resolvePendingChoice,
  triggerCardAbilities,
  type GameCardInstance,
  type GameState,
  type Owner,
  type PendingChoice,
  type ZoneId,
} from './game-rules';

function createDrawCardsAbility(count: number): AbilityHandler {
  return ({ state, event }) => {
    if (count <= 0) return { state, resolved: false };
    const deck = event.controller === 'player' ? state.zones.deck : state.opponentZones.deck;
    const drawn = deck.slice(0, count);
    const nextState = event.controller === 'player'
      ? {
          ...state,
          zones: {
            ...state.zones,
            deck: state.zones.deck.slice(drawn.length),
            hand: [...state.zones.hand, ...drawn],
          },
        }
      : {
          ...state,
          opponentZones: {
            ...state.opponentZones,
            deck: state.opponentZones.deck.slice(drawn.length),
            hand: [...state.opponentZones.hand, ...drawn],
          },
        };
    return {
      state: recordCardsDrawn(nextState, event.controller, drawn.length),
      resolved: drawn.length > 0,
      message: `${event.source.card.name} drew ${drawn.length} ${drawn.length === 1 ? 'card' : 'cards'}${event.controller === 'opponent' ? ' for Bot' : ''}.`,
    };
  };
}
const UNIT_ABILITY_ZONES: ZoneId[] = ['staging', 'battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'];
const EXPERIMENT_TOKEN_CARD = cardData.cards.find((card) => card.id === 'IMP000');

function isUnit(card: Card): boolean {
  return card.type.toLowerCase().includes('unit') || card.type.toLowerCase().includes('token');
}

function createTokenInStaging(
  state: GameState,
  owner: Owner,
  tokenCard: Card,
  sourceName: string
): AbilityResolution {
  const token: GameCardInstance = {
    instanceId: `${owner}-${tokenCard.id}-token-${crypto.randomUUID()}`,
    owner,
    card: tokenCard,
    ready: false,
    faceDown: false,
    attachedToInstanceId: null,
    damage: 0,
    retreatLockedUntilNextTurn: false,
  };

  return owner === 'player'
    ? {
        state: {
          ...state,
          zones: {
            ...state.zones,
            staging: [token, ...state.zones.staging],
          },
        },
        resolved: true,
        message: `${sourceName} created ${tokenCard.name} in staging.`,
      }
    : {
        state: {
          ...state,
          opponentZones: {
            ...state.opponentZones,
            staging: [token, ...state.opponentZones.staging],
          },
        },
        resolved: true,
        message: `${sourceName} created ${tokenCard.name} in Bot staging.`,
      };
}

function createExperimentTokenOnDeathAbility(): AbilityHandler {
  return ({ state, event }) => {
    if (!EXPERIMENT_TOKEN_CARD) {
      return { state, resolved: false };
    }

    return createTokenInStaging(state, event.controller, EXPERIMENT_TOKEN_CARD, event.source.card.name);
  };
}

function createExperimentTokenOnEnterAbility(): AbilityHandler {
  return ({ state, event }) => {
    if (!EXPERIMENT_TOKEN_CARD) {
      return { state, resolved: false };
    }

    return createTokenInStaging(state, event.controller, EXPERIMENT_TOKEN_CARD, event.source.card.name);
  };
}

function createReanimateNonRenownedUnitAbility(): AbilityHandler {
  return ({ state, event }) => {
    const target = event.targets?.find((entry) => entry.type === 'card');
    const graveyard = event.controller === 'player' ? state.zones.graveyard : state.opponentZones.graveyard;

    if (!target) {
      return { state, resolved: false };
    }

    const revived = graveyard.find(
      (instance) =>
        instance.instanceId === target.instanceId &&
        isUnit(instance.card) &&
        !instance.card.type.toLowerCase().includes('renowned')
    );

    if (!revived) {
      return { state, resolved: false };
    }

    const revivedCard: GameCardInstance = {
      ...revived,
      ready: false,
      faceDown: false,
      attachedToInstanceId: null,
      damage: 0,
      retreatLockedUntilNextTurn: false,
      banishOnDeath: false,
    };

    return event.controller === 'player'
      ? {
          state: {
            ...state,
            zones: {
              ...state.zones,
              graveyard: state.zones.graveyard.filter((instance) => instance.instanceId !== revived.instanceId),
              staging: [revivedCard, ...state.zones.staging],
            },
          },
          resolved: true,
          message: `${event.source.card.name} returned ${revived.card.name} from your graveyard to staging.`,
        }
      : {
          state: {
            ...state,
            opponentZones: {
              ...state.opponentZones,
              graveyard: state.opponentZones.graveyard.filter((instance) => instance.instanceId !== revived.instanceId),
              staging: [revivedCard, ...state.opponentZones.staging],
            },
          },
          resolved: true,
          message: `${event.source.card.name} returned ${revived.card.name} from Bot graveyard to staging.`,
        };
  };
}

function resolveAssimilatingAbominationAbility({ state, event }: AbilityContext): AbilityResolution {
  const sacrificeTarget = event.targets?.find((target) => target.type === 'card');

  if (!sacrificeTarget || sacrificeTarget.instanceId === event.source.instanceId) {
    return {
      state,
      resolved: false,
      pendingTargets: [{ type: 'unit', scope: 'friendly', count: 1 }],
    };
  }

  const controllerStaging = event.controller === 'player' ? state.zones.staging : state.opponentZones.staging;
  const sourceZone = UNIT_ABILITY_ZONES.find((zone) => {
    const cards = zone === 'staging' ? controllerStaging : state.zones[zone];
    return cards.some(
      (instance) =>
        instance.instanceId === event.source.instanceId &&
        getCardController(instance) === event.controller &&
        instance.card.id === 'IMP001'
    );
  });
  const targetZone = UNIT_ABILITY_ZONES.find((zone) => {
    const cards = zone === 'staging' ? controllerStaging : state.zones[zone];
    return cards.some(
      (instance) =>
        instance.instanceId === sacrificeTarget.instanceId &&
        getCardController(instance) === event.controller &&
        isUnit(instance.card)
    );
  });

  if (!sourceZone || !targetZone) {
    return { state, resolved: false };
  }

  const targetZoneCards = targetZone === 'staging' ? controllerStaging : state.zones[targetZone];
  const sacrificedUnit = targetZoneCards.find((instance) => instance.instanceId === sacrificeTarget.instanceId)!;
  const sacrificedIds = new Set([
    sacrificedUnit.instanceId,
    ...targetZoneCards
      .filter((instance) => instance.attachedToInstanceId === sacrificedUnit.instanceId)
      .map((instance) => instance.instanceId),
  ]);
  const sacrificedCards = targetZoneCards.filter((instance) => sacrificedIds.has(instance.instanceId));

  const updateZone = (zone: ZoneId, cards: GameCardInstance[]): GameCardInstance[] =>
    cards
      .filter((instance) => zone !== targetZone || !sacrificedIds.has(instance.instanceId))
      .map((instance) =>
        zone === sourceZone && instance.instanceId === event.source.instanceId
          ? {
              ...instance,
              ready: true,
            }
          : instance
      );

  const nextStaging = updateZone('staging', controllerStaging);
  const nextBattlefields = Object.fromEntries(
    UNIT_ABILITY_ZONES.filter((zone) => zone !== 'staging').map((zone) => [zone, updateZone(zone, state.zones[zone])])
  ) as Pick<Record<ZoneId, GameCardInstance[]>, 'battlefieldLeft' | 'battlefieldCenter' | 'battlefieldRight'>;

  const removedState = {
    ...state,
      zones: {
        ...state.zones,
        ...nextBattlefields,
        ...(event.controller === 'player' ? { staging: nextStaging } : null),
      },
      opponentZones: {
        ...state.opponentZones,
        ...(event.controller === 'opponent' ? { staging: nextStaging } : null),
      },
    };

  return {
    state: moveCardsToOwnerGraveyards(removedState, sacrificedCards),
    resolved: true,
    followUpEvents: [
      {
        trigger: 'onDeath',
        source: sacrificedUnit,
        controller: event.controller,
        zone: 'graveyard',
      },
    ],
    message: `${event.source.card.name} sacrificed ${sacrificedUnit.card.name} and readied.`,
  };
}

function resolveLucilleOnScoreAbility({ state, event }: AbilityContext): AbilityResolution {
  const controllerStaging = event.controller === 'player' ? state.zones.staging : state.opponentZones.staging;
  const stagingUnits = controllerStaging.filter((instance) => getCardController(instance) === event.controller && isUnit(instance.card));

  if (stagingUnits.length === 0) {
    return { state, resolved: false };
  }

  if (event.controller === 'player') {
    return {
      state: {
        ...state,
        pendingChoice: {
          kind: 'lucilleScore',
          owner: event.controller,
          sourceInstanceId: event.source.instanceId,
          availableUnitInstanceIds: stagingUnits.map((unit) => unit.instanceId),
          remainingScoreTriggers: [],
          resumeTurnAdvance: false,
        },
      },
      resolved: false,
    };
  }

  const sacrificedIds = new Set<string>();
  for (const unit of stagingUnits) {
    sacrificedIds.add(unit.instanceId);
    for (const attachment of controllerStaging.filter((instance) => instance.attachedToInstanceId === unit.instanceId)) {
      sacrificedIds.add(attachment.instanceId);
    }
  }

  const sacrificedCards = controllerStaging
    .filter((instance) => sacrificedIds.has(instance.instanceId))
    .map((instance) => ({
      ...instance,
      faceDown: false,
      attachedToInstanceId: null,
      damage: 0,
      retreatLockedUntilNextTurn: false,
    }));
  const nextStaging = controllerStaging.filter((instance) => !sacrificedIds.has(instance.instanceId));
  const gainedVictoryPoints = stagingUnits.length;

  let nextState: GameState = {
    ...state,
    opponentZones: {
      ...state.opponentZones,
      staging: nextStaging,
      graveyard: [...sacrificedCards, ...state.opponentZones.graveyard],
    },
  };

  nextState = {
    ...adjustVictoryPoints(nextState, event.controller, gainedVictoryPoints),
    log: addLogEntry(nextState, {
      suffix: `${event.source.card.name} sacrificed ${gainedVictoryPoints} ${gainedVictoryPoints === 1 ? 'staging unit' : 'staging units'} and gained ${gainedVictoryPoints} ${gainedVictoryPoints === 1 ? 'victory point' : 'victory points'}.`,
    }),
  };

  for (const unit of stagingUnits) {
    nextState = triggerCardAbilities(nextState, 'onDeath', {
      source: unit,
      controller: event.controller,
      zone: 'graveyard',
    });
  }

  return {
    state: nextState,
    resolved: false,
  };
}

function resolveNerezzaOnPlayAbility({ state, event }: AbilityContext): AbilityResolution {
  const sacrificeChoices = getFriendlyUnitsInPlay(state, event.controller).filter((instance) => instance.instanceId !== event.source.instanceId);
  const enemyCombatUnits = UNIT_ABILITY_ZONES
    .filter((zone) => zone !== 'staging')
    .flatMap((zone) => state.zones[zone].filter((instance) => getCardController(instance) !== event.controller && isUnit(instance.card)))
    .filter((instance) => !getRenownedUnitLimitError(state, event.controller, instance));

  if (sacrificeChoices.length === 0 || enemyCombatUnits.length === 0) {
    return { state, resolved: false };
  }

  if (event.controller === 'player') {
    return {
      state: {
        ...state,
        pendingChoice: {
          kind: 'nerezzaSacrifice',
          owner: event.controller,
          sourceInstanceId: event.source.instanceId,
          availableUnitInstanceIds: sacrificeChoices.map((instance) => instance.instanceId),
        },
      },
      resolved: false,
    };
  }

  const afterSacrifice = resolvePendingChoice(
    {
      ...state,
      pendingChoice: {
        kind: 'nerezzaSacrifice',
        owner: event.controller,
        sourceInstanceId: event.source.instanceId,
        availableUnitInstanceIds: sacrificeChoices.map((instance) => instance.instanceId),
      },
    },
    [sacrificeChoices[0]!.instanceId]
  );

  if ('error' in afterSacrifice || !afterSacrifice.pendingChoice || afterSacrifice.pendingChoice.kind !== 'nerezzaSteal') {
    return { state: 'error' in afterSacrifice ? state : afterSacrifice, resolved: false };
  }

  const afterSteal = resolvePendingChoice(afterSacrifice, [afterSacrifice.pendingChoice.availableUnitInstanceIds[0]!]);
  return { state: 'error' in afterSteal ? afterSacrifice : afterSteal, resolved: false };
}

function resolveNocturneOnEnterAbility({ state, event }: AbilityContext): AbilityResolution {
  const enemyCombatUnits = UNIT_ABILITY_ZONES
    .filter((zone) => zone !== 'staging')
    .flatMap((zone) => state.zones[zone].filter((instance) => getCardController(instance) !== event.controller && isUnit(instance.card)));

  if (enemyCombatUnits.length === 0) {
    return { state, resolved: false };
  }

  if (event.controller === 'player') {
    return {
      state: {
        ...state,
        pendingChoice: {
          kind: 'nocturneMark',
          owner: event.controller,
          sourceInstanceId: event.source.instanceId,
          availableUnitInstanceIds: enemyCombatUnits.map((instance) => instance.instanceId),
        },
      },
      resolved: false,
    };
  }

  const resolved = resolvePendingChoice(
    {
      ...state,
      pendingChoice: {
        kind: 'nocturneMark',
        owner: event.controller,
        sourceInstanceId: event.source.instanceId,
        availableUnitInstanceIds: enemyCombatUnits.map((instance) => instance.instanceId),
      },
    },
    [enemyCombatUnits[0]!.instanceId]
  );

  return { state: 'error' in resolved ? state : resolved, resolved: false };
}

function updateUnitInPlay(
  state: GameState,
  instanceId: string,
  update: (instance: GameCardInstance) => GameCardInstance
): GameState {
  const updateCards = (cards: GameCardInstance[]) =>
    cards.map((instance) => instance.instanceId === instanceId ? update(instance) : instance);

  return {
    ...state,
    zones: {
      ...state.zones,
      staging: updateCards(state.zones.staging),
      battlefieldLeft: updateCards(state.zones.battlefieldLeft),
      battlefieldCenter: updateCards(state.zones.battlefieldCenter),
      battlefieldRight: updateCards(state.zones.battlefieldRight),
    },
    opponentZones: {
      ...state.opponentZones,
      staging: updateCards(state.opponentZones.staging),
    },
  };
}

function createPlayerNoxChoice(
  state: GameState,
  source: GameCardInstance,
  effect: Extract<PendingChoice, { kind: 'noxTarget' }>['effect'],
  availableInstanceIds: string[],
  optional = false
): GameState {
  return {
    ...state,
    pendingChoice: {
      kind: 'noxTarget',
      owner: 'player',
      sourceInstanceId: source.instanceId,
      sourceName: source.card.name,
      effect,
      availableInstanceIds,
      optional,
    },
  };
}

function createExperimentForOwner(state: GameState, owner: Owner, sourceName: string): GameState {
  if (!EXPERIMENT_TOKEN_CARD) {
    return state;
  }

  const resolution = createTokenInStaging(state, owner, EXPERIMENT_TOKEN_CARD, sourceName);
  return resolution.resolved && resolution.message
    ? {
        ...resolution.state,
        log: addLogEntry(resolution.state, { suffix: resolution.message }),
      }
    : resolution.state;
}

function discardFirstCardAndCreateExperiment(state: GameState, owner: Owner, sourceName: string): GameState {
  const hand = owner === 'player' ? state.zones.hand : state.opponentZones.hand;
  const discarded = hand[0];
  if (!discarded) {
    return state;
  }

  const discardedState = owner === 'player'
    ? {
        ...state,
        zones: {
          ...state.zones,
          hand: state.zones.hand.slice(1),
          graveyard: [{ ...discarded, faceDown: false, attachedToInstanceId: null }, ...state.zones.graveyard],
        },
      }
    : {
        ...state,
        opponentZones: {
          ...state.opponentZones,
          hand: state.opponentZones.hand.slice(1),
          graveyard: [{ ...discarded, faceDown: false, attachedToInstanceId: null }, ...state.opponentZones.graveyard],
        },
      };

  return createExperimentForOwner({
    ...discardedState,
    log: addLogEntry(discardedState, {
      suffix: `${owner === 'player' ? 'You discard' : 'Bot discards'} ${discarded.card.name} for ${sourceName}.`,
    }),
  }, owner, sourceName);
}

function isProtectedFromEnemyTactic(state: GameState, unit: GameCardInstance, controller: Owner): boolean {
  if (getCardController(unit) === controller) {
    return false;
  }

  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) =>
    state.zones[candidate].some((instance) => instance.instanceId === unit.instanceId)
  );
  return Boolean(
    zone &&
    state.zones[zone].some(
      (instance) => instance.card.id === 'IMP032' && getCardController(instance) === getCardController(unit)
    )
  );
}

function resolveTenebrosaOnDefend({ state, event }: AbilityContext): AbilityResolution {
  if (!getUnitsInPlay(state).some((unit) => unit.instanceId === event.source.instanceId)) {
    return { state, resolved: false };
  }
  return {
    state: updateUnitInPlay(state, event.source.instanceId, (instance) => ({ ...instance, ready: true })),
    resolved: true,
    message: `${event.source.card.name} readied after defending.`,
  };
}

function resolveCommissarAbility({ state, event }: AbilityContext): AbilityResolution {
  const target = event.targets?.find((entry) => entry.type === 'card');
  if (!target) {
    return { state, resolved: false };
  }

  const removed = removeUnitFromPlay(state, target.instanceId);
  if ('error' in removed) {
    return { state, resolved: false };
  }

  const exhaustedState = updateUnitInPlay(removed.state, event.source.instanceId, (instance) => ({
    ...instance,
    ready: false,
  }));
  const opponent: Owner = event.controller === 'player' ? 'opponent' : 'player';
  return {
    state: adjustVictoryPoints(exhaustedState, opponent, -1),
    resolved: true,
    message: `${event.source.card.name} sacrificed ${removed.unit.card.name}; ${opponent === 'player' ? 'you lose' : 'Bot loses'} 1 victory point.`,
  };
}

function resolveZealotOnDeath({ state, event }: AbilityContext): AbilityResolution {
  const opponent: Owner = event.controller === 'player' ? 'opponent' : 'player';
  const hand = opponent === 'player' ? state.zones.hand : state.opponentZones.hand;
  if (hand.length === 0) {
    return { state, resolved: false };
  }

  if (opponent === 'player') {
    return {
      state: {
        ...state,
        pendingChoice: {
          kind: 'forcedDiscard',
          owner: 'player',
          sourceInstanceId: event.source.instanceId,
          availableCardInstanceIds: hand.map((instance) => instance.instanceId),
          sourceName: event.source.card.name,
        },
      },
      resolved: false,
    };
  }

  const discarded = hand[0]!;
  return {
    state: {
      ...state,
      opponentZones: {
        ...state.opponentZones,
        hand: hand.slice(1),
        graveyard: [{ ...discarded, faceDown: false }, ...state.opponentZones.graveyard],
      },
    },
    resolved: true,
    message: `${event.source.card.name} caused Bot to discard ${discarded.card.name}.`,
  };
}

function resolveRetainerOnDeath({ state, event }: AbilityContext): AbilityResolution {
  const targets = getFriendlyUnitsInPlay(state, event.controller);
  if (targets.length === 0) {
    return { state, resolved: false };
  }

  if (event.controller === 'player') {
    return {
      state: createPlayerNoxChoice(state, event.source, 'retainerBuff', targets.map((unit) => unit.instanceId)),
      resolved: false,
    };
  }

  const target = targets[0]!;
  return {
    state: updateUnitInPlay(state, target.instanceId, (instance) => ({
      ...instance,
      temporaryInfluenceBonus: (instance.temporaryInfluenceBonus ?? 0) + 1,
      temporaryInfluenceExpiresAfterTurn: state.activePlayer === getCardController(target) ? state.turn + 1 : state.turn,
    })),
    resolved: true,
    message: `${event.source.card.name} gave ${target.card.name} +1 influence until the end of Bot's next turn.`,
  };
}

function resolveDemonicAdvance({ state, event }: AbilityContext): AbilityResolution {
  return {
    state: {
      ...state,
      ...(event.controller === 'player'
        ? { playerDemonicAdvanceActive: true }
        : { opponentDemonicAdvanceActive: true }),
    },
    resolved: true,
    message: `${event.source.card.name} will let the next unit enter an unoccupied combat zone ready this turn.`,
  };
}

function resolveExterminate({ state, event }: AbilityContext): AbilityResolution {
  let nextState = state;
  const units = getUnitsInPlay(state);
  for (const unit of units) {
    const removed = removeUnitFromPlay(nextState, unit.instanceId);
    if (!('error' in removed)) {
      nextState = removed.state;
    }
  }
  return {
    state: nextState,
    resolved: units.length > 0,
    message: `${event.source.card.name} destroyed all units.`,
  };
}

function resolveTargetedNoxTactic(
  effect: Extract<PendingChoice, { kind: 'noxTarget' }>['effect'],
  getTargets: (state: GameState, event: AbilityEvent) => GameCardInstance[]
): AbilityHandler {
  return ({ state, event }) => {
    const targets = getTargets(state, event);
    if (targets.length === 0) {
      return { state, resolved: false };
    }
    const selectedTarget = event.targets?.find((target) => target.type === 'card');
    if (selectedTarget) {
      const target = targets.find((unit) => unit.instanceId === selectedTarget.instanceId);
      if (!target) {
        return { state, resolved: false };
      }
      const removed = removeUnitFromPlay(state, target.instanceId);
      return 'error' in removed
        ? { state, resolved: false }
        : {
            state: removed.state,
            resolved: true,
            message: `${event.source.card.name} destroyed ${removed.unit.card.name}.`,
          };
    }
    if (event.controller === 'player') {
      return {
        state: createPlayerNoxChoice(state, event.source, effect, targets.map((unit) => unit.instanceId)),
        resolved: false,
      };
    }

    const removed = removeUnitFromPlay(state, targets[0]!.instanceId);
    return 'error' in removed
      ? { state, resolved: false }
      : {
          state: removed.state,
          resolved: true,
          message: `${event.source.card.name} destroyed ${removed.unit.card.name}.`,
        };
  };
}

function resolveBlindingMist({ state, event }: AbilityContext): AbilityResolution {
  const defenderId = state.pendingCombat?.defenderInstanceId;
  if (!defenderId) {
    return { state, resolved: false };
  }
  return {
    state: updateUnitInPlay(state, defenderId, (instance) => ({
      ...instance,
      preventNextCombatDamageThisTurn: true,
    })),
    resolved: true,
    message: `${event.source.card.name} will prevent the next combat damage dealt to the defending unit.`,
  };
}

function resolveContagiousDisposal({ state, event }: AbilityContext): AbilityResolution {
  const nextPlayer: Owner = event.controller === 'player' ? 'opponent' : 'player';
  if (nextPlayer === 'player' && state.zones.hand.length > 0) {
    return {
      state: createPlayerNoxChoice(state, event.source, 'contagiousDiscard', state.zones.hand.map((card) => card.instanceId)),
      resolved: false,
    };
  }

  let nextState = discardFirstCardAndCreateExperiment(state, nextPlayer, event.source.card.name);
  if (event.controller === 'player' && state.zones.hand.length > 0) {
    nextState = createPlayerNoxChoice(
      nextState,
      event.source,
      'contagiousDiscard',
      nextState.zones.hand.map((card) => card.instanceId)
    );
  }
  return { state: nextState, resolved: true, message: `${event.source.card.name} resolved.` };
}

function findCardInstance(state: GameState, instanceId: string): GameCardInstance | null {
  return [
    ...Object.values(state.zones).flat(),
    ...Object.values(state.opponentZones).flat(),
  ].find((instance) => instance.instanceId === instanceId) ?? null;
}

function resolveEyeForAnEye({ state, event }: AbilityContext): AbilityResolution {
  const friendlyUnits = getFriendlyUnitsInPlay(state, event.controller);
  if (friendlyUnits.length === 0) {
    return { state, resolved: false };
  }

  if (event.controller === 'player') {
    return {
      state: createPlayerNoxChoice(state, event.source, 'eyeSacrifice', friendlyUnits.map((unit) => unit.instanceId)),
      resolved: false,
    };
  }

  const ownSacrifice = removeUnitFromPlay(state, friendlyUnits[0]!.instanceId);
  if ('error' in ownSacrifice) {
    return { state, resolved: false };
  }
  const playerUnits = getFriendlyUnitsInPlay(ownSacrifice.state, 'player');
  if (playerUnits.length === 0) {
    return { state: ownSacrifice.state, resolved: true };
  }
  const highestCost = Math.max(...playerUnits.map((unit) => unit.card.cost));
  return {
    state: createPlayerNoxChoice(
      ownSacrifice.state,
      event.source,
      'eyeOpponentSacrifice',
      playerUnits.filter((unit) => unit.card.cost === highestCost).map((unit) => unit.instanceId)
    ),
    resolved: false,
  };
}

export function resolveNoxTargetChoice(
  state: GameState,
  pendingChoice: Extract<PendingChoice, { kind: 'noxTarget' }>,
  selectedInstanceIds: string[]
): GameState | { error: string } {
  if (selectedInstanceIds.length === 0 && pendingChoice.optional) {
    return { ...state, pendingChoice: null };
  }
  if (selectedInstanceIds.length !== 1 || !pendingChoice.availableInstanceIds.includes(selectedInstanceIds[0]!)) {
    return { error: 'Choose exactly one valid card.' };
  }

  const selectedId = selectedInstanceIds[0]!;
  const source = findCardInstance(state, pendingChoice.sourceInstanceId);
  let nextState: GameState = { ...state, pendingChoice: null };

  if (pendingChoice.effect === 'retainerBuff') {
    const target = findCardInstance(state, selectedId);
    if (!target) {
      return { error: 'That unit is no longer in play.' };
    }
    return updateUnitInPlay(nextState, selectedId, (instance) => ({
      ...instance,
      temporaryInfluenceBonus: (instance.temporaryInfluenceBonus ?? 0) + 1,
      temporaryInfluenceExpiresAfterTurn: state.activePlayer === getCardController(instance) ? state.turn + 1 : state.turn,
    }));
  }

  if (pendingChoice.effect === 'contagiousDiscard') {
    const discarded = state.zones.hand.find((card) => card.instanceId === selectedId);
    if (!discarded) {
      return { error: 'That card is no longer in your hand.' };
    }
    nextState = {
      ...nextState,
      zones: {
        ...nextState.zones,
        hand: nextState.zones.hand.filter((card) => card.instanceId !== selectedId),
        graveyard: [{ ...discarded, faceDown: false, attachedToInstanceId: null }, ...nextState.zones.graveyard],
      },
    };
    nextState = createExperimentForOwner(nextState, 'player', pendingChoice.sourceName);
    if (source && getCardController(source) === 'opponent') {
      nextState = discardFirstCardAndCreateExperiment(nextState, 'opponent', pendingChoice.sourceName);
    }
    return nextState;
  }

  if (pendingChoice.effect === 'laboratoryDiscard') {
    const discarded = state.zones.hand.find((card) => card.instanceId === selectedId);
    if (!discarded) {
      return { error: 'That card is no longer in your hand.' };
    }
    return {
      ...nextState,
      zones: {
        ...nextState.zones,
        hand: nextState.zones.hand.filter((card) => card.instanceId !== selectedId),
        graveyard: [{ ...discarded, faceDown: false, attachedToInstanceId: null }, ...nextState.zones.graveyard],
      },
    };
  }

  if (pendingChoice.effect === 'laboratoryUse') {
    if (!source) {
      return { error: 'Noxhaven Laboratory is no longer available.' };
    }
    const drawResolution = createDrawCardsAbility(1)({
      state: nextState,
      event: {
        trigger: 'onEnter',
        source,
        controller: 'player',
        zone: null,
      },
    });
    const hand = drawResolution.state.zones.hand;
    return hand.length === 0
      ? drawResolution.state
      : createPlayerNoxChoice(
          drawResolution.state,
          source,
          'laboratoryDiscard',
          hand.map((card) => card.instanceId)
        );
  }

  if (pendingChoice.effect === 'hideoutSacrifice' && source?.instanceId === selectedId) {
    const sourceZone = BATTLEFIELD_ZONE_IDS.find((zone) =>
      state.zones[zone].some((instance) => instance.instanceId === selectedId)
    );
    if (!sourceZone) {
      return { error: 'The Hideout is no longer in play.' };
    }
    return {
      ...nextState,
      zones: {
        ...nextState.zones,
        [sourceZone]: nextState.zones[sourceZone].filter((instance) => instance.instanceId !== selectedId),
        graveyard: getCardController(source) === 'player'
          ? [{ ...source, faceDown: false }, ...nextState.zones.graveyard]
          : nextState.zones.graveyard,
      },
      opponentZones: getCardController(source) === 'opponent'
        ? {
            ...nextState.opponentZones,
            graveyard: [{ ...source, faceDown: false }, ...nextState.opponentZones.graveyard],
          }
        : nextState.opponentZones,
    };
  }

  const removed = removeUnitFromPlay(
    nextState,
    selectedId,
    pendingChoice.effect === 'unethicalSacrifice' && source
      ? {
          beforeOnDeath: (stateAfterMove) =>
            createDrawCardsAbility(2)({
              state: stateAfterMove,
              event: {
                trigger: 'onPlay',
                source,
                controller: getCardController(source),
                zone: 'graveyard',
              },
            }).state,
        }
      : undefined
  );
  if ('error' in removed) {
    return removed;
  }
  nextState = removed.state;

  if (pendingChoice.effect === 'eyeSacrifice') {
    const opponentUnits = getFriendlyUnitsInPlay(nextState, 'opponent');
    if (opponentUnits.length > 0) {
      const highestCost = Math.max(...opponentUnits.map((unit) => unit.card.cost));
      const target = opponentUnits.find((unit) => unit.card.cost === highestCost)!;
      const opponentSacrifice = removeUnitFromPlay(nextState, target.instanceId);
      if (!('error' in opponentSacrifice)) {
        nextState = opponentSacrifice.state;
      }
    }
  }

  return nextState;
}

const acknowledgeRule: AbilityHandler = ({ state }) => ({ state, resolved: false });

function getTacticCombatUnits(state: GameState): GameCardInstance[] {
  const battlefieldUnits = BATTLEFIELD_ZONE_IDS
    .flatMap((zone) => state.zones[zone])
    .filter((unit) => isUnit(unit.card));
  const attacker = state.pendingCombat
    ? getUnitsInPlay(state).find((unit) => unit.instanceId === state.pendingCombat?.attackerInstanceId)
    : null;
  return attacker ? [...battlefieldUnits, attacker] : battlefieldUnits;
}

export function createNoxAbilityHandlers() {
  return {
    acknowledgeRule,
    assimilatingAbomination: resolveAssimilatingAbominationAbility,
    cadaverSupplier: createExperimentTokenOnDeathAbility(),
    ebonblightInvoker: createReanimateNonRenownedUnitAbility(),
    lucilleEnter: createExperimentTokenOnEnterAbility(),
    lucilleScore: resolveLucilleOnScoreAbility,
    nerezza: resolveNerezzaOnPlayAbility,
    nocturneAgent: resolveNocturneOnEnterAbility,
    noxhavenResearcher: createExperimentTokenOnEnterAbility(),
    tenebrosaDefend: resolveTenebrosaOnDefend,
    valrathianCommissar: resolveCommissarAbility,
    valrathianZealot: resolveZealotOnDeath,
    vampireRetainer: resolveRetainerOnDeath,
    contagiousDisposal: resolveContagiousDisposal,
    demonicAdvance: resolveDemonicAdvance,
    exterminate: resolveExterminate,
    eyeForAnEye: resolveEyeForAnEye,
    unethicalResearch: resolveTargetedNoxTactic(
      'unethicalSacrifice',
      (state, event) => getFriendlyUnitsInPlay(state, event.controller)
    ),
    blindingMist: resolveBlindingMist,
    killingBlow: resolveTargetedNoxTactic(
      'destroyUnit',
      (state, event) => getTacticCombatUnits(state).filter((unit) => !isProtectedFromEnemyTactic(state, unit, event.controller))
    ),
    quashInsurrection: resolveTargetedNoxTactic(
      'destroyUnit',
      (state, event) => getTacticCombatUnits(state).filter(
        (unit) => unit.card.cost <= 2 && !isProtectedFromEnemyTactic(state, unit, event.controller)
      )
    ),
  };
}
