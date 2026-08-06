import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { normalizeCollectionRows } from './card-collection';

describe('normalizeCollectionRows', () => {
  it('maps valid card quantities', () => {
    expect(normalizeCollectionRows([
      { card_id: 'IMP001', quantity: 2 },
      { card_id: 'IMP002', quantity: 4 },
    ])).toEqual({ IMP001: 2, IMP002: 4 });
  });

  it('ignores empty and non-positive rows while clamping large quantities', () => {
    expect(normalizeCollectionRows([
      { card_id: '', quantity: 2 },
      { card_id: 'IMP001', quantity: 0 },
      { card_id: 'IMP002', quantity: 1200 },
    ])).toEqual({ IMP002: 999 });
  });
});
