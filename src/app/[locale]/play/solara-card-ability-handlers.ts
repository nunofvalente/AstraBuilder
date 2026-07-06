import type { AbilityContext, AbilityEvent, AbilityHandler, AbilityResolution } from './card-abilities';
import {
  BATTLEFIELD_ZONE_IDS,
  addLogEntry,
  adjustVictoryPoints,
  declareBattlefieldAttack,
  dealDamageToUnit,
  exhaustSupplyForCost,
  getCardController,
  getCardInstanceById,
  getCurrentUnitHealth,
  getFriendlyUnitsInPlay,
  getReadySupplyCount,
  getUnitsInPlay,
  isItemCard,
  isTerritoryCard,
  isUnitCard,
  moveCardsToOwnerGraveyards,
  prepareCardForZone,
  readyUnitInPlay,
  recordCardsDrawn,
  removeUnitFromPlay,
  type GameCardInstance,
  type GameState,
  type Owner,
  type PendingChoice,
  type ZoneId,
} from './game-rules';

type SolaraChoice = Extract<PendingChoice, { kind: 'solaraTarget' }>;
type SolaraEffect = SolaraChoice['effect'];

function ownerZone(
  state: GameState,
  owner: Owner,
  zone: 'deck' | 'hand' | 'staging' | 'supply' | 'graveyard' | 'banish'
) {
  return owner === 'player' ? state.zones[zone] : state.opponentZones[zone];
}

function setOwnerZone(
  state: GameState,
  owner: Owner,
  zone: 'hand' | 'staging' | 'supply' | 'graveyard' | 'banish' | 'deck',
  cards: GameCardInstance[]
): GameState {
  return owner === 'player'
    ? { ...state, zones: { ...state.zones, [zone]: cards } }
    : { ...state, opponentZones: { ...state.opponentZones, [zone]: cards } };
}

function playZone(state: GameState, instanceId: string): ZoneId | null {
  if (state.zones.staging.some((card) => card.instanceId === instanceId)) return 'staging';
  if (state.opponentZones.staging.some((card) => card.instanceId === instanceId)) return 'staging';
  return BATTLEFIELD_ZONE_IDS.find((zone) => state.zones[zone].some((card) => card.instanceId === instanceId)) ?? null;
}

function updateCard(state: GameState, instanceId: string, update: (card: GameCardInstance) => GameCardInstance): GameState {
  const apply = (cards: GameCardInstance[]) => cards.map((card) => card.instanceId === instanceId ? update(card) : card);
  return {
    ...state,
    zones: {
      ...state.zones,
      staging: apply(state.zones.staging),
      supply: apply(state.zones.supply),
      battlefieldLeft: apply(state.zones.battlefieldLeft),
      battlefieldCenter: apply(state.zones.battlefieldCenter),
      battlefieldRight: apply(state.zones.battlefieldRight),
    },
    opponentZones: {
      ...state.opponentZones,
      staging: apply(state.opponentZones.staging),
      supply: apply(state.opponentZones.supply),
    },
  };
}

function choice(
  state: GameState,
  event: AbilityEvent,
  effect: SolaraEffect,
  targets: GameCardInstance[],
  prompt: string,
  options: Pick<SolaraChoice, 'optional' | 'minSelections' | 'maxSelections' | 'contextInstanceIds' | 'resumeTurnAdvance'> = {}
): GameState {
  return {
    ...state,
    pendingChoice: {
      kind: 'solaraTarget',
      owner: 'player',
      sourceInstanceId: event.source.instanceId,
      sourceName: event.source.card.name,
      prompt,
      effect,
      availableInstanceIds: targets.map((card) => card.instanceId),
      ...options,
    },
  };
}

function selectedTarget(event: AbilityEvent, targets: GameCardInstance[]) {
  const id = event.targets?.find((target) => target.type === 'card')?.instanceId;
  return id ? targets.find((target) => target.instanceId === id) ?? null : null;
}

