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
  dealDamageToUnit,
  addLogEntry,
  getCardController,
  getCurrentUnitHealth,
  getFriendlyUnitsInPlay,
  getRenownedUnitLimitError,
  getUnitsInPlay,
  isItemCard,
  isTerritoryCard,
  isUnitCard,
  prepareCardForZone,
  recordCardsDrawn,
  readyUnitInPlay,
  removeUnitFromPlay,
  shouldCardCeaseInZone,
  type GameCardInstance,
  type GameState,
  type Owner,
  type PendingChoice,
  type ZoneId,
} from './game-rules';

type LuxChoice = Extract<PendingChoice, { kind: 'luxTarget' }>;
type LuxEffect = LuxChoice['effect'];

const DRONE_TOKEN_CARD = cardData.cards.find((card) => card.id === 'IMPT001');

function getOwnerPrivateZone(state: GameState, owner: Owner, zone: 'deck' | 'hand' | 'staging' | 'graveyard' | 'banish') {
  return owner === 'player' ? state.zones[zone] : state.opponentZones[zone];
}

function setOwnerPrivateZone(
  state: GameState,
  owner: Owner,
  zone: 'deck' | 'hand' | 'staging' | 'graveyard' | 'banish',
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
  const playerPrivateZone = (['staging'] as const).find((zone) =>
    state.zones[zone].some((instance) => instance.instanceId === instanceId)
  );
  if (playerPrivateZone) return playerPrivateZone;
  if (state.opponentZones.staging.some((instance) => instance.instanceId === instanceId)) return 'staging';
  return BATTLEFIELD_ZONE_IDS.find((zone) =>
    state.zones[zone].some((instance) => instance.instanceId === instanceId)
  ) ?? null;
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

function drawCards(state: GameState, owner: Owner, count: number, sourceName: string): GameState {
  const deck = getOwnerPrivateZone(state, owner, 'deck');
  const drawn = deck.slice(0, count);
  let nextState = setOwnerPrivateZone(state, owner, 'deck', deck.slice(drawn.length));
  nextState = setOwnerPrivateZone(
    nextState,
    owner,
    'hand',
    [...getOwnerPrivateZone(nextState, owner, 'hand'), ...drawn]
  );
  return {
    ...recordCardsDrawn(nextState, owner, drawn.length),
    log: addLogEntry(nextState, {
      suffix: `${sourceName} drew ${drawn.length} ${drawn.length === 1 ? 'card' : 'cards'}${owner === 'opponent' ? ' for Bot' : ''}.`,
    }),
  };
}

function createDroneTokens(state: GameState, owner: Owner, count: number, sourceName: string): GameState {
  if (!DRONE_TOKEN_CARD || count <= 0) return state;
  const tokens: GameCardInstance[] = Array.from({ length: count }, () => ({
    instanceId: `${owner}-${DRONE_TOKEN_CARD.id}-token-${crypto.randomUUID()}`,
    owner,
    card: DRONE_TOKEN_CARD as Card,
    ready: false,
    faceDown: false,
    attachedToInstanceId: null,
    damage: 0,
    retreatLockedUntilNextTurn: false,
  }));
  const nextState = setOwnerPrivateZone(
    state,
    owner,
    'staging',
    [...tokens, ...getOwnerPrivateZone(state, owner, 'staging')]
  );
  return {
    ...nextState,
    log: addLogEntry(nextState, {
      suffix: `${sourceName} created ${count} ${count === 1 ? 'Drone' : 'Drones'} in staging.`,
    }),
  };
}

function createPlayerChoice(
  state: GameState,
  event: AbilityEvent,
  effect: LuxEffect,
  targets: GameCardInstance[],
  prompt: string,
  options: Pick<LuxChoice, 'optional' | 'maxSelections' | 'contextInstanceIds' | 'resumeTurnAdvance'> = {}
): GameState {
  return {
    ...state,
    pendingChoice: {
      kind: 'luxTarget',
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

function damageUnit(state: GameState, target: GameCardInstance, amount: number): GameState {
  return dealDamageToUnit(state, target.instanceId, amount);
}

function resolveSingleTarget(
  effect: LuxEffect,
  prompt: string,
  getTargets: (state: GameState, event: AbilityEvent) => GameCardInstance[],
  apply: (state: GameState, event: AbilityEvent, target: GameCardInstance) => GameState,
  optional = false
): AbilityHandler {
  return ({ state, event }) => {
    const targets = getTargets(state, event);
    if (targets.length === 0) return { state, resolved: false };
    const selected = selectedEventTarget(event, targets);
    if (selected) {
      return { state: apply(state, event, selected), resolved: true };
    }
    if (event.controller === 'player') {
      return {
        state: createPlayerChoice(state, event, effect, targets, prompt, { optional }),
        resolved: false,
      };
    }
    return { state: apply(state, event, targets[0]!), resolved: true };
  };
}

function removeCardToHand(state: GameState, target: GameCardInstance): GameState {
  const zone = findPlayZone(state, target.instanceId);
  if (!zone) return state;
  const zoneCards = zone === 'staging'
    ? getOwnerPrivateZone(state, getCardController(target), 'staging')
    : state.zones[zone];
  const attachments = isUnitCard(target.card)
    ? zoneCards.filter((card) => card.attachedToInstanceId === target.instanceId)
    : [];
  const removedIds = new Set([target.instanceId, ...attachments.map((card) => card.instanceId)]);
  let nextState = zone === 'staging'
    ? setOwnerPrivateZone(
        state,
        getCardController(target),
        'staging',
        zoneCards.filter((card) => !removedIds.has(card.instanceId))
      )
    : {
        ...state,
        zones: {
          ...state.zones,
          [zone]: state.zones[zone].filter((card) => !removedIds.has(card.instanceId)),
        },
      };
  if (!shouldCardCeaseInZone(target, 'hand')) {
    nextState = setOwnerPrivateZone(
      nextState,
      target.owner,
      'hand',
      shouldCardCeaseInZone(target, 'hand')
        ? getOwnerPrivateZone(nextState, target.owner, 'hand')
        : [prepareCardForZone(target, 'hand'), ...getOwnerPrivateZone(nextState, target.owner, 'hand')]
    );
  }
  for (const attachment of attachments) {
    nextState = setOwnerPrivateZone(
      nextState,
      attachment.owner,
      'graveyard',
      [prepareCardForZone(attachment, 'graveyard'), ...getOwnerPrivateZone(nextState, attachment.owner, 'graveyard')]
    );
  }
  return nextState;
}

function banishCard(state: GameState, target: GameCardInstance): GameState {
  const zone = findPlayZone(state, target.instanceId);
  if (!zone) return state;
  const zoneCards = zone === 'staging'
    ? getOwnerPrivateZone(state, getCardController(target), 'staging')
    : state.zones[zone];
  const attachments = isUnitCard(target.card)
    ? zoneCards.filter((card) => card.attachedToInstanceId === target.instanceId)
    : [];
  const removedIds = new Set([target.instanceId, ...attachments.map((card) => card.instanceId)]);
  let nextState = zone === 'staging'
    ? setOwnerPrivateZone(
        state,
        getCardController(target),
        'staging',
        zoneCards.filter((card) => !removedIds.has(card.instanceId))
      )
    : {
        ...state,
        zones: {
          ...state.zones,
          [zone]: state.zones[zone].filter((card) => !removedIds.has(card.instanceId)),
        },
      };
  if (!shouldCardCeaseInZone(target, 'banish')) {
    nextState = setOwnerPrivateZone(
      nextState,
      target.owner,
      'banish',
      [prepareCardForZone(target, 'banish'), ...getOwnerPrivateZone(nextState, target.owner, 'banish')]
    );
  }
  for (const attachment of attachments) {
    nextState = setOwnerPrivateZone(
      nextState,
      attachment.owner,
      'graveyard',
      [prepareCardForZone(attachment, 'graveyard'), ...getOwnerPrivateZone(nextState, attachment.owner, 'graveyard')]
    );
  }
  return nextState;
}

function friendlyCombatUnits(state: GameState, owner: Owner): GameCardInstance[] {
  return BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    state.zones[zone].filter((card) => isUnitCard(card.card) && getCardController(card) === owner)
  );
}

function enemyCombatUnits(state: GameState, owner: Owner): GameCardInstance[] {
  const battlefieldUnits = BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    state.zones[zone].filter((card) => isUnitCard(card.card) && getCardController(card) !== owner)
  );
  const pendingAttacker = state.pendingCombat
    ? findCardInstance(state, state.pendingCombat.attackerInstanceId)
    : null;

  return pendingAttacker &&
    isUnitCard(pendingAttacker.card) &&
    getCardController(pendingAttacker) !== owner &&
    !battlefieldUnits.some((unit) => unit.instanceId === pendingAttacker.instanceId)
    ? [...battlefieldUnits, pendingAttacker]
    : battlefieldUnits;
}

function isProtectedFromEnemyTactic(state: GameState, unit: GameCardInstance, controller: Owner): boolean {
  if (getCardController(unit) === controller) return false;
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) =>
    state.zones[candidate].some((card) => card.instanceId === unit.instanceId)
  );
  return Boolean(
    zone &&
    state.zones[zone].some(
      (card) =>
        card.card.id === 'IMP032' &&
        !card.faceDown &&
        getCardController(card) === getCardController(unit)
    )
  );
}

