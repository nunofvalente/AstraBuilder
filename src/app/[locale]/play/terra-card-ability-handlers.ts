import type { AbilityEvent, AbilityHandler } from './card-abilities';
import {
  BATTLEFIELD_ZONE_IDS,
  addLogEntry,
  dealDamageToUnit,
  declareBattlefieldAttack,
  exhaustSupplyForCost,
  getCardController,
  getCardInstanceById,
  getCurrentUnitAttack,
  getFriendlyUnitsInPlay,
  getReadySupplyCount,
  getRenownedUnitLimitError,
  getUnitsInPlay,
  isTerritoryCard,
  isUnitCard,
  moveCardsToOwnerGraveyards,
  prepareCardForZone,
  readyUnitInPlay,
  recordCardsDrawn,
  shouldCardCeaseInZone,
  triggerCardAbilities,
  type GameCardInstance,
  type GameState,
  type Owner,
  type PendingChoice,
  type ZoneId,
} from './game-rules';

type TerraChoice = Extract<PendingChoice, { kind: 'terraTarget' }>;
type TerraZoneChoice = Extract<PendingChoice, { kind: 'terraZone' }>;
type TerraEffect = TerraChoice['effect'];

function privateZone(state: GameState, owner: Owner, zone: 'deck' | 'hand' | 'staging' | 'graveyard') {
  return owner === 'player' ? state.zones[zone] : state.opponentZones[zone];
}

function setPrivateZone(
  state: GameState,
  owner: Owner,
  zone: 'deck' | 'hand' | 'staging' | 'graveyard',
  cards: GameCardInstance[]
): GameState {
  return owner === 'player'
    ? { ...state, zones: { ...state.zones, [zone]: cards } }
    : { ...state, opponentZones: { ...state.opponentZones, [zone]: cards } };
}

function findZone(state: GameState, id: string): ZoneId | null {
  if (state.zones.staging.some((card) => card.instanceId === id)) return 'staging';
  if (state.opponentZones.staging.some((card) => card.instanceId === id)) return 'staging';
  return BATTLEFIELD_ZONE_IDS.find((zone) => state.zones[zone].some((card) => card.instanceId === id)) ?? null;
}

function updateInPlay(state: GameState, id: string, update: (card: GameCardInstance) => GameCardInstance): GameState {
  const map = (cards: GameCardInstance[]) => cards.map((card) => card.instanceId === id ? update(card) : card);
  return {
    ...state,
    zones: {
      ...state.zones,
      staging: map(state.zones.staging),
      battlefieldLeft: map(state.zones.battlefieldLeft),
      battlefieldCenter: map(state.zones.battlefieldCenter),
      battlefieldRight: map(state.zones.battlefieldRight),
    },
    opponentZones: { ...state.opponentZones, staging: map(state.opponentZones.staging) },
  };
}

