const FALLBACK_SITE_URL = 'https://www.astra-builder.com';

function normalizeSiteUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.origin;
  } catch {
    return null;
  }
}

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  return normalizeSiteUrl(raw) ?? FALLBACK_SITE_URL;
}

export function getMetadataBase(): URL {
  return new URL(getSiteUrl());
}

export function buildAbsoluteUrl(path: string): string {
  const base = getSiteUrl();
  if (!path || path === '/') {
    return base;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
