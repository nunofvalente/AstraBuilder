import type {
  AbilityHandler,
  CardAbilityDefinition,
  TriggeredAbilityDefinition,
} from './card-abilities';

export type SolaraAbilityHandlers = {
  acknowledgeRule: AbilityHandler;
  ashfangPillager: AbilityHandler;
  ashfangRaider: AbilityHandler;
  brand: AbilityHandler;
  enrage: AbilityHandler;
  fearlessWhelp: AbilityHandler;
  firedancer: AbilityHandler;
  lavaFlow: AbilityHandler;
  landbreaker: AbilityHandler;
  lingyi: AbilityHandler;
  markOfDeath: AbilityHandler;
  ransack: AbilityHandler;
  rockjaw: AbilityHandler;
  rocketBarrage: AbilityHandler;
  uprising: AbilityHandler;
  varenthus: AbilityHandler;
  voraciousWyvern: AbilityHandler;
  wyrmscarDragon: AbilityHandler;
  zhufeng: AbilityHandler;
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

export function createSolaraCardAbilityRegistry(
  handlers: SolaraAbilityHandlers
): Record<string, CardAbilityDefinition> {
  const staticRule = (id: string, text: string) =>
    rule(id, 'static', 'static', text, handlers.acknowledgeRule);

  return {
    IMP096: { cardId: 'IMP096', abilities: [rule('IMP096-exhaust-supply', 'onPlay', 'automatic', "On Play: Exhaust target supply card. It doesn't ready during its controller's next ready phase.", handlers.ashfangPillager)] },
    IMP097: { cardId: 'IMP097', abilities: [rule('IMP097-attack-unoccupied', 'onEnter', 'automatic', 'On Enter: This unit can only attack unoccupied combat zones this turn.', handlers.ashfangRaider)] },
    IMP098: { cardId: 'IMP098', abilities: [] },
    IMP099: { cardId: 'IMP099', abilities: [staticRule('IMP099-no-attacking-combat-damage', "This unit doesn't take combat damage while attacking.")] },
    IMP100: { cardId: 'IMP100', abilities: [rule('IMP100-draw-card', 'onDeath', 'automatic', 'On Death: Draw a card.', handlers.fearlessWhelp)] },
    IMP101: { cardId: 'IMP101', abilities: [rule('IMP101-grant-glory', 'onAttack', 'optional', 'On Attack: Another target friendly unit gains Glory 1 until end of turn.', handlers.firedancer)] },
    IMP102: { cardId: 'IMP102', abilities: [staticRule('IMP102-flanking', 'Flanking.'), staticRule('IMP102-reveal-top', 'When this unit takes control of a combat zone, reveal the top card of your deck. Until end of turn, you may play it or use it to extend supply.')] },
    IMP103: { cardId: 'IMP103', abilities: [] },
    IMP104: { cardId: 'IMP104', abilities: [staticRule('IMP104-blitz', 'Blitz.')] },
    IMP105: { cardId: 'IMP105', abilities: [rule('IMP105-banish-play', 'onEnter', 'optional', 'On Enter: You may banish a unit card from your hand. It gains Blitz and can be played from banish once.', handlers.lingyi)] },
    IMP106: { cardId: 'IMP106', abilities: [staticRule('IMP106-blitz', 'Blitz.')] },
    IMP107: { cardId: 'IMP107', abilities: [staticRule('IMP107-glory', 'Glory 2.')] },
    IMP108: { cardId: 'IMP108', abilities: [rule('IMP108-retreat-and-enter', 'onPlay', 'optional', 'On Play: You may force retreat a friendly unit in a combat zone. If you do, place this directly into that combat zone ready.', handlers.rockjaw)] },
    IMP109: { cardId: 'IMP109', abilities: [staticRule('IMP109-reveal-top', 'Whenever this unit destroys a defending unit in combat, reveal the top card of your deck. Until end of turn, you may play it or use it to extend supply.')] },
    IMP110: { cardId: 'IMP110', abilities: [staticRule('IMP110-glory', 'Glory 1.')] },
    IMP111: { cardId: 'IMP111', abilities: [staticRule('IMP111-fortify', 'Fortify.'), rule('IMP111-sacrifice-destroy', 'onAttack', 'optional', 'On Attack: You may sacrifice any number of units. If you do, destroy that many target enemy units in combat zones.', handlers.varenthus)] },
    IMP112: { cardId: 'IMP112', abilities: [staticRule('IMP112-flanking', 'Flanking.'), rule('IMP112-ready-attack', 'onReady', 'automatic', "On Ready: If it's your turn, this unit attacks a combat zone controlled by an enemy unit.", handlers.voraciousWyvern)] },
    IMP113: { cardId: 'IMP113', abilities: [rule('IMP113-defender-damage', 'onAttack', 'automatic', 'On Attack: Deal 2 damage to the defending unit.', handlers.wyrmscarDragon)] },
    IMP114: { cardId: 'IMP114', abilities: [rule('IMP114-ready', 'onDefend', 'automatic', 'On Defend: Ready this unit.', handlers.zhufeng)] },
    IMP115: { cardId: 'IMP115', abilities: [rule('IMP115-damage-mark', 'onPlay', 'automatic', 'Deal 1 damage to target unit. If it dies this turn, gain 1 victory point.', handlers.brand)] },
    IMP116: { cardId: 'IMP116', abilities: [rule('IMP116-lava-flow', 'onPlay', 'automatic', 'Sacrifice a territory. If you do, deal 2 damage to all units in each staging area.', handlers.lavaFlow)] },
    IMP117: { cardId: 'IMP117', abilities: [rule('IMP117-mark-death', 'onPlay', 'automatic', 'The next time target enemy unit in a combat zone takes damage this turn, destroy it.', handlers.markOfDeath)] },
    IMP118: { cardId: 'IMP118', abilities: [rule('IMP118-destroy-permanent', 'onPlay', 'automatic', 'Destroy target territory or item.', handlers.ransack)] },
    IMP119: { cardId: 'IMP119', abilities: [rule('IMP119-damage', 'onPlay', 'automatic', 'Deal 3 damage to target unit in a combat zone.', handlers.rocketBarrage)] },
    IMP120: { cardId: 'IMP120', abilities: [rule('IMP120-buff-exhaust', 'onPlay', 'automatic', 'Target friendly unit gets +2/+0 until end of turn. You may exhaust target enemy unit in a combat zone.', handlers.uprising)] },
    IMP121: { cardId: 'IMP121', abilities: [rule('IMP121-buff-ready', 'onPlay', 'automatic', 'Target friendly unit gets +1/+0 until end of turn. Ready it.', handlers.enrage)] },
    IMP122: { cardId: 'IMP122', abilities: [staticRule('IMP122-glory', 'Equipped unit gains Glory 1.')] },
    IMP123: { cardId: 'IMP123', abilities: [staticRule('IMP123-return', 'When equipped unit dies while attacking, you may return this to your hand from your graveyard.')] },
    IMP124: { cardId: 'IMP124', abilities: [staticRule('IMP124-base-stats', 'Units in this zone have 3 base attack and health.')] },
    IMP125: { cardId: 'IMP125', abilities: [staticRule('IMP125-dig', 'Whenever a friendly unit scores this zone, put a dig counter here. At three counters, gain 2 victory points and sacrifice this territory.')] },
    IMP126: { cardId: 'IMP126', abilities: [staticRule('IMP126-end-retreat', 'At the end of your turn, you may pay {1} to force retreat a friendly unit with cost 2 or less from this zone.')] },
    IMP162: {
      cardId: 'IMP162',
      abilities: [
        staticRule('IMP162-flanking', 'Flanking.'),
        rule('IMP162-destroy-territory-buff', 'onAttack', 'optional', 'On Attack: You may destroy a territory in the same combat zone as this unit. If you do, this gets +2/+2 until end of turn.', handlers.landbreaker),
      ],
    },
  };
}
