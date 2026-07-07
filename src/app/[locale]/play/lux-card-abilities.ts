import type {
  AbilityHandler,
  CardAbilityDefinition,
  TriggeredAbilityDefinition,
} from './card-abilities';

export type LuxAbilityHandlers = {
  acknowledgeRule: AbilityHandler;
  armoredCarrier: AbilityHandler;
  artilleryBarrage: AbilityHandler;
  biscuitAttack: AbilityHandler;
  bladewolfDefend: AbilityHandler;
  celesteReady: AbilityHandler;
  communityEffort: AbilityHandler;
  concordStrategist: AbilityHandler;
  emergencyExtraction: AbilityHandler;
  farsightOperative: AbilityHandler;
  fortunaFlip: AbilityHandler;
  frontlineOfficer: AbilityHandler;
  musterForBattle: AbilityHandler;
  nekoraMedic: AbilityHandler;
  resuscitate: AbilityHandler;
  seraphielDeath: AbilityHandler;
  seraphielScore: AbilityHandler;
  smokescreen: AbilityHandler;
  stormhammerHowitzer: AbilityHandler;
  suppression: AbilityHandler;
  veroAttack: AbilityHandler;
};

function rule(
  id: string,
  trigger: TriggeredAbilityDefinition['trigger'],
  timing: TriggeredAbilityDefinition['timing'],
  text: string,
  resolve: AbilityHandler
): TriggeredAbilityDefinition {
  return { id, trigger, timing, text, resolve };
}

