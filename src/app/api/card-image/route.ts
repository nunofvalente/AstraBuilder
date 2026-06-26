import { NextRequest, NextResponse } from 'next/server';

import { isAllowedCardImageUrl } from '@/lib/images/card-image-proxy';

const CLIENT_CACHE_HEADER = 'public, max-age=86400';
const VERCEL_CACHE_HEADER = 'public, s-maxage=31536000, stale-while-revalidate=86400';

export async function GET(request: NextRequest) {
  const sourceUrl = request.nextUrl.searchParams.get('url')?.trim() ?? '';
  if (!sourceUrl || !isAllowedCardImageUrl(sourceUrl)) {
    return new NextResponse('Invalid image URL', { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(sourceUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
  } catch {
    return new NextResponse('Unable to fetch image', { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse('Upstream image fetch failed', { status: upstream.status });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': CLIENT_CACHE_HEADER,
      'content-type': contentType,
      'vercel-cdn-cache-control': VERCEL_CACHE_HEADER,
    },
  });
}
