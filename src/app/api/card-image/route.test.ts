import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/images/card-image-proxy', () => ({
  isAllowedCardImageUrl: vi.fn((value: string) => value === 'https://assets.echoesofastra.com/card.webp'),
}));

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('card image proxy route', () => {
  it('rejects missing or disallowed image URLs', async () => {
    const { GET } = await import('./route');

    await expect(GET({ nextUrl: new URL('https://app.test/api/card-image') } as never)).resolves.toMatchObject({
      status: 400,
    });
    await expect(
      GET({ nextUrl: new URL('https://app.test/api/card-image?url=https%3A%2F%2Fexample.com%2Fbad.webp') } as never),
    ).resolves.toMatchObject({ status: 400 });
  });

  it('returns proxied image responses with cache and CORS headers', async () => {
    const { GET } = await import('./route');
    const bytes = new Uint8Array([1, 2, 3]);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'image/webp' },
      }),
    );

    const response = await GET({
      nextUrl: new URL('https://app.test/api/card-image?url=https%3A%2F%2Fassets.echoesofastra.com%2Fcard.webp'),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(response.headers.get('content-type')).toContain('image/webp');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it('surfaces upstream fetch failures', async () => {
    const { GET } = await import('./route');
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));

    await expect(
      GET({
        nextUrl: new URL('https://app.test/api/card-image?url=https%3A%2F%2Fassets.echoesofastra.com%2Fcard.webp'),
      } as never),
    ).resolves.toMatchObject({ status: 502 });

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(
      GET({
        nextUrl: new URL('https://app.test/api/card-image?url=https%3A%2F%2Fassets.echoesofastra.com%2Fcard.webp'),
      } as never),
    ).resolves.toMatchObject({ status: 404 });
  });
});
