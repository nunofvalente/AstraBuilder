import { describe, expect, it } from 'vitest';

import {
  appendUniqueFilters,
  buildActiveAffinitySet,
  buildCombinedQueries,
  createInitialActiveAffinities,
  filterAndSortCards,
  parseCatalogSearch,
  toggleAffinitySelection,
} from './catalog-controls';
import { AFFINITY_FILTERS } from './constants';
import { createTestCard } from './test-utils';

describe('catalog controls', () => {
  it('creates and toggles affinity filters', () => {
    const initial = createInitialActiveAffinities();
    expect(Object.values(initial).every(Boolean)).toBe(true);
    expect(buildActiveAffinitySet(initial)).toBeNull();

    const onlyTerra = toggleAffinitySelection(initial, 'Terra');
    expect(onlyTerra).toMatchObject({ Terra: true });
    expect(AFFINITY_FILTERS.filter((filter) => onlyTerra[filter.value])).toHaveLength(1);
    expect(buildActiveAffinitySet(onlyTerra)).toEqual(new Set(['Terra']));

    const allAgain = toggleAffinitySelection(onlyTerra, 'Terra');
    expect(Object.values(allAgain).every(Boolean)).toBe(true);
  });

  it('combines and deduplicates structured filters', () => {
    const [costQuery] = parseCatalogSearch('cost: 2').queries;
    const [duplicateCost] = parseCatalogSearch('cost: 2').queries;
    const [typeQuery] = parseCatalogSearch('type: unit').queries;

    expect(buildCombinedQueries([costQuery!], [typeQuery!])).toEqual([costQuery, typeQuery]);
    expect(appendUniqueFilters([costQuery!], [duplicateCost!, typeQuery!])).toEqual([costQuery, typeQuery]);
  });

  it('filters by affinities, structured queries, free text, and sort option', () => {
    const cards = [
      createTestCard({ name: 'Beta', affinity: 'Terra', cost: 2, number: 20, searchContent: 'beta terra scout' }),
      createTestCard({ name: 'Alpha', affinity: 'Terra', cost: 1, number: 10, searchContent: 'alpha terra scout' }),
      createTestCard({ name: 'Gamma', affinity: 'Lux', cost: 1, number: 5, searchContent: 'gamma lux mage' }),
    ];
    const { queries, terms } = parseCatalogSearch('type: unit\nscout');

    expect(
      filterAndSortCards({
        cards,
        activeAffinitySet: new Set(['Terra']),
        combinedQueries: queries,
        searchTerms: terms,
        sortOption: 'cost',
      }).map((card) => card.name),
    ).toEqual(['Alpha', 'Beta']);

    expect(
      filterAndSortCards({
        cards,
        activeAffinitySet: null,
        combinedQueries: [],
        searchTerms: [],
        sortOption: 'number',
      }).map((card) => card.name),
    ).toEqual(['Gamma', 'Alpha', 'Beta']);
  });
});
