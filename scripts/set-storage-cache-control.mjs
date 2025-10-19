#!/usr/bin/env node
// Bulk-sets Cache-Control metadata on Supabase Storage objects by re-uploading
// the current content with updated headers. Paths stay the same, so URLs do not
// change, but caches see the refreshed metadata.

import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';

import { createClient } from '@supabase/supabase-js';

const CARDS_DATA_FILE = process.env.CARDS_DATA_FILE ?? path.join('src', 'data', 'cards.json');
const CARDS_TABLE = process.env.CARDS_TABLE ?? 'cards';
const CARDS_PAGE_SIZE = Number.parseInt(process.env.CARDS_PAGE_SIZE ?? '1000', 10);
const CARD_ID_FILTER = process.env.CARD_ID_FILTER
  ? new Set(
      process.env.CARD_ID_FILTER.split(',').map((value) => value.trim()).filter(Boolean).map((value) => value.toLowerCase()),
    )
  : null;
const CARD_OBJECT_FILTER = process.env.CARD_OBJECT_FILTER
  ? process.env.CARD_OBJECT_FILTER.split(',').map((value) => value.trim()).filter(Boolean)
  : null;
const VARIANT_FILTER = process.env.CARD_VARIANTS
  ? process.env.CARD_VARIANTS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  : null;

const VARIANTS = [
  { name: 'small' },
  { name: 'medium' },
  { name: 'large' },
];

const ACTIVE_VARIANTS = VARIANT_FILTER
  ? VARIANTS.filter((variant) => VARIANT_FILTER.includes(variant.name))
  : VARIANTS;

if (ACTIVE_VARIANTS.length === 0) {
  console.error('CARD_VARIANTS filter did not match any known variants.');
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    bucket: null,
    seconds: null,
    cacheControl: null,
    prefix: '',
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if ((value === '-b' || value === '--bucket') && args[i + 1]) {
      options.bucket = args[++i];
    } else if ((value === '-s' || value === '--seconds') && args[i + 1]) {
      options.seconds = args[++i];
    } else if ((value === '--cache-control' || value === '--cache') && args[i + 1]) {
      options.cacheControl = args[++i];
    } else if ((value === '-p' || value === '--prefix') && args[i + 1]) {
      options.prefix = args[++i];
    } else if (value === '--dry-run') {
      options.dryRun = true;
    } else if (value === '-h' || value === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

async function loadCardsFile() {
  const filePath = path.resolve(CARDS_DATA_FILE);
  const content = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(content);
  if (!parsed || !Array.isArray(parsed.cards)) {
    throw new Error(`Unexpected cards JSON structure in ${filePath}`);
  }
  return parsed.cards;
}

async function loadCardsFromDatabase(supabase) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(CARDS_TABLE)
      .select('id,image_url')
      .order('id', { ascending: true })
      .range(from, from + CARDS_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < CARDS_PAGE_SIZE) {
      break;
    }

    from += CARDS_PAGE_SIZE;
  }

  return rows;
}

function parseSupabaseObject(urlString) {
  try {
    const url = new URL(urlString);
    const match = url.pathname.match(/\/storage\/v1\/object\/public\/(.+?)\/(.+)$/);
    if (!match) {
      return null;
    }
    const bucket = match[1];
    const encodedPath = match[2];
    const objectPath = encodedPath
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
    return { bucket, objectPath, encodedPath };
  } catch {
    return null;
  }
}

function buildVariantKey(objectPath, variantName) {
  const segments = objectPath.split('/');
  const filename = segments.pop();
  if (!filename) {
    throw new Error(`Unable to derive filename from ${objectPath}`);
  }

  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  const variantFilename = `${base}.webp`;
  return [...segments, variantName, variantFilename].filter(Boolean).join('/');
}

