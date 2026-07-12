import type {
  AbilityContext,
  AbilityEvent,
  AbilityHandler,
  AbilityResolution,
} from './card-abilities';
import {
  BATTLEFIELD_ZONE_IDS,
  dealDamageToUnit,
  addLogEntry,
  adjustVictoryPoints,
  exhaustSupplyForCost,
  getCardController,
  getCurrentUnitHealth,
  getFriendlyUnitsInPlay,
  getReadySupplyCount,
  getZoneLogLabel,
  getUnitsInPlay,
  isItemCard,
  isTacticCard,
  isTerritoryCard,
  isUnitCard,
  moveCardsToOwnerGraveyards,
  prepareCardForZone,
  readyUnitInPlay,
  recordCardsDrawn,
  removeUnitFromPlay,
  shouldCardCeaseInZone,
  triggerCardAbilities,
  type GameCardInstance,
  type GameState,
  type Owner,
  type PendingChoice,
  type ZoneId,
} from './game-rules';

type CaelumChoice = Extract<PendingChoice, { kind: 'caelumTarget' }>;
type CaelumZoneChoice = Extract<PendingChoice, { kind: 'caelumZone' }>;
type CaelumEffect = CaelumChoice['effect'];

function getOwnerPrivateZone(state: GameState, owner: Owner, zone: 'deck' | 'hand' | 'staging' | 'supply' | 'graveyard' | 'banish') {
  return owner === 'player' ? state.zones[zone] : state.opponentZones[zone];
}

function setOwnerPrivateZone(
  state: GameState,
  owner: Owner,
  zone: 'deck' | 'hand' | 'staging' | 'supply' | 'graveyard' | 'banish',
  cards: GameCardInstance[]
): GameState {
  return owner === 'player'
    ? { ...state, zones: { ...state.zones, [zone]: cards } }
    : { ...state, opponentZones: { ...state.opponentZones, [zone]: cards } };
}

function findCardInstance(state: GameState, instanceId: string): GameCardInstance | null {
  return [
    ...Object.values(state.zones).flat(),
    ...Object.values(state.opponentZones).flat(),
  ].find((instance) => instance.instanceId === instanceId) ?? null;
}

function findPlayZone(state: GameState, instanceId: string): ZoneId | null {
  if (state.zones.staging.some((instance) => instance.instanceId === instanceId)) return 'staging';
  if (state.opponentZones.staging.some((instance) => instance.instanceId === instanceId)) return 'staging';
  return BATTLEFIELD_ZONE_IDS.find((zone) =>
    state.zones[zone].some((instance) => instance.instanceId === instanceId)
  ) ?? null;
}

function findBattlefieldZone(state: GameState, instanceId: string): ZoneId | null {
  return BATTLEFIELD_ZONE_IDS.find((zone) =>
    state.zones[zone].some((instance) => instance.instanceId === instanceId)
  ) ?? null;
}

function updateCardInPlay(
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

function drawCards(state: GameState, owner: Owner, count: number, sourceName: string): GameState {
  const deck = getOwnerPrivateZone(state, owner, 'deck');
  const drawn = deck.slice(0, count);
  let nextState = setOwnerPrivateZone(state, owner, 'deck', deck.slice(drawn.length));
  nextState = setOwnerPrivateZone(nextState, owner, 'hand', [...getOwnerPrivateZone(nextState, owner, 'hand'), ...drawn]);
  return {
    ...recordCardsDrawn(nextState, owner, drawn.length),
    log: addLogEntry(nextState, {
      suffix: `${sourceName} drew ${drawn.length} ${drawn.length === 1 ? 'card' : 'cards'}${owner === 'opponent' ? ' for Bot' : ''}.`,
    }),
  };
}

function discardCard(state: GameState, owner: Owner, card: GameCardInstance): GameState {
  const afterHand = setOwnerPrivateZone(
    state,
    owner,
    'hand',
    getOwnerPrivateZone(state, owner, 'hand').filter((instance) => instance.instanceId !== card.instanceId)
  );
  return setOwnerPrivateZone(
    afterHand,
    card.owner,
    'graveyard',
    [prepareCardForZone(card, 'graveyard'), ...getOwnerPrivateZone(afterHand, card.owner, 'graveyard')]
  );
}

function createPlayerChoice(
  state: GameState,
  event: AbilityEvent,
  effect: CaelumEffect,
  targets: GameCardInstance[],
  prompt: string,
  options: Pick<CaelumChoice, 'optional' | 'contextInstanceIds' | 'resumeTurnAdvance'> = {}
): GameState {
  return {
    ...state,
    pendingChoice: {
      kind: 'caelumTarget',
      owner: 'player',
      sourceInstanceId: event.source.instanceId,
      sourceName: event.source.card.name,
      prompt,
      effect,
      availableInstanceIds: targets.map((target) => target.instanceId),
      ...options,
    },
  };
}

function selectedEventTarget(event: AbilityEvent, targets: GameCardInstance[]): GameCardInstance | null {
  const selectedId = event.targets?.find((target) => target.type === 'card')?.instanceId;
  return selectedId ? targets.find((target) => target.instanceId === selectedId) ?? null : null;
}

function isDroneOrVehicle(card: GameCardInstance): boolean {
  const subtype = card.card.subtype.trim().toLowerCase();
  return subtype.includes('drone') || subtype.includes('vehicle');
}

function removeCardToHand(state: GameState, target: GameCardInstance): GameState {
  const zone = findPlayZone(state, target.instanceId);
  if (!zone) return state;
  const controller = getCardController(target);
  const zoneCards = zone === 'staging' ? getOwnerPrivateZone(state, controller, 'staging') : state.zones[zone];
  const attachments = isUnitCard(target.card) ? zoneCards.filter((card) => card.attachedToInstanceId === target.instanceId) : [];
  const removedIds = new Set([target.instanceId, ...attachments.map((card) => card.instanceId)]);
  let nextState = zone === 'staging'
    ? setOwnerPrivateZone(state, controller, 'staging', zoneCards.filter((card) => !removedIds.has(card.instanceId)))
    : { ...state, zones: { ...state.zones, [zone]: zoneCards.filter((card) => !removedIds.has(card.instanceId)) } };
  if (!shouldCardCeaseInZone(target, 'hand')) {
    nextState = setOwnerPrivateZone(nextState, target.owner, 'hand', [
      prepareCardForZone(target, 'hand'),
      ...getOwnerPrivateZone(nextState, target.owner, 'hand'),
    ]);
  }
  for (const attachment of attachments) {
    nextState = setOwnerPrivateZone(nextState, attachment.owner, 'graveyard', [
      prepareCardForZone(attachment, 'graveyard'),
      ...getOwnerPrivateZone(nextState, attachment.owner, 'graveyard'),
    ]);
  }
  return nextState;
}

function sacrificeTerritory(state: GameState, territory: GameCardInstance): GameState {
  const zone = findBattlefieldZone(state, territory.instanceId);
  if (!zone) return state;
  let nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      [zone]: state.zones[zone].filter((card) => card.instanceId !== territory.instanceId),
    },
  };
  nextState = setOwnerPrivateZone(nextState, territory.owner, 'graveyard', [
    prepareCardForZone(territory, 'graveyard'),
    ...getOwnerPrivateZone(nextState, territory.owner, 'graveyard'),
  ]);
  return nextState;
}