export function createLuxCardAbilityRegistry(
  handlers: LuxAbilityHandlers
): Record<string, CardAbilityDefinition> {
  const staticRule = (id: string, text: string) =>
    rule(id, 'static', 'static', text, handlers.acknowledgeRule);

  return {
    IMP033: { cardId: 'IMP033', abilities: [] },
    IMP034: {
      cardId: 'IMP034',
      abilities: [staticRule('IMP034-provoke', 'Provoke')],
    },
    IMP035: {
      cardId: 'IMP035',
      abilities: [
        staticRule('IMP035-provoke', 'Provoke'),
        staticRule('IMP035-combat-tactic-protection', "This unit can't be the target of enemy tactics during combat."),
      ],
    },
    IMP036: {
      cardId: 'IMP036',
      abilities: [rule('IMP036-create-drones', 'onDeath', 'automatic', 'On Death: Create two 1/1 Drone unit tokens with 0 influence.', handlers.armoredCarrier)],
    },
    IMP037: {
      cardId: 'IMP037',
      abilities: [staticRule('IMP037-provoke', 'Provoke')],
    },
    IMP038: {
      cardId: 'IMP038',
      abilities: [rule('IMP038-look-top', 'onAttack', 'optional', 'On Attack: You may look at the top card of your deck, then you may put it on the bottom.', handlers.biscuitAttack)],
    },
    IMP039: {
      cardId: 'IMP039',
      abilities: [rule('IMP039-ready-buff', 'onDefend', 'automatic', 'On Defend: Ready this unit. It gets +2/+0 during this combat.', handlers.bladewolfDefend)],
    },
    IMP040: {
      cardId: 'IMP040',
      abilities: [staticRule('IMP040-no-attacking-combat-damage', "This unit doesn't take combat damage while attacking.")],
    },
    IMP041: {
      cardId: 'IMP041',
      abilities: [rule('IMP041-exhaust-enemy', 'onReady', 'automatic', 'On Ready: Exhaust target enemy unit in a combat zone.', handlers.celesteReady)],
    },
    IMP042: {
      cardId: 'IMP042',
      abilities: [rule('IMP042-ready-friendly', 'onEnter', 'optional', 'On Enter: You may ready target friendly unit in a combat zone.', handlers.concordStrategist)],
    },
    IMP043: {
      cardId: 'IMP043',
      abilities: [rule('IMP043-damage-enemy', 'onEnter', 'automatic', 'On Enter: Deal 1 damage to target enemy unit.', handlers.farsightOperative)],
    },
    IMP044: {
      cardId: 'IMP044',
      abilities: [rule('IMP044-create-drone', 'onEnter', 'automatic', 'On Enter: Create a 1/1 Drone unit token with 0 influence.', handlers.frontlineOfficer)],
    },
    IMP045: {
      cardId: 'IMP045',
      abilities: [rule('IMP045-prevent-damage', 'onEnter', 'automatic', 'On Enter: The next combat damage dealt to target friendly defending unit this turn is prevented.', handlers.nekoraMedic)],
    },
    IMP046: {
      cardId: 'IMP046',
      abilities: [staticRule('IMP046-ready-exhausted-buff', 'Other friendly units get +1/+0 while ready or +0/+1 while exhausted.')],
    },
    IMP047: { cardId: 'IMP047', abilities: [] },
    IMP048: {
      cardId: 'IMP048',
      abilities: [
        rule('IMP048-return-unit', 'onScore', 'automatic', 'On Score: Return a unit card from your graveyard to your staging area.', handlers.seraphielScore),
        rule('IMP048-bottom-deck', 'onDeath', 'automatic', 'On Death: Place this card on the bottom of your deck.', handlers.seraphielDeath),
      ],
    },
    IMP049: {
      cardId: 'IMP049',
      abilities: [rule('IMP049-howitzer', 'onEnter', 'optional', 'On Enter: You may exhaust another ready staging unit to deal 4 damage to an enemy staging unit.', handlers.stormhammerHowitzer)],
    },
    IMP050: {
      cardId: 'IMP050',
      abilities: [staticRule('IMP050-attack-floor', "Units with 2 or less attack can't attack this unit.")],
    },
    IMP051: {
      cardId: 'IMP051',
      abilities: [rule('IMP051-team-buff', 'onAttack', 'automatic', 'On Attack: Other friendly units get +1/+1 until end of turn.', handlers.veroAttack)],
    },
    IMP052: {
      cardId: 'IMP052',
      abilities: [rule('IMP052-staging-damage', 'onPlay', 'automatic', 'Deal 4 damage to target enemy unit in a staging area.', handlers.artilleryBarrage)],
    },
    IMP053: {
      cardId: 'IMP053',
      abilities: [rule('IMP053-exhaust-draw', 'onPlay', 'automatic', 'Exhaust up to 3 friendly ready units, then draw that many cards.', handlers.communityEffort)],
    },
    IMP054: {
      cardId: 'IMP054',
      abilities: [rule('IMP054-return-unit', 'onPlay', 'automatic', 'Return a unit card from your graveyard to your hand.', handlers.resuscitate)],
    },
    IMP055: {
      cardId: 'IMP055',
      abilities: [rule('IMP055-exhaust-enemy', 'onPlay', 'automatic', 'Exhaust target enemy unit in a combat zone.', handlers.smokescreen)],
    },
    IMP056: {
      cardId: 'IMP056',
      abilities: [rule('IMP056-banish', 'onPlay', 'automatic', 'Banish target unit or territory.', handlers.suppression)],
    },
    IMP057: {
      cardId: 'IMP057',
      abilities: [rule('IMP057-return-friendly', 'onPlay', 'automatic', "Return target friendly unit or item to its owner's hand.", handlers.emergencyExtraction)],
    },
    IMP058: {
      cardId: 'IMP058',
      abilities: [rule('IMP058-ready-draw', 'onPlay', 'automatic', 'Ready target friendly unit. Draw a card.', handlers.musterForBattle)],
    },
    IMP059: { cardId: 'IMP059', abilities: [] },
    IMP060: {
      cardId: 'IMP060',
      abilities: [staticRule('IMP060-grant-provoke', 'Equipped unit gains Provoke.')],
    },
    IMP061: {
      cardId: 'IMP061',
      abilities: [rule('IMP061-add-supply', 'onFlip', 'automatic', 'On Flip: Add 3 supply until end of turn.', handlers.fortunaFlip)],
    },
    IMP062: {
      cardId: 'IMP062',
      abilities: [staticRule('IMP062-return-dead-unit', 'A friendly unit that dies in this combat zone may return to hand by sacrificing this territory.')],
    },
    IMP063: {
      cardId: 'IMP063',
      abilities: [staticRule('IMP063-quarantine', "Units can't attack or retreat from this zone, have no abilities, and this zone is not counted during scoring.")],
    },
    IMP161: {
      cardId: 'IMP161',
      abilities: [staticRule('IMP161-zone-health', 'Friendly units occupying this zone get +0/+2.')],
    },
  };
}