function chooseOrBot(
  state: GameState,
  event: AbilityEvent,
  effect: SolaraEffect,
  targets: GameCardInstance[],
  prompt: string,
  apply: (state: GameState, target: GameCardInstance) => GameState,
  optional = false
): AbilityResolution {
  if (targets.length === 0) return { state, resolved: false };
  const selected = selectedTarget(event, targets);
  if (event.controller === 'player' && !selected) {
    return { state: choice(state, event, effect, targets, prompt, { optional }), resolved: false };
  }
  return { state: apply(state, selected ?? targets[0]!), resolved: true };
}

function destroyPermanent(state: GameState, target: GameCardInstance): GameState {
  const zone = playZone(state, target.instanceId);
  if (!zone) return state;
  if (isUnitCard(target.card)) {
    const removed = removeUnitFromPlay(state, target.instanceId);
    return 'error' in removed ? state : removed.state;
  }
  const cards = zone === 'staging'
    ? ownerZone(state, getCardController(target), 'staging')
    : state.zones[zone];
  const removed = [
    target,
    ...cards.filter((card) => card.attachedToInstanceId === target.instanceId),
  ];
  const ids = new Set(removed.map((card) => card.instanceId));
  const without = cards.filter((card) => !ids.has(card.instanceId));
  const next = zone === 'staging'
    ? setOwnerZone(state, getCardController(target), 'staging', without)
    : { ...state, zones: { ...state.zones, [zone]: without } };
  return moveCardsToOwnerGraveyards(next, removed);
}

function damageUnit(state: GameState, target: GameCardInstance, amount: number): GameState {
  return dealDamageToUnit(state, target.instanceId, amount);
}

const ashfangPillager: AbilityHandler = ({ state, event }) => {
  const targets = [...state.zones.supply, ...state.opponentZones.supply];
  return chooseOrBot(state, event, 'pillagerSupply', targets, 'Choose a supply card to exhaust and lock for its next ready phase.', (current, target) =>
    updateCard(current, target.instanceId, (card) => ({ ...card, ready: false, skipNextReady: true }))
  );
};

const ashfangRaider: AbilityHandler = ({ state, event }) => ({
  state: updateCard(state, event.source.instanceId, (card) => ({ ...card, attackOnlyUnoccupiedUntilTurn: state.turn })),
  resolved: true,
});

const fearlessWhelp: AbilityHandler = ({ state, event }) => {
  const deck = event.controller === 'player' ? state.zones.deck : state.opponentZones.deck;
  const drawn = deck.slice(0, 1);
  const next = event.controller === 'player'
    ? { ...state, zones: { ...state.zones, deck: deck.slice(1), hand: [...state.zones.hand, ...drawn] } }
    : { ...state, opponentZones: { ...state.opponentZones, deck: deck.slice(1), hand: [...state.opponentZones.hand, ...drawn] } };
  return {
    state: recordCardsDrawn(next, event.controller, drawn.length),
    resolved: drawn.length > 0,
    message: `${event.source.card.name} drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`,
  };
};

function grantTemporaryGlory(state: GameState, target: GameCardInstance, sourceName: string): GameState {
  const next = updateCard(state, target.instanceId, (card) => ({
    ...card,
    temporaryGloryBonus: (card.temporaryGloryBonus ?? 0) + 1,
    temporaryGloryExpiresAfterTurn: state.turn,
  }));
  return {
    ...next,
    log: addLogEntry(next, {
      suffix: `${sourceName} gave ${target.card.name} Glory 1 until end of turn.`,
    }),
  };
}

const firedancer: AbilityHandler = ({ state, event }) => {
  const targets = getFriendlyUnitsInPlay(state, event.controller).filter((unit) => unit.instanceId !== event.source.instanceId);
  return chooseOrBot(state, event, 'grantGlory', targets, 'Choose another friendly unit to gain Glory 1 this turn.', (current, target) =>
    grantTemporaryGlory(current, target, event.source.card.name), true);
};

