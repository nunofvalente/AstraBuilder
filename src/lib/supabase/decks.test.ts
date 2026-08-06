import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestCard } from '@/app/[locale]/create/deck-builder/test-utils';

const from = vi.fn();
const getAstraCardLookup = vi.fn();

vi.mock('./supabaseClient', () => ({
  supabase: { from },
}));

vi.mock('@/lib/astra/astra-card-directory', () => ({
  getAstraCardLookup,
}));

function makeTable(result: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnValue({ eq, maybeSingle });
  return { select, eq, maybeSingle };
}

function makeClient(tables: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => makeTable(tables[table])),
  };
}

afterEach(() => {
  from.mockReset();
  getAstraCardLookup.mockReset();
});

describe('deck data helpers', () => {
  it('loads access metadata and computes ownership', async () => {
    const { getDeckAccessMetadata } = await import('./decks');
    const client = makeClient({
      decks: { data: { id: 'deck-1', user_id: 'owner-1', is_public: false }, error: null },
    });

    await expect(getDeckAccessMetadata(' deck-1 ', 'owner-1', client as never)).resolves.toEqual({
      deckId: 'deck-1',
      ownerId: 'owner-1',
      isPublic: false,
      isOwner: true,
    });
    expect(client.from).toHaveBeenCalledWith('decks');

    await expect(getDeckAccessMetadata('   ', 'owner-1', client as never)).resolves.toBeNull();
  });

  it('returns null for missing private inaccessible decks', async () => {
    const { getAccessibleDeckDetailById } = await import('./decks');
    const client = makeClient({
      decks: { data: { id: 'deck-1', user_id: 'owner-1', is_public: false }, error: null },
    });

    await expect(getAccessibleDeckDetailById('deck-1', 'viewer-1', client as never)).resolves.toBeNull();
  });

  it('maps deck details with stats fallback and card entries', async () => {
    const { getDeckDetailById } = await import('./decks');
    const card = createTestCard({ id: 'card-1', affinity: 'Lux' });
    getAstraCardLookup.mockResolvedValue(new Map([[card.id, card]]));

    const detailRow = {
      id: 'deck-1',
      title: 'Deck',
      description: 'Description',
      created_at: '2024-01-01T00:00:00Z',
      is_public: true,
      user_id: 'owner-1',
      deck_cards: [
        { card_id: 'card-1', quantity: 2 },
        { card_id: 'missing', quantity: 5 },
        { card_id: 'card-1', quantity: 0 },
      ],
      deck_stats: null,
      profiles: { id: 'owner-1', username: ' Owner ', x_link: 'https://x.test/owner', youtube_link: null },
    };

    const decksTable = makeTable({ data: detailRow, error: null });
    const statsMaybeSingle = vi.fn().mockResolvedValue({ data: { views_total: 7, favorites_total: 3 }, error: null });
    const statsEq = vi.fn().mockReturnValue({ maybeSingle: statsMaybeSingle });
    const statsSelect = vi.fn().mockReturnValue({ eq: statsEq });
    const client = {
      from: vi.fn((table: string) => (table === 'decks' ? decksTable : { select: statsSelect })),
    };

    await expect(getDeckDetailById('deck-1', client as never)).resolves.toEqual({
      id: 'deck-1',
      title: 'Deck',
      description: 'Description',
      isPublic: true,
      createdAt: '2024-01-01T00:00:00Z',
      favoritesTotal: 3,
      viewsTotal: 7,
      authorName: 'Owner',
      authorId: 'owner-1',
      authorXLink: 'https://x.test/owner',
      authorYoutubeLink: null,
      displayCardId: null,
      entries: [{ card, count: 2 }],
    });
  });
});
