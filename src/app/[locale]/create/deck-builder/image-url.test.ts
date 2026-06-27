import { afterEach, describe, expect, it, vi } from 'vitest';

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function importImageUrlHelpers() {
  vi.resetModules();
  return import('./image-url');
}

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
});

describe('card image variant URLs', () => {
  it('builds Supabase variant URLs from configured host', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    const { getCardImageVariantUrl } = await importImageUrlHelpers();
    const source = 'https://project.supabase.co/storage/v1/object/public/cards/base/My%20Card.png';

    expect(getCardImageVariantUrl(source, 'small')).toBe(
      'https://project.supabase.co/storage/v1/object/public/cards/base/small/My%20Card.webp',
    );
  });

  it('detects Supabase hosts by suffix when no host is configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { getCardImageVariantUrl } = await importImageUrlHelpers();
    const source = 'https://other.supabase.co/storage/v1/object/public/cards/base/card.png';

    expect(getCardImageVariantUrl(source, 'medium')).toBe(
      'https://other.supabase.co/storage/v1/object/public/cards/base/medium/card.webp',
    );
  });

  it('returns non-Supabase URLs unchanged except medium and large Astra asset variants', async () => {
    const { getCardImageVariantUrl } = await importImageUrlHelpers();
    const astra = 'https://assets.echoesofastra.com/cards/alpha_web.webp';
    const external = 'https://example.com/card.png';

    expect(getCardImageVariantUrl(astra, 'small')).toBe(astra);
    expect(getCardImageVariantUrl(astra, 'medium')).toBe('https://assets.echoesofastra.com/cards/alpha.webp');
    expect(getCardImageVariantUrl(astra, 'large')).toBe('https://assets.echoesofastra.com/cards/alpha.webp');
    expect(getCardImageVariantUrl(external, 'large')).toBe(external);
    expect(getCardImageVariantUrl('data:image/png;base64,abc', 'large')).toBe('data:image/png;base64,abc');
  });
});