function choice(
  state: GameState,
  event: AbilityEvent,
  effect: TerraEffect,
  targets: GameCardInstance[],
  prompt: string,
  options: Pick<TerraChoice, 'optional' | 'minSelections' | 'maxSelections' | 'contextInstanceIds' | 'effectAmount' | 'resumeTurnAdvance'> = {}
): GameState {
  return {
    ...state,
    pendingChoice: {
      kind: 'terraTarget',
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

function selected(event: AbilityEvent, targets: GameCardInstance[]) {
  const id = event.targets?.find((target) => target.type === 'card')?.instanceId;
  return id ? targets.find((target) => target.instanceId === id) ?? null : null;
}

function chooseTarget(
  state: GameState,
  event: AbilityEvent,
  effect: TerraEffect,
  targets: GameCardInstance[],
  prompt: string,
  apply: (state: GameState, target: GameCardInstance) => GameState,
  optional = false
) {
  if (targets.length === 0) return { state, resolved: false };
  const target = selected(event, targets);
  if (event.controller === 'player' && !target) {
    return { state: choice(state, event, effect, targets, prompt, { optional }), resolved: false };
  }
  return { state: apply(state, target ?? targets[0]!), resolved: true };
}

function retreat(state: GameState, unit: GameCardInstance): GameState {
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) => state.zones[candidate].some((card) => card.instanceId === unit.instanceId));
  if (!zone) {
    if (state.pendingCombat?.attackerInstanceId === unit.instanceId) {
      return updateInPlay(state, unit.instanceId, (card) => ({ ...card, ready: false, skipCurrentCombat: true }));
    }
    return state;
  }
  const owner = getCardController(unit);
  const attachments = state.zones[zone].filter((card) => card.attachedToInstanceId === unit.instanceId);
  const ids = new Set([unit.instanceId, ...attachments.map((card) => card.instanceId)]);
  const without = { ...state, zones: { ...state.zones, [zone]: state.zones[zone].filter((card) => !ids.has(card.instanceId)) } };
  const retreated = setPrivateZone(without, owner, 'staging', [
    prepareCardForZone(unit, 'staging', { enterExhausted: true }),
    ...attachments.map((card) => prepareCardForZone(card, 'staging', { attachToInstanceId: unit.instanceId })),
    ...privateZone(without, owner, 'staging'),
  ]);
  return applyOvergrownFactoryLeave(retreated, unit, zone);
}

function draw(state: GameState, owner: Owner, count: number): GameState {
  const deck = privateZone(state, owner, 'deck');
  const cards = deck.slice(0, count);
  let next = setPrivateZone(state, owner, 'deck', deck.slice(cards.length));
  next = setPrivateZone(next, owner, 'hand', [...privateZone(next, owner, 'hand'), ...cards]);
  return recordCardsDrawn(next, owner, cards.length);
}

function freePlayUnit(state: GameState, owner: Owner, card: GameCardInstance): GameState {
  let next = setPrivateZone(state, owner, 'hand', privateZone(state, owner, 'hand').filter((item) => item.instanceId !== card.instanceId));
  const staged = prepareCardForZone(card, 'staging');
  next = setPrivateZone(next, owner, 'staging', [staged, ...privateZone(next, owner, 'staging')]);
  next = triggerCardAbilities(next, 'onPlay', { source: staged, controller: owner, zone: 'staging' });
  return triggerCardAbilities(next, 'onEnter', { source: staged, controller: owner, zone: 'staging' });
}

function freePlayTerritory(state: GameState, owner: Owner, card: GameCardInstance, zone: ZoneId): GameState {
  const replaced = state.zones[zone].find((item) => isTerritoryCard(item.card) && item.owner === card.owner);
  let next = setPrivateZone(state, owner, 'hand', privateZone(state, owner, 'hand').filter((item) => item.instanceId !== card.instanceId));
  next = {
    ...next,
    zones: {
      ...next.zones,
      [zone]: [prepareCardForZone(card, zone), ...next.zones[zone].filter((item) => item.instanceId !== replaced?.instanceId)],
    },
  };
  if (replaced) next = moveCardsToOwnerGraveyards(next, [replaced]);
  next = triggerCardAbilities(next, 'onPlay', { source: card, controller: owner, zone });
  return triggerCardAbilities(next, 'onEnter', { source: card, controller: owner, zone });
}

const gaiaPlay: AbilityHandler = ({ state, event }) => {
  const targets = privateZone(state, event.controller, 'hand').filter(
    (card) =>
      isTerritoryCard(card.card) ||
      (isUnitCard(card.card) && !getRenownedUnitLimitError(state, event.controller, card))
  );
  return chooseTarget(state, event, 'gaiaFreePlay', targets, 'Choose a unit or territory to play for free.', (current, target) => {
    if (isUnitCard(target.card)) return freePlayUnit(current, event.controller, target);
    const zone = BATTLEFIELD_ZONE_IDS[0];
    return freePlayTerritory(current, event.controller, target, zone);
  }, true);
};

const gaiaDeath: AbilityHandler = ({ state, event }) => {
  const graveyard = privateZone(state, event.source.owner, 'graveyard');
  if (!graveyard.some((card) => card.instanceId === event.source.instanceId)) return { state, resolved: false };
  let next = setPrivateZone(state, event.source.owner, 'graveyard', graveyard.filter((card) => card.instanceId !== event.source.instanceId));
  next = setPrivateZone(next, event.source.owner, 'deck', [...privateZone(next, event.source.owner, 'deck'), prepareCardForZone(event.source, 'deck')]);
  return { state: next, resolved: true };
};

const groveShaman: AbilityHandler = ({ state, event }) => {
  const top = privateZone(state, event.controller, 'deck').slice(0, 3);
  const units = top.filter((card) => isUnitCard(card.card));
  if (units.length === 0) {
    const deck = privateZone(state, event.controller, 'deck');
    return { state: setPrivateZone(state, event.controller, 'deck', [...deck.slice(top.length), ...top]), resolved: true };
  }
  if (event.controller === 'player') return { state: choice(state, event, 'shamanUnit', units, 'Choose a unit from the top three cards to add to your hand.', { optional: true, contextInstanceIds: top.map((card) => card.instanceId) }), resolved: false };
  const picked = units[0]!;
  const deck = privateZone(state, event.controller, 'deck');
  let next = setPrivateZone(state, event.controller, 'deck', [...deck.slice(top.length), ...top.filter((card) => card.instanceId !== picked.instanceId)]);
  next = setPrivateZone(next, event.controller, 'hand', [picked, ...privateZone(next, event.controller, 'hand')]);
  return { state: next, resolved: true };
};

const kingBeneathCanopy: AbilityHandler = ({ state, event }) => {
  let next = state;
  for (const unit of BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).filter((card) => isUnitCard(card.card) && getCardController(card) !== event.controller)) {
    next = updateInPlay(next, unit.instanceId, (card) => ({ ...card, ready: false }));
  }
  return { state: next, resolved: true };
};

