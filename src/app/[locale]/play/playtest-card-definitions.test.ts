import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { definePlaytestCard, getDefaultPlayDestination, getPlaytestCardType, hasPlaytestKeyword } from './playtest-card-definitions';

describe('playtest card definitions', () => {
  it('classifies printed card types into playtest types', () => {
    expect(getPlaytestCardType(createTestCard({ type: 'Renowned Unit' }))).toBe('unit');
    expect(getPlaytestCardType(createTestCard({ type: 'Tactic' }))).toBe('tactic');
    expect(getPlaytestCardType(createTestCard({ type: 'Territory' }))).toBe('territory');
    expect(getPlaytestCardType(createTestCard({ type: 'Item Equipment' }))).toBe('item');
  });

  it('derives keywords from rules text', () => {
    const card = createTestCard({ rulesText: 'Blitz (This unit enters ready.) Provoke. Flanking. Swift.' });

    expect(hasPlaytestKeyword(card, 'blitz')).toBe(true);
    expect(hasPlaytestKeyword(card, 'provoke')).toBe(true);
    expect(hasPlaytestKeyword(card, 'flanking')).toBe(true);
    expect(hasPlaytestKeyword(card, 'swift')).toBe(true);
    expect(hasPlaytestKeyword(card, 'flying')).toBe(false);
  });

  it('derives default play destinations', () => {
    expect(getDefaultPlayDestination(createTestCard({ type: 'Unit' }))).toBe('staging');
    expect(getDefaultPlayDestination(createTestCard({ type: 'Item' }))).toBe('staging');
    expect(getDefaultPlayDestination(createTestCard({ type: 'Territory' }))).toBe('battlefield');
    expect(getDefaultPlayDestination(createTestCard({ type: 'Tactic' }))).toBe('graveyard');
  });

  it('defines core playtest facts for a card', () => {
    const definition = definePlaytestCard(
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
