import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import {
  createUnimplementedAbilityMessage,
  getImplementedAbilitiesForTrigger,
  getPrintedAbilityTriggers,
  getRegisteredCardAbilities,
} from './card-abilities';

describe('card abilities', () => {
  it('detects printed ability triggers from rules text', () => {
    const card = createTestCard({
      name: 'Triggered Unit',
      rulesText: 'On Enter: Draw a card.\n\nOn Death: Create a token.\n\n{Exhaust}: Target friendly unit gets +1 influence.',
    });

    expect(getPrintedAbilityTriggers(card)).toEqual(['onEnter', 'onDeath', 'activated']);
  });

  it('returns no registered abilities until a card implementation is added', () => {
    expect(getRegisteredCardAbilities('missing-card')).toBeNull();
    expect(getImplementedAbilitiesForTrigger('missing-card', 'onPlay')).toEqual([]);
  });

  it('registers implemented card abilities by stable card id', () => {
    expect(getRegisteredCardAbilities('IMP066')).toMatchObject({
      cardId: 'IMP066',
      abilities: [
        {
          id: 'IMP066-on-death-draw-card',
          trigger: 'onDeath',
          timing: 'automatic',
        },
      ],
    });
    expect(getImplementedAbilitiesForTrigger('IMP066', 'onDeath')).toHaveLength(1);
  });

  it('creates a clear unimplemented ability message', () => {
    const card = createTestCard({ name: 'Aegis Defender' });

    expect(createUnimplementedAbilityMessage(card, 'onEnter')).toBe(
      'On Enter is detected on Aegis Defender, but this ability is not implemented yet.'
    );
  });
});

