const ASTRA_ASSET_HOST = 'assets.echoesofastra.com';

const SUPABASE_HOST = (() => {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    return null;
  }

  try {
    return new URL(value).host;
  } catch {
    return null;
  }
})();

function getUrlHost(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function isAllowedCardImageUrl(value: string): boolean {
  if (!value || value.startsWith('data:')) {
    return false;
  }

  const host = getUrlHost(value);
  if (!host) {
    return false;
  }

  if (host === ASTRA_ASSET_HOST) {
    return true;
  }

  return Boolean(SUPABASE_HOST && host === SUPABASE_HOST);
}

export function getShareRenderableImageUrl(value: string): string {
  if (!value || value.startsWith('data:')) {
    return value;
  }

  if (!isAllowedCardImageUrl(value)) {
    return value;
  }

  return `/api/card-image?url=${encodeURIComponent(value)}`;
}