function sweepUnyieldingStormZone(state: GameState, storm: GameCardInstance): GameState {
  const zone = findBattlefieldZone(state, storm.instanceId);
  if (!zone) return state;
  const stormController = getCardController(storm);
  const zoneCards = state.zones[zone];
  const units = zoneCards.filter((card) => isUnitCard(card.card));
  const enemyTerritories = zoneCards.filter(
    (card) => isTerritoryCard(card.card) && card.instanceId !== storm.instanceId && getCardController(card) !== stormController
  );
  let nextState = state;
  for (const unit of units) {
    nextState = removeCardToHand(nextState, unit);
  }
  for (const territory of enemyTerritories) {
    nextState = removeCardToHand(nextState, territory);
  }
  return sacrificeTerritory(nextState, storm);
}

function moveUnyieldingStormToZone(state: GameState, storm: GameCardInstance, targetZone: ZoneId): GameState | { error: string } {
  if (!BATTLEFIELD_ZONE_IDS.some((zone) => zone === targetZone)) return { error: 'Choose a valid battlefield.' };
  const zone = findBattlefieldZone(state, storm.instanceId);
  if (!zone) return { error: 'Unyielding Storm is no longer in a battlefield.' };
  if (zone === targetZone) return { error: 'Choose a different battlefield.' };
  if (!state.zones[zone].some((card) => card.instanceId === storm.instanceId)) {
    return { error: 'Unyielding Storm is no longer available.' };
  }
  return {
    ...state,
    zones: {
      ...state.zones,
      [zone]: state.zones[zone].filter((card) => card.instanceId !== storm.instanceId),
      [targetZone]: [
        prepareCardForZone({ ...storm, startTurnAbilityResolvedTurn: state.turn }, targetZone),
        ...state.zones[targetZone],
      ],
    },
    log: addLogEntry(state, {
      suffix: `${storm.card.name} moved to ${getZoneLogLabel(targetZone)}.`,
    }),
  };
}

function logAbilityOutcome(state: GameState, sourceName: string, message: string): GameState {
  return {
    ...state,
    log: addLogEntry(state, {
      suffix: `${sourceName}: ${message}`,
    }),
  };
}

function placeFreightModuleIntoSupply(state: GameState, freightModule: GameCardInstance): GameState | { error: string } {
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) =>
    state.zones[candidate].some((card) => card.instanceId === freightModule.instanceId)
  );
  if (!zone) return { error: 'Freight Module is no longer in a combat zone.' };
  const prepared = { ...prepareCardForZone(freightModule, 'supply'), ready: false };
  const nextState = {
    ...state,
    zones: {
      ...state.zones,
      [zone]: state.zones[zone].filter((card) => card.instanceId !== freightModule.instanceId),
    },
  };
  return setOwnerPrivateZone(nextState, freightModule.owner, 'supply', [
    prepared,
    ...getOwnerPrivateZone(nextState, freightModule.owner, 'supply'),
  ]);
}