const ravenScore: AbilityHandler = ({ state, event }) => {
  const current = getCardInstanceById(state, event.source.instanceId);
  if (!current?.ready) return { state, resolved: false };
  return chooseTarget(state, event, 'ravenRetreat', [current], 'Retreat Raven Moonwhisper after scoring?', retreat, true);
};

const sunderingWyrm: AbilityHandler = ({ state, event }) =>
  chooseTarget(state, event, 'wyrmDamage', getUnitsInPlay(state), 'Choose a unit to deal 3 damage to.', (current, target) => dealDamageToUnit(current, target.instanceId, 3), true);

const sylvanRallier: AbilityHandler = ({ state, event }) => {
  const targets = getFriendlyUnitsInPlay(state, event.controller);
  const target = selected(event, targets);
  if (!target || (!event.costsPaid && (!event.source.ready || getReadySupplyCount(state, event.controller) < 1))) return { state, resolved: false };
  let next = event.costsPaid ? state : exhaustSupplyForCost(state, event.controller, 1);
  if (!event.costsPaid) {
    next = updateInPlay(next, event.source.instanceId, (card) => ({ ...card, ready: false }));
  }
  next = updateInPlay(next, target.instanceId, (card) => ({ ...card, temporaryAttackBonus: (card.temporaryAttackBonus ?? 0) + 1, temporaryStatsExpireAfterTurn: state.turn }));
  return { state: next, resolved: true };
};

const yakoIllusionist: AbilityHandler = ({ state, event }) => {
  const owner: Owner = event.controller === 'player' ? 'opponent' : 'player';
  const targets = privateZone(state, owner, 'staging').filter((card) => isUnitCard(card.card));
  if (targets.length === 0) return { state, resolved: false };
  if (event.controller === 'player') {
    return { state: choice(state, event, 'illusionistUnit', targets, 'Choose an enemy staging unit to ready and force to attack.'), resolved: false };
  }
  const target = targets[0]!;
  const readied = readyUnitInPlay(state, target.instanceId);
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) =>
    !readied.zones[candidate].some((card) => isUnitCard(card.card) && getCardController(card) === getCardController(target))
  );
  if (!zone) return { state: readied, resolved: true };
  const attacked = forcedAttack(readied, target, zone);
  return 'error' in attacked ? { state: readied, resolved: true } : { state: attacked, resolved: true };
};

