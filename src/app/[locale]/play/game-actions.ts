import {
  BATTLEFIELD_ZONES,
  addLogEntry,
  canManuallySupplyFromHand,
  exhaustSupplyForCost,
  getAttachedCards,
  getBattlefieldPlacementError,
  getEquipmentAttachmentError,
  getManualPlayCost,
  getPlayCost,
  getPlayCostError,
  getStagingPlacementError,
  isItemCard,
  isTerritoryCard,
  isUnitCard,
  markSuppliedThisTurn,
  placeCardIntoSupply,
  placeStartingSupply,
  prepareCardForZone,
  stabilizeAttachmentState,
  splitBattlefieldReplacement,
  startGameAfterSetup,
  triggerCardAbilities,
  type GameCardInstance,
  type GameState,
  type Owner,
  type PrivateZones,
  type ZoneId,
} from './game-rules';

export type MoveCardOptions = {
  faceDown?: boolean;
  enterExhausted?: boolean;
  attachToInstanceId?: string;
  setupFirstPlayer?: Owner;
};

export type CardAction = {
  owner: Owner;
  instanceId: string;
  fromZone: ZoneId;
  toZone: ZoneId;
  options?: MoveCardOptions;
};

export type CardActionResult = {
  state: GameState;
  applied: boolean;
  error: string | null;
};

const ZONE_LABELS: Record<ZoneId, string> = {
  deck: 'Deck',
  hand: 'Hand',
  staging: 'Staging',
  supply: 'Supply',
  graveyard: 'Graveyard',
  banish: 'Banish',
  battlefieldLeft: 'Battlefield 1',
  battlefieldCenter: 'Battlefield 2',
  battlefieldRight: 'Battlefield 3',
};

function getOwnerZoneMap(state: GameState, owner: Owner): Record<ZoneId, GameCardInstance[]> {
  if (owner === 'player') {
    return state.zones;
  }

  return {
    ...state.opponentZones,
    battlefieldLeft: state.zones.battlefieldLeft,
    battlefieldCenter: state.zones.battlefieldCenter,
    battlefieldRight: state.zones.battlefieldRight,
  };
}

function applyOwnerZoneMap(
  state: GameState,
  owner: Owner,
  zones: Record<ZoneId, GameCardInstance[]>
): GameState {
  if (owner === 'player') {
    return {
      ...state,
      zones,
    };
  }

  const opponentZones: PrivateZones = {
    deck: zones.deck,
    hand: zones.hand,
    staging: zones.staging,
    supply: zones.supply,
    graveyard: zones.graveyard,
    banish: zones.banish,
  };

  return {
    ...state,
    zones: {
      ...state.zones,
      battlefieldLeft: zones.battlefieldLeft,
      battlefieldCenter: zones.battlefieldCenter,
      battlefieldRight: zones.battlefieldRight,
    },
    opponentZones,
  };
}

function unchanged(state: GameState): CardActionResult {
  return {
    state,
    applied: false,
    error: null,
  };
}

function rejected(state: GameState, error: string): CardActionResult {
  return {
    state: {
      ...state,
      log: addLogEntry(state, { suffix: error }),
    },
    applied: false,
    error,
  };
}

function applied(state: GameState): CardActionResult {
  return {
    state,
    applied: true,
    error: null,
  };
}

