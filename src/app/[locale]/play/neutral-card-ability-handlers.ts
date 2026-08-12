import type { AbilityHandler } from './card-abilities';
import {
  BATTLEFIELD_ZONE_IDS,
  addLogEntry,
  dealDamageToUnit,
  getCardController,
  getCardInstanceById,
  getZoneLogLabel,
  isTerritoryCard,
  isUnitCard,
  prepareCardForZone,
  recordCardsDrawn,
  type GameCardInstance,
  type GameState,
  type Owner,
  type PendingChoice,
} from './game-rules';

type NeutralChoice = Extract<PendingChoice, { kind: 'neutralTarget' }>;
type BattlefieldZone = (typeof BATTLEFIELD_ZONE_IDS)[number];

function destroyTerritory(state: GameState, territory: GameCardInstance): GameState {
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) =>
    state.zones[candidate].some((card) => card.instanceId === territory.instanceId)
  );
  if (!zone) return state;

  const owner = getCardController(territory);
  const nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      [zone]: state.zones[zone].filter((card) => card.instanceId !== territory.instanceId),
    },
  };

  return owner === 'player'
    ? {
        ...nextState,
        zones: {
          ...nextState.zones,
          graveyard: [prepareCardForZone(territory, 'graveyard'), ...nextState.zones.graveyard],
        },
      }
    : {
        ...nextState,
        opponentZones: {
          ...nextState.opponentZones,
          graveyard: [prepareCardForZone(territory, 'graveyard'), ...nextState.opponentZones.graveyard],
        },
      };
}

export function drawTopUnitForWarBanner(state: GameState, owner: Owner, sourceName: string): GameState {
  const deck = owner === 'player' ? state.zones.deck : state.opponentZones.deck;
  const topCard = deck[0];
  if (!topCard || !isUnitCard(topCard.card)) {
    return {
      ...state,
      log: addLogEntry(state, {
        suffix: `${sourceName} revealed ${topCard ? topCard.card.name : 'no card'} and drew no card.`,
      }),
    };
  }

  const nextState = owner === 'player'
    ? recordCardsDrawn({
        ...state,
        zones: {
          ...state.zones,
          deck: state.zones.deck.slice(1),
          hand: [...state.zones.hand, topCard],
        },
      }, owner, 1)
    : recordCardsDrawn({
        ...state,
        opponentZones: {
          ...state.opponentZones,
          deck: state.opponentZones.deck.slice(1),
          hand: [...state.opponentZones.hand, topCard],
        },
      }, owner, 1);

  return {
    ...nextState,
    log: addLogEntry(nextState, {
      suffix: `${sourceName} revealed ${topCard.card.name} and ${owner === 'player' ? 'you draw' : 'Bot draws'} it.`,
    }),
  };
}

function revealTopCardForWarBanner(state: GameState, pending: NeutralChoice): GameState {
  const topCard = state.zones.deck[0];
  if (!topCard || !isUnitCard(topCard.card)) {
    return {
      ...state,
      pendingChoice: null,
      log: addLogEntry(state, {
        suffix: `${pending.sourceName} revealed ${topCard ? topCard.card.name : 'no card'} and drew no card.`,
      }),
    };
  }

  return {
    ...state,
    log: addLogEntry(state, {
      suffix: `${pending.sourceName} revealed ${topCard.card.name}.`,
    }),
    pendingChoice: {
      kind: 'neutralTarget',
      owner: 'player',
      sourceInstanceId: pending.sourceInstanceId,
      sourceName: pending.sourceName,
      prompt: `Draw revealed ${topCard.card.name}?`,
      effect: 'warBannerDraw',
      availableInstanceIds: [topCard.instanceId],
      optional: true,
      resumeTurnAdvance: pending.resumeTurnAdvance,
    },
  };
}

function drawRevealedWarBannerUnit(state: GameState, pending: NeutralChoice, selectedId: string): GameState | { error: string } {
  const topCard = state.zones.deck[0];
  if (!topCard || topCard.instanceId !== selectedId || !isUnitCard(topCard.card)) {
    return { error: 'Choose the revealed unit.' };
  }

  const nextState = recordCardsDrawn({
    ...state,
    pendingChoice: null,
    zones: {
      ...state.zones,
      deck: state.zones.deck.slice(1),
      hand: [...state.zones.hand, topCard],
    },
  }, pending.owner, 1);

  return {
    ...nextState,
    log: addLogEntry(nextState, {
      suffix: `${pending.sourceName} drew ${topCard.card.name}.`,
    }),
  };
}

const excavator: AbilityHandler = ({ state, event }) => {
  if (!event.zone || !BATTLEFIELD_ZONE_IDS.includes(event.zone as BattlefieldZone)) {
    return { state, resolved: false };
  }

  const zone = event.zone as BattlefieldZone;
  const targets = state.zones[zone].filter((card) => isTerritoryCard(card.card));
  if (targets.length === 0) {
    return { state, resolved: false };
  }

  if (event.controller === 'player') {
    return {
      state: {
        ...state,
        pendingChoice: {
          kind: 'neutralTarget',
          owner: 'player',
          sourceInstanceId: event.source.instanceId,
          sourceName: event.source.card.name,
          prompt: 'Destroy a territory in this combat zone?',
          effect: 'excavatorDestroy',
          availableInstanceIds: targets.map((card) => card.instanceId),
          optional: true,
        },
      },
      resolved: false,
    };
  }

  const target = targets[0]!;
  return {
    state: destroyTerritory(state, target),
    resolved: true,
    message: `${event.source.card.name} destroyed ${target.card.name}.`,
  };
};