function resolveArmoredCarrier({ state, event }: AbilityContext): AbilityResolution {
  return {
    state: createDroneTokens(state, event.controller, 2, event.source.card.name),
    resolved: true,
  };
}

function resolveFrontlineOfficer({ state, event }: AbilityContext): AbilityResolution {
  return {
    state: createDroneTokens(state, event.controller, 1, event.source.card.name),
    resolved: true,
  };
}

function resolveBiscuitAttack({ state, event }: AbilityContext): AbilityResolution {
  const deck = getOwnerPrivateZone(state, event.controller, 'deck');
  if (deck.length === 0) return { state, resolved: false };
  if (event.controller === 'player') {
    return {
      state: createPlayerChoice(
        state,
        event,
        'biscuitBottom',
        [deck[0]!],
        'Put the revealed top card on the bottom of your deck?',
        { optional: true }
      ),
      resolved: false,
    };
  }
  return { state, resolved: false };
}

function resolveBladewolfDefend({ state, event }: AbilityContext): AbilityResolution {
  return {
    state: updateUnitInPlay(state, event.source.instanceId, (unit) => ({
      ...unit,
      ready: true,
      combatAttackBonus: (unit.combatAttackBonus ?? 0) + 2,
    })),
    resolved: true,
    message: `${event.source.card.name} readied and gets +2 attack during this combat.`,
  };
}

