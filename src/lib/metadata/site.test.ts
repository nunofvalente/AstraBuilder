import { afterEach, describe, expect, it, vi } from 'vitest';

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

async function importSiteHelpers() {
  vi.resetModules();
  return import('./site');
}

afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe('site metadata helpers', () => {
  it('uses the fallback site URL when configuration is empty or invalid', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    let helpers = await importSiteHelpers();
    expect(helpers.getSiteUrl()).toBe('https://www.astrabuilder.com');

    process.env.NEXT_PUBLIC_SITE_URL = 'not a url';
    helpers = await importSiteHelpers();
    expect(helpers.getSiteUrl()).toBe('https://www.astrabuilder.com');
  });

  it('normalizes configured origins and builds absolute URLs', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com/base/path';
    const helpers = await importSiteHelpers();

    expect(helpers.getSiteUrl()).toBe('https://example.com');
    expect(helpers.getMetadataBase()).toEqual(new URL('https://example.com'));
    expect(helpers.buildAbsoluteUrl('/decks')).toBe('https://example.com/decks');
    expect(helpers.buildAbsoluteUrl('collection')).toBe('https://example.com/collection');
    expect(helpers.buildAbsoluteUrl('https://other.test/path')).toBe('https://other.test/path');
    expect(helpers.buildAbsoluteUrl('/')).toBe('https://example.com');
  });
});
