import { afterEach, describe, expect, it } from 'vitest';

import { getAstraCardCatalogRevalidateSeconds } from './astra-card-catalog';

const originalRevalidateSeconds = process.env.ASTRA_CARD_CATALOG_REVALIDATE_SECONDS;

afterEach(() => {
  process.env.ASTRA_CARD_CATALOG_REVALIDATE_SECONDS = originalRevalidateSeconds;
});

describe('getAstraCardCatalogRevalidateSeconds', () => {
  it('defaults to one day', () => {
    delete process.env.ASTRA_CARD_CATALOG_REVALIDATE_SECONDS;

    expect(getAstraCardCatalogRevalidateSeconds()).toBe(86400);
  });

  it('uses a valid configured value', () => {
    process.env.ASTRA_CARD_CATALOG_REVALIDATE_SECONDS = '21600';

    expect(getAstraCardCatalogRevalidateSeconds()).toBe(21600);
  });

  it('falls back when configured with an invalid value', () => {
    process.env.ASTRA_CARD_CATALOG_REVALIDATE_SECONDS = 'often';

    expect(getAstraCardCatalogRevalidateSeconds()).toBe(86400);
  });
});
