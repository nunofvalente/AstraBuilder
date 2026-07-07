import type { AbilityHandler, CardAbilityDefinition, TriggeredAbilityDefinition } from './card-abilities';

export type TerraAbilityHandlers = {
  acknowledgeRule: AbilityHandler;
  canopyAmbush: AbilityHandler;
  coordinatedStrike: AbilityHandler;
  gaiaDeath: AbilityHandler;
  gaiaPlay: AbilityHandler;
  groveShaman: AbilityHandler;
  kingBeneathCanopy: AbilityHandler;
  lastStand: AbilityHandler;
  predatoryStrike: AbilityHandler;
  primordialHowl: AbilityHandler;
  ravenScore: AbilityHandler;
  sporeBloom: AbilityHandler;
  shadowveilHunter: AbilityHandler;
  sunderingWyrm: AbilityHandler;
  swiftAcrobatics: AbilityHandler;
  sylvanRallier: AbilityHandler;
  yakoIllusionist: AbilityHandler;
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

export function createTerraCardAbilityRegistry(
  handlers: TerraAbilityHandlers
): Record<string, CardAbilityDefinition> {
  const staticRule = (id: string, text: string) => rule(id, 'static', 'static', text, handlers.acknowledgeRule);
  return {
    IMP127: { cardId: 'IMP127', abilities: [staticRule('IMP127-fortify', 'Fortify.'), staticRule('IMP127-heal-after-kill', 'After this unit destroys an enemy through combat damage and survives, remove temporary damage from it.')] },
    IMP128: { cardId: 'IMP128', abilities: [staticRule('IMP128-impede', 'Impede 1.')] },
    IMP129: { cardId: 'IMP129', abilities: [] },
    IMP130: { cardId: 'IMP130', abilities: [staticRule('IMP130-fortify', 'Fortify.'), rule('IMP130-free-play', 'onPlay', 'optional', 'On Play: You may play a unit or territory from your hand without paying its supply cost.', handlers.gaiaPlay), rule('IMP130-bottom-deck', 'onDeath', 'automatic', 'On Death: Place this card on the bottom of your deck.', handlers.gaiaDeath)] },
    IMP131: { cardId: 'IMP131', abilities: [rule('IMP131-look-three', 'onEnter', 'optional', 'On Enter: Look at the top 3 cards of your deck. You may reveal a unit and add it to your hand. Put the rest on the bottom.', handlers.groveShaman)] },
    IMP132: { cardId: 'IMP132', abilities: [staticRule('IMP132-provoke', 'Provoke.'), staticRule('IMP132-impede', 'Impede 1.')] },
    IMP133: { cardId: 'IMP133', abilities: [rule('IMP133-exhaust-enemies', 'onEnter', 'automatic', 'On Enter: Exhaust all enemy units controlling a combat zone.', handlers.kingBeneathCanopy)] },
    IMP134: { cardId: 'IMP134', abilities: [] },
    IMP135: { cardId: 'IMP135', abilities: [staticRule('IMP135-flanking', 'Flanking.'), staticRule('IMP135-impede', 'Impede 1.')] },
    IMP136: { cardId: 'IMP136', abilities: [rule('IMP136-retreat', 'onScore', 'optional', 'On Score: If this unit is ready, you may retreat it.', handlers.ravenScore)] },
    IMP137: { cardId: 'IMP137', abilities: [rule('IMP137-damage', 'onEnter', 'optional', 'On Enter: You may deal 3 damage to target unit.', handlers.sunderingWyrm)] },
    IMP138: { cardId: 'IMP138', abilities: [staticRule('IMP138-impede', 'Impede 1.')] },
    IMP139: { cardId: 'IMP139', abilities: [rule('IMP139-buff', 'activated', 'activated', '{Exhaust}, {1}: Target friendly unit gets +1/+0 until end of turn.', handlers.sylvanRallier)] },
    IMP140: { cardId: 'IMP140', abilities: [] },
    IMP141: { cardId: 'IMP141', abilities: [staticRule('IMP141-score-lock', "While this unit controls a combat zone, enemy units can't score in zones that have a revealed territory you control.")] },
    IMP142: { cardId: 'IMP142', abilities: [staticRule('IMP142-provoke', 'Provoke.')] },
    IMP143: { cardId: 'IMP143', abilities: [] },
    IMP144: { cardId: 'IMP144', abilities: [rule('IMP144-forced-attack', 'onEnter', 'automatic', "On Enter: Ready target enemy unit in an opponent's staging area. It attacks target combat zone.", handlers.yakoIllusionist)] },
    IMP145: { cardId: 'IMP145', abilities: [rule('IMP145-coordinated', 'onPlay', 'automatic', 'Exhaust two friendly units. Deal their combined attack to target unit in a combat zone.', handlers.coordinatedStrike)] },
    IMP146: { cardId: 'IMP146', abilities: [rule('IMP146-predatory', 'onPlay', 'automatic', 'Target friendly unit gets +2/+0 this turn. Deal damage equal to its attack to target exhausted combat unit.', handlers.predatoryStrike)] },
    IMP147: { cardId: 'IMP147', abilities: [rule('IMP147-exhaust-all', 'onPlay', 'automatic', 'Exhaust all enemy units in combat zones.', handlers.primordialHowl)] },
    IMP148: { cardId: 'IMP148', abilities: [rule('IMP148-exhaust-lock', 'onPlay', 'automatic', "Exhaust target enemy unit. It doesn't ready during its next ready phase.", handlers.sporeBloom)] },
    IMP149: { cardId: 'IMP149', abilities: [rule('IMP149-combat-buff', 'onPlay', 'automatic', 'Friendly units in combat zones get +2/+0 until end of turn.', handlers.canopyAmbush)] },
    IMP150: { cardId: 'IMP150', abilities: [rule('IMP150-last-stand', 'onPlay', 'automatic', 'Target friendly combat unit gets +2/+1 until your next turn. Ready it.', handlers.lastStand)] },
    IMP151: { cardId: 'IMP151', abilities: [rule('IMP151-retreat', 'onPlay', 'automatic', 'Force retreat target friendly unit in a combat zone.', handlers.swiftAcrobatics)] },
    IMP152: { cardId: 'IMP152', abilities: [staticRule('IMP152-impede', 'Equipped unit gains Impede 1.')] },
    IMP153: { cardId: 'IMP153', abilities: [staticRule('IMP153-return', 'When equipped unit dies defending, you may return it from the graveyard to the top of your deck.')] },
    IMP154: { cardId: 'IMP154', abilities: [] },
    IMP155: { cardId: 'IMP155', abilities: [staticRule('IMP155-defend-buff', 'Friendly Sylvan, Kitsune, and Beast units in this zone ready and get +2/+0 on defend.'), staticRule('IMP155-death-draw', 'When a friendly unit dies defending this zone, draw a card.')] },
    IMP156: { cardId: 'IMP156', abilities: [staticRule('IMP156-end-exhaust', 'At the end of each turn, exhaust any enemy unit controlling this combat zone.')] },
    IMP157: { cardId: 'IMP157', abilities: [staticRule('IMP157-impede', 'Enemy attackers in this zone get -2/-0.'), staticRule('IMP157-upkeep', 'At the end of your turn, pay {2} or sacrifice this territory.')] },
    IMP158: { cardId: 'IMP158', abilities: [staticRule('IMP158-leave-draw', 'When a friendly unit leaves this zone without dying, you may pay {1} to draw a card. Once per turn.')] },
    IMP163: {
      cardId: 'IMP163',
      abilities: [
        staticRule('IMP163-swift', 'Swift.'),
        rule('IMP163-enter-damage', 'onEnter', 'automatic', 'On Enter: Deal 1 damage to target enemy unit in a combat zone.', handlers.shadowveilHunter),
      ],
    },
  };
}
