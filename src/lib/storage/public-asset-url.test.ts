import { afterEach, describe, expect, it } from 'vitest';

import { getPublicAssetUrl } from './public-asset-url';

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
});

describe('public asset URL helper', () => {
  it('returns undefined without a Supabase URL', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(getPublicAssetUrl('cards', 'foo.webp')).toBeUndefined();
  });

  it('normalizes base URL, bucket, and path slashes', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co/';
    expect(getPublicAssetUrl('/cards/', '/nested/foo.webp/')).toBe(
      'https://project.supabase.co/storage/v1/object/public/cards/nested/foo.webp',
    );
  });
});