function resolveCommunityEffort({ state, event }: AbilityContext): AbilityResolution {
  const targets = getFriendlyUnitsInPlay(state, event.controller).filter((unit) => unit.ready);
  if (targets.length === 0) return { state, resolved: false };
  if (event.controller === 'player') {
    return {
      state: createPlayerChoice(
        state,
        event,
        'communityEffort',
        targets,
        'Choose up to 3 friendly ready units to exhaust, then draw that many cards.',
        { optional: true, maxSelections: 3 }
      ),
      resolved: false,
    };
  }
  const selected = targets.slice(0, 3);
  let nextState = state;
  for (const unit of selected) {
    nextState = updateUnitInPlay(nextState, unit.instanceId, (current) => ({ ...current, ready: false }));
  }
  return {
    state: drawCards(nextState, event.controller, selected.length, event.source.card.name),
    resolved: true,
  };
}

function resolveFortunaFlip({ state, event }: AbilityContext): AbilityResolution {
  return {
    state: {
      ...state,
      ...(event.controller === 'player'
        ? { playerTemporarySupply: state.playerTemporarySupply + 3 }
        : { opponentTemporarySupply: state.opponentTemporarySupply + 3 }),
    },
    resolved: true,
    message: `${event.source.card.name} added 3 supply until end of turn.`,
  };
}

function resolveSeraphielDeath({ state, event }: AbilityContext): AbilityResolution {
  const graveyard = getOwnerPrivateZone(state, event.source.owner, 'graveyard');
  const seraphiel = graveyard.find((card) => card.instanceId === event.source.instanceId);
  if (!seraphiel) return { state, resolved: false };
  let nextState = setOwnerPrivateZone(
    state,
    event.source.owner,
    'graveyard',
    graveyard.filter((card) => card.instanceId !== seraphiel.instanceId)
  );
  nextState = setOwnerPrivateZone(
    nextState,
    event.source.owner,
    'deck',
    [...getOwnerPrivateZone(nextState, event.source.owner, 'deck'), prepareCardForZone(seraphiel, 'deck')]
  );
  return { state: nextState, resolved: true, message: `${event.source.card.name} was placed on the bottom of its owner's deck.` };
}