const lingyi: AbilityHandler = ({ state, event }) => {
  const targets = ownerZone(state, event.controller, 'hand').filter((card) => isUnitCard(card.card));
  return chooseOrBot(state, event, 'lingyiBanish', targets, 'Choose a unit card from your hand to banish. It gains Blitz and may be played from banish once.', (current, target) => {
    const withoutHand = setOwnerZone(
      current,
      event.controller,
      'hand',
      ownerZone(current, event.controller, 'hand').filter((card) => card.instanceId !== target.instanceId)
    );
    return setOwnerZone(withoutHand, event.controller, 'banish', [
      {
        ...prepareCardForZone(target, 'banish'),
        lingyiPlayableFromBanishOnce: true,
        lingyiGrantedBlitz: true,
      },
      ...ownerZone(withoutHand, event.controller, 'banish'),
    ]);
  }, true);
};

const rockjaw: AbilityHandler = ({ state, event }) => {
  const targets = BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).filter(
    (unit) => isUnitCard(unit.card) && getCardController(unit) === event.controller
  );
  return chooseOrBot(state, event, 'rockjawRetreat', targets, 'Choose a friendly combat unit to retreat for Rockjaw.', (current, target) =>
    resolveRockjaw(current, event.source, target), true);
};

function resolveRockjaw(state: GameState, rockjaw: GameCardInstance, target: GameCardInstance): GameState {
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) => state.zones[candidate].some((card) => card.instanceId === target.instanceId));
  if (!zone) return state;
  const controller = getCardController(target);
  const attachments = state.zones[zone].filter((card) => card.attachedToInstanceId === target.instanceId);
  const ids = new Set([target.instanceId, ...attachments.map((card) => card.instanceId), rockjaw.instanceId]);
  let next: GameState = {
    ...state,
    zones: {
      ...state.zones,
      staging: state.zones.staging.filter((card) => card.instanceId !== rockjaw.instanceId),
      [zone]: [
        prepareCardForZone(rockjaw, zone, { enterReady: true }),
        ...state.zones[zone].filter((card) => !ids.has(card.instanceId)),
      ],
    },
    opponentZones: {
      ...state.opponentZones,
      staging: state.opponentZones.staging.filter((card) => card.instanceId !== rockjaw.instanceId),
    },
  };
  next = setOwnerZone(next, controller, 'staging', [
    prepareCardForZone(target, 'staging', { enterExhausted: true }),
    ...attachments.map((card) => prepareCardForZone(card, 'staging', { attachToInstanceId: target.instanceId })),
    ...ownerZone(next, controller, 'staging'),
  ]);
  return next;
}

function retreatUnit(state: GameState, target: GameCardInstance): GameState {
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) => state.zones[candidate].some((card) => card.instanceId === target.instanceId));
  if (!zone) return state;
  const controller = getCardController(target);
  const attachments = state.zones[zone].filter((card) => card.attachedToInstanceId === target.instanceId);
  const ids = new Set([target.instanceId, ...attachments.map((card) => card.instanceId)]);
  const without = {
    ...state,
    zones: {
      ...state.zones,
      [zone]: state.zones[zone].filter((card) => !ids.has(card.instanceId)),
    },
  };
  return setOwnerZone(without, controller, 'staging', [
    prepareCardForZone(target, 'staging', { enterExhausted: true }),
    ...attachments.map((card) => prepareCardForZone(card, 'staging', { attachToInstanceId: target.instanceId })),
    ...ownerZone(without, controller, 'staging'),
  ]);
}

