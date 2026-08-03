import { afterEach, describe, expect, it, vi } from 'vitest';

const getSupabaseCardRows = vi.fn();
const fetchAstraCardCatalog = vi.fn();

vi.mock('@/lib/supabase/cards', () => ({
  getSupabaseCardRows,
}));

vi.mock('./astra-card-catalog', () => ({
  fetchAstraCardCatalog,
}));

afterEach(() => {
  getSupabaseCardRows.mockReset();
  fetchAstraCardCatalog.mockReset();
  vi.resetModules();
});

describe('Astra card directory', () => {
  it('uses the Supabase catalogue so saved decks include locally maintained cards', async () => {
    getSupabaseCardRows.mockResolvedValue({
      rows: [
        {
          id: 'IMP161',
          name: 'Fortified Pillbox',
          affinity: 'Lux',
          artist: 'EliasArt',
          rarity: 'Promo',
          number: 161,
          type: 'Territory',
          subtype: null,
          cost: 3,
          attack: 0,
          health: 0,
          influence: null,
          rules_text: 'Friendly units occupying this zone get +0/+2.',
          description: null,
          image_url: '/images/cards/imperion-extras/IMP161_FortifiedPillbox.png',
        },
      ],
      error: null,
    });

    const { getAstraCardLookup } = await import('./astra-card-directory');

    await expect(getAstraCardLookup()).resolves.toEqual(
      new Map([
        [
          'IMP161',
          expect.objectContaining({
            id: 'IMP161',
            name: 'Fortified Pillbox',
            type: 'Territory',
          }),
        ],
      ])
    );
    expect(fetchAstraCardCatalog).not.toHaveBeenCalled();
  });

  it('falls back to the Astra catalogue when Supabase is unavailable', async () => {
    getSupabaseCardRows.mockResolvedValue({ rows: [], error: 'Unavailable' });
    fetchAstraCardCatalog.mockResolvedValue([
      {
        cardId: 'IMP001',
        cardName: 'Assimilating Abomination',
        cardAffinity: 'Nox',
        cardType: 'Unit',
        cardSubTypes: ['Monster'],
        renowned: false,
        statSupplyCost: 6,
        statInfluence: 2,
        statAttack: 4,
        statHealth: 6,
        abilityText: '',
        flavorText: '',
        artistName: 'EliasArt',
        cardImageUrl: 'https://assets.echoesofastra.com/cards/IMP001_AssimilatingAbomination_web.png',
        cardImageLargeUrl: '',
        rarity: 'Rare',
      },
    ]);

    const { getAstraCards } = await import('./astra-card-directory');

    await expect(getAstraCards()).resolves.toEqual([
      expect.objectContaining({ id: 'IMP001', name: 'Assimilating Abomination' }),
    ]);
    expect(fetchAstraCardCatalog).toHaveBeenCalledTimes(1);
  });
});