const supplyCarrier: AbilityHandler = ({ state, event }) => {
  const owner: Owner = event.controller;
  if (event.costsPaid) {
    return {
      state: owner === 'player'
        ? { ...state, playerTemporarySupply: state.playerTemporarySupply + 1 }
        : { ...state, opponentTemporarySupply: state.opponentTemporarySupply + 1 },
      resolved: true,
      message: `${event.source.card.name} added 1 temporary supply until end of turn.`,
    };
  }
  const nextState: GameState = owner === 'player'
    ? {
        ...state,
        playerTemporarySupply: state.playerTemporarySupply + 1,
        zones: {
          ...state.zones,
          staging: state.zones.staging.map((card) =>
            card.instanceId === event.source.instanceId ? { ...card, ready: false } : card
          ),
          battlefieldLeft: state.zones.battlefieldLeft.map((card) =>
            card.instanceId === event.source.instanceId ? { ...card, ready: false } : card
          ),
          battlefieldCenter: state.zones.battlefieldCenter.map((card) =>
            card.instanceId === event.source.instanceId ? { ...card, ready: false } : card
          ),
          battlefieldRight: state.zones.battlefieldRight.map((card) =>
            card.instanceId === event.source.instanceId ? { ...card, ready: false } : card
          ),
        },
      }
    : {
        ...state,
        opponentTemporarySupply: state.opponentTemporarySupply + 1,
        opponentZones: {
          ...state.opponentZones,
          staging: state.opponentZones.staging.map((card) =>
            card.instanceId === event.source.instanceId ? { ...card, ready: false } : card
          ),
        },
        zones: {
          ...state.zones,
          battlefieldLeft: state.zones.battlefieldLeft.map((card) =>
            card.instanceId === event.source.instanceId ? { ...card, ready: false } : card
          ),
          battlefieldCenter: state.zones.battlefieldCenter.map((card) =>
            card.instanceId === event.source.instanceId ? { ...card, ready: false } : card
          ),
          battlefieldRight: state.zones.battlefieldRight.map((card) =>
            card.instanceId === event.source.instanceId ? { ...card, ready: false } : card
          ),
        },
      };

  return {
    state: nextState,
    resolved: true,
    message: `${event.source.card.name} added 1 temporary supply until end of turn.`,
  };
};

const minefield: AbilityHandler = ({ state, event }) => {
  if (!event.zone || !BATTLEFIELD_ZONE_IDS.includes(event.zone as BattlefieldZone)) {
    return { state, resolved: false };
  }

  const zone = event.zone as BattlefieldZone;
  const pendingAttacker = state.pendingCombat?.targetZone === zone
    ? getCardInstanceById(state, state.pendingCombat.attackerInstanceId)
    : null;
  const unitIds = state.zones[zone]
    .filter((card) => isUnitCard(card.card))
    .map((card) => card.instanceId);
  if (pendingAttacker && isUnitCard(pendingAttacker.card)) {
    unitIds.push(pendingAttacker.instanceId);
  }
  let nextState = state;
  for (const unitId of unitIds) {
    nextState = dealDamageToUnit(nextState, unitId, 3);
  }

  const source = getCardInstanceById(nextState, event.source.instanceId) ?? event.source;
  nextState = destroyTerritory(nextState, source);

  return {
    state: nextState,
    resolved: true,
    message: `${event.source.card.name} dealt 3 damage to all units in ${getZoneLogLabel(zone)} and was sacrificed.`,
  };
};

export function resolveNeutralTargetChoice(
  state: GameState,
  pending: NeutralChoice,
  selectedIds: string[]
): GameState | { error: string } {
  if (selectedIds.length === 0 && pending.optional) return { ...state, pendingChoice: null };
  if (pending.effect === 'warBannerReveal') {
    if (selectedIds.length !== 1 || !pending.availableInstanceIds.includes(selectedIds[0]!)) {
      return { error: 'Choose War Banner.' };
    }
    return revealTopCardForWarBanner(state, pending);
  }
  if (pending.effect === 'warBannerDraw') {
    if (selectedIds.length !== 1 || !pending.availableInstanceIds.includes(selectedIds[0]!)) {
      return { error: 'Choose the revealed unit.' };
    }
    return drawRevealedWarBannerUnit(state, pending, selectedIds[0]!);
  }
  if (selectedIds.length !== 1 || !pending.availableInstanceIds.includes(selectedIds[0]!)) {
    return { error: 'Choose exactly 1 valid card.' };
  }
  const selected = getCardInstanceById(state, selectedIds[0]!);
  if (!selected || !isTerritoryCard(selected.card)) {
    return { error: 'That territory is no longer available.' };
  }

  const nextState = destroyTerritory({ ...state, pendingChoice: null }, selected);
  return {
    ...nextState,
    log: addLogEntry(nextState, {
      suffix: `${pending.sourceName} destroyed ${selected.card.name}.`,
    }),
  };
}

export function createNeutralAbilityHandlers() {
  return {
    excavator,
    minefield,
    supplyCarrier,
  };
}
