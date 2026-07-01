import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import {
  createUnimplementedAbilityMessage,
  getImplementedAbilitiesForTrigger,
  getPrintedAbilityTriggers,
  getRegisteredCardAbilities,
} from './playtest-abilities';

describe('playtest abilities', () => {
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

  it('creates a clear unimplemented ability message', () => {
    const card = createTestCard({ name: 'Aegis Defender' });

    expect(createUnimplementedAbilityMessage(card, 'onEnter')).toBe(
      'On Enter is detected on Aegis Defender, but this ability is not implemented yet.'
    );
  });
});

