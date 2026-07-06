import type { AbilityHandler, CardAbilityDefinition } from './card-abilities';

type NeutralHandlers = {
  excavator: AbilityHandler;
  supplyCarrier: AbilityHandler;
};

function rule(
  id: string,
  trigger: CardAbilityDefinition['abilities'][number]['trigger'],
  timing: CardAbilityDefinition['abilities'][number]['timing'],
  text: string,
  resolve: AbilityHandler
) {
  return { id, trigger, timing, text, resolve };
}

export function createNeutralCardAbilityRegistry(handlers: NeutralHandlers): Record<string, CardAbilityDefinition> {
  return {
    IMP159: {
      cardId: 'IMP159',
      abilities: [
        rule('IMP159-destroy-territory', 'onAttack', 'optional', 'On Attack: You may destroy a territory in the same combat zone as this unit.', handlers.excavator),
      ],
    },
    IMP160: {
      cardId: 'IMP160',
      abilities: [
        rule('IMP160-temporary-supply', 'activated', 'activated', '{Exhaust}: Add 1 supply until end of turn.', handlers.supplyCarrier),
      ],
    },
  };
}