const varenthus: AbilityHandler = ({ state, event }) => {
  const sacrifices = getFriendlyUnitsInPlay(state, event.controller).filter((unit) => unit.instanceId !== event.source.instanceId);
  const enemies = BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).filter(
    (unit) => isUnitCard(unit.card) && getCardController(unit) !== event.controller
  );
  if (sacrifices.length === 0 || enemies.length === 0) return { state, resolved: false };
  if (event.controller === 'player') {
    return {
      state: choice(state, event, 'varenthusSacrifice', sacrifices, 'Choose any number of friendly units to sacrifice.', {
        optional: true,
        maxSelections: Math.min(sacrifices.length, enemies.length),
        contextInstanceIds: enemies.map((unit) => unit.instanceId),
      }),
      resolved: false,
    };
  }
  const removed = removeUnitFromPlay(state, sacrifices[0]!.instanceId);
  if ('error' in removed || enemies.length === 0) return { state, resolved: false };
  const destroyed = removeUnitFromPlay(removed.state, enemies[0]!.instanceId);
  return { state: 'error' in destroyed ? removed.state : destroyed.state, resolved: true };
};

const wyrmscarDragon: AbilityHandler = ({ state, event }) => {
  const targets = getUnitsInPlay(state).filter((unit) =>
    event.targets?.some((target) => target.type === 'card' && target.instanceId === unit.instanceId)
  );
  return targets[0] ? { state: damageUnit(state, targets[0], 2), resolved: true } : { state, resolved: false };
};

const zhufeng: AbilityHandler = ({ state, event }) => ({ state: readyUnitInPlay(state, event.source.instanceId), resolved: true });

const voraciousWyvern: AbilityHandler = ({ state, event }) => {
  if (state.activePlayer !== event.controller) return { state, resolved: false };
  const targets = BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    state.zones[zone]
      .filter((unit) => isUnitCard(unit.card) && getCardController(unit) !== event.controller)
      .map((unit) => ({ unit, zone }))
  );
  if (targets.length === 0) return { state, resolved: false };
  if (event.controller === 'player') {
    return {
      state: choice(state, event, 'wyvernAttack', targets.map(({ unit }) => unit), 'Choose an enemy-controlled combat zone for Voracious Wyvern to attack.'),
      resolved: false,
    };
  }
  const declared = declareBattlefieldAttack(state, event.controller, event.source.instanceId, targets[0]!.zone);
  return 'error' in declared ? { state, resolved: false } : { state: declared.state, resolved: true };
};

export function revealTopCardForSolara(state: GameState, owner: Owner, sourceName: string): GameState {
  const deck = ownerZone(state, owner, 'deck');
  const top = deck[0];
  if (!top) return state;
  let next = setOwnerZone(state, owner, 'deck', deck.slice(1));
  next = setOwnerZone(next, owner, 'hand', [
    { ...prepareCardForZone(top, 'hand'), solaraRevealedFromDeckUntilTurn: state.turn },
    ...ownerZone(next, owner, 'hand'),
  ]);
  return {
    ...next,
    log: addLogEntry(next, {
      suffix: `${sourceName} revealed ${top.card.name}; it may be played or used to extend supply this turn.`,
    }),
  };
}

function targetedDamage(effect: SolaraEffect, amount: number, combatOnly: boolean, enemyOnly = false): AbilityHandler {
  return ({ state, event }) => {
    const targets = getUnitsInPlay(state).filter((unit) =>
      (!combatOnly || BATTLEFIELD_ZONE_IDS.some((zone) => state.zones[zone].some((card) => card.instanceId === unit.instanceId))) &&
      (!enemyOnly || getCardController(unit) !== event.controller)
    );
    return chooseOrBot(state, event, effect, targets, `Choose a unit to deal ${amount} damage to.`, (current, target) => damageUnit(current, target, amount));
  };
}

const brand: AbilityHandler = ({ state, event }) => {
  const targets = getUnitsInPlay(state);
  return chooseOrBot(state, event, 'brandDamage', targets, 'Choose a unit to deal 1 damage to.', (current, target) =>
    damageUnit(updateCard(current, target.instanceId, (card) => ({
      ...card,
      gainVictoryPointOnDeathUntilTurn: state.turn,
      gainVictoryPointOnDeathOwner: event.controller,
    })), target, 1)
  );
};