function resolveVeroAttack({ state, event }: AbilityContext): AbilityResolution {
  let nextState = state;
  for (const unit of getFriendlyUnitsInPlay(state, event.controller)) {
    if (unit.instanceId === event.source.instanceId) continue;
    nextState = updateUnitInPlay(nextState, unit.instanceId, (current) => ({
      ...current,
      temporaryAttackBonus: (current.temporaryAttackBonus ?? 0) + 1,
      temporaryHealthBonus: (current.temporaryHealthBonus ?? 0) + 1,
      temporaryStatsExpireAfterTurn: state.turn,
    }));
  }
  return { state: nextState, resolved: true, message: `${event.source.card.name} gave other friendly units +1/+1 until end of turn.` };
}

const artilleryBarrage = resolveSingleTarget(
  'artilleryDamage',
  'Choose an enemy unit in a staging area to deal 4 damage to.',
  (state, event) => getFriendlyUnitsInPlay(state, event.controller === 'player' ? 'opponent' : 'player')
    .filter((unit) => findPlayZone(state, unit.instanceId) === 'staging'),
  (state, _event, target) => damageUnit(state, target, 4)
);

const celesteReady = resolveSingleTarget(
  'celesteExhaust',
  'Choose an enemy unit in a combat zone to exhaust.',
  (state, event) => enemyCombatUnits(state, event.controller),
  (state, _event, target) => updateUnitInPlay(state, target.instanceId, (unit) => ({ ...unit, ready: false }))
);

const concordStrategist = resolveSingleTarget(
  'strategistReady',
  'Choose a friendly unit in a combat zone to ready.',
  (state, event) => friendlyCombatUnits(state, event.controller).filter((unit) => !unit.ready),
  (state, _event, target) => readyUnitInPlay(state, target.instanceId),
  true
);

const emergencyExtraction = resolveSingleTarget(
  'emergencyReturn',
  "Choose a friendly unit or item to return to its owner's hand.",
  (state, event) => {
    const controller = event.controller;
    return [
      ...(controller === 'player' ? state.zones.staging : state.opponentZones.staging),
      ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
    ].filter((card) => getCardController(card) === controller && (isUnitCard(card.card) || isItemCard(card.card)));
  },
  (state, _event, target) => removeCardToHand(state, target)
);

const farsightOperative = resolveSingleTarget(
  'farsightDamage',
  'Choose an enemy unit to deal 1 damage to.',
  (state, event) => getFriendlyUnitsInPlay(state, event.controller === 'player' ? 'opponent' : 'player'),
  (state, _event, target) => damageUnit(state, target, 1)
);

const musterForBattle = resolveSingleTarget(
  'musterReady',
  'Choose a friendly unit to ready.',
  (state, event) => getFriendlyUnitsInPlay(state, event.controller).filter((unit) => !unit.ready),
  (state, event, target) => drawCards(
    readyUnitInPlay(state, target.instanceId),
    event.controller,
    1,
    event.source.card.name
  )
);

const nekoraMedic = resolveSingleTarget(
  'medicPrevent',
  'Choose the friendly defending unit.',
  (state, event) => {
    const defenderId = state.pendingCombat?.defenderInstanceId;
    const defender = defenderId ? findCardInstance(state, defenderId) : null;
    return defender && getCardController(defender) === event.controller ? [defender] : [];
  },
  (state, _event, target) => updateUnitInPlay(state, target.instanceId, (unit) => ({
    ...unit,
    preventNextCombatDamageThisTurn: true,
  }))
);

