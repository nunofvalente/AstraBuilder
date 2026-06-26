import { describe, expect, it } from 'vitest';

import { buildSearchSuggestions, doesCardMatchQuery, parseSearchInput } from './search';
import { createTestCard } from './test-utils';

describe('deck-builder search', () => {
  it('parses structured queries, aliases, and free text terms', () => {
    const parsed = parseSearchInput('cost: 3\nability: draw\nunknown: kept\nfree words');

    expect(parsed.queries.map((query) => [query.field.key, query.rawKey, query.value])).toEqual([
      ['cost', 'cost', '3'],
      ['abilities', 'ability', 'draw'],
    ]);
    expect(parsed.terms).toEqual(['unknown: kept', 'free words']);
  });

  it('matches numeric and text queries against cards', () => {
    const card = createTestCard({ cost: 3, rulesText: 'Draw two cards' });
    const parsed = parseSearchInput('cost: 3\nabilities: draw');

    expect(parsed.queries.every((query) => doesCardMatchQuery(card, query))).toBe(true);
    expect(doesCardMatchQuery(card, parseSearchInput('cost: nope').queries[0]!)).toBe(false);
    expect(doesCardMatchQuery(card, parseSearchInput('cost: 4').queries[0]!)).toBe(false);
  });

  it('builds search suggestions for numeric, field-name, and text inputs', () => {
    expect(buildSearchSuggestions('4').map((suggestion) => suggestion.value)).toEqual([
      'cost: 4',
      'attack: 4',
      'health: 4',
      'influence: 4',
      'number: 4',
    ]);

    expect(buildSearchSuggestions('art').map((suggestion) => suggestion.key)).toEqual(['artist']);
    expect(buildSearchSuggestions('draw cards')[0]).toMatchObject({
      key: 'name',
      value: 'name: draw cards',
    });
    expect(buildSearchSuggestions('cost: ')).toEqual([]);
  });
});
