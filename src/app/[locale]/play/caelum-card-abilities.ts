import type { AbilityHandler, CardAbilityDefinition } from './card-abilities';

export function createCaelumCardAbilityRegistry(
  drawOneCard: AbilityHandler
): Record<string, CardAbilityDefinition> {
  return {
    IMP066: {
      cardId: 'IMP066',
      abilities: [
        {
          id: 'IMP066-on-death-draw-card',
          trigger: 'onDeath',
          timing: 'automatic',
          text: 'On Death: Draw a card.',
          resolve: drawOneCard,
        },
      ],
    },
  };
}