const resuscitate = resolveSingleTarget(
  'resuscitate',
  'Choose a unit card in your graveyard to return to your hand.',
  (state, event) => getOwnerPrivateZone(state, event.controller, 'graveyard').filter((card) => isUnitCard(card.card)),
  (state, event, target) => {
    let nextState = setOwnerPrivateZone(
      state,
      event.controller,
      'graveyard',
      getOwnerPrivateZone(state, event.controller, 'graveyard').filter((card) => card.instanceId !== target.instanceId)
    );
    nextState = setOwnerPrivateZone(
      nextState,
      target.owner,
      'hand',
      [prepareCardForZone(target, 'hand'), ...getOwnerPrivateZone(nextState, target.owner, 'hand')]
    );
    return nextState;
  }
);

const seraphielScore = resolveSingleTarget(
  'seraphielReturn',
  'Choose a unit card in your graveyard to return to staging.',
  (state, event) => getOwnerPrivateZone(state, event.controller, 'graveyard').filter(
    (card) => isUnitCard(card.card) && !getRenownedUnitLimitError(state, event.controller, card)
  ),
  (state, event, target) => {
    let nextState = setOwnerPrivateZone(
      state,
      event.controller,
      'graveyard',
      getOwnerPrivateZone(state, event.controller, 'graveyard').filter((card) => card.instanceId !== target.instanceId)
    );
    nextState = setOwnerPrivateZone(
      nextState,
      event.controller,
      'staging',
      [prepareCardForZone(target, 'staging'), ...getOwnerPrivateZone(nextState, event.controller, 'staging')]
    );
    return nextState;
  }
);

const smokescreen = resolveSingleTarget(
  'smokescreen',
  'Choose an enemy unit in a combat zone to exhaust.',
  (state, event) => enemyCombatUnits(state, event.controller).filter(
    (unit) => !isProtectedFromEnemyTactic(state, unit, event.controller)
  ),
  (state, _event, target) => updateUnitInPlay(state, target.instanceId, (unit) => ({ ...unit, ready: false }))
);

const suppression = resolveSingleTarget(
  'suppression',
  'Choose a unit or territory to banish.',
  (state, event) => [
    ...getUnitsInPlay(state).filter(
      (unit) => !isProtectedFromEnemyTactic(state, unit, event.controller)
    ),
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
      state.zones[zone].filter((card) => isTerritoryCard(card.card))
    ),
  ],
  (state, _event, target) => banishCard(state, target)
);

function resolveStormhammer({ state, event }: AbilityContext): AbilityResolution {
  const exhaustTargets = getOwnerPrivateZone(state, event.controller, 'staging').filter(
    (unit) => isUnitCard(unit.card) && unit.ready && unit.instanceId !== event.source.instanceId
  );
  const damageTargets = getOwnerPrivateZone(
    state,
    event.controller === 'player' ? 'opponent' : 'player',
    'staging'
  ).filter((unit) => isUnitCard(unit.card));
  if (exhaustTargets.length === 0 || damageTargets.length === 0) return { state, resolved: false };
  if (event.controller === 'player') {
    return {
      state: createPlayerChoice(
        state,
        event,
        'stormhammerExhaust',
        exhaustTargets,
        'Choose another ready unit in staging to exhaust.',
        { optional: true, contextInstanceIds: damageTargets.map((target) => target.instanceId) }
      ),
      resolved: false,
    };
  }
  const exhausted = updateUnitInPlay(state, exhaustTargets[0]!.instanceId, (unit) => ({ ...unit, ready: false }));
  return {
    state: damageUnit(exhausted, damageTargets[0]!, 4),
    resolved: true,
    message: `${event.source.card.name} exhausted ${exhaustTargets[0]!.card.name} to deal 4 damage to ${damageTargets[0]!.card.name}.`,
  };
}