function placeSupply(
  state: GameState,
  owner: Owner,
  instanceId: string,
  setupFirstPlayer?: Owner
): CardActionResult {
  if (owner === 'player' && !state.playerStartingSupplyPlaced) {
    if (state.sessionMode === 'multiplayer' && !setupFirstPlayer) {
      return rejected(state, 'A first player is required to start a multiplayer game.');
    }

    const setupSupply = placeStartingSupply(state.zones, instanceId);

    if (!setupSupply) {
      return unchanged(state);
    }

    const setupState = {
      ...state,
      playerStartingSupplyPlaced: true,
      zones: {
        ...state.zones,
        ...setupSupply.zones,
      },
      log: addLogEntry(state, {
        prefix: 'Placed ',
        cardName: setupSupply.selectedCard.card.name,
        suffix: ` as starting supply and drew ${setupSupply.replacementDraw.length} replacement card.`,
      }),
    };

    if (setupState.sessionMode !== 'multiplayer') {
      return applied(setupState);
    }

    return applied(startGameAfterSetup(setupState, setupFirstPlayer!));
  }

  if (!canManuallySupplyFromHand(state, owner)) {
    return rejected(
      state,
      state.phase !== 'main' || state.activePlayer !== owner
        ? `${owner === 'player' ? 'You can' : 'Bot can'} only supply a card during ${owner === 'player' ? 'your' : 'its'} main turn.`
        : `${owner === 'player' ? 'You have' : 'Bot has'} already supplied a card this turn.`
    );
  }

  const ownerZones = getOwnerZoneMap(state, owner);
  const suppliedCard = placeCardIntoSupply(ownerZones, instanceId);

  if (!suppliedCard) {
    return unchanged(state);
  }

  const suppliedState = applyOwnerZoneMap(state, owner, {
    ...ownerZones,
    ...suppliedCard.zones,
  });

  return applied(markSuppliedThisTurn({
    ...suppliedState,
    log: addLogEntry(state, {
      prefix: owner === 'player' ? 'Supplied ' : 'Bot supplied ',
      cardName: suppliedCard.selectedCard.card.name,
      suffix: ` and drew ${suppliedCard.replacementDraw.length} card.`,
    }),
  }, owner));
}

function flipTerritory(
  state: GameState,
  owner: Owner,
  card: GameCardInstance,
  zone: ZoneId
): CardActionResult {
  if (!card.faceDown) {
    return unchanged(state);
  }

  if (card.owner !== owner) {
    return rejected(state, 'Only your face-down territories can be flipped manually.');
  }

  if (state.phase !== 'main' || state.activePlayer !== owner) {
    return rejected(state, `${owner === 'player' ? 'You can' : 'Bot can'} only flip a territory face up during ${owner === 'player' ? 'your' : 'its'} main turn.`);
  }

  const costError = getPlayCostError(state, owner, card.card);

  if (costError) {
    return rejected(state, costError);
  }

  const paidState = exhaustSupplyForCost(state, owner, getPlayCost(card.card));
  const ownerZones = getOwnerZoneMap(paidState, owner);
  const flippedCard = prepareCardForZone(card, zone, { faceDown: false });
  const flippedState = applyOwnerZoneMap(paidState, owner, {
      ...ownerZones,
      [zone]: ownerZones[zone].map((instance) =>
        instance.instanceId === card.instanceId ? flippedCard : instance
      ),
    });
  const loggedState = {
    ...flippedState,
    log: addLogEntry(paidState, {
      prefix: owner === 'player' ? 'Flipped ' : 'Bot flipped ',
      cardName: card.card.name,
      suffix: ` face up in ${ZONE_LABELS[zone]}.`,
    }),
  };

  return applied(triggerCardAbilities(loggedState, 'onFlip', {
    source: flippedCard,
    controller: owner,
    zone,
  }));
}