const coordinatedStrike: AbilityHandler = ({ state, event }) => {
  const targets = getFriendlyUnitsInPlay(state, event.controller).filter((unit) => unit.ready);
  if (targets.length < 2) return { state, resolved: false };
  if (event.controller === 'player') return { state: choice(state, event, 'coordinatedExhaust', targets, 'Choose exactly two friendly units to exhaust.', { minSelections: 2, maxSelections: 2 }), resolved: false };
  const picked = targets.slice(0, 2);
  let next = state;
  for (const unit of picked) next = updateInPlay(next, unit.instanceId, (card) => ({ ...card, ready: false }));
  const victim = BATTLEFIELD_ZONE_IDS.flatMap((zone) => next.zones[zone]).find((unit) => isUnitCard(unit.card));
  const amount = picked.reduce((sum, unit) => sum + getCurrentUnitAttack(state, unit), 0);
  return { state: victim ? dealDamageToUnit(next, victim.instanceId, amount) : next, resolved: Boolean(victim) };
};

const predatoryStrike: AbilityHandler = ({ state, event }) => {
  const allies = getFriendlyUnitsInPlay(state, event.controller);
  if (allies.length === 0) return { state, resolved: false };
  if (event.controller === 'player') {
    return { state: choice(state, event, 'predatoryBuff', allies, 'Choose a friendly unit to get +2/+0.'), resolved: false };
  }
  const ally = allies[0]!;
  const buffed = updateInPlay(state, ally.instanceId, (card) => ({ ...card, temporaryAttackBonus: (card.temporaryAttackBonus ?? 0) + 2, temporaryStatsExpireAfterTurn: state.turn }));
  const current = getCardInstanceById(buffed, ally.instanceId)!;
  const victim = BATTLEFIELD_ZONE_IDS.flatMap((zone) => buffed.zones[zone]).find(
    (unit) => isUnitCard(unit.card) && !unit.ready
  );
  return { state: victim ? dealDamageToUnit(buffed, victim.instanceId, getCurrentUnitAttack(buffed, current)) : buffed, resolved: true };
};

const primordialHowl: AbilityHandler = ({ state, event }) => {
  let next = state;
  for (const unit of BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).filter((card) => isUnitCard(card.card) && getCardController(card) !== event.controller)) {
    next = updateInPlay(next, unit.instanceId, (card) => ({ ...card, ready: false }));
  }
  return { state: next, resolved: true };
};

const sporeBloom: AbilityHandler = ({ state, event }) =>
  chooseTarget(state, event, 'sporeExhaust', getUnitsInPlay(state).filter((unit) => getCardController(unit) !== event.controller), 'Choose an enemy unit to exhaust and lock.', (current, target) =>
    updateInPlay(current, target.instanceId, (card) => ({ ...card, ready: false, skipNextReady: true }))
  );

const shadowveilHunter: AbilityHandler = ({ state, event }) =>
  chooseTarget(
    state,
    event,
    'shadowveilDamage',
    [
      ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
      ...(state.pendingCombat
        ? [getCardInstanceById(state, state.pendingCombat.attackerInstanceId)].filter((card): card is GameCardInstance => Boolean(card))
        : []),
    ].filter(
      (unit) => isUnitCard(unit.card) && getCardController(unit) !== event.controller
    ),
    'Choose an enemy combat unit to deal 1 damage to.',
    (current, target) => dealDamageToUnit(current, target.instanceId, 1)
  );