export function resolveLuxTargetChoice(
  state: GameState,
  pendingChoice: LuxChoice,
  selectedInstanceIds: string[]
): GameState | { error: string } {
  const maxSelections = pendingChoice.maxSelections ?? 1;
  if (selectedInstanceIds.length === 0 && pendingChoice.optional) {
    return { ...state, pendingChoice: null };
  }
  if (
    selectedInstanceIds.length === 0 ||
    selectedInstanceIds.length > maxSelections ||
    selectedInstanceIds.some((id) => !pendingChoice.availableInstanceIds.includes(id))
  ) {
    return { error: maxSelections > 1 ? `Choose between 1 and ${maxSelections} valid cards.` : 'Choose exactly one valid card.' };
  }

  const source = findCardInstance(state, pendingChoice.sourceInstanceId);
  const selected = selectedInstanceIds
    .map((id) => findCardInstance(state, id))
    .filter((card): card is GameCardInstance => Boolean(card));
  if (selected.length !== selectedInstanceIds.length) return { error: 'One or more selected cards are no longer available.' };
  let nextState: GameState = { ...state, pendingChoice: null };

  switch (pendingChoice.effect) {
    case 'artilleryDamage':
      nextState = damageUnit(nextState, selected[0]!, 4);
      break;
    case 'biscuitBottom': {
      const deck = getOwnerPrivateZone(nextState, 'player', 'deck');
      const top = deck.find((card) => card.instanceId === selected[0]!.instanceId);
      if (!top) return { error: 'That card is no longer on top of your deck.' };
      nextState = setOwnerPrivateZone(nextState, 'player', 'deck', [...deck.filter((card) => card.instanceId !== top.instanceId), top]);
      break;
    }
    case 'biscuitReturn': {
      const biscuit = selected[0]!;
      const zone = findPlayZone(nextState, biscuit.instanceId);
      if (!zone) return { error: 'Biscuit is no longer in play.' };
      const zoneCards = zone === 'staging'
        ? getOwnerPrivateZone(nextState, getCardController(biscuit), 'staging')
        : nextState.zones[zone];
      const attachments = zoneCards.filter((card) => card.attachedToInstanceId === biscuit.instanceId);
      const removedIds = new Set([biscuit.instanceId, ...attachments.map((card) => card.instanceId)]);
      const remaining = zoneCards.filter((card) => !removedIds.has(card.instanceId));
      nextState = zone === 'staging'
        ? setOwnerPrivateZone(nextState, getCardController(biscuit), 'staging', remaining)
        : { ...nextState, zones: { ...nextState.zones, [zone]: remaining } };
      nextState = setOwnerPrivateZone(
        nextState,
        biscuit.owner,
        'deck',
        [...getOwnerPrivateZone(nextState, biscuit.owner, 'deck'), prepareCardForZone(biscuit, 'deck')]
      );
      for (const attachment of attachments) {
        nextState = setOwnerPrivateZone(
          nextState,
          attachment.owner,
          'graveyard',
          [prepareCardForZone(attachment, 'graveyard'), ...getOwnerPrivateZone(nextState, attachment.owner, 'graveyard')]
        );
      }
      nextState = drawCards(nextState, pendingChoice.owner, 1, pendingChoice.sourceName);
      break;
    }
    case 'celesteExhaust':
    case 'smokescreen':
      nextState = updateUnitInPlay(nextState, selected[0]!.instanceId, (unit) => ({ ...unit, ready: false }));
      break;
    case 'communityEffort':
      for (const unit of selected) {
        nextState = updateUnitInPlay(nextState, unit.instanceId, (current) => ({ ...current, ready: false }));
      }
      nextState = drawCards(nextState, 'player', selected.length, pendingChoice.sourceName);
      break;
    case 'strategistReady':
      nextState = readyUnitInPlay(nextState, selected[0]!.instanceId);
      break;
    case 'emergencyReturn':
      nextState = removeCardToHand(nextState, selected[0]!);
      break;
    case 'farsightDamage':
      nextState = damageUnit(nextState, selected[0]!, 1);
      break;
    case 'fortunaSacrifice':
      nextState = banishOrSacrificeTerritory(nextState, selected[0]!, false);
      nextState = drawCards(nextState, 'player', 1, pendingChoice.sourceName);
      break;
    case 'hallowedReturn': {
      const territory = source;
      const deadUnit = selected[0]!;
      if (!territory) return { error: 'Hallowed Sanctum is no longer in play.' };
      const graveyard = getOwnerPrivateZone(nextState, deadUnit.owner, 'graveyard');
      if (!graveyard.some((card) => card.instanceId === deadUnit.instanceId)) {
        return { error: 'That unit is no longer in its graveyard.' };
      }
      nextState = setOwnerPrivateZone(
        nextState,
        deadUnit.owner,
        'graveyard',
        graveyard.filter((card) => card.instanceId !== deadUnit.instanceId)
      );
    nextState = setOwnerPrivateZone(
      nextState,
      deadUnit.owner,
      'hand',
      shouldCardCeaseInZone(deadUnit, 'hand')
        ? getOwnerPrivateZone(nextState, deadUnit.owner, 'hand')
        : [prepareCardForZone(deadUnit, 'hand'), ...getOwnerPrivateZone(nextState, deadUnit.owner, 'hand')]
    );
      nextState = banishOrSacrificeTerritory(nextState, territory, false);
      break;
    }
    case 'musterReady':
      nextState = readyUnitInPlay(nextState, selected[0]!.instanceId);
      nextState = drawCards(nextState, 'player', 1, pendingChoice.sourceName);
      break;
    case 'medicPrevent':
      nextState = updateUnitInPlay(nextState, selected[0]!.instanceId, (unit) => ({ ...unit, preventNextCombatDamageThisTurn: true }));
      break;
    case 'resuscitate': {
      const graveyard = nextState.zones.graveyard;
      nextState = {
        ...nextState,
        zones: {
          ...nextState.zones,
          graveyard: graveyard.filter((card) => card.instanceId !== selected[0]!.instanceId),
          hand: shouldCardCeaseInZone(selected[0]!, 'hand')
            ? nextState.zones.hand
            : [prepareCardForZone(selected[0]!, 'hand'), ...nextState.zones.hand],
        },
      };
      break;
    }
    case 'seraphielReturn': {
      const graveyard = nextState.zones.graveyard;
      nextState = {
        ...nextState,
        zones: {
          ...nextState.zones,
          graveyard: graveyard.filter((card) => card.instanceId !== selected[0]!.instanceId),
          staging: [prepareCardForZone(selected[0]!, 'staging'), ...nextState.zones.staging],
        },
      };
      break;
    }
    case 'stormhammerExhaust':
      nextState = updateUnitInPlay(nextState, selected[0]!.instanceId, (unit) => ({ ...unit, ready: false }));
      if (source) {
        const damageTargets = (pendingChoice.contextInstanceIds ?? [])
          .map((id) => findCardInstance(nextState, id))
          .filter((card): card is GameCardInstance => Boolean(card));
        if (damageTargets.length > 0) {
          nextState = createPlayerChoice(
            nextState,
            { trigger: 'onEnter', source, controller: 'player', zone: findPlayZone(nextState, source.instanceId) },
            'stormhammerDamage',
            damageTargets,
            'Choose an enemy unit in staging to deal 4 damage to.'
          );
        }
      }
      break;
    case 'stormhammerDamage':
      nextState = damageUnit(nextState, selected[0]!, 4);
      if (source) {
        nextState = {
          ...nextState,
          log: addLogEntry(nextState, {
            suffix: `${source.card.name} dealt 4 damage to ${selected[0]!.card.name}.`,
          }),
        };
      }
      break;
    case 'suppression':
      nextState = banishCard(nextState, selected[0]!);
      break;
  }
  return nextState;
}

