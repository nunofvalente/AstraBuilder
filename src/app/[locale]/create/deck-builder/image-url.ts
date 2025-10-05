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

type TransformOptions = {
  width: number;
  height: number;
  quality?: number;
  resize?: 'cover' | 'contain';
  format?: 'webp' | 'jpeg' | 'png' | 'avif' | 'origin';
};

function isTransformableSupabaseUrl(value: string): boolean {
  if (!value) {
    return false;
  }

  if (value.startsWith('data:')) {
    return false;
  }

  if (SUPABASE_HOST) {
    return value.includes(SUPABASE_HOST);
  }

  return value.includes('.supabase.co/');
}

export function getTransformedImageUrl(value: string, options: TransformOptions): string {
  if (!isTransformableSupabaseUrl(value)) {
    return value;
  }

  const [rawPath, existingQuery] = value.split('?');
  const transformedPath = rawPath.includes('/storage/v1/object/')
    ? rawPath.replace('/storage/v1/object/', '/storage/v1/render/image/')
    : rawPath;

  const params = new URLSearchParams(existingQuery ?? undefined);

  params.set('width', String(options.width));
  params.set('height', String(options.height));
  params.set('resize', options.resize ?? 'cover');

  if (options.format) {
    params.set('format', options.format);
  } else {
    params.delete('format');
  }

  if (typeof options.quality === 'number') {
    params.set('quality', String(options.quality));
  } else {
    params.delete('quality');
  }

  const query = params.toString();
  return query ? `${transformedPath}?${query}` : transformedPath;
}