function markUnitForDeath(state: GameState, target: GameCardInstance, sourceName: string): GameState {
  const marked = updateCard(state, target.instanceId, (card) => ({
    ...card,
    destroyOnNextDamageUntilTurn: state.turn,
  }));
  return {
    ...marked,
    log: addLogEntry(marked, {
      suffix: `${sourceName} marked ${target.card.name}; the next time it takes damage this turn, destroy it.`,
    }),
  };
}

const markOfDeath: AbilityHandler = ({ state, event }) => {
  const targets = BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).filter(
    (unit) => isUnitCard(unit.card) && getCardController(unit) !== event.controller
  );
  return chooseOrBot(state, event, 'markOfDeath', targets, 'Choose an enemy combat unit to mark for death.', (current, target) =>
    markUnitForDeath(current, target, event.source.card.name)
  );
};

const rocketBarrage = targetedDamage('rocketDamage', 3, true);

const ransack: AbilityHandler = ({ state, event }) => {
  const targets = [
    ...state.zones.staging,
    ...state.opponentZones.staging,
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
  ].filter((card) => isItemCard(card.card) || isTerritoryCard(card.card));
  return chooseOrBot(state, event, 'ransackDestroy', targets, 'Choose a territory or item to destroy.', destroyPermanent);
};

const lavaFlow: AbilityHandler = ({ state, event }) => {
  const targets = BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).filter(
    (card) => isTerritoryCard(card.card) && getCardController(card) === event.controller
  );
  return chooseOrBot(state, event, 'lavaSacrifice', targets, 'Choose a territory to sacrifice.', (current, target) => {
    let next = destroyPermanent(current, target);
    const stagingUnits = [...next.zones.staging, ...next.opponentZones.staging].filter((card) => isUnitCard(card.card));
    for (const unit of stagingUnits) next = damageUnit(next, unit, 2);
    return next;
  });
};

const uprising: AbilityHandler = ({ state, event }) => {
  const targets = getFriendlyUnitsInPlay(state, event.controller);
  return chooseOrBot(state, event, 'uprisingBuff', targets, 'Choose a friendly unit to get +2/+0 this turn.', (current, target) => {
    const buffed = updateCard(current, target.instanceId, (card) => ({
      ...card,
      temporaryAttackBonus: (card.temporaryAttackBonus ?? 0) + 2,
      temporaryStatsExpireAfterTurn: state.turn,
    }));
    const enemies = BATTLEFIELD_ZONE_IDS.flatMap((zone) => buffed.zones[zone]).filter(
      (unit) => isUnitCard(unit.card) && getCardController(unit) !== event.controller
    );
    return event.controller === 'player' && enemies.length > 0
      ? choice(buffed, event, 'uprisingExhaust', enemies, 'You may exhaust an enemy unit in a combat zone.', { optional: true })
      : enemies[0] ? updateCard(buffed, enemies[0].instanceId, (card) => ({ ...card, ready: false })) : buffed;
  });
};

const enrage: AbilityHandler = ({ state, event }) => {
  const targets = getFriendlyUnitsInPlay(state, event.controller);
  return chooseOrBot(state, event, 'enrageReady', targets, 'Choose a friendly unit to get +1/+0 and ready.', (current, target) =>
    readyUnitInPlay(updateCard(current, target.instanceId, (card) => ({
      ...card,
      temporaryAttackBonus: (card.temporaryAttackBonus ?? 0) + 1,
      temporaryStatsExpireAfterTurn: state.turn,
    })), target.instanceId)
  );
};

