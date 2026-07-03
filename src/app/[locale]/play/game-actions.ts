import {
  BATTLEFIELD_ZONES,
  addLogEntry,
  canManuallySupplyFromHand,
  exhaustSupplyForCost,
  getAttachedCards,
  getBattlefieldPlacementError,
  getCardController,
  getEquipmentAttachmentError,
  getManualPlayCost,
  getModifiedPlayCost,
  getPlayCost,
  getPlayCostError,
  getRenownedUnitLimitError,
  getStagingPlacementError,
  isItemCard,
  isTerritoryCard,
  isTacticCard,
  isUnitCard,
  markSuppliedThisTurn,
  moveCardsToOwnerGraveyards,
  placeCardIntoSupply,
  placeStartingSupply,
  prepareCardForZone,
  recordCardsDrawn,
  resolveUnitTakesControlOfZone,
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
  sacrificeUnitInstanceId?: string;
  discardCardInstanceId?: string;
  reanimateTargetInstanceId?: string;
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

function getOwnedUnitsInPlay(state: GameState, owner: Owner): GameCardInstance[] {
  const ownerZones = getOwnerZoneMap(state, owner);

  return [
    ...ownerZones.staging,
    ...state.zones.battlefieldLeft,
    ...state.zones.battlefieldCenter,
    ...state.zones.battlefieldRight,
  ].filter((instance) => getCardController(instance) === owner && isUnitCard(instance.card));
}

function applyAdditionalPlayCost(
  state: GameState,
  owner: Owner,
  card: GameCardInstance,
  options: MoveCardOptions
): CardActionResult {
  if (card.card.id === 'IMP004') {
    const targetId = options.sacrificeUnitInstanceId;

    if (!targetId) {
      return rejected(state, 'Choose a friendly unit to sacrifice to play Demonic Berserker.');
    }

    const ownerZones = getOwnerZoneMap(state, owner);
    const targetZone = (['staging', 'battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'] as const).find((zone) =>
      (zone === 'staging' ? ownerZones.staging : state.zones[zone]).some(
        (instance) => instance.instanceId === targetId && getCardController(instance) === owner && isUnitCard(instance.card)
      )
    );

    if (!targetZone) {
      return rejected(state, 'That unit cannot be sacrificed to play Demonic Berserker.');
    }

    const zoneCards = targetZone === 'staging' ? ownerZones.staging : state.zones[targetZone];
    const sacrificedUnit = zoneCards.find((instance) => instance.instanceId === targetId)!;
    const sacrificedIds = new Set([
      sacrificedUnit.instanceId,
      ...zoneCards.filter((instance) => instance.attachedToInstanceId === sacrificedUnit.instanceId).map((instance) => instance.instanceId),
    ]);
    const remainingZoneCards = zoneCards.filter((instance) => !sacrificedIds.has(instance.instanceId));
    const sacrificedCards = zoneCards.filter((instance) => sacrificedIds.has(instance.instanceId));
    const removedState = targetZone === 'staging'
      ? applyOwnerZoneMap(state, owner, {
          ...ownerZones,
          staging: remainingZoneCards,
        })
      : {
          ...state,
          zones: {
            ...state.zones,
            [targetZone]: remainingZoneCards,
          },
        };

    const nextState = moveCardsToOwnerGraveyards(removedState, sacrificedCards);
    const loggedState = {
      ...nextState,
      log: addLogEntry(nextState, {
        prefix: owner === 'player' ? 'Sacrificed ' : 'Bot sacrificed ',
        cardName: sacrificedUnit.card.name,
        suffix: ' to play Demonic Berserker.',
      }),
    };

    return applied(triggerCardAbilities(loggedState, 'onDeath', {
      source: sacrificedUnit,
      controller: owner,
      zone: 'graveyard',
    }));
  }

  if (card.card.id === 'IMP005') {
    const discardId = options.discardCardInstanceId;
    const ownerZones = getOwnerZoneMap(state, owner);

    if (!discardId) {
      return rejected(state, 'Choose a card to discard to play Dreadscythe Myrmidon.');
    }

    const discardedCard = ownerZones.hand.find(
      (instance) => instance.instanceId === discardId && instance.instanceId !== card.instanceId
    );

    if (!discardedCard) {
      return rejected(state, 'That card cannot be discarded to play Dreadscythe Myrmidon.');
    }

    const nextState = applyOwnerZoneMap(state, owner, {
      ...ownerZones,
      hand: ownerZones.hand.filter((instance) => instance.instanceId !== discardedCard.instanceId),
      graveyard: [prepareCardForZone(discardedCard, 'graveyard'), ...ownerZones.graveyard],
    });

    return applied({
      ...nextState,
      log: addLogEntry(state, {
        prefix: owner === 'player' ? 'Discarded ' : 'Bot discarded ',
        cardName: discardedCard.card.name,
        suffix: ' to play Dreadscythe Myrmidon.',
      }),
    });
  }

  return applied(state);
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

    const setupState = recordCardsDrawn({
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
    }, owner, setupSupply.replacementDraw.length);

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

  return applied(recordCardsDrawn(markSuppliedThisTurn({
    ...suppliedState,
    log: addLogEntry(state, {
      prefix: owner === 'player' ? 'Supplied ' : 'Bot supplied ',
      cardName: suppliedCard.selectedCard.card.name,
      suffix: ` and drew ${suppliedCard.replacementDraw.length} card.`,
    }),
  }, owner), owner, suppliedCard.replacementDraw.length));
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

  if (getCardController(card) !== owner) {
    return rejected(state, 'Only your face-down territories can be flipped manually.');
  }

  if (state.phase !== 'main' || state.activePlayer !== owner) {
    return rejected(state, `${owner === 'player' ? 'You can' : 'Bot can'} only flip a territory face up during ${owner === 'player' ? 'your' : 'its'} main turn.`);
  }

  const costError = getPlayCostError(state, owner, card.card);

  if (costError) {
    return rejected(state, costError);
  }

  const paidState = exhaustSupplyForCost(state, owner, getModifiedPlayCost(state, owner, card.card));
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

  const demonicAdvanceActive = owner === 'player'
    ? state.playerDemonicAdvanceActive
    : state.opponentDemonicAdvanceActive;
  const isDemonicAdvanceUnitPlay =
    fromZone === 'hand' &&
    BATTLEFIELD_ZONES.has(toZone) &&
    isUnitCard(card.card) &&
    demonicAdvanceActive &&
    !state.zones[toZone].some((instance) => isUnitCard(instance.card));

  if (
    fromZone === 'hand' &&
    toZone === 'graveyard' &&
    !isTacticCard(card.card)
  ) {
    return rejected(state, 'Only tactics can be played directly to the graveyard.');
  }

  if (fromZone === 'hand' && BATTLEFIELD_ZONES.has(toZone) && !isTerritoryCard(card.card) && !isDemonicAdvanceUnitPlay) {
    return rejected(state, `${ZONE_LABELS[toZone]} only accepts territories from hand.`);
  }

  if (BATTLEFIELD_ZONES.has(fromZone) && toZone === 'staging' && !isUnitCard(card.card)) {
    return rejected(state, 'Only units can retreat from a battlefield zone to staging.');
  }

  if (isUnitCard(card.card) && (toZone === 'staging' || BATTLEFIELD_ZONES.has(toZone))) {
    const sourceIsAlreadyInPlay = fromZone === 'staging' || BATTLEFIELD_ZONES.has(fromZone);
    const renownedLimitError = getRenownedUnitLimitError(
      state,
      owner,
      card,
      sourceIsAlreadyInPlay ? card.instanceId : null
    );

    if (renownedLimitError) {
      return rejected(state, renownedLimitError);
    }
  }

  const isPaidPlayFromHand =
    fromZone === 'hand' &&
    (
      (toZone === 'staging' && (isUnitCard(card.card) || isItemCard(card.card))) ||
      (BATTLEFIELD_ZONES.has(toZone) && (isTerritoryCard(card.card) || isDemonicAdvanceUnitPlay)) ||
      (toZone === 'graveyard' && isTacticCard(card.card))
    );
  const isPaidPlayFromGraveyard =
    fromZone === 'graveyard' &&
    toZone === 'staging' &&
    (card.card.id === 'IMP007' || card.card.id === 'IMP009');
  const isPaidPlay = isPaidPlayFromHand || isPaidPlayFromGraveyard;

  if (isPaidPlay) {
    if (state.phase !== 'main' || state.activePlayer !== owner) {
      return rejected(state, `${owner === 'player' ? 'You can' : 'Bot can'} only play cards during ${owner === 'player' ? 'your' : 'its'} main turn.`);
    }

    if (card.card.id === 'IMP004' && getOwnedUnitsInPlay(state, owner).length === 0) {
      return rejected(state, 'You need a friendly unit in play to sacrifice for Demonic Berserker.');
    }

    if (card.card.id === 'IMP005' && ownerZones.hand.filter((instance) => instance.instanceId !== card.instanceId).length === 0) {
      return rejected(state, 'You need another card in hand to discard for Dreadscythe Myrmidon.');
    }

    if (
      card.card.id === 'IMP006' &&
      !ownerZones.graveyard.some(
        (instance) => isUnitCard(instance.card) && !instance.card.type.toLowerCase().includes('renowned')
      )
    ) {
      return rejected(state, 'You need a non-Renowned unit in your graveyard to play Ebonblight Invoker.');
    }

    const cost = isTacticCard(card.card)
      ? getModifiedPlayCost(state, owner, card.card)
      : getManualPlayCost(card.card, toZone, { faceDown: options.faceDown });
    const readySupplyCount = ownerZones.supply.filter((instance) => instance.ready).length;

    if (readySupplyCount < cost) {
      return rejected(
        state,
        `Not enough ready supply. ${card.card.name} costs ${cost}, but you have ${readySupplyCount}.`
      );
    }
  }

  const additionalCostState = isPaidPlayFromHand ? applyAdditionalPlayCost(state, owner, card, options) : applied(state);

  if (isPaidPlayFromHand && additionalCostState.error) {
    return additionalCostState;
  }

  const paidState = isPaidPlay
    ? exhaustSupplyForCost(
        additionalCostState.state,
        owner,
        isTacticCard(card.card)
          ? getModifiedPlayCost(additionalCostState.state, owner, card.card)
          : getManualPlayCost(card.card, toZone, { faceDown: options.faceDown })
      )
    : state;
  const paidOwnerZones = getOwnerZoneMap(paidState, owner);
  const destinationCards = paidOwnerZones[toZone];
  const battlefieldPlacement = BATTLEFIELD_ZONES.has(toZone)
    ? splitBattlefieldReplacement(card, destinationCards)
    : { destinationCards, replacedTerritory: null };

  if (BATTLEFIELD_ZONES.has(toZone)) {
    const placementError = getBattlefieldPlacementError(
      isDemonicAdvanceUnitPlay ? { ...card, ready: true } : card,
      battlefieldPlacement.destinationCards
    );

    if (placementError) {
      return rejected(state, `${ZONE_LABELS[toZone]} ${placementError}`);
    }
  }

  const attachedCards =
    fromZone === 'staging' || BATTLEFIELD_ZONES.has(fromZone)
      ? getAttachedCards(paidOwnerZones[fromZone], card.instanceId)
      : [];
  const movedCardIds = new Set([card.instanceId, ...attachedCards.map((instance) => instance.instanceId)]);
  const sourceCards = paidOwnerZones[fromZone].filter((instance) => !movedCardIds.has(instance.instanceId));
  const graveyardCards = battlefieldPlacement.replacedTerritory
    ? [battlefieldPlacement.replacedTerritory, ...paidOwnerZones.graveyard]
    : paidOwnerZones.graveyard;
  const nextGraveyardCards = fromZone === 'graveyard' ? sourceCards : graveyardCards;
  const movedCard = prepareCardForZone(card, toZone, {
    faceDown: BATTLEFIELD_ZONES.has(toZone) && isTerritoryCard(card.card) ? options.faceDown : false,
    enterExhausted: toZone === 'staging' ? options.enterExhausted || BATTLEFIELD_ZONES.has(fromZone) : false,
    enterReady:
      isDemonicAdvanceUnitPlay
        ? true
        :
      fromZone === 'hand' && isItemCard(card.card)
        ? true
        : fromZone === 'graveyard' && card.card.id === 'IMP009'
          ? true
          : undefined,
    attachToInstanceId: isItemCard(card.card) ? options.attachToInstanceId ?? card.attachedToInstanceId : null,
  });
  if (fromZone === 'graveyard' && (card.card.id === 'IMP007' || card.card.id === 'IMP009')) {
    movedCard.banishOnDeath = true;
  }
  const movedAttachments = attachedCards.map((instance) =>
    prepareCardForZone(instance, toZone, {
      attachToInstanceId: movedCard.instanceId,
    })
  );
  const nextZones = {
    ...paidOwnerZones,
    [fromZone]: sourceCards,
    graveyard: nextGraveyardCards,
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
    ...(isDemonicAdvanceUnitPlay
      ? owner === 'player'
        ? { playerDemonicAdvanceActive: false }
        : { opponentDemonicAdvanceActive: false }
      : null),
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
          targets: options.reanimateTargetInstanceId ? [{ type: 'card', instanceId: options.reanimateTargetInstanceId }] : undefined,
        })
      : movedState;
  const entersFromPlay =
    isPaidPlay &&
    (toZone === 'staging' || BATTLEFIELD_ZONES.has(toZone));
  let enteredState =
    entersFromPlay
      ? triggerCardAbilities(playTriggeredState, 'onEnter', {
          source: movedCard,
          controller: owner,
          zone: toZone,
        })
      : playTriggeredState;

  if (isDemonicAdvanceUnitPlay) {
    enteredState = resolveUnitTakesControlOfZone(enteredState, toZone);
  }

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

  if (state.pendingChoice) {
    return rejected(state, 'Resolve the pending ability choice before taking another action.');
  }

  const ownerZones = getOwnerZoneMap(state, owner);
  const card = ownerZones[fromZone].find((instance) => instance.instanceId === instanceId) ?? null;

  if (!card) {
    return unchanged(state);
  }

  if (getCardController(card) !== owner) {
    return rejected(state, `${owner === 'player' ? 'You can' : 'Bot can'} only move ${owner === 'player' ? 'your' : 'its'} own cards.`);
  }

  if (fromZone === 'hand' && toZone === 'supply') {
    return placeSupply(state, owner, instanceId, options.setupFirstPlayer);
  }

  if (toZone === 'supply') {
    return rejected(state, 'Only cards from hand can be supplied manually.');
  }

  const isTacticPlay = fromZone === 'hand' && toZone === 'graveyard' && isTacticCard(card.card);
  if (
    toZone === 'deck' ||
    toZone === 'hand' ||
    (toZone === 'graveyard' && !isTacticPlay) ||
    toZone === 'banish'
  ) {
    return rejected(state, `Cards cannot be moved to ${ZONE_LABELS[toZone]} manually.`);
  }

  if (fromZone === toZone && BATTLEFIELD_ZONES.has(fromZone) && isTerritoryCard(card.card)) {
    return flipTerritory(state, owner, card, fromZone);
  }

  const isHandPlay =
    fromZone === 'hand' &&
    (toZone === 'staging' || BATTLEFIELD_ZONES.has(toZone) || isTacticPlay);
  const isSpecialGraveyardPlay =
    fromZone === 'graveyard' &&
    toZone === 'staging' &&
    (card.card.id === 'IMP007' || card.card.id === 'IMP009');
  const isRetreat =
    BATTLEFIELD_ZONES.has(fromZone) &&
    toZone === 'staging';

  if (!isHandPlay && !isRetreat && !isSpecialGraveyardPlay) {
    return rejected(state, `Cards cannot be moved from ${ZONE_LABELS[fromZone]} to ${ZONE_LABELS[toZone]} manually.`);
  }

  if (isRetreat && (state.phase !== 'main' || state.activePlayer !== owner)) {
    return rejected(state, `${owner === 'player' ? 'You can' : 'Bot can'} only retreat units during ${owner === 'player' ? 'your' : 'its'} main turn.`);
  }

  if (isRetreat && card.retreatLockedUntilNextTurn) {
    return rejected(state, 'That unit cannot retreat until your next turn because it captured the battlefield through combat this turn.');
  }

  if (isSpecialGraveyardPlay && (state.phase !== 'main' || state.activePlayer !== owner)) {
    return rejected(state, `${owner === 'player' ? 'You can' : 'Bot can'} only play cards during ${owner === 'player' ? 'your' : 'its'} main turn.`);
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