const canopyAmbush: AbilityHandler = ({ state, event }) => {
  let next = state;
  const pendingAttacker = state.pendingCombat
    ? getCardInstanceById(state, state.pendingCombat.attackerInstanceId)
    : null;
  const targets = [
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
    ...(pendingAttacker ? [pendingAttacker] : []),
  ].filter((card) => isUnitCard(card.card) && getCardController(card) === event.controller);
  for (const unit of targets) {
    next = updateInPlay(next, unit.instanceId, (card) => ({ ...card, temporaryAttackBonus: (card.temporaryAttackBonus ?? 0) + 2, temporaryStatsExpireAfterTurn: state.turn }));
  }
  return { state: next, resolved: true };
};

const lastStand: AbilityHandler = ({ state, event }) =>
  chooseTarget(state, event, 'lastStand', [
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
    ...(state.pendingCombat ? [getCardInstanceById(state, state.pendingCombat.attackerInstanceId)].filter((card): card is GameCardInstance => Boolean(card)) : []),
  ].filter((unit) => isUnitCard(unit.card) && getCardController(unit) === event.controller), 'Choose a friendly combat unit for Last Stand.', (current, target) =>
    readyUnitInPlay(updateInPlay(current, target.instanceId, (card) => ({
      ...card,
      terraLastStandAttackBonus: 2,
      terraLastStandHealthBonus: 1,
      terraLastStandExpiresAtStartOfOwner: event.controller,
    })), target.instanceId)
  );

const swiftAcrobatics: AbilityHandler = ({ state, event }) =>
  chooseTarget(state, event, 'swiftRetreat', [
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
    ...(state.pendingCombat ? [getCardInstanceById(state, state.pendingCombat.attackerInstanceId)].filter((card): card is GameCardInstance => Boolean(card)) : []),
  ].filter((unit) => isUnitCard(unit.card) && getCardController(unit) === event.controller), 'Choose a friendly combat unit to retreat.', retreat);

function forcedAttack(state: GameState, unit: GameCardInstance, zone: ZoneId): GameState | { error: string } {
  const originalActive = state.activePlayer;
  const declared = declareBattlefieldAttack({ ...state, activePlayer: getCardController(unit) }, getCardController(unit), unit.instanceId, zone);
  return 'error' in declared ? declared : { ...declared.state, activePlayer: originalActive };
}