function putUnitOnTopOfDeck(state: GameState, target: GameCardInstance): GameState {
  const zone = findPlayZone(state, target.instanceId);
  if (!zone) return state;
  const controller = getCardController(target);
  const zoneCards = zone === 'staging' ? getOwnerPrivateZone(state, controller, 'staging') : state.zones[zone];
  const attachments = zoneCards.filter((card) => card.attachedToInstanceId === target.instanceId);
  const removedIds = new Set([target.instanceId, ...attachments.map((card) => card.instanceId)]);
  let nextState = zone === 'staging'
    ? setOwnerPrivateZone(state, controller, 'staging', zoneCards.filter((card) => !removedIds.has(card.instanceId)))
    : { ...state, zones: { ...state.zones, [zone]: zoneCards.filter((card) => !removedIds.has(card.instanceId)) } };
  if (!shouldCardCeaseInZone(target, 'deck')) {
    nextState = setOwnerPrivateZone(nextState, target.owner, 'deck', [
      prepareCardForZone(target, 'deck'),
      ...getOwnerPrivateZone(nextState, target.owner, 'deck'),
    ]);
  }
  for (const attachment of attachments) {
    nextState = setOwnerPrivateZone(nextState, attachment.owner, 'graveyard', [
      prepareCardForZone(attachment, 'graveyard'),
      ...getOwnerPrivateZone(nextState, attachment.owner, 'graveyard'),
    ]);
  }
  return nextState;
}

function forceRetreatUnit(state: GameState, target: GameCardInstance): GameState {
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) =>
    state.zones[candidate].some((card) => card.instanceId === target.instanceId)
  );
  if (!zone) return state;
  const zoneCards = state.zones[zone];
  const attachments = zoneCards.filter((card) => card.attachedToInstanceId === target.instanceId);
  const removedIds = new Set([target.instanceId, ...attachments.map((card) => card.instanceId)]);
  let nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      [zone]: zoneCards.filter((card) => !removedIds.has(card.instanceId)),
    },
  };
  const controller = getCardController(target);
  nextState = setOwnerPrivateZone(nextState, controller, 'staging', [
    prepareCardForZone(target, 'staging', { enterExhausted: true }),
    ...attachments.map((attachment) => prepareCardForZone(attachment, 'staging', { attachToInstanceId: target.instanceId })),
    ...getOwnerPrivateZone(nextState, controller, 'staging'),
  ]);
  const retreatedUnit = getOwnerPrivateZone(nextState, controller, 'staging').find(
    (card) => card.instanceId === target.instanceId
  );
  return retreatedUnit
    ? triggerCardAbilities(nextState, 'onRetreat', {
        source: retreatedUnit,
        controller,
        zone,
      })
    : nextState;
}

function damageUnit(state: GameState, target: GameCardInstance, amount: number): GameState {
  return dealDamageToUnit(state, target.instanceId, amount);
}

function resolveSingleTarget(
  effect: CaelumEffect,
  prompt: string,
  getTargets: (state: GameState, event: AbilityEvent) => GameCardInstance[],
  apply: (state: GameState, event: AbilityEvent, target: GameCardInstance) => GameState,
  optional = false
): AbilityHandler {
  return ({ state, event }) => {
    const targets = getTargets(state, event);
    if (targets.length === 0) return { state, resolved: false };
    const selected = selectedEventTarget(event, targets);
    if (selected) return { state: apply(state, event, selected), resolved: true };
    if (event.controller === 'player') {
      return { state: createPlayerChoice(state, event, effect, targets, prompt, { optional }), resolved: false };
    }
    return { state: apply(state, event, targets[0]!), resolved: true };
  };
}

function enemyUnits(state: GameState, owner: Owner): GameCardInstance[] {
  return getUnitsInPlay(state).filter((unit) => getCardController(unit) !== owner);
}

function friendlyUnits(state: GameState, owner: Owner): GameCardInstance[] {
  return getFriendlyUnitsInPlay(state, owner);
}

function enemyCombatUnits(state: GameState, owner: Owner): GameCardInstance[] {
  return BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    state.zones[zone].filter((card) => isUnitCard(card.card) && getCardController(card) !== owner)
  );
}

function canEnemyTacticTarget(state: GameState, event: AbilityEvent, unit: GameCardInstance): boolean {
  return !(
    getCardController(unit) !== event.controller &&
    unit.protectedFromEnemyTacticsUntilTurn &&
    state.turn <= unit.protectedFromEnemyTacticsUntilTurn
  );
}

const cloudbreachLeviathan: AbilityHandler = ({ state, event }) => {
  const targets = getUnitsInPlay(state);
  if (targets.length === 0) return { state, resolved: false };
  const selected = selectedEventTarget(event, targets);
  if (!selected && event.controller === 'player') {
    return {
      state: createPlayerChoice(
        state,
        event,
        'leviathanReturn',
        targets,
        "Choose a unit to return to its owner's hand.",
        { optional: true }
      ),
      resolved: false,
    };
  }
  const target = selected ?? targets[0]!;
  return {
    state: removeCardToHand(state, target),
    resolved: true,
    message: `${event.source.card.name} returned ${target.card.name} to its owner's hand.`,
  };
};

const rebound = resolveSingleTarget(
  'leviathanReturn',
  "Choose a unit to return to its owner's hand.",
  (state, event) => getUnitsInPlay(state).filter((unit) => canEnemyTacticTarget(state, event, unit)),
  (state, _event, target) => removeCardToHand(state, target)
);

const inquisitor = resolveSingleTarget(
  'inquisitorSuppress',
  'Choose an enemy unit. It has no abilities this turn.',
  (state, event) => enemyUnits(state, event.controller),
  (state, _event, target) => updateCardInPlay(state, target.instanceId, (unit) => ({
    ...unit,
    abilitiesSuppressedUntilTurn: state.turn,
  }))
);

const enforcer = resolveSingleTarget(
  'enforcerExhaust',
  "Choose an enemy unit to exhaust. It won't ready during its next ready phase.",
  (state, event) => enemyUnits(state, event.controller),
  (state, _event, target) => updateCardInPlay(state, target.instanceId, (unit) => ({
    ...unit,
    ready: false,
    skipNextReady: true,
  })),
  true
);