function banishOrSacrificeTerritory(state: GameState, territory: GameCardInstance, banish: boolean): GameState {
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) =>
    state.zones[candidate].some((card) => card.instanceId === territory.instanceId)
  );
  if (!zone) return state;
  let nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      [zone]: state.zones[zone].filter((card) => card.instanceId !== territory.instanceId),
    },
  };
  const destination = banish ? 'banish' : 'graveyard';
  nextState = setOwnerPrivateZone(
    nextState,
    territory.owner,
    destination,
    [prepareCardForZone(territory, destination), ...getOwnerPrivateZone(nextState, territory.owner, destination)]
  );
  return nextState;
}

export function applyHallowedSanctumDeath(
  state: GameState,
  unit: GameCardInstance,
  zone: ZoneId
): GameState {
  if (!BATTLEFIELD_ZONE_IDS.includes(zone as (typeof BATTLEFIELD_ZONE_IDS)[number])) return state;
  const sanctum = state.zones[zone].find(
    (card) => card.card.id === 'IMP062' && !card.faceDown && getCardController(card) === getCardController(unit)
  );
  if (!sanctum) return state;
  if (getCardController(sanctum) === 'player') {
    return createPlayerChoice(
      state,
      { trigger: 'onDeath', source: sanctum, controller: 'player', zone },
      'hallowedReturn',
      [unit],
      `Return ${unit.card.name} to its owner's hand and sacrifice Hallowed Sanctum?`,
      { optional: true }
    );
  }
  let nextState = setOwnerPrivateZone(
    state,
    unit.owner,
    'graveyard',
    getOwnerPrivateZone(state, unit.owner, 'graveyard').filter((card) => card.instanceId !== unit.instanceId)
  );
  nextState = setOwnerPrivateZone(
    nextState,
    unit.owner,
    'hand',
    shouldCardCeaseInZone(unit, 'hand')
      ? getOwnerPrivateZone(nextState, unit.owner, 'hand')
      : [prepareCardForZone(unit, 'hand'), ...getOwnerPrivateZone(nextState, unit.owner, 'hand')]
  );
  return banishOrSacrificeTerritory(nextState, sanctum, false);
}