async function collectCardPaths({ supabase, bucket }) {
  if (!CARD_ID_FILTER || CARD_ID_FILTER.size === 0) {
    return new Set();
  }

  let records = [];

  try {
    const dbRows = await loadCardsFromDatabase(supabase);
    records = dbRows
      .filter((row) => typeof row?.image_url === 'string' && row.image_url.length > 0)
      .map((row) => ({
        id: row?.id != null ? String(row.id) : null,
        imageUrl: row.image_url,
        source: 'database',
      }));
    console.log(`Loaded ${records.length} card image URLs from Supabase table ${CARDS_TABLE}.`);
  } catch (error) {
    console.warn(
      `Unable to load cards from database (${error.message}). Falling back to ${CARDS_DATA_FILE}.`,
    );
  }

  if (records.length === 0) {
    try {
      const fallbackCards = await loadCardsFile();
      records = fallbackCards
        .filter((card) => typeof card?.imageSrc === 'string' && card.imageSrc.length > 0)
        .map((card) => ({
          id: card?.id != null ? String(card.id) : null,
          imageUrl: card.imageSrc,
          source: 'file',
        }));
      console.log(`Loaded ${records.length} card image URLs from ${CARDS_DATA_FILE}.`);
    } catch (fallbackError) {
      console.warn(`Unable to load fallback cards: ${fallbackError.message}`);
    }
  }

  const targetPaths = new Set();
  const missingIds = new Set(CARD_ID_FILTER);

  for (const record of records) {
    if (!record.id) {
      continue;
    }

    const recordId = record.id.toLowerCase();
    if (!CARD_ID_FILTER.has(recordId)) {
      continue;
    }

    const parsed = parseSupabaseObject(record.imageUrl);
    if (!parsed) {
      continue;
    }
    if (parsed.bucket !== bucket) {
      continue;
    }

    missingIds.delete(recordId);

    targetPaths.add(parsed.objectPath);
    for (const variant of ACTIVE_VARIANTS) {
      const variantKey = buildVariantKey(parsed.objectPath, variant.name);
      targetPaths.add(variantKey);
    }
  }

  if (missingIds.size > 0) {
    console.warn(
      `No storage paths found for card IDs: ${Array.from(missingIds).join(', ')}. They may use a different bucket.`,
    );
  }

  return targetPaths;
}

function printHelp() {
  console.log(`Usage: node scripts/set-storage-cache-control.mjs --bucket <name> (--seconds <ttl>|--cache-control <value>) [--prefix <path>] [--dry-run]

Environment:
  SUPABASE_URL                  Project URL
  SUPABASE_SERVICE_ROLE_KEY     Service role key (required)

Examples:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
  node scripts/set-storage-cache-control.mjs --bucket cards --seconds 31536000

  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
  node scripts/set-storage-cache-control.mjs --bucket cards --cache-control "public, max-age=86400" --prefix Imperion/Lux

Optional flags:
  --prefix       Limit updates to the given directory prefix inside the bucket.
  --dry-run      Print what would change without modifying files.

Environment filters:
  CARD_ID_FILTER=uuid-a,uuid-b         Limit updates to variants derived from specific card IDs.
  CARD_OBJECT_FILTER=path-fragment     Only update storage objects whose path contains the fragment.
  CARD_VARIANTS=small,large            Restrict variant folders when using CARD_ID_FILTER (defaults to all).
`);
}