function moveCard(
  state: GameState,
  owner: Owner,
  card: GameCardInstance,
  fromZone: ZoneId,
  toZone: ZoneId,
  options: MoveCardOptions
): CardActionResult {
  const ownerZones = getOwnerZoneMap(state, owner);

  if (fromZone === 'hand' && toZone === 'staging') {
    if (isUnitCard(card.card)) {
      const placementError = getStagingPlacementError(card);

      if (placementError) {
        return rejected(state, placementError);
      }
    } else if (isItemCard(card.card)) {
      const attachmentError = getEquipmentAttachmentError(ownerZones.staging, owner, options.attachToInstanceId);

      if (attachmentError) {
        return rejected(state, attachmentError);
      }
    } else {
      return rejected(state, 'Only units and equipment can be played to staging.');
    }
  }

  if (fromZone === 'hand' && BATTLEFIELD_ZONES.has(toZone) && !isTerritoryCard(card.card)) {
    return rejected(state, `${ZONE_LABELS[toZone]} only accepts territories from hand.`);
  }

  if (BATTLEFIELD_ZONES.has(fromZone) && toZone === 'staging' && !isUnitCard(card.card)) {
    return rejected(state, 'Only units can retreat from a battlefield zone to staging.');
  }

  const isPaidPlayFromHand =
    fromZone === 'hand' &&
    (
      (toZone === 'staging' && (isUnitCard(card.card) || isItemCard(card.card))) ||
      (BATTLEFIELD_ZONES.has(toZone) && isTerritoryCard(card.card))
    );

  if (isPaidPlayFromHand) {
    if (state.phase !== 'main' || state.activePlayer !== owner) {
      return rejected(state, `${owner === 'player' ? 'You can' : 'Bot can'} only play cards during ${owner === 'player' ? 'your' : 'its'} main turn.`);
    }

    const cost = getManualPlayCost(card.card, toZone, { faceDown: options.faceDown });
    const readySupplyCount = ownerZones.supply.filter((instance) => instance.ready).length;

    if (readySupplyCount < cost) {
      return rejected(
        state,
        `Not enough ready supply. ${card.card.name} costs ${cost}, but you have ${readySupplyCount}.`
      );
    }
  }

  const paidState = isPaidPlayFromHand
    ? exhaustSupplyForCost(state, owner, getManualPlayCost(card.card, toZone, { faceDown: options.faceDown }))
    : state;
  const paidOwnerZones = getOwnerZoneMap(paidState, owner);
  const destinationCards = paidOwnerZones[toZone];
  const battlefieldPlacement = BATTLEFIELD_ZONES.has(toZone)
    ? splitBattlefieldReplacement(card, destinationCards)
    : { destinationCards, replacedTerritory: null };

  if (BATTLEFIELD_ZONES.has(toZone)) {
    const placementError = getBattlefieldPlacementError(card, battlefieldPlacement.destinationCards);

    if (placementError) {
      return rejected(state, `${ZONE_LABELS[toZone]} ${placementError}`);
    }
  }

  const attachedCards =
    fromZone === 'staging' || BATTLEFIELD_ZONES.has(fromZone)
      ? getAttachedCards(ownerZones[fromZone], card.instanceId)
      : [];
  const movedCardIds = new Set([card.instanceId, ...attachedCards.map((instance) => instance.instanceId)]);
  const sourceCards = ownerZones[fromZone].filter((instance) => !movedCardIds.has(instance.instanceId));
  const graveyardCards = battlefieldPlacement.replacedTerritory
    ? [battlefieldPlacement.replacedTerritory, ...paidOwnerZones.graveyard]
    : paidOwnerZones.graveyard;
  const movedCard = prepareCardForZone(card, toZone, {
    faceDown: BATTLEFIELD_ZONES.has(toZone) && isTerritoryCard(card.card) ? options.faceDown : false,
    enterExhausted: toZone === 'staging' ? options.enterExhausted || BATTLEFIELD_ZONES.has(fromZone) : false,
    enterReady: fromZone === 'hand' && isItemCard(card.card) ? true : undefined,
    attachToInstanceId: isItemCard(card.card) ? options.attachToInstanceId ?? card.attachedToInstanceId : null,
  });
  const movedAttachments = attachedCards.map((instance) =>
    prepareCardForZone(instance, toZone, {
      attachToInstanceId: movedCard.instanceId,
    })
  );
  const nextZones = {
    ...paidOwnerZones,
    [fromZone]: sourceCards,
    graveyard: graveyardCards,
    [toZone]: [movedCard, ...movedAttachments, ...battlefieldPlacement.destinationCards],
  };
  const stabilizedAttachments = stabilizeAttachmentState(nextZones, owner);
  const attachmentTargetName =
    isItemCard(card.card) && toZone === 'staging' && options.attachToInstanceId
      ? ownerZones.staging.find((instance) => instance.instanceId === options.attachToInstanceId)?.card.name ?? null
      : null;
  const movedZoneState = applyOwnerZoneMap(paidState, owner, stabilizedAttachments.zones);
  let movedState = {
    ...movedZoneState,
    log: addLogEntry(state, {
      prefix: owner === 'player' ? 'Moved ' : 'Bot moved ',
      cardName: card.card.name,
      suffix: attachmentTargetName
        ? ` from ${ZONE_LABELS[fromZone]} to ${ZONE_LABELS[toZone]}, attaching to ${attachmentTargetName}.`
        : battlefieldPlacement.replacedTerritory
          ? ` from ${ZONE_LABELS[fromZone]} to ${ZONE_LABELS[toZone]}, replacing ${battlefieldPlacement.replacedTerritory.card.name}.`
          : ` from ${ZONE_LABELS[fromZone]} to ${ZONE_LABELS[toZone]}.`,
    }),
  };

  if (stabilizedAttachments.orphanedAttachments.length > 0) {
    const orphanedNames = stabilizedAttachments.orphanedAttachments.map((instance) => instance.card.name);
    const orphanedLabel =
      orphanedNames.length === 1
        ? orphanedNames[0]
        : `${orphanedNames.slice(0, -1).join(', ')}, and ${orphanedNames[orphanedNames.length - 1]}`;

    movedState = {
      ...movedState,
      log: addLogEntry(movedState, {
        suffix: `${orphanedLabel} ${orphanedNames.length === 1 ? 'was' : 'were'} sent to Graveyard because ${
          orphanedNames.length === 1 ? 'it no longer has' : 'they no longer have'
        } a legal unit to equip.`,
      }),
    };
  }

  const playTriggeredState =
    fromZone === 'hand'
      ? triggerCardAbilities(movedState, 'onPlay', {
          source: movedCard,
          controller: owner,
          zone: toZone,
        })
      : movedState;
  const enteredState =
    toZone === 'staging' || BATTLEFIELD_ZONES.has(toZone)
      ? triggerCardAbilities(playTriggeredState, 'onEnter', {
          source: movedCard,
          controller: owner,
          zone: toZone,
        })
      : playTriggeredState;

  return applied(enteredState);
}

