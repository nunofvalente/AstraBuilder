import { describe, expect, it } from 'vitest';

import {
  buildAffinityGradient,
  getAffinityBaseColor,
  getAffinityIconPath,
  normalizeAffinity,
} from './affinity';

describe('affinity helpers', () => {
  it('normalizes known affinity keys and preserves unknown display values', () => {
    expect(normalizeAffinity(' terra ')).toBe('Terra');
    expect(normalizeAffinity('SOLARA')).toBe('Solara');
    expect(normalizeAffinity('custom')).toBe('custom');
    expect(normalizeAffinity('   ')).toBeNull();
    expect(normalizeAffinity(undefined)).toBeNull();
  });

  it('resolves base colors and icon paths with neutral fallbacks', () => {
    expect(getAffinityBaseColor('Lux')).toBe('#B38A2E');
    expect(getAffinityBaseColor('neutral')).toBe('#4b5563');
    expect(getAffinityBaseColor('missing')).toBe('#4b5563');

    expect(getAffinityIconPath('nox')).toBe('/images/icons/affinity/icon_nox.png');
    expect(getAffinityIconPath('missing')).toBeNull();
    expect(getAffinityIconPath(null)).toBeNull();
  });

  it('builds gradients from unique non-neutral affinities', () => {
    expect(buildAffinityGradient(['terra', 'Terra', 'Neutral'])).toBe(
      'linear-gradient(135deg, #4F8F63 0%, #7bab8a 100%)',
    );
    expect(buildAffinityGradient(['lux', 'nox'])).toBe(
      'linear-gradient(135deg, #B38A2E 0%, #7c4e6f 100%)',
    );
    expect(buildAffinityGradient(['neutral', null])).toBe(
      'linear-gradient(135deg, #4b5563 0%, #78808a 100%)',
    );
  });
});