const renataProtect = resolveSingleTarget(
  'renataProtect',
  "Choose a friendly Drone or Vehicle. It can't be targeted by enemy tactics until end of turn.",
  (state, event) => friendlyUnits(state, event.controller).filter(isDroneOrVehicle),
  (state, _event, target) => updateCardInPlay(state, target.instanceId, (unit) => ({
    ...unit,
    protectedFromEnemyTacticsUntilTurn: state.turn,
  }))
);

const valeriaRetreat = resolveSingleTarget(
  'valeriaRetreat',
  'Choose a unit in a combat zone to force retreat.',
  (state) => BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).filter((card) => isUnitCard(card.card)),
  (state, _event, target) => forceRetreatUnit(state, target),
  true
);

const valeriaAttack: AbilityHandler = ({ state, event }) => {
  const targets = BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).filter((card) => isUnitCard(card.card));
  if (targets.length === 0) return { state, resolved: false };
  const selected = selectedEventTarget(event, targets);
  if (!selected && event.controller === 'player') {
    return {
      state: createPlayerChoice(state, event, 'valeriaExhaust', targets, 'Choose a unit in a combat zone to exhaust.'),
      resolved: false,
    };
  }
  const target = selected ?? targets[0]!;
  return {
    state: updateCardInPlay(state, target.instanceId, (unit) => ({ ...unit, ready: false })),
    resolved: true,
    message: `${event.source.card.name} exhausted ${target.card.name} on attack.`,
  };
};

const skybreaker = resolveSingleTarget(
  'skybreakerDamage',
  'Choose an enemy unit in staging to deal 2 damage to.',
  (state, event) => getOwnerPrivateZone(state, event.controller === 'player' ? 'opponent' : 'player', 'staging')
    .filter((card) => isUnitCard(card.card)),
  (state, _event, target) => damageUnit(state, target, 2),
  true
);

const forcedConfession = resolveSingleTarget(
  'confessionDamage',
  'Choose an enemy unit to deal 1 damage to.',
  (state, event) => enemyUnits(state, event.controller).filter((unit) => canEnemyTacticTarget(state, event, unit)),
  (state, event, target) => drawCards(damageUnit(state, target, 1), event.controller, 1, event.source.card.name)
);

function voidWarpTargets(state: GameState, event: AbilityEvent): GameCardInstance[] {
  const battlefieldUnits = BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone])
    .filter((card) => isUnitCard(card.card));
  const attacker = state.pendingCombat
    ? getUnitsInPlay(state).find((unit) => unit.instanceId === state.pendingCombat?.attackerInstanceId) ?? null
    : null;
  const combatUnits = attacker ? [...battlefieldUnits, attacker] : battlefieldUnits;
  return combatUnits.filter((card) => canEnemyTacticTarget(state, event, card));
}

const voidWarp = resolveSingleTarget(
  'voidWarp',
  "Choose a unit in a combat zone to put on top of its owner's deck.",
  voidWarpTargets,
  (state, _event, target) => putUnitOnTopOfDeck(state, target)
);

function resolveCourierDrone({ state, event }: AbilityContext): AbilityResolution {
  return { state: drawCards(state, event.controller, 1, event.source.card.name), resolved: true };
}

function resolveGenesisActivated({ state, event }: AbilityContext): AbilityResolution {
  const targetId = event.targets?.find((target) => target.type === 'card')?.instanceId;
  const target = targetId ? friendlyUnits(state, event.controller).find((unit) => unit.instanceId === targetId) : null;
  if (!target) return { state, resolved: false };
  const exhausted = updateCardInPlay(state, event.source.instanceId, (unit) => ({ ...unit, ready: false }));
  return {
    state: updateCardInPlay(exhausted, target.instanceId, (unit) => ({
      ...unit,
      temporaryInfluenceBonus: (unit.temporaryInfluenceBonus ?? 0) + 1,
      temporaryInfluenceExpiresAfterTurn: state.turn,
    })),
    resolved: true,
    message: `${event.source.card.name} gave ${target.card.name} +1 influence until end of turn.`,
  };
}

function resolveMasterStrategist({ state, event }: AbilityContext): AbilityResolution {
  const deck = getOwnerPrivateZone(state, event.controller, 'deck');
  if (deck.length === 0) return { state, resolved: false };
  const drawnState = drawCards(state, event.controller, 1, event.source.card.name);
  const hand = getOwnerPrivateZone(drawnState, event.controller, 'hand');
  if (hand.length === 0) return { state: drawnState, resolved: true };
  if (event.controller === 'player') {
    return {
      state: createPlayerChoice(drawnState, event, 'strategistDiscard', hand, 'Choose a card to discard.', { optional: true }),
      resolved: false,
    };
  }
  return { state: discardCard(drawnState, event.controller, hand[0]!), resolved: true };
}

function resolveRepulsiveExperiment({ state, event }: AbilityContext): AbilityResolution {
  if (!event.zone || !BATTLEFIELD_ZONE_IDS.includes(event.zone as (typeof BATTLEFIELD_ZONE_IDS)[number])) {
    return { state, resolved: false };
  }
  const enemy = event.controller === 'player' ? 'opponent' : 'player';
  return {
    state: {
      ...state,
      scoreLocks: [
        ...(state.scoreLocks ?? []),
        { zone: event.zone, blockedOwner: enemy, expiresAtStartOfOwner: event.controller },
      ],
    },
    resolved: true,
    message: `${event.source.card.name} prevents enemy units from scoring ${getZoneLogLabel(event.zone)} until your next turn.`,
  };
}