async function main() {
  const { bucket, seconds, cacheControl: cacheControlArg, prefix, dryRun } = parseArgs();
  const cacheControl = cacheControlArg ?? (seconds != null ? String(seconds) : null);

  if (!bucket || !cacheControl) {
    printHelp();
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let updated = 0;
  let visited = 0;
  const hasIdFilter = CARD_ID_FILTER && CARD_ID_FILTER.size > 0;
  const hasObjectFilter = CARD_OBJECT_FILTER && CARD_OBJECT_FILTER.length > 0;
  let targetPaths = null;

  if (hasIdFilter) {
    targetPaths = await collectCardPaths({ supabase, bucket });
    if (!targetPaths || targetPaths.size === 0) {
      console.warn('No storage objects matched CARD_ID_FILTER. Nothing to update.');
      return;
    }
  }

  if (hasIdFilter) {
    console.log(`Filtering to card IDs: ${Array.from(CARD_ID_FILTER).join(', ')}`);
  }

  if (hasObjectFilter) {
    console.log(`Filtering to object paths containing: ${CARD_OBJECT_FILTER.join(', ')}`);
  }

  async function updateOne(path, mimetype) {
    if (dryRun) {
      console.log(`[dry-run] ${path} -> Cache-Control: ${cacheControl}`);
      return;
    }

    const { data: dl, error: downloadError } = await supabase.storage.from(bucket).download(path);
    if (downloadError) {
      throw new Error(`Download failed for ${path}: ${downloadError.message}`);
    }

    const contentType = mimetype || (dl && dl.type) || 'application/octet-stream';

    const { error: updateError } = await supabase.storage
      .from(bucket)
      .update(path, dl, { contentType, cacheControl, upsert: true });

    if (updateError) {
      throw new Error(`Update failed for ${path}: ${updateError.message}`);
    }

    updated++;
    if (updated % 25 === 0) {
      console.log(`Progress: ${updated} files updated...`);
    }
  }

  function matchesFilters(path) {
    if (hasIdFilter && targetPaths && !targetPaths.has(path)) {
      return false;
    }

    if (hasObjectFilter && !CARD_OBJECT_FILTER.some((pattern) => path.includes(pattern))) {
      return false;
    }

    return true;
  }

  async function walk(currentPrefix = '') {
    const { data: entries, error } = await supabase.storage.from(bucket).list(currentPrefix, { limit: 1000 });
    if (error) {
      throw new Error(`List failed at "${currentPrefix}": ${error.message}`);
    }

    for (const entry of entries ?? []) {
      const path = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
      const isFile = entry.metadata && (typeof entry.metadata.size === 'number' || typeof entry.metadata.mimetype === 'string');

      if (isFile) {
        if (matchesFilters(path)) {
          visited++;
          try {
            await updateOne(path, entry.metadata?.mimetype);
            if (!dryRun) {
              console.log(`Updated ${path}`);
            }
          } catch (error_) {
            console.error(String(error_));
          }
        }
      } else {
        await walk(path);
      }
    }
  }

  function parentPrefixForPath(path) {
    const idx = path.lastIndexOf('/');
    return idx >= 0 ? path.slice(0, idx) : '';
  }

  function buildPrefixesToWalk() {
    if (prefix) {
      return [prefix];
    }

    if (hasIdFilter && targetPaths && targetPaths.size > 0) {
      const prefixes = new Set();
      for (const path of targetPaths) {
        prefixes.add(parentPrefixForPath(path));
      }

      const sorted = Array.from(prefixes).sort((a, b) => a.length - b.length);
      const filtered = [];

      for (const candidate of sorted) {
        const isShadowed = filtered.some((existing) => {
          if (existing === '') {
            return candidate !== '';
          }
          return candidate === existing || candidate.startsWith(`${existing}/`);
        });

        if (!isShadowed) {
          filtered.push(candidate);
        }
      }

      return filtered.length > 0 ? filtered : [''];
    }

    return [''];
  }

  const prefixesToWalk = buildPrefixesToWalk();
  const displayPrefixes = prefixesToWalk.map((value) => (value === '' ? '(root)' : value)).join(', ');
  console.log(
    `${dryRun ? '[dry-run] ' : ''}Setting Cache-Control="${cacheControl}" on bucket="${bucket}" prefixes=${displayPrefixes}...`
  );

  for (const prefixToWalk of prefixesToWalk) {
    await walk(prefixToWalk);
  }

  if (dryRun) {
    console.log(`Dry run complete. Files inspected: ${visited}`);
  } else {
    console.log(`Done. Updated=${updated}, Files inspected=${visited}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
