import { afterEach, describe, expect, it, vi } from 'vitest';

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function importProxyHelpers() {
  vi.resetModules();
  return import('./card-image-proxy');
}

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
});

describe('card image proxy helpers', () => {
  it('allows Astra asset URLs and wraps them for share rendering', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { getShareRenderableImageUrl, isAllowedCardImageUrl } = await importProxyHelpers();
    const imageUrl = 'https://assets.echoesofastra.com/cards/example_web.webp';

    expect(isAllowedCardImageUrl(imageUrl)).toBe(true);
    expect(getShareRenderableImageUrl(imageUrl)).toBe(`/api/card-image?url=${encodeURIComponent(imageUrl)}`);
  });

  it('allows the configured Supabase host only', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    const { getShareRenderableImageUrl, isAllowedCardImageUrl } = await importProxyHelpers();
    const allowed = 'https://project.supabase.co/storage/v1/object/public/cards/a.webp';
    const rejected = 'https://other.supabase.co/storage/v1/object/public/cards/a.webp';

    expect(isAllowedCardImageUrl(allowed)).toBe(true);
    expect(isAllowedCardImageUrl(rejected)).toBe(false);
    expect(getShareRenderableImageUrl(allowed)).toBe(`/api/card-image?url=${encodeURIComponent(allowed)}`);
    expect(getShareRenderableImageUrl(rejected)).toBe(rejected);
  });

  it('rejects invalid and data URLs', async () => {
    const { getShareRenderableImageUrl, isAllowedCardImageUrl } = await importProxyHelpers();

    expect(isAllowedCardImageUrl('')).toBe(false);
    expect(isAllowedCardImageUrl('data:image/png;base64,abc')).toBe(false);
    expect(isAllowedCardImageUrl('not a url')).toBe(false);
    expect(getShareRenderableImageUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });
});