export function resolveTerraTargetChoice(state: GameState, pending: TerraChoice, ids: string[]): GameState | { error: string } {
  if (ids.length === 0 && pending.optional) {
    if (pending.effect === 'shamanUnit') {
      const topIds = new Set(pending.contextInstanceIds ?? []);
      const top = state.zones.deck.filter((card) => topIds.has(card.instanceId));
      return {
        ...state,
        pendingChoice: null,
        zones: {
          ...state.zones,
          deck: [...state.zones.deck.filter((card) => !topIds.has(card.instanceId)), ...top],
        },
      };
    }
    if (pending.effect === 'escapeRoutePay') {
      const route = getCardInstanceById(state, pending.sourceInstanceId);
      const zone = route ? BATTLEFIELD_ZONE_IDS.find((candidate) => state.zones[candidate].some((card) => card.instanceId === route.instanceId)) : null;
      if (!route || !zone) return { ...state, pendingChoice: null };
      const without = { ...state, pendingChoice: null, zones: { ...state.zones, [zone]: state.zones[zone].filter((card) => card.instanceId !== route.instanceId) } };
      const sacrificed = moveCardsToOwnerGraveyards(without, [route]);
      return {
        ...sacrificed,
        log: addLogEntry(sacrificed, {
          prefix: 'You sacrificed ',
          cardName: route.card.name,
          suffix: ' instead of paying 2 supply.',
        }),
      };
    }
    return { ...state, pendingChoice: null };
  }
  const min = pending.minSelections ?? 1;
  const max = pending.maxSelections ?? 1;
  if (ids.length < min || ids.length > max || ids.some((id) => !pending.availableInstanceIds.includes(id))) return { error: 'Choose valid cards.' };
  const cards = ids.map((id) => getCardInstanceById(state, id)).filter((card): card is GameCardInstance => Boolean(card));
  if (cards.length !== ids.length) return { error: 'One or more cards are no longer available.' };
  let next: GameState = { ...state, pendingChoice: null };
  switch (pending.effect) {
    case 'gaiaFreePlay': {
      const card = cards[0]!;
      if (isUnitCard(card.card)) next = freePlayUnit(next, 'player', card);
      else {
        next = { ...next, pendingChoice: { kind: 'terraZone', owner: 'player', sourceInstanceId: card.instanceId, sourceName: pending.sourceName, prompt: 'Choose a combat zone for the free territory.', effect: 'gaiaTerritory', availableZoneIds: [...BATTLEFIELD_ZONE_IDS] } };
      }
      break;
    }
    case 'shamanUnit': {
      const topIds = new Set(pending.contextInstanceIds ?? []);
      const top = state.zones.deck.filter((card) => topIds.has(card.instanceId));
      const picked = cards[0]!;
      next = { ...next, zones: { ...next.zones, deck: [...state.zones.deck.filter((card) => !topIds.has(card.instanceId)), ...top.filter((card) => card.instanceId !== picked.instanceId)], hand: [picked, ...next.zones.hand] } };
      break;
    }
    case 'ravenRetreat':
      next = retreat(next, cards[0]!);
      break;
    case 'swiftRetreat':
      next = retreat(next, cards[0]!);
      next = {
        ...next,
        log: addLogEntry(next, {
          prefix: `${pending.sourceName} selected `,
          cardName: cards[0]!.card.name,
          suffix: ' to retreat.',
        }),
      };
      break;
    case 'rallierBuff':
      next = updateInPlay(exhaustSupplyForCost(next, 'player', 1), pending.sourceInstanceId, (card) => ({ ...card, ready: false }));
      next = updateInPlay(next, cards[0]!.instanceId, (card) => ({ ...card, temporaryAttackBonus: (card.temporaryAttackBonus ?? 0) + 1, temporaryStatsExpireAfterTurn: state.turn }));
      break;
    case 'wyrmDamage':
      next = dealDamageToUnit(next, cards[0]!.instanceId, 3);
      break;
    case 'illusionistUnit': {
      next = readyUnitInPlay(next, cards[0]!.instanceId);
      next = { ...next, pendingChoice: { kind: 'terraZone', owner: 'player', sourceInstanceId: pending.sourceInstanceId, sourceName: pending.sourceName, prompt: 'Choose a combat zone for the forced attack.', effect: 'illusionistAttack', availableZoneIds: [...BATTLEFIELD_ZONE_IDS], contextInstanceIds: [cards[0]!.instanceId] } };
      break;
    }
    case 'coordinatedExhaust': {
      const amount = cards.reduce((sum, card) => sum + getCurrentUnitAttack(next, card), 0);
      for (const card of cards) next = updateInPlay(next, card.instanceId, (unit) => ({ ...unit, ready: false }));
      const victims = BATTLEFIELD_ZONE_IDS.flatMap((zone) => next.zones[zone]).filter((unit) => isUnitCard(unit.card));
      next = { ...next, pendingChoice: { kind: 'terraTarget', owner: 'player', sourceInstanceId: pending.sourceInstanceId, sourceName: pending.sourceName, prompt: `Choose a combat unit to deal ${amount} damage to.`, effect: 'coordinatedDamage', availableInstanceIds: victims.map((unit) => unit.instanceId), effectAmount: amount } };
      break;
    }
    case 'coordinatedDamage':
      next = dealDamageToUnit(next, cards[0]!.instanceId, pending.effectAmount ?? 0);
      break;
    case 'predatoryBuff': {
      next = updateInPlay(next, cards[0]!.instanceId, (card) => ({ ...card, temporaryAttackBonus: (card.temporaryAttackBonus ?? 0) + 2, temporaryStatsExpireAfterTurn: state.turn }));
      const current = getCardInstanceById(next, cards[0]!.instanceId)!;
      const victims = BATTLEFIELD_ZONE_IDS.flatMap((zone) => next.zones[zone]).filter((unit) => isUnitCard(unit.card) && !unit.ready);
      if (victims.length > 0) {
        next = { ...next, pendingChoice: { kind: 'terraTarget', owner: 'player', sourceInstanceId: pending.sourceInstanceId, sourceName: pending.sourceName, prompt: `Choose an exhausted combat unit to deal ${getCurrentUnitAttack(next, current)} damage to.`, effect: 'predatoryDamage', availableInstanceIds: victims.map((unit) => unit.instanceId), effectAmount: getCurrentUnitAttack(next, current) } };
      }
      break;
    }
    case 'predatoryDamage':
      next = dealDamageToUnit(next, cards[0]!.instanceId, pending.effectAmount ?? 0);
      break;
    case 'sporeExhaust':
      next = updateInPlay(next, cards[0]!.instanceId, (card) => ({ ...card, ready: false, skipNextReady: true }));
      break;
    case 'shadowveilDamage':
      next = dealDamageToUnit(next, cards[0]!.instanceId, 1);
      break;
    case 'lastStand':
      next = readyUnitInPlay(updateInPlay(next, cards[0]!.instanceId, (card) => ({ ...card, terraLastStandAttackBonus: 2, terraLastStandHealthBonus: 1, terraLastStandExpiresAtStartOfOwner: 'player' })), cards[0]!.instanceId);
      break;
    case 'katanaReturn': {
      const card = cards[0]!;
      next = setPrivateZone(next, card.owner, 'graveyard', privateZone(next, card.owner, 'graveyard').filter((item) => item.instanceId !== card.instanceId));
      if (!shouldCardCeaseInZone(card, 'deck')) {
        next = setPrivateZone(next, card.owner, 'deck', [prepareCardForZone(card, 'deck'), ...privateZone(next, card.owner, 'deck')]);
      }
      break;
    }
    case 'escapeRoutePay':
      next = exhaustSupplyForCost(next, 'player', 2);
      next = {
        ...next,
        log: addLogEntry(next, {
          prefix: 'You paid 2 supply to keep ',
          cardName: pending.sourceName,
          suffix: '.',
        }),
      };
      break;
    case 'factoryDraw': {
      next = exhaustSupplyForCost(next, 'player', 1);
      next = updateInPlay(next, cards[0]!.instanceId, (card) => ({ ...card, overgrownFactoryUsedTurn: state.turn }));
      next = draw(next, 'player', 1);
      break;
    }
  }
  return next;
}

