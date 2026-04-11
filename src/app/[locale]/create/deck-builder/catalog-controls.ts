import { AFFINITY_FILTERS, AFFINITY_SORT_ORDER } from './constants';
import { doesCardMatchQuery, parseSearchInput, type SearchQuery } from './search';
import type { Card } from './types';

export const CARD_SORT_OPTIONS = [
  { value: 'affinity', label: 'Affinity' },
  { value: 'number', label: 'Card number' },
  { value: 'cost', label: 'Cost' },
] as const;

export type CardSortOption = (typeof CARD_SORT_OPTIONS)[number]['value'];

export function createInitialActiveAffinities(): Record<string, boolean> {
  const initial: Record<string, boolean> = {};

  for (const filter of AFFINITY_FILTERS) {
    initial[filter.value] = true;
  }

  return initial;
}

export function parseCatalogSearch(searchTerm: string) {
  return parseSearchInput(searchTerm);
}

export function buildCombinedQueries(
  activeFilters: SearchQuery[],
  searchQueries: SearchQuery[]
): SearchQuery[] {
  return [...activeFilters, ...searchQueries];
}

export function buildActiveAffinitySet(activeAffinities: Record<string, boolean>): Set<string> | null {
  const enabled = AFFINITY_FILTERS.filter((filter) => activeAffinities[filter.value]);

  if (enabled.length === AFFINITY_FILTERS.length) {
    return null;
  }

  return new Set(enabled.map((filter) => filter.value));
}

export function filterAndSortCards(params: {
  cards: Card[];
  activeAffinitySet: Set<string> | null;
  combinedQueries: SearchQuery[];
  searchTerms: string[];
  sortOption: CardSortOption;
}): Card[] {
  const { cards, activeAffinitySet, combinedQueries, searchTerms, sortOption } = params;

  const filtered = cards.filter((card) => {
    const matchesAffinity = !activeAffinitySet || activeAffinitySet.has(card.affinity);
    if (!matchesAffinity) {
      return false;
    }

    if (combinedQueries.length === 0 && searchTerms.length === 0) {
      return true;
    }

    const matchesStructured = combinedQueries.every((query) => doesCardMatchQuery(card, query));
    if (!matchesStructured) {
      return false;
    }

    if (searchTerms.length === 0) {
      return true;
    }

    return searchTerms.every((term) => card.searchContent.includes(term));
  });

  return [...filtered].sort((a, b) => compareCards(a, b, sortOption));
}

export function appendUniqueFilters(
  activeFilters: SearchQuery[],
  nextQueries: SearchQuery[]
): SearchQuery[] {
  const existingKeys = new Set(
    activeFilters.map((query) => `${query.field.key}:${query.value.toLowerCase()}`)
  );
  const appended: SearchQuery[] = [];

  for (const query of nextQueries) {
    const key = `${query.field.key}:${query.value.toLowerCase()}`;
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      appended.push(query);
    }
  }

  if (appended.length === 0) {
    return activeFilters;
  }

  return [...activeFilters, ...appended];
}

export function toggleAffinitySelection(
  previous: Record<string, boolean>,
  value: string
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...previous };
  const totalFilters = AFFINITY_FILTERS.length;
  const enabledBefore = AFFINITY_FILTERS.reduce(
    (count, filter) => (next[filter.value] ? count + 1 : count),
    0
  );
  const current = next[value] ?? true;

  if (enabledBefore === totalFilters && current) {
    for (const filter of AFFINITY_FILTERS) {
      next[filter.value] = filter.value === value;
    }
    return next;
  }

  if (current && enabledBefore === 1) {
    for (const filter of AFFINITY_FILTERS) {
      next[filter.value] = true;
    }
    return next;
  }

  next[value] = !current;

  const enabledAfter = AFFINITY_FILTERS.reduce(
    (count, filter) => (next[filter.value] ? count + 1 : count),
    0
  );
  if (enabledAfter === 0) {
    for (const filter of AFFINITY_FILTERS) {
      next[filter.value] = true;
    }
  }

  return next;
}

function compareCards(a: Card, b: Card, sortOption: CardSortOption): number {
  if (sortOption === 'number') {
    const aNumber = a.number ?? Number.POSITIVE_INFINITY;
    const bNumber = b.number ?? Number.POSITIVE_INFINITY;
    if (aNumber !== bNumber) {
      return aNumber - bNumber;
    }
  } else if (sortOption === 'cost') {
    if (a.cost !== b.cost) {
      return a.cost - b.cost;
    }

    const aNumber = a.number ?? Number.POSITIVE_INFINITY;
    const bNumber = b.number ?? Number.POSITIVE_INFINITY;
    if (aNumber !== bNumber) {
      return aNumber - bNumber;
    }

    return a.name.localeCompare(b.name);
  }

  const affinityDiff = getAffinityIndex(a.affinity) - getAffinityIndex(b.affinity);
  if (affinityDiff !== 0) {
    return affinityDiff;
  }

  const nameDiff = a.name.localeCompare(b.name);
  if (nameDiff !== 0) {
    return nameDiff;
  }

  const aNumber = a.number ?? Number.POSITIVE_INFINITY;
  const bNumber = b.number ?? Number.POSITIVE_INFINITY;
  return aNumber - bNumber;
}

function getAffinityIndex(value: string): number {
  const index = AFFINITY_SORT_ORDER.indexOf(value);
  return index === -1 ? AFFINITY_SORT_ORDER.length : index;
}
