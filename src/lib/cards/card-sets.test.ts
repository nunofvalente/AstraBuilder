import { describe, expect, it } from 'vitest';

import type { Card } from '@/app/[locale]/create/deck-builder/types';
import { getCardSetId, groupCardsBySet } from './card-sets';

const card = (id: string, number: number): Card => ({
  id, number, name: id, type: 'Unit', affinity: 'Lux', cost: 1, attack: 1, health: 1,
  subtype: '', rarity: 'Common', artist: '', influence: 1, rulesText: '', description: '',
  imageSrc: '', searchContent: id.toLowerCase(), detailLabel: id,
});

describe('card sets', () => {
  it('keeps token ids with their known set', () => {
    expect(getCardSetId('IMPT001')).toBe('IMP');
  });

  it('groups and orders cards by collector number', () => {
    const sets = groupCardsBySet([card('IMP002', 2), card('IMP001', 1)]);
    expect(sets[0]?.name).toBe('Imperion');
    expect(sets[0]?.cards.map((entry) => entry.id)).toEqual(['IMP001', 'IMP002']);
  });
});