export function resolveTerraZoneChoice(state: GameState, pending: TerraZoneChoice, ids: string[]): GameState | { error: string } {
  const zone = ids[0] as ZoneId | undefined;
  if (!zone || !pending.availableZoneIds.includes(zone)) return { error: 'Choose a valid combat zone.' };
  let next: GameState = { ...state, pendingChoice: null };
  if (pending.effect === 'gaiaTerritory') {
    const card = state.zones.hand.find((item) => item.instanceId === pending.sourceInstanceId);
    return card ? freePlayTerritory(next, 'player', card, zone) : { error: 'That territory is no longer in hand.' };
  }
  const unit = getCardInstanceById(next, pending.contextInstanceIds?.[0] ?? '');
  return unit ? forcedAttack(next, unit, zone) : { error: 'That forced attacker is no longer available.' };
}

export function applyTerraEndTurnAbilities(state: GameState, owner: Owner): GameState {
  let next = state;
  for (const zone of BATTLEFIELD_ZONE_IDS) {
    const wilds = next.zones[zone].find((card) => card.card.id === 'IMP156' && !card.faceDown);
    const unit = next.zones[zone].find((card) => isUnitCard(card.card));
    if (wilds && unit && unit.ready && getCardController(unit) !== getCardController(wilds)) {
      next = updateInPlay(next, unit.instanceId, (card) => ({ ...card, ready: false }));
      next = {
        ...next,
        log: addLogEntry(next, {
          cardName: wilds.card.name,
          suffix: ` exhausted ${unit.card.name} at the end of the turn.`,
        }),
      };
    }
  }
  const routeEntry = BATTLEFIELD_ZONE_IDS.map((zone) => ({
    zone,
    card: next.zones[zone].find((card) => card.card.id === 'IMP157' && !card.faceDown && getCardController(card) === owner && card.endTurnAbilityResolvedTurn !== state.turn),
  })).find(({ card }) => card);
  if (!routeEntry?.card) return next;
  next = { ...next, zones: { ...next.zones, [routeEntry.zone]: next.zones[routeEntry.zone].map((card) => card.instanceId === routeEntry.card!.instanceId ? { ...card, endTurnAbilityResolvedTurn: state.turn } : card) } };
  if (owner === 'player' && getReadySupplyCount(next, owner) >= 2) {
    return {
      ...next,
      pendingChoice: {
        kind: 'terraTarget',
        owner: 'player',
        sourceInstanceId: routeEntry.card.instanceId,
        sourceName: routeEntry.card.card.name,
        prompt: 'Pay 2 supply to keep Escape Route? Decline to sacrifice it.',
        effect: 'escapeRoutePay',
        availableInstanceIds: [routeEntry.card.instanceId],
        optional: true,
        resumeTurnAdvance: true,
      },
    };
  }
  if (owner === 'opponent' && getReadySupplyCount(next, owner) >= 2) {
    const paid = exhaustSupplyForCost(next, owner, 2);
    return {
      ...paid,
      log: addLogEntry(paid, {
        prefix: 'Bot paid 2 supply to keep ',
        cardName: routeEntry.card.card.name,
        suffix: '.',
      }),
    };
  }
  const without = { ...next, zones: { ...next.zones, [routeEntry.zone]: next.zones[routeEntry.zone].filter((card) => card.instanceId !== routeEntry.card!.instanceId) } };
  const sacrificed = moveCardsToOwnerGraveyards(without, [routeEntry.card]);
  return {
    ...sacrificed,
    log: addLogEntry(sacrificed, {
      prefix: owner === 'player' ? 'You sacrificed ' : 'Bot sacrificed ',
      cardName: routeEntry.card.card.name,
      suffix: ' because there was not enough ready supply to pay 2.',
    }),
  };
}