function resolveRenataActivated({ state, event }: AbilityContext): AbilityResolution {
  const targetId = event.targets?.find((target) => target.type === 'card')?.instanceId;
  const target = targetId ? friendlyUnits(state, event.controller).find((unit) => unit.instanceId === targetId && isDroneOrVehicle(unit)) : null;
  if (!target || getReadySupplyCount(state, event.controller) < 2) return { state, resolved: false };
  let nextState = exhaustSupplyForCost(state, event.controller, 2);
  nextState = updateCardInPlay(nextState, event.source.instanceId, (unit) => ({ ...unit, ready: false }));
  nextState = readyUnitInPlay(nextState, target.instanceId);
  return {
    state: updateCardInPlay(nextState, target.instanceId, (unit) => ({
      ...unit,
      temporaryAttackBonus: (unit.temporaryAttackBonus ?? 0) + 2,
      temporaryHealthBonus: (unit.temporaryHealthBonus ?? 0) + 2,
      temporaryStatsExpireAfterTurn: state.turn,
    })),
    resolved: true,
    message: `${event.source.card.name} readied ${target.card.name} and gave it +2/+2 until end of turn.`,
  };
}

function resolveDreadnoughtActivated({ state, event }: AbilityContext): AbilityResolution {
  const targetId = event.targets?.find((target) => target.type === 'card')?.instanceId;
  const target = targetId ? getUnitsInPlay(state).find((unit) => unit.instanceId === targetId) : null;
  if (!target || getReadySupplyCount(state, event.controller) < 3 || findPlayZone(state, event.source.instanceId) === 'staging') {
    return { state, resolved: false };
  }
  let nextState = exhaustSupplyForCost(state, event.controller, 3);
  nextState = updateCardInPlay(nextState, event.source.instanceId, (unit) => ({ ...unit, ready: false }));
  const removed = removeUnitFromPlay(nextState, target.instanceId);
  return 'error' in removed
    ? { state, resolved: false }
    : { state: removed.state, resolved: true, message: `${event.source.card.name} destroyed ${target.card.name}.` };
}

function resolveComplexStratagem({ state, event }: AbilityContext): AbilityResolution {
  return { state: drawCards(state, event.controller, 2, event.source.card.name), resolved: true };
}

function resolveAirdrop({ state, event }: AbilityContext): AbilityResolution {
  const deck = getOwnerPrivateZone(state, event.controller, 'deck');
  const top = deck[0];
  if (!top) return { state, resolved: false };
  if (event.controller === 'player') {
    return {
      state: createPlayerChoice(state, event, 'airdrop', [top], 'Put the top card into your hand? Choose no to place it into supply exhausted.', { optional: true }),
      resolved: false,
    };
  }
  let nextState = setOwnerPrivateZone(state, event.controller, 'deck', deck.slice(1));
  nextState = setOwnerPrivateZone(nextState, event.controller, 'hand', [...getOwnerPrivateZone(nextState, event.controller, 'hand'), top]);
  return { state: nextState, resolved: true };
}

function markUnitForAbandonTheLab(state: GameState, unit: GameCardInstance, controller: Owner): GameState {
  const returnOnTurn =
    state.activePlayer === controller
      ? state.turn + 1
      : state.firstPlayer === controller
        ? state.turn + 1
        : state.turn;
  return updateCardInPlay(state, unit.instanceId, (instance) => ({
    ...instance,
    abandonLabBanishOnDeathUntilTurn: state.turn,
    abandonLabReturnController: controller,
    abandonLabReturnAfterTurn: returnOnTurn,
  }));
}

function resolveAbandonTheLab({ state, event }: AbilityContext): AbilityResolution {
  const targets = getFriendlyUnitsInPlay(state, event.controller);
  if (targets.length === 0) return { state, resolved: false };
  if (event.controller === 'player') {
    return {
      state: createPlayerChoice(state, event, 'abandonLab', targets, 'Choose a friendly unit to escape Abandon the Lab.'),
      resolved: false,
    };
  }
  return {
    state: markUnitForAbandonTheLab(state, targets[0]!, event.controller),
    resolved: true,
    message: `${event.source.card.name} marked ${targets[0]!.card.name}; if it dies this turn, it returns next main phase.`,
  };
}

function resolveBreachTheDam({ state, event }: AbilityContext): AbilityResolution {
  const territories = BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone].filter((card) => isTerritoryCard(card.card)));
  const combatCardsByZone = BATTLEFIELD_ZONE_IDS.map((zone) => ({
    zone,
    cards: state.zones[zone].filter((card) => isUnitCard(card.card) || isItemCard(card.card)),
  }));
  let nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      battlefieldLeft: [],
      battlefieldCenter: [],
      battlefieldRight: [],
    },
  };
  nextState = moveCardsToOwnerGraveyards(nextState, territories);
  for (const { cards } of combatCardsByZone) {
    const units = cards.filter((card) => isUnitCard(card.card));
    const attachedItems = cards.filter((card) => isItemCard(card.card) && card.attachedToInstanceId);
    for (const unit of units) {
      if (!shouldCardCeaseInZone(unit, 'hand')) {
        nextState = setOwnerPrivateZone(nextState, unit.owner, 'hand', [
          prepareCardForZone(unit, 'hand'),
          ...getOwnerPrivateZone(nextState, unit.owner, 'hand'),
        ]);
      }
    }
    for (const item of attachedItems) {
      nextState = setOwnerPrivateZone(nextState, item.owner, 'graveyard', [
        prepareCardForZone(item, 'graveyard'),
        ...getOwnerPrivateZone(nextState, item.owner, 'graveyard'),
      ]);
    }
    for (const looseItem of cards.filter((card) => isItemCard(card.card) && !card.attachedToInstanceId)) {
      nextState = setOwnerPrivateZone(nextState, looseItem.owner, 'hand', [
        prepareCardForZone(looseItem, 'hand'),
        ...getOwnerPrivateZone(nextState, looseItem.owner, 'hand'),
      ]);
    }
  }
  return { state: nextState, resolved: true, message: `${event.source.card.name} destroyed territories and returned combat units to hand.` };
}

