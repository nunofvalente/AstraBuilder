import type { MetadataRoute } from 'next';

import { SUPPORTED_LOCALES } from '@/i18n/config';
import { buildAffinityPairingStats } from '@/lib/decks/affinity-pairings';
import { isSimulatorEnabled } from '@/lib/features';
import { buildLocalePath } from '@/lib/metadata/locale';
import { buildAbsoluteUrl } from '@/lib/metadata/site';
import { getAllPublicDeckSummaries } from '@/lib/supabase/decks';

export const revalidate = 3600;

function entry(
  path: string,
  options: Pick<MetadataRoute.Sitemap[number], 'changeFrequency' | 'priority' | 'lastModified'>
): MetadataRoute.Sitemap[number] {
  return {
    url: buildAbsoluteUrl(path),
    ...options,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = SUPPORTED_LOCALES.flatMap((locale) => [
    entry(buildLocalePath(locale), { changeFrequency: 'daily', priority: 1 }),
    entry(buildLocalePath(locale, 'create'), { changeFrequency: 'weekly', priority: 0.9 }),
    entry(buildLocalePath(locale, 'decks'), { changeFrequency: 'daily', priority: 0.9 }),
    entry(buildLocalePath(locale, 'collection'), { changeFrequency: 'weekly', priority: 0.8 }),
    ...(isSimulatorEnabled()
      ? [entry(buildLocalePath(locale, 'play'), { changeFrequency: 'weekly' as const, priority: 0.7 })]
      : []),
  ]);

  try {
    const decks = await getAllPublicDeckSummaries();
    const pairings = buildAffinityPairingStats(decks).filter((pairing) => !pairing.isUnknown);
    const authorDates = new Map<string, string>();

    for (const deck of decks) {
      if (!deck.authorId || !deck.createdAt) {
        continue;
      }

      const current = authorDates.get(deck.authorId);
      if (!current || deck.createdAt > current) {
        authorDates.set(deck.authorId, deck.createdAt);
      }
    }

    const dynamicEntries = SUPPORTED_LOCALES.flatMap((locale) => [
      ...pairings.map((pairing) =>
        entry(buildLocalePath(locale, 'affinity', pairing.slug), {
          changeFrequency: 'daily',
          priority: 0.7,
        })
      ),
      ...decks.map((deck) =>
        entry(buildLocalePath(locale, 'decks', deck.id), {
          changeFrequency: 'weekly',
          priority: 0.8,
          ...(deck.createdAt ? { lastModified: deck.createdAt } : {}),
        })
      ),
      ...Array.from(authorDates.entries()).map(([authorId, lastModified]) =>
        entry(buildLocalePath(locale, 'players', authorId), {
          changeFrequency: 'weekly',
          priority: 0.6,
          lastModified,
        })
      ),
    ]);

    return [...staticEntries, ...dynamicEntries];
  } catch (error) {
    console.error('Failed to build dynamic sitemap entries', error);
    return staticEntries;
  }
}
