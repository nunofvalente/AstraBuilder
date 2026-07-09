import { describe, expect, it, afterEach } from 'vitest';

import { isBuyMeACoffeeEnabled } from './features';

const originalBuyMeACoffeeFlag = process.env.NEXT_PUBLIC_ENABLE_BUY_ME_A_COFFEE;

afterEach(() => {
  if (originalBuyMeACoffeeFlag === undefined) {
    delete process.env.NEXT_PUBLIC_ENABLE_BUY_ME_A_COFFEE;
  } else {
    process.env.NEXT_PUBLIC_ENABLE_BUY_ME_A_COFFEE = originalBuyMeACoffeeFlag;
  }
});

describe('feature flags', () => {
  it('enables Buy Me a Coffee only when explicitly set to true', () => {
    process.env.NEXT_PUBLIC_ENABLE_BUY_ME_A_COFFEE = 'true';

    expect(isBuyMeACoffeeEnabled()).toBe(true);

    process.env.NEXT_PUBLIC_ENABLE_BUY_ME_A_COFFEE = 'false';

    expect(isBuyMeACoffeeEnabled()).toBe(false);

    delete process.env.NEXT_PUBLIC_ENABLE_BUY_ME_A_COFFEE;

    expect(isBuyMeACoffeeEnabled()).toBe(false);
  });
});
