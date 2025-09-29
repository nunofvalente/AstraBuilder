const SUPABASE_PUBLIC_PATH = "/storage/v1/object/public";

function trimSlashes(value: string) {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function getPublicAssetUrl(bucket: string, filePath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    return undefined;
  }

  const normalizedBase = supabaseUrl.replace(/\/+$/, "");
  const normalizedBucket = trimSlashes(bucket);
  const normalizedPath = trimSlashes(filePath);

  return `${normalizedBase}${SUPABASE_PUBLIC_PATH}/${normalizedBucket}/${normalizedPath}`;
}