function resolveInquisitionDrone({ state, event }: AbilityContext): AbilityResolution {
  const targets = BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    state.zones[zone].filter(
      (card) => isTerritoryCard(card.card) && card.faceDown && getCardController(card) !== event.controller
    )
  );
  if (targets.length === 0) return { state, resolved: false };
  if (event.controller === 'player') {
    return {
      state: createPlayerChoice(state, event, 'droneReveal', targets, "Choose an enemy face-down territory to reveal and return to its owner's hand."),
      resolved: false,
    };
  }
  return { state: revealTerritoryAndReturn(state, targets[0]!), resolved: true };
}

function revealTerritoryAndReturn(state: GameState, territory: GameCardInstance): GameState {
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) =>
    state.zones[candidate].some((card) => card.instanceId === territory.instanceId)
  );
  if (!zone) return state;
  const revealed = prepareCardForZone(territory, zone, { faceDown: false });
  let nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      [zone]: state.zones[zone].map((card) => card.instanceId === territory.instanceId ? revealed : card),
    },
  };
  nextState = triggerCardAbilities(nextState, 'onFlip', {
    source: revealed,
    controller: getCardController(revealed),
    zone,
  });
  nextState = {
    ...nextState,
    zones: {
      ...nextState.zones,
      [zone]: nextState.zones[zone].filter((card) => card.instanceId !== territory.instanceId),
    },
  };
  return setOwnerPrivateZone(nextState, territory.owner, 'hand', [
    prepareCardForZone(revealed, 'hand'),
    ...getOwnerPrivateZone(nextState, territory.owner, 'hand'),
  ]);
}

function resolveWingshieldTransport({ state, event }: AbilityContext): AbilityResolution {
  const supply = getOwnerPrivateZone(state, event.controller, 'supply');
  if (supply.length === 0) return { state, resolved: false };
  if (event.controller === 'player') {
    return {
      state: createPlayerChoice(state, event, 'wingshieldSupply', supply, 'Choose a supply card to reveal and return to your hand.', { optional: true }),
      resolved: false,
    };
  }
  const card = supply[0]!;
  let nextState = setOwnerPrivateZone(state, event.controller, 'supply', supply.slice(1));
  nextState = setOwnerPrivateZone(nextState, card.owner, 'hand', [
    prepareCardForZone(card, 'hand'),
    ...getOwnerPrivateZone(nextState, card.owner, 'hand'),
  ]);
  return { state: nextState, resolved: true };
}

