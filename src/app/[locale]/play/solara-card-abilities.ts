import type { AbilityHandler, CardAbilityDefinition } from './card-abilities';

export function createSolaraCardAbilityRegistry(
  drawOneCard: AbilityHandler
): Record<string, CardAbilityDefinition> {
  return {
    IMP100: {
      cardId: 'IMP100',
      abilities: [
        {
          id: 'IMP100-on-death-draw-card',
          trigger: 'onDeath',
          timing: 'automatic',
          text: 'On Death: Draw a card.',
          resolve: drawOneCard,
        },
      ],
    },
  };
}