export function resolveSolaraTargetChoice(
  state: GameState,
  pending: SolaraChoice,
  selectedIds: string[]
): GameState | { error: string } {
  if (selectedIds.length === 0 && pending.optional) return { ...state, pendingChoice: null };
  const min = pending.minSelections ?? 1;
  const max = pending.maxSelections ?? 1;
  if (selectedIds.length < min || selectedIds.length > max || selectedIds.some((id) => !pending.availableInstanceIds.includes(id))) {
    return { error: min === max ? `Choose exactly ${min} valid card${min === 1 ? '' : 's'}.` : `Choose between ${min} and ${max} valid cards.` };
  }
  const selected = selectedIds.map((id) => getCardInstanceById(state, id)).filter((card): card is GameCardInstance => Boolean(card));
  if (selected.length !== selectedIds.length) return { error: 'One or more selected cards are no longer available.' };
  let next: GameState = { ...state, pendingChoice: null };
  switch (pending.effect) {
    case 'pillagerSupply':
      next = updateCard(next, selected[0]!.instanceId, (card) => ({ ...card, ready: false, skipNextReady: true }));
      break;
    case 'grantGlory':
      next = grantTemporaryGlory(next, selected[0]!, pending.sourceName);
      break;
    case 'lingyiBanish': {
      const target = selected[0]!;
      next = setOwnerZone(next, 'player', 'hand', next.zones.hand.filter((card) => card.instanceId !== target.instanceId));
      next = setOwnerZone(next, 'player', 'banish', [
        { ...prepareCardForZone(target, 'banish'), lingyiPlayableFromBanishOnce: true, lingyiGrantedBlitz: true },
        ...next.zones.banish,
      ]);
      break;
    }
    case 'rockjawRetreat': {
      const source = getCardInstanceById(next, pending.sourceInstanceId);
      if (source) next = resolveRockjaw(next, source, selected[0]!);
      break;
    }
    case 'brandDamage': {
      next = updateCard(next, selected[0]!.instanceId, (card) => ({ ...card, gainVictoryPointOnDeathUntilTurn: state.turn, gainVictoryPointOnDeathOwner: 'player' }));
      next = damageUnit(next, selected[0]!, 1);
      break;
    }
    case 'markOfDeath':
      next = markUnitForDeath(next, selected[0]!, pending.sourceName);
      break;
    case 'rocketDamage':
      next = damageUnit(next, selected[0]!, 3);
      break;
    case 'ransackDestroy':
      next = destroyPermanent(next, selected[0]!);
      break;
    case 'lavaSacrifice': {
      next = destroyPermanent(next, selected[0]!);
      const units = [...next.zones.staging, ...next.opponentZones.staging].filter((card) => isUnitCard(card.card));
      for (const unit of units) next = damageUnit(next, unit, 2);
      break;
    }
    case 'uprisingBuff': {
      next = updateCard(next, selected[0]!.instanceId, (card) => ({ ...card, temporaryAttackBonus: (card.temporaryAttackBonus ?? 0) + 2, temporaryStatsExpireAfterTurn: state.turn }));
      const enemies = (pending.contextInstanceIds ?? BATTLEFIELD_ZONE_IDS.flatMap((zone) => next.zones[zone]).map((card) => card.instanceId))
        .map((id) => getCardInstanceById(next, id))
        .filter((card): card is GameCardInstance => Boolean(card && isUnitCard(card.card) && getCardController(card) === 'opponent'));
      if (enemies.length > 0) {
        next = {
          ...next,
          pendingChoice: {
            kind: 'solaraTarget',
            owner: 'player',
            sourceInstanceId: pending.sourceInstanceId,
            sourceName: pending.sourceName,
            prompt: 'You may exhaust an enemy unit in a combat zone.',
            effect: 'uprisingExhaust',
            availableInstanceIds: enemies.map((card) => card.instanceId),
            optional: true,
          },
        };
      }
      break;
    }
    case 'uprisingExhaust':
      next = updateCard(next, selected[0]!.instanceId, (card) => ({ ...card, ready: false }));
      break;
    case 'enrageReady':
      next = readyUnitInPlay(updateCard(next, selected[0]!.instanceId, (card) => ({ ...card, temporaryAttackBonus: (card.temporaryAttackBonus ?? 0) + 1, temporaryStatsExpireAfterTurn: state.turn })), selected[0]!.instanceId);
      break;
    case 'vengeanceReturn':
      for (const target of selected) {
        const graveyard = ownerZone(next, target.owner, 'graveyard');
        if (!graveyard.some((card) => card.instanceId === target.instanceId)) continue;
        next = setOwnerZone(next, target.owner, 'graveyard', graveyard.filter((card) => card.instanceId !== target.instanceId));
        next = setOwnerZone(next, target.owner, 'hand', [prepareCardForZone(target, 'hand'), ...ownerZone(next, target.owner, 'hand')]);
      }
      break;
    case 'wyvernAttack': {
      const targetZone = BATTLEFIELD_ZONE_IDS.find((zone) =>
        next.zones[zone].some((card) => card.instanceId === selected[0]!.instanceId)
      );
      if (!targetZone) return { error: 'That combat zone is no longer controlled by the selected enemy unit.' };
      const declared = declareBattlefieldAttack(next, 'player', pending.sourceInstanceId, targetZone);
      if ('error' in declared) return declared;
      next = declared.state;
      break;
    }
    case 'varenthusSacrifice': {
      for (const unit of selected) {
        const removed = removeUnitFromPlay(next, unit.instanceId);
        if (!('error' in removed)) next = removed.state;
      }
      const enemies = (pending.contextInstanceIds ?? []).map((id) => getCardInstanceById(next, id)).filter((card): card is GameCardInstance => Boolean(card));
      if (enemies.length > 0) {
        const source = getCardInstanceById(next, pending.sourceInstanceId);
        if (source) next = choice(next, { trigger: 'onAttack', source, controller: 'player', zone: playZone(next, source.instanceId) }, 'varenthusDestroy', enemies, `Choose exactly ${selected.length} enemy combat unit${selected.length === 1 ? '' : 's'} to destroy.`, { minSelections: selected.length, maxSelections: selected.length });
      }
      break;
    }
    case 'varenthusDestroy':
      for (const unit of selected) {
        const removed = removeUnitFromPlay(next, unit.instanceId);
        if (!('error' in removed)) next = removed.state;
      }
      break;
    case 'peaksRetreat':
      next = exhaustSupplyForCost(next, 'player', 1);
      next = retreatUnit(next, selected[0]!);
      break;
  }
  return next;
}