export function resolveCaelumTargetChoice(
  state: GameState,
  pendingChoice: CaelumChoice,
  selectedInstanceIds: string[]
): GameState | { error: string } {
  const continueFreightModuleChoices = (nextState: GameState): GameState => {
    if (pendingChoice.effect !== 'freightModuleSupply') return nextState;
    const [nextModuleId, ...remainingModuleIds] = pendingChoice.contextInstanceIds ?? [];
    if (!nextModuleId || !findCardInstance(nextState, nextModuleId)) return nextState;
    return {
      ...nextState,
      pendingChoice: {
        ...pendingChoice,
        sourceInstanceId: nextModuleId,
        availableInstanceIds: [nextModuleId],
        contextInstanceIds: remainingModuleIds,
      },
    };
  };

  if (selectedInstanceIds.length === 0 && pendingChoice.optional) {
    if (pendingChoice.effect === 'airdrop') {
      const deck = state.zones.deck;
      const top = deck[0];
      if (!top) return { ...state, pendingChoice: null };
      return {
        ...state,
        pendingChoice: null,
        zones: {
          ...state.zones,
          deck: deck.slice(1),
          supply: [{ ...prepareCardForZone(top, 'supply'), ready: false }, ...state.zones.supply],
        },
        log: addLogEntry(state, {
          suffix: `${pendingChoice.sourceName}: ${top.card.name} went to your supply exhausted.`,
        }),
      };
    }
    return continueFreightModuleChoices({ ...state, pendingChoice: null });
  }
  if (selectedInstanceIds.length !== 1 || !pendingChoice.availableInstanceIds.includes(selectedInstanceIds[0]!)) {
    return { error: 'Choose exactly one valid card.' };
  }

  const selected = findCardInstance(state, selectedInstanceIds[0]!);
  if (!selected) return { error: 'That card is no longer available.' };
  let nextState: GameState = { ...state, pendingChoice: null };

  switch (pendingChoice.effect) {
    case 'abandonLab':
      nextState = markUnitForAbandonTheLab(nextState, selected, 'player');
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `marked ${selected.card.name}; if it dies this turn, it returns next main phase.`);
      break;
    case 'airdrop': {
      const deck = nextState.zones.deck;
      const top = deck.find((card) => card.instanceId === selected.instanceId);
      if (!top) return { error: 'That card is no longer on top of your deck.' };
      nextState = {
        ...nextState,
        zones: {
          ...nextState.zones,
          deck: deck.filter((card) => card.instanceId !== top.instanceId),
          hand: [...nextState.zones.hand, top],
        },
      };
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `${top.card.name} went to your hand.`);
      break;
    }
    case 'confessionDamage':
      nextState = damageUnit(nextState, selected, 1);
      nextState = drawCards(nextState, 'player', 1, pendingChoice.sourceName);
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `dealt 1 damage to ${selected.card.name} and drew a card.`);
      break;
    case 'discard':
    case 'strategistDiscard':
      nextState = discardCard(nextState, 'player', selected);
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `you discarded ${selected.card.name}.`);
      break;
    case 'fortifyDiscard': {
      nextState = setOwnerPrivateZone(
        nextState,
        'player',
        'hand',
        nextState.zones.hand.filter((card) => card.instanceId !== selected.instanceId)
      );
      nextState = setOwnerPrivateZone(nextState, 'player', 'graveyard', [
        prepareCardForZone(selected, 'graveyard'),
        ...nextState.zones.graveyard,
      ]);
      nextState = readyUnitInPlay(nextState, pendingChoice.sourceInstanceId);
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `used Fortify by discarding ${selected.card.name} and readied.`);
      break;
    }
    case 'droneReveal':
      nextState = revealTerritoryAndReturn(nextState, selected);
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `revealed ${selected.card.name} and returned it to hand.`);
      break;
    case 'enforcerExhaust':
      nextState = updateCardInPlay(nextState, selected.instanceId, (unit) => ({ ...unit, ready: false, skipNextReady: true }));
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `${selected.card.name} was exhausted and will skip its next ready.`);
      break;
    case 'inquisitorSuppress':
      nextState = updateCardInPlay(nextState, selected.instanceId, (unit) => ({ ...unit, abilitiesSuppressedUntilTurn: state.turn }));
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `${selected.card.name}'s abilities are suppressed this turn.`);
      break;
    case 'leviathanReturn':
      nextState = removeCardToHand(nextState, selected);
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `returned ${selected.card.name} to its owner's hand.`);
      break;
    case 'renataProtect':
      nextState = updateCardInPlay(nextState, selected.instanceId, (unit) => ({ ...unit, protectedFromEnemyTacticsUntilTurn: state.turn }));
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `${selected.card.name} is protected from enemy tactics this turn.`);
      break;
    case 'renataReady':
      nextState = readyUnitInPlay(nextState, selected.instanceId);
      nextState = updateCardInPlay(nextState, selected.instanceId, (unit) => ({
        ...unit,
        temporaryAttackBonus: (unit.temporaryAttackBonus ?? 0) + 2,
        temporaryHealthBonus: (unit.temporaryHealthBonus ?? 0) + 2,
        temporaryStatsExpireAfterTurn: state.turn,
      }));
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `${selected.card.name} readied and got +2/+2 until end of turn.`);
      break;
    case 'skybreakerDamage':
      nextState = damageUnit(nextState, selected, 2);
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `dealt 2 damage to ${selected.card.name}.`);
      break;
    case 'valeriaExhaust':
      nextState = updateCardInPlay(nextState, selected.instanceId, (unit) => ({ ...unit, ready: false }));
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `exhausted ${selected.card.name} on attack.`);
      break;
    case 'valeriaRetreat':
      nextState = forceRetreatUnit(nextState, selected);
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `${selected.card.name} retreated to staging.`);
      break;
    case 'voidWarp':
      nextState = putUnitOnTopOfDeck(nextState, selected);
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `${selected.card.name} went on top of its owner's deck.`);
      break;
    case 'wingshieldSupply':
      nextState = setOwnerPrivateZone(nextState, 'player', 'supply', nextState.zones.supply.filter((card) => card.instanceId !== selected.instanceId));
      nextState = setOwnerPrivateZone(nextState, selected.owner, 'hand', [
        prepareCardForZone(selected, 'hand'),
        ...getOwnerPrivateZone(nextState, selected.owner, 'hand'),
      ]);
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `${selected.card.name} moved from supply to hand.`);
      break;
    case 'freightModuleSupply': {
      const supplied = placeFreightModuleIntoSupply(nextState, selected);
      if ('error' in supplied) return supplied;
      nextState = logAbilityOutcome(supplied, pendingChoice.sourceName, 'moved to supply exhausted.');
      break;
    }
    case 'unyieldingStormSweep':
      nextState = sweepUnyieldingStormZone(nextState, selected);
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, "returned units and enemy territories in its zone, then sacrificed itself.");
      break;
    case 'archiveReturn':
      nextState = setOwnerPrivateZone(nextState, 'player', 'graveyard', nextState.zones.graveyard.filter((card) => card.instanceId !== selected.instanceId));
      nextState = setOwnerPrivateZone(nextState, selected.owner, 'hand', [
        prepareCardForZone(selected, 'hand'),
        ...getOwnerPrivateZone(nextState, selected.owner, 'hand'),
      ]);
      {
        const archiveRuins = findCardInstance(nextState, pendingChoice.sourceInstanceId);
        if (archiveRuins) {
          nextState = sacrificeTerritory(nextState, archiveRuins);
        }
      }
      nextState = logAbilityOutcome(nextState, pendingChoice.sourceName, `${selected.card.name} returned from graveyard to hand, then Archive Ruins was sacrificed.`);
      break;
  }
  return continueFreightModuleChoices(nextState);
}

