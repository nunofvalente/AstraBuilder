const SUPABASE_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    return null;
  }

  try {
    return new URL(url).host;
  } catch (_error) {
    return null;
  }
})();

const SUPABASE_PUBLIC_PREFIX = '/storage/v1/object/public/';
const ASTRA_ASSET_HOST = 'assets.echoesofastra.com';

export type CardImageVariant = 'small' | 'medium' | 'large';

function isSupabaseObjectUrl(value: string): boolean {
  if (!value || value.startsWith('data:')) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostMatches = SUPABASE_HOST ? url.host === SUPABASE_HOST : url.host.includes('.supabase.co');
    return hostMatches && url.pathname.includes(SUPABASE_PUBLIC_PREFIX);
  } catch (_error) {
    return false;
  }
}

function isAstraAssetUrl(value: string): boolean {
  if (!value || value.startsWith('data:')) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.host === ASTRA_ASSET_HOST;
  } catch (_error) {
    return false;
  }
}

function extractSupabaseObjectParts(
  value: string
): { origin: string; bucket: string; objectPath: string; encodedPath: string } | null {
  try {
    const url = new URL(value);
    if (!url.pathname.startsWith(SUPABASE_PUBLIC_PREFIX)) {
      return null;
    }

    const remainder = url.pathname.slice(SUPABASE_PUBLIC_PREFIX.length);
    const segments = remainder.split('/').filter(Boolean);
    const rawBucket = segments.shift();
    if (!rawBucket || segments.length === 0) {
      return null;
    }

    const decodedSegments = segments.map((segment) => decodeURIComponent(segment));

    return {
      origin: url.origin,
      bucket: rawBucket,
      objectPath: decodedSegments.join('/'),
      encodedPath: segments.join('/'),
    };
  } catch (_error) {
    return null;
  }
}

export function getCardImageVariantUrl(value: string, variant: CardImageVariant): string {
  if (!isSupabaseObjectUrl(value)) {
    if (isAstraAssetUrl(value)) {
      return getAstraCardImageVariantUrl(value, variant);
    }

    return value;
  }

  const parts = extractSupabaseObjectParts(value);
  if (!parts) {
    return value;
  }

  const variantPath = buildVariantPath(parts.objectPath, variant);
  if (!variantPath) {
    return value;
  }

  const encodedVariantPath = encodePath(variantPath);
  return `${parts.origin}${SUPABASE_PUBLIC_PREFIX}${parts.bucket}/${encodedVariantPath}`;
}

function getAstraCardImageVariantUrl(value: string, variant: CardImageVariant): string {
  if (variant === 'small') {
    return value;
  }

  return value.replace(/_web(\.[a-z0-9]+)$/i, '$1');
}

function buildVariantPath(objectPath: string, variant: CardImageVariant): string | null {
  if (!objectPath) {
    return null;
  }

  const segments = objectPath.split('/');
  const filename = segments.pop();
  if (!filename) {
    return null;
  }

  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  const variantFilename = `${base}.webp`;
  const variantSegments = [...segments, variant, variantFilename];

  return variantSegments.filter(Boolean).join('/');
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