export function applyCardAction(
  state: GameState,
  {
    owner,
    instanceId,
    fromZone,
    toZone,
    options = {},
  }: CardAction
): CardActionResult {
  if (state.winner) {
    return rejected(state, 'The game is over.');
  }

  if (state.pendingCombat) {
    return rejected(state, 'Resolve the pending combat before taking another action.');
  }

  const ownerZones = getOwnerZoneMap(state, owner);
  const card = ownerZones[fromZone].find((instance) => instance.instanceId === instanceId) ?? null;

  if (!card) {
    return unchanged(state);
  }

  if (card.owner !== owner) {
    return rejected(state, `${owner === 'player' ? 'You can' : 'Bot can'} only move ${owner === 'player' ? 'your' : 'its'} own cards.`);
  }

  if (fromZone === 'hand' && toZone === 'supply') {
    return placeSupply(state, owner, instanceId, options.setupFirstPlayer);
  }

  if (toZone === 'supply') {
    return rejected(state, 'Only cards from hand can be supplied manually.');
  }

  if (toZone === 'deck' || toZone === 'hand' || toZone === 'graveyard' || toZone === 'banish') {
    return rejected(state, `Cards cannot be moved to ${ZONE_LABELS[toZone]} manually.`);
  }

  if (fromZone === toZone && BATTLEFIELD_ZONES.has(fromZone) && isTerritoryCard(card.card)) {
    return flipTerritory(state, owner, card, fromZone);
  }

  const isHandPlay =
    fromZone === 'hand' &&
    (toZone === 'staging' || BATTLEFIELD_ZONES.has(toZone));
  const isRetreat =
    BATTLEFIELD_ZONES.has(fromZone) &&
    toZone === 'staging';

  if (!isHandPlay && !isRetreat) {
    return rejected(state, `Cards cannot be moved from ${ZONE_LABELS[fromZone]} to ${ZONE_LABELS[toZone]} manually.`);
  }

  if (isRetreat && (state.phase !== 'main' || state.activePlayer !== owner)) {
    return rejected(state, `${owner === 'player' ? 'You can' : 'Bot can'} only retreat units during ${owner === 'player' ? 'your' : 'its'} main turn.`);
  }

  return moveCard(state, owner, card, fromZone, toZone, options);
}

export function applyPlayerCardAction(
  state: GameState,
  action: Omit<CardAction, 'owner'>
): CardActionResult {
  return applyCardAction(state, {
    ...action,
    owner: 'player',
  });
}