export function resolveCaelumZoneChoice(
  state: GameState,
  pendingChoice: CaelumZoneChoice,
  selectedZoneIds: string[]
): GameState | { error: string } {
  if (pendingChoice.effect !== 'unyieldingStormMove') return { error: 'Unknown Caelum zone choice.' };
  if (selectedZoneIds.length !== 1 || !pendingChoice.availableZoneIds.includes(selectedZoneIds[0] as ZoneId)) {
    return { error: 'Choose exactly one valid battlefield.' };
  }
  const storm = findCardInstance(state, pendingChoice.sourceInstanceId);
  if (!storm) return { error: 'Unyielding Storm is no longer available.' };
  return moveUnyieldingStormToZone({ ...state, pendingChoice: null }, storm, selectedZoneIds[0] as ZoneId);
}

const acknowledgeRule: AbilityHandler = ({ state }) => ({ state, resolved: false });

export function applyCaelumTurnStartAbilities(state: GameState, owner: Owner): GameState {
  let nextState = state;
  const storms = BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    state.zones[zone]
      .filter((card) =>
        card.card.id === 'IMP095' &&
        !card.faceDown &&
        getCardController(card) === owner &&
        card.startTurnAbilityResolvedTurn !== state.turn
      )
      .map((storm) => ({ storm, zone }))
  );
  for (const { storm, zone } of storms) {
    if (!nextState.zones[zone].some((card) => card.instanceId === storm.instanceId)) continue;
    const availableZoneIds = BATTLEFIELD_ZONE_IDS.filter((candidate) => candidate !== zone);
    if (availableZoneIds.length === 0) continue;
    if (owner === 'player') {
      const markedState = {
        ...nextState,
        zones: {
          ...nextState.zones,
          [zone]: nextState.zones[zone].map((card) =>
            card.instanceId === storm.instanceId ? { ...card, startTurnAbilityResolvedTurn: state.turn } : card
          ),
        },
      };
      return {
        ...markedState,
        pendingChoice: {
          kind: 'caelumZone',
          owner: 'player',
          sourceInstanceId: storm.instanceId,
          sourceName: storm.card.name,
          prompt: 'Choose a battlefield to move Unyielding Storm to.',
          effect: 'unyieldingStormMove',
          availableZoneIds,
          resumeTurnStart: true,
        },
      };
    }
    const moved = moveUnyieldingStormToZone(nextState, storm, availableZoneIds[0]!);
    if (!('error' in moved)) nextState = moved;
  }
  return nextState;
}

export function applyCaelumEndTurnAbilities(state: GameState, owner: Owner): GameState {
  const storms = BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    state.zones[zone].filter(
      (card) =>
        card.card.id === 'IMP095' &&
        !card.faceDown &&
        getCardController(card) === owner &&
        card.endTurnAbilityResolvedTurn !== state.turn
    )
  );
  const storm = storms.find((candidate) => {
    const zone = findBattlefieldZone(state, candidate.instanceId);
    if (!zone) return false;
    return state.zones[zone].some(
      (card) =>
        isUnitCard(card.card) ||
        (isTerritoryCard(card.card) && card.instanceId !== candidate.instanceId && getCardController(card) !== owner)
    );
  });
  if (!storm) return state;
  const zone = findBattlefieldZone(state, storm.instanceId);
  const markedState = zone
    ? {
        ...state,
        zones: {
          ...state.zones,
          [zone]: state.zones[zone].map((card) =>
            card.instanceId === storm.instanceId ? { ...card, endTurnAbilityResolvedTurn: state.turn } : card
          ),
        },
      }
    : state;
  const markedStorm = findCardInstance(markedState, storm.instanceId) ?? storm;
  if (owner === 'player') {
    return {
      ...markedState,
      pendingChoice: {
        kind: 'caelumTarget',
        owner: 'player',
        sourceInstanceId: markedStorm.instanceId,
        sourceName: markedStorm.card.name,
        prompt: "Return units and enemy territories in Unyielding Storm's zone to their owners' hands, then sacrifice it?",
        effect: 'unyieldingStormSweep',
        availableInstanceIds: [markedStorm.instanceId],
        optional: true,
        resumeTurnAdvance: true,
      },
    };
  }
  return sweepUnyieldingStormZone(markedState, markedStorm);
}

export function createCaelumAbilityHandlers() {
  return {
    acknowledgeRule,
    abandonTheLab: resolveAbandonTheLab,
    airdrop: resolveAirdrop,
    breachTheDam: resolveBreachTheDam,
    cloudbreachLeviathan,
    complexStratagem: resolveComplexStratagem,
    courierDrone: resolveCourierDrone,
    forcedConfession,
    genesisActivated: resolveGenesisActivated,
    inquisitionDrone: resolveInquisitionDrone,
    levitarInquisitor: inquisitor,
    lockdownEnforcer: enforcer,
    masterStrategist: resolveMasterStrategist,
    rebound,
    renataActivated: resolveRenataActivated,
    renataProtect,
    repulsiveExperiment: resolveRepulsiveExperiment,
    skybreakerGunship: skybreaker,
    valeriaAttack,
    valeriaEnter: valeriaRetreat,
    valrathianDreadnought: resolveDreadnoughtActivated,
    voidWarp,
    wingshieldTransport: resolveWingshieldTransport,
  };
}
