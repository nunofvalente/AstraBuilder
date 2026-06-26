import { describe, expect, it } from 'vitest';

import type { PublicDeckSummary } from '@/lib/supabase/decks';
import {
  UNKNOWN_PAIRING_KEY,
  buildAffinityPairingSlug,
  buildAffinityPairingStats,
  deckMatchesAffinityPairing,
  formatAffinityPairingLabel,
  isUnknownPairing,
  parseAffinityPairingSlug,
  resolveDeckAffinityPairing,
} from './affinity-pairings';

function deck(affinities: string[]): PublicDeckSummary {
  return {
    id: affinities.join('-') || 'unknown',
    title: null,
    description: null,
    createdAt: null,
    isPublic: true,
    cardCount: 0,
    viewsTotal: 0,
    favoritesTotal: 0,
    affinities,
    authorId: null,
    authorName: null,
  };
}

describe('affinity pairing helpers', () => {
  it('canonicalizes deck affinity pairings', () => {
    expect(resolveDeckAffinityPairing(deck(['neutral']))).toEqual(['Neutral']);
    expect(resolveDeckAffinityPairing(deck(['terra', 'lux', 'nox']))).toEqual(['Lux', 'Terra']);
    expect(resolveDeckAffinityPairing(deck([]))).toBeNull();
    expect(formatAffinityPairingLabel(['Lux', 'Terra'])).toBe('Lux / Terra');
  });

  it('builds and parses pairing slugs', () => {
    expect(buildAffinityPairingSlug(['terra', 'lux'])).toBe('Lux-Terra'.toLowerCase());
    expect(parseAffinityPairingSlug('terra-lux')).toEqual(['Lux', 'Terra']);
    expect(parseAffinityPairingSlug('terra-lux-nox')).toBeNull();
    expect(parseAffinityPairingSlug('')).toBeNull();
  });

  it('builds sorted pairing stats including unknown decks', () => {
    expect(buildAffinityPairingStats([deck(['terra', 'lux']), deck(['lux', 'terra']), deck([])])).toEqual([
      {
        slug: 'lux-terra',
        label: 'Lux / Terra',
        affinities: ['Lux', 'Terra'],
        count: 2,
        isUnknown: false,
      },
      {
        slug: UNKNOWN_PAIRING_KEY,
        label: '',
        affinities: [],
        count: 1,
        isUnknown: true,
      },
    ]);
    expect(buildAffinityPairingStats([])).toEqual([]);
  });

  it('matches decks against canonical pairings', () => {
    expect(deckMatchesAffinityPairing(deck(['terra', 'lux']), ['Lux', 'Terra'])).toBe(true);
    expect(deckMatchesAffinityPairing(deck(['terra']), ['Lux', 'Terra'])).toBe(false);
    expect(deckMatchesAffinityPairing(deck([]), ['Lux'])).toBe(false);
    expect(isUnknownPairing(UNKNOWN_PAIRING_KEY)).toBe(true);
    expect(isUnknownPairing('lux-terra')).toBe(false);
  });
});