export function applyOvergrownFactoryLeave(
  state: GameState,
  unit: GameCardInstance,
  sourceZone: ZoneId
): GameState {
  if (!BATTLEFIELD_ZONE_IDS.includes(sourceZone as (typeof BATTLEFIELD_ZONE_IDS)[number])) return state;
  const owner = getCardController(unit);
  const factory = state.zones[sourceZone].find(
    (card) =>
      card.card.id === 'IMP158' &&
      !card.faceDown &&
      getCardController(card) === owner &&
      card.overgrownFactoryUsedTurn !== state.turn
  );
  if (!factory || getReadySupplyCount(state, owner) < 1) return state;
  if (owner === 'player') {
    return {
      ...state,
      pendingChoice: {
        kind: 'terraTarget',
        owner: 'player',
        sourceInstanceId: factory.instanceId,
        sourceName: factory.card.name,
        prompt: 'Pay 1 supply to draw a card from Overgrown Factory?',
        effect: 'factoryDraw',
        availableInstanceIds: [factory.instanceId],
        optional: true,
      },
    };
  }
  let next = exhaustSupplyForCost(state, owner, 1);
  next = updateInPlay(next, factory.instanceId, (card) => ({ ...card, overgrownFactoryUsedTurn: state.turn }));
  return draw(next, owner, 1);
}

const acknowledgeRule: AbilityHandler = ({ state }) => ({ state, resolved: false });

export function createTerraAbilityHandlers() {
  return {
    acknowledgeRule,
    canopyAmbush,
    coordinatedStrike,
    gaiaDeath,
    gaiaPlay,
    groveShaman,
    kingBeneathCanopy,
    lastStand,
    predatoryStrike,
    primordialHowl,
    ravenScore,
    shadowveilHunter,
    sporeBloom,
    sunderingWyrm,
    swiftAcrobatics,
    sylvanRallier,
    yakoIllusionist,
  };
}
