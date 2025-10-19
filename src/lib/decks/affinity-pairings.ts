import { normalizeAffinity } from '@/lib/cards/affinity';
import type { PublicDeckSummary } from '@/lib/supabase/decks';

export type AffinityPairingStat = {
  slug: string;
  label: string;
  affinities: string[];
  count: number;
  isUnknown: boolean;
};

export const UNKNOWN_PAIRING_KEY = '__unknown__';
const SLUG_SEPARATOR = '-';

function canonicalizePairing(normalizedAffinities: string[]): string[] {
  const deduped: string[] = [];

  for (const affinity of normalizedAffinities) {
    if (!affinity || deduped.includes(affinity)) {
      continue;
    }
    deduped.push(affinity);
  }

  const nonNeutral = deduped.filter((affinity) => affinity !== 'Neutral');

  if (nonNeutral.length >= 2) {
    return [...nonNeutral.slice(0, 2)].sort((a, b) => a.localeCompare(b));
  }

  if (nonNeutral.length === 1) {
    return nonNeutral;
  }

  if (deduped.includes('Neutral')) {
    return ['Neutral'];
  }

  return [];
}

function normalizeAffinityValues(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => normalizeAffinity(value))
    .filter((value): value is string => Boolean(value));
}

export function resolveDeckAffinityPairing(deck: Pick<PublicDeckSummary, 'affinities'>): string[] | null {
  const affinities = normalizeAffinityValues(deck.affinities ?? []);
  const pairing = canonicalizePairing(affinities);
  return pairing.length > 0 ? pairing : null;
}

export function formatAffinityPairingLabel(affinities: string[]): string {
  return affinities.join(' / ');
}

export function buildAffinityPairingSlug(affinities: string[]): string {
  const normalized = normalizeAffinityValues(affinities);
  const pairing = canonicalizePairing(normalized);
  if (pairing.length === 0) {
    return '';
  }

  return pairing
    .map((affinity) =>
      affinity
        .trim()
        .toLowerCase()
        .replace(/\s+/g, SLUG_SEPARATOR)
    )
    .join(SLUG_SEPARATOR);
}

export function parseAffinityPairingSlug(slug: string): string[] | null {
  if (!slug || typeof slug !== 'string') {
    return null;
  }

  const segments = slug
    .split(SLUG_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0 || segments.length > 2) {
    return null;
  }

  const normalized = normalizeAffinityValues(segments);
  if (normalized.length !== segments.length) {
    return null;
  }

  const pairing = canonicalizePairing(normalized);
  return pairing.length > 0 ? pairing : null;
}

export function buildAffinityPairingStats(decks: PublicDeckSummary[]): AffinityPairingStat[] {
  if (decks.length === 0) {
    return [];
  }

  const counts = new Map<string, { count: number; affinities: string[] }>();
  let unknownCount = 0;

  for (const deck of decks) {
    const pairingAffinities = resolveDeckAffinityPairing(deck);
    if (!pairingAffinities || pairingAffinities.length === 0) {
      unknownCount += 1;
      continue;
    }

    const slug = buildAffinityPairingSlug(pairingAffinities);
    if (!slug) {
      unknownCount += 1;
      continue;
    }

    const existing = counts.get(slug);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(slug, { count: 1, affinities: pairingAffinities });
    }
  }

  const stats: AffinityPairingStat[] = Array.from(counts.entries()).map(([slug, value]) => ({
    slug,
    label: formatAffinityPairingLabel(value.affinities),
    affinities: value.affinities,
    count: value.count,
    isUnknown: false,
  }));

  if (unknownCount > 0) {
    stats.push({
      slug: UNKNOWN_PAIRING_KEY,
      label: '',
      affinities: [],
      count: unknownCount,
      isUnknown: true,
    });
  }

  return stats.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    if (a.isUnknown !== b.isUnknown) {
      return a.isUnknown ? 1 : -1;
    }
    return a.label.localeCompare(b.label);
  });
}

export function deckMatchesAffinityPairing(
  deck: Pick<PublicDeckSummary, 'affinities'>,
  pairingAffinities: string[]
): boolean {
  const deckPairing = resolveDeckAffinityPairing(deck);
  if (!deckPairing || pairingAffinities.length === 0) {
    return false;
  }

  if (pairingAffinities.length !== deckPairing.length) {
    return false;
  }

  return pairingAffinities.every((affinity) => deckPairing.includes(affinity));
}

export function isUnknownPairing(slug: string): boolean {
  return slug === UNKNOWN_PAIRING_KEY;
}
