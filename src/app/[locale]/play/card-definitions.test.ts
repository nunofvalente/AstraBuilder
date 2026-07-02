import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { defineCard, getDefaultPlayDestination, getCardType, hasCardKeyword } from './card-definitions';

describe('card definitions', () => {
  it('classifies printed card types into simulator types', () => {
    expect(getCardType(createTestCard({ type: 'Renowned Unit' }))).toBe('unit');
    expect(getCardType(createTestCard({ type: 'Tactic' }))).toBe('tactic');
    expect(getCardType(createTestCard({ type: 'Territory' }))).toBe('territory');
    expect(getCardType(createTestCard({ type: 'Item Equipment' }))).toBe('item');
  });

  it('derives keywords from rules text', () => {
    const card = createTestCard({ rulesText: 'Blitz (This unit enters ready.) Provoke. Flanking. Swift.' });

    expect(hasCardKeyword(card, 'blitz')).toBe(true);
    expect(hasCardKeyword(card, 'provoke')).toBe(true);
    expect(hasCardKeyword(card, 'flanking')).toBe(true);
    expect(hasCardKeyword(card, 'swift')).toBe(true);
    expect(hasCardKeyword(card, 'flying')).toBe(false);
  });

  it('derives default play destinations', () => {
    expect(getDefaultPlayDestination(createTestCard({ type: 'Unit' }))).toBe('staging');
    expect(getDefaultPlayDestination(createTestCard({ type: 'Item' }))).toBe('staging');
    expect(getDefaultPlayDestination(createTestCard({ type: 'Territory' }))).toBe('battlefield');
    expect(getDefaultPlayDestination(createTestCard({ type: 'Tactic' }))).toBe('graveyard');
  });

  it('defines core simulator facts for a card', () => {
    const definition = defineCard(
      createTestCard({
        type: 'Unit',
        attack: 3,
        health: 2,
        influence: 1,
        rulesText: 'Blitz (This unit enters ready.)\n\nOn Enter: Draw a card.',
      })
    );

    expect(definition).toMatchObject({
      type: 'unit',
      attack: 3,
      health: 2,
      influence: 1,
      printedTriggers: ['onEnter'],
      defaultPlayDestination: 'staging',
      canScore: true,
      entersStagingExhausted: false,
    });
  });
});
