import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { defineCard, getDefaultPlayDestination, getCardType, hasCardKeyword } from './card-definitions';

describe('card definitions', () => {
  it('classifies printed card types into simulator types', () => {
    expect(getCardType(createTestCard({ type: 'Renowned Unit' }))).toBe('unit');
    expect(getCardType(createTestCard({ type: 'Tactic' }))).toBe('tactic');
    expect(getCardType(createTestCard({ type: 'Territory' }))).toBe('territory');
    expect(getCardType(createTestCard({ type: 'Item Equipment' }))).toBe('item');
    expect(getCardType(createTestCard({ type: 'Unit', subtype: 'Drone Token', rarity: 'Token' }))).toBe('token');
  });

  it('derives keywords from rules text', () => {
    const card = createTestCard({
      rulesText: 'Blitz (This unit enters ready.)\nProvoke.\nFlanking.\nSwift.',
    });

    expect(hasCardKeyword(card, 'blitz')).toBe(true);
    expect(hasCardKeyword(card, 'provoke')).toBe(true);
    expect(hasCardKeyword(card, 'flanking')).toBe(true);
    expect(hasCardKeyword(card, 'swift')).toBe(true);
    expect(hasCardKeyword(card, 'flying')).toBe(false);
  });

  it('does not treat granted keyword text as the source card having that keyword', () => {
    const lingyi = createTestCard({
      id: 'IMP105',
      name: 'Lingyi, the Gilded Prophet',
      type: 'Renowned Unit',
      rulesText: 'On Enter: You may reveal, then banish a unit card from your hand. It gains Blitz and "This card can be played from the banish pile once."',
    });

    expect(hasCardKeyword(lingyi, 'blitz')).toBe(false);
    expect(defineCard(lingyi).entersStagingExhausted).toBe(true);
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