export function applyLuxEndTurnAbilities(state: GameState, owner: Owner): GameState {
  let nextState = state;
  const vero = getFriendlyUnitsInPlay(nextState, owner).find((unit) => unit.card.id === 'IMP051');
  if (vero) {
    for (const unit of friendlyCombatUnits(nextState, owner)) {
      nextState = readyUnitInPlay(nextState, unit.instanceId);
    }
  }

  const biscuit = getFriendlyUnitsInPlay(nextState, owner).find(
    (unit) => unit.card.id === 'IMP038' && unit.endTurnAbilityResolvedTurn !== state.turn
  );
  if (biscuit) {
    nextState = updateUnitInPlay(nextState, biscuit.instanceId, (unit) => ({ ...unit, endTurnAbilityResolvedTurn: state.turn }));
    if (owner === 'player') {
      return createPlayerChoice(
        nextState,
        { trigger: 'static', source: biscuit, controller: owner, zone: findPlayZone(nextState, biscuit.instanceId) },
        'biscuitReturn',
        [biscuit],
        'Put Biscuit on the bottom of your deck and draw a card?',
        { optional: true, resumeTurnAdvance: true }
      );
    }
  }

  const fortuna = BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    nextState.zones[zone].map((card) => ({ card, zone }))
  ).find(({ card, zone }) =>
    card.card.id === 'IMP061' &&
    !card.faceDown &&
    getCardController(card) === owner &&
    card.endTurnAbilityResolvedTurn !== state.turn &&
    nextState.zones[zone].some((unit) => isUnitCard(unit.card) && getCardController(unit) === owner)
  );
  if (fortuna) {
    nextState = {
      ...nextState,
      zones: {
        ...nextState.zones,
        [fortuna.zone]: nextState.zones[fortuna.zone].map((card) =>
          card.instanceId === fortuna.card.instanceId ? { ...card, endTurnAbilityResolvedTurn: state.turn } : card
        ),
      },
    };
    if (owner === 'player') {
      return createPlayerChoice(
        nextState,
        { trigger: 'static', source: fortuna.card, controller: owner, zone: fortuna.zone },
        'fortunaSacrifice',
        [fortuna.card],
        'Sacrifice Fortuna Bank to draw a card?',
        { optional: true, resumeTurnAdvance: true }
      );
    }
    nextState = drawCards(banishOrSacrificeTerritory(nextState, fortuna.card, false), owner, 1, fortuna.card.card.name);
  }
  return nextState;
}

const acknowledgeRule: AbilityHandler = ({ state }) => ({ state, resolved: false });

export function createLuxAbilityHandlers() {
  return {
    acknowledgeRule,
    armoredCarrier: resolveArmoredCarrier,
    artilleryBarrage,
    biscuitAttack: resolveBiscuitAttack,
    bladewolfDefend: resolveBladewolfDefend,
    celesteReady,
    communityEffort: resolveCommunityEffort,
    concordStrategist,
    emergencyExtraction,
    farsightOperative,
    fortunaFlip: resolveFortunaFlip,
    frontlineOfficer: resolveFrontlineOfficer,
    musterForBattle,
    nekoraMedic,
    resuscitate,
    seraphielDeath: resolveSeraphielDeath,
    seraphielScore,
    smokescreen,
    stormhammerHowitzer: resolveStormhammer,
    suppression,
    veroAttack: resolveVeroAttack,
  };
}
