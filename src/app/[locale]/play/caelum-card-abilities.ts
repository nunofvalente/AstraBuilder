import type {
  AbilityHandler,
  CardAbilityDefinition,
  TriggeredAbilityDefinition,
} from './card-abilities';

export type CaelumAbilityHandlers = {
  acknowledgeRule: AbilityHandler;
  abandonTheLab: AbilityHandler;
  airdrop: AbilityHandler;
  breachTheDam: AbilityHandler;
  cloudbreachLeviathan: AbilityHandler;
  complexStratagem: AbilityHandler;
  courierDrone: AbilityHandler;
  forcedConfession: AbilityHandler;
  genesisActivated: AbilityHandler;
  inquisitionDrone: AbilityHandler;
  levitarInquisitor: AbilityHandler;
  lockdownEnforcer: AbilityHandler;
  masterStrategist: AbilityHandler;
  rebound: AbilityHandler;
  renataActivated: AbilityHandler;
  renataProtect: AbilityHandler;
  repulsiveExperiment: AbilityHandler;
  skybreakerGunship: AbilityHandler;
  valeriaAttack: AbilityHandler;
  valeriaEnter: AbilityHandler;
  valrathianDreadnought: AbilityHandler;
  voidWarp: AbilityHandler;
  wingshieldTransport: AbilityHandler;
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

export function createCaelumCardAbilityRegistry(
  handlers: CaelumAbilityHandlers
): Record<string, CardAbilityDefinition> {
  const staticRule = (id: string, text: string) =>
    rule(id, 'static', 'static', text, handlers.acknowledgeRule);

  return {
    IMP064: {
      cardId: 'IMP064',
      abilities: [rule('IMP064-return-unit', 'onEnter', 'optional', "On Enter: You may return target unit to its owner's hand.", handlers.cloudbreachLeviathan)],
    },
    IMP065: {
      cardId: 'IMP065',
      abilities: [rule('IMP065-draw-card', 'onDeath', 'automatic', 'On Death: Draw a card.', handlers.courierDrone)],
    },
    IMP066: {
      cardId: 'IMP066',
      abilities: [
        staticRule('IMP066-cost-reduction', 'Your Caelum units cost {1} less to play.'),
        rule('IMP066-influence', 'activated', 'activated', '{Exhaust}: Target friendly unit gets +1 influence until end of turn.', handlers.genesisActivated),
      ],
    },
    IMP067: {
      cardId: 'IMP067',
      abilities: [
        staticRule('IMP067-fortify', 'Fortify.'),
        staticRule('IMP067-score-lock', 'While this unit controls a combat zone, all other combat zones do not score.'),
      ],
    },
    IMP068: {
      cardId: 'IMP068',
      abilities: [rule('IMP068-reveal-territory', 'onEnter', 'automatic', "On Enter: Reveal target enemy facedown territory card. Return it to its owner's hand.", handlers.inquisitionDrone)],
    },
    IMP069: {
      cardId: 'IMP069',
      abilities: [staticRule('IMP069-force-retreat', 'Force retreat this unit after it destroys another unit through combat damage.')],
    },
    IMP070: {
      cardId: 'IMP070',
      abilities: [rule('IMP070-suppress-abilities', 'onEnter', 'automatic', 'On Enter: Target enemy unit has no abilities this turn.', handlers.levitarInquisitor)],
    },
    IMP071: {
      cardId: 'IMP071',
      abilities: [rule('IMP071-exhaust-skip-ready', 'onEnter', 'optional', "On Enter: You may exhaust target enemy unit. It doesn't ready during its controller's next ready phase.", handlers.lockdownEnforcer)],
    },
    IMP072: {
      cardId: 'IMP072',
      abilities: [rule('IMP072-draw-discard', 'onEnter', 'optional', 'On Enter: You may draw a card. If you do, discard a card.', handlers.masterStrategist)],
    },
    IMP073: {
      cardId: 'IMP073',
      abilities: [
        rule('IMP073-protect-drone-vehicle', 'onEnter', 'automatic', "On Enter: Target friendly Drone or Vehicle can't be targeted by enemy tactics until end of turn.", handlers.renataProtect),
        rule('IMP073-ready-buff', 'activated', 'activated', '{Exhaust},{2}: Ready target friendly Drone or Vehicle. It gets +2/+2 until end of turn.', handlers.renataActivated),
      ],
    },
    IMP074: {
      cardId: 'IMP074',
      abilities: [rule('IMP074-score-lock', 'onDeath', 'automatic', "On Death: If this was in a combat zone, enemy units can't score that zone until the start of your next turn.", handlers.repulsiveExperiment)],
    },
    IMP075: { cardId: 'IMP075', abilities: [] },
    IMP076: {
      cardId: 'IMP076',
      abilities: [rule('IMP076-staging-damage', 'onRetreat', 'optional', 'On Retreat: You may deal 2 damage to target enemy unit in a staging area.', handlers.skybreakerGunship)],
    },
    IMP077: {
      cardId: 'IMP077',
      abilities: [staticRule('IMP077-tactic-buff', 'Whenever you play a tactic during your turn, this unit gets +1/+1 until end of turn.')],
    },
    IMP078: {
      cardId: 'IMP078',
      abilities: [
        rule('IMP078-force-retreat', 'onEnter', 'optional', 'On Enter: You may force retreat target unit in a combat zone.', handlers.valeriaEnter),
        rule('IMP078-exhaust-combat-unit', 'onAttack', 'automatic', 'On Attack: Exhaust target unit in a combat zone.', handlers.valeriaAttack),
      ],
    },
    IMP079: {
      cardId: 'IMP079',
      abilities: [
        staticRule('IMP079-fortify', 'Fortify.'),
        rule('IMP079-destroy-unit', 'activated', 'activated', '{Exhaust},{3}: Destroy target unit. Use only in a combat zone and outside combat.', handlers.valrathianDreadnought),
      ],
    },
    IMP080: {
      cardId: 'IMP080',
      abilities: [staticRule('IMP080-extra-draw', 'Each player draws an extra card during their draw phase.')],
    },
    IMP081: {
      cardId: 'IMP081',
      abilities: [rule('IMP081-supply-to-hand', 'onEnter', 'optional', 'On Enter: You may reveal a card from your supply area and return it to your hand.', handlers.wingshieldTransport)],
    },
    IMP082: {
      cardId: 'IMP082',
      abilities: [rule('IMP082-airdrop', 'onPlay', 'optional', 'Look at the top card of your deck. You may put it into your hand or your supply area exhausted.', handlers.airdrop)],
    },
    IMP083: {
      cardId: 'IMP083',
      abilities: [rule('IMP083-breach', 'onPlay', 'automatic', "Destroy all territories. Return all units and items in combat zones to their owners' hands.", handlers.breachTheDam)],
    },
    IMP084: {
      cardId: 'IMP084',
      abilities: [rule('IMP084-draw-two', 'onPlay', 'automatic', 'Draw two cards.', handlers.complexStratagem)],
    },
    IMP085: {
      cardId: 'IMP085',
      abilities: [rule('IMP085-damage-draw', 'onPlay', 'automatic', 'Deal 1 damage to target enemy unit. Draw a card.', handlers.forcedConfession)],
    },
    IMP086: {
      cardId: 'IMP086',
      abilities: [rule('IMP086-return-unit', 'onPlay', 'automatic', "Return target unit to its owner's hand.", handlers.rebound)],
    },
    IMP087: {
      cardId: 'IMP087',
      abilities: [rule('IMP087-delayed-return', 'onPlay', 'automatic', 'Choose target friendly unit. If it would die this turn, banish it instead and return it to your staging area at the start of your next main phase.', handlers.abandonTheLab)],
    },
    IMP088: {
      cardId: 'IMP088',
      abilities: [rule('IMP088-top-deck', 'onPlay', 'automatic', "Put target unit in a combat zone on the top of its owner's deck.", handlers.voidWarp)],
    },
    IMP089: {
      cardId: 'IMP089',
      abilities: [staticRule('IMP089-equipped-discard', 'When equipped unit dies, target opponent discards a card.')],
    },
    IMP090: {
      cardId: 'IMP090',
      abilities: [staticRule('IMP090-zone-control-vp', 'When equipped unit takes control of an unoccupied combat zone, return this item to your hand. If you do, gain 1 victory point.')],
    },
    IMP091: {
      cardId: 'IMP091',
      abilities: [staticRule('IMP091-score-supply', 'When equipped unit scores, you may place this card into your supply area exhausted.')],
    },
    IMP092: {
      cardId: 'IMP092',
      abilities: [staticRule('IMP092-tactic-return', 'Whenever your units take control of this zone, you may return a tactic card from your graveyard to your hand. If you do, sacrifice this territory.')],
    },
    IMP093: {
      cardId: 'IMP093',
      abilities: [staticRule('IMP093-score-discard', 'Whenever an enemy unit scores this zone, its controller discards a card.')],
    },
    IMP094: {
      cardId: 'IMP094',
      abilities: [staticRule('IMP094-ready-defender', 'Friendly units in this zone have "On Defend: Ready this unit."')],
    },
    IMP095: {
      cardId: 'IMP095',
      abilities: [
        staticRule('IMP095-start-move', 'At the start of your turn, move this territory to another combat zone.'),
        staticRule('IMP095-end-sweep', "At the end of your turn, you may return units and enemy territories in this zone to their owners' hands. If you do, sacrifice this territory."),
      ],
    },
  };
}
