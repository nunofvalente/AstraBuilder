import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccessibleDeckDetailById: vi.fn(),
  getDeckAccessMetadata: vi.fn(),
  getPublicDeckSummaryById: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({})),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerComponentClient: () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock('@/i18n/get-dictionary', () => ({
  getDictionary: vi.fn(async () => ({
    myDecks: { untitledLabel: 'Untitled deck' },
    deckDetails: { description: 'Card breakdown and statistics for this deck.' },
    publicProfile: {},
    builder: {
      emptyDeck: 'Empty deck',
      menuExport: 'Export',
      exportOptionTTS: 'Tabletop Simulator',
      exportOptionText: 'Text',
      exportCopy: 'Copy',
      exportCopySuccess: 'Copied',
      exportCopyError: 'Copy failed',
      deckHeading: 'Deck',
      totalCardsLabel: 'Total cards',
      shareButton: 'Share',
      shareGenerating: 'Generating',
      shareDownload: 'Download',
      shareCopy: 'Copy image',
      shareCopySuccess: 'Image copied',
      shareCopyError: 'Image copy failed',
      shareEmpty: 'Empty deck',
      shareError: 'Share failed',
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({}),
}));

vi.mock('@/lib/supabase/decks', () => ({
  getAccessibleDeckDetailById: mocks.getAccessibleDeckDetailById,
  getDeckAccessMetadata: mocks.getDeckAccessMetadata,
  getPublicDeckSummaryById: mocks.getPublicDeckSummaryById,
}));

vi.mock('./deck-detail-client', () => ({
  DeckDetailClient: () => null,
}));

import DeckDetailsPage, { generateMetadata } from './page';

describe('deck details page indexing', () => {
  beforeEach(() => {
    mocks.getAccessibleDeckDetailById.mockReset();
    mocks.getDeckAccessMetadata.mockReset();
    mocks.getPublicDeckSummaryById.mockReset();
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
  });

  it('returns a real not-found response when the deck is inaccessible', async () => {
    mocks.getAccessibleDeckDetailById.mockResolvedValue(null);
    mocks.getDeckAccessMetadata.mockResolvedValue(null);

    await expect(
      DeckDetailsPage({ params: Promise.resolve({ locale: 'en', deckId: '999' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('allows an existing private deck to load through the authenticated client fallback', async () => {
    mocks.getAccessibleDeckDetailById.mockResolvedValue(null);
    mocks.getDeckAccessMetadata.mockResolvedValue({
      deckId: '793',
      ownerId: 'owner-1',
      isPublic: false,
      isOwner: false,
    });

    const page = await DeckDetailsPage({ params: Promise.resolve({ locale: 'en', deckId: '793' }) });

    expect(page.props).toMatchObject({ deck: null, deckId: '793' });
    expect(mocks.getDeckAccessMetadata).toHaveBeenCalledWith('793', null, {});
  });

  it('rejects malformed deck ids before querying Supabase', async () => {
    await expect(
      DeckDetailsPage({ params: Promise.resolve({ locale: 'en', deckId: 'not-a-number' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.getAccessibleDeckDetailById).not.toHaveBeenCalled();
    expect(mocks.getDeckAccessMetadata).not.toHaveBeenCalled();
  });

  it('uses public deck content for unique metadata', async () => {
    mocks.getPublicDeckSummaryById.mockResolvedValue({
      id: '777',
      title: 'Righteous Order',
      description: 'A Lux and Terra starter deck.',
    });

    await expect(
      generateMetadata({ params: Promise.resolve({ locale: 'en', deckId: '777' }) })
    ).resolves.toMatchObject({
      title: 'Righteous Order | AstraBuilder',
      description: 'A Lux and Terra starter deck.',
      alternates: { canonical: '/en/decks/777' },
    });
  });

  it('marks non-public deck metadata as noindex', async () => {
    mocks.getPublicDeckSummaryById.mockResolvedValue(null);

    await expect(
      generateMetadata({ params: Promise.resolve({ locale: 'en', deckId: '123' }) })
    ).resolves.toMatchObject({
      robots: { index: false, follow: true },
    });
  });
});
