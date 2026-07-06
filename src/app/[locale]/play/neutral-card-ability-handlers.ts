import type { AbilityHandler } from './card-abilities';
import {
  BATTLEFIELD_ZONE_IDS,
  addLogEntry,
  getCardController,
  getCardInstanceById,
  isTerritoryCard,
  prepareCardForZone,
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

export function resolveNeutralTargetChoice(
  state: GameState,
  pending: NeutralChoice,
  selectedIds: string[]
): GameState | { error: string } {
  if (selectedIds.length === 0 && pending.optional) return { ...state, pendingChoice: null };
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
    supplyCarrier,
  };
}
