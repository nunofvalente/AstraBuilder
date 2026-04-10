import { NextRequest, NextResponse } from 'next/server';

import { isAllowedCardImageUrl } from '@/lib/images/card-image-proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CACHE_CONTROL_HEADER = 'no-store, no-cache, must-revalidate';

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
      cache: 'no-store',
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
      'content-type': contentType,
      'cache-control': CACHE_CONTROL_HEADER,
    },
  });
}