export function applySolaraEndTurnAbilities(state: GameState, owner: Owner): GameState {
  const peak = BATTLEFIELD_ZONE_IDS.map((zone) => ({
    zone,
    card: state.zones[zone].find(
      (card) =>
        card.card.id === 'IMP126' &&
        !card.faceDown &&
        getCardController(card) === owner &&
        card.endTurnAbilityResolvedTurn !== state.turn
    ),
  })).find(({ card }) => card);
  if (!peak?.card || getReadySupplyCount(state, owner) < 1) return state;
  const targets = state.zones[peak.zone].filter(
    (card) => isUnitCard(card.card) && getCardController(card) === owner && card.card.cost <= 2
  );
  if (targets.length === 0) return state;
  const markedState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      [peak.zone]: state.zones[peak.zone].map((card) =>
        card.instanceId === peak.card!.instanceId ? { ...card, endTurnAbilityResolvedTurn: state.turn } : card
      ),
    },
  };
  if (owner === 'player') {
    return choice(markedState, { trigger: 'static', source: peak.card, controller: owner, zone: peak.zone }, 'peaksRetreat', targets, 'Pay 1 supply to force retreat a friendly unit costing 2 or less?', { optional: true, resumeTurnAdvance: true });
  }
  return retreatUnit(exhaustSupplyForCost(markedState, owner, 1), targets[0]!);
}

const acknowledgeRule: AbilityHandler = ({ state }) => ({ state, resolved: false });

export function createSolaraAbilityHandlers() {
  return {
    acknowledgeRule,
    ashfangPillager,
    ashfangRaider,
    brand,
    enrage,
    fearlessWhelp,
    firedancer,
    lavaFlow,
    lingyi,
    markOfDeath,
    ransack,
    rockjaw,
    rocketBarrage,
    uprising,
    varenthus,
    voraciousWyvern,
    wyrmscarDragon,
    zhufeng,
  };
}
