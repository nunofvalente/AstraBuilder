#!/usr/bin/env node
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SOURCE_BUCKET = process.env.CARDS_SOURCE_BUCKET ?? 'cards';
const CARDS_DATA_FILE = process.env.CARDS_DATA_FILE ?? path.join('src', 'data', 'cards.json');
const CARDS_TABLE = process.env.CARDS_TABLE ?? 'cards';
const CARDS_PAGE_SIZE = Number.parseInt(process.env.CARDS_PAGE_SIZE ?? '1000', 10);
const VARIANT_FILTER = process.env.CARD_VARIANTS
  ? process.env.CARD_VARIANTS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  : null;
const SKIP_EXISTING_VARIANTS =
  (process.env.CARD_SKIP_EXISTING ?? process.env.SKIP_EXISTING_VARIANTS ?? '').toLowerCase() === 'true';
const CARD_ID_FILTER = process.env.CARD_ID_FILTER
  ? new Set(
      process.env.CARD_ID_FILTER.split(',').map((value) => value.trim()).filter(Boolean).map((value) => value.toLowerCase()),
    )
  : null;
const CARD_OBJECT_FILTER = process.env.CARD_OBJECT_FILTER
  ? process.env.CARD_OBJECT_FILTER.split(',').map((value) => value.trim()).filter(Boolean)
  : null;

const VARIANTS = [
  { name: 'small', width: 880, height: 1232, quality: 90 },
  { name: 'medium', width: 1120, height: 1568, quality: 93 },
  { name: 'large', width: 1440, height: 2016, quality: 96 },
];

const ACTIVE_VARIANTS = VARIANT_FILTER
  ? VARIANTS.filter((variant) => VARIANT_FILTER.includes(variant.name))
  : VARIANTS;

if (ACTIVE_VARIANTS.length === 0) {
  console.error('CARD_VARIANTS filter did not match any known variants.');
  process.exit(1);
}

if (!SUPABASE_URL) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable.');
  process.exitCode = 1;
  process.exit();
}

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
  console.error('The service role key is required to upload assets to storage buckets.');
  process.exitCode = 1;
  process.exit();
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function loadCardsFile() {
  const filePath = path.resolve(CARDS_DATA_FILE);
  const content = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(content);
  if (!parsed || !Array.isArray(parsed.cards)) {
    throw new Error(`Unexpected cards JSON structure in ${filePath}`);
  }
  return parsed.cards;
}

async function loadCardsFromDatabase() {
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
  } catch (error) {
    console.warn(`Unable to parse Supabase storage URL: ${urlString}`, error);
    return null;
  }
}

function encodePath(path) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
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

function splitVariantKey(key) {
  const segments = key.split('/');
  const filename = segments.pop();
  if (!filename) {
    throw new Error(`Unable to derive filename from ${key}`);
  }
  return { folder: segments.join('/'), filename };
}

const variantExistenceCache = new Map();

async function uploadVariant(key, buffer) {
  const { error } = await supabase.storage.from(SOURCE_BUCKET).upload(key, buffer, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (error) {
    throw new Error(`Upload failed for ${SOURCE_BUCKET}/${key}: ${error.message}`);
  }
}

async function variantExists(variantKey) {
  if (variantExistenceCache.has(variantKey)) {
    return variantExistenceCache.get(variantKey);
  }

  const { folder, filename } = splitVariantKey(variantKey);
  const listPath = folder.length > 0 ? folder : '';

  try {
    const { data, error } = await supabase.storage.from(SOURCE_BUCKET).list(listPath, {
      limit: 1,
      search: filename,
    });

    if (error) {
      console.warn(
        `Unable to inspect existing variant ${SOURCE_BUCKET}/${variantKey} (${error.message}). Regenerating.`,
      );
      variantExistenceCache.set(variantKey, false);
      return false;
    }

    const exists = Array.isArray(data) && data.some((item) => item.name === filename);
    variantExistenceCache.set(variantKey, exists);
    return exists;
  } catch (error) {
    console.warn(`Unable to inspect existing variant ${SOURCE_BUCKET}/${variantKey}. Regenerating.`, error);
    variantExistenceCache.set(variantKey, false);
    return false;
  }
}

async function determineVariantsToGenerate(objectPath) {
  if (!SKIP_EXISTING_VARIANTS) {
    return ACTIVE_VARIANTS;
  }

  const variantsToGenerate = [];

  for (const variant of ACTIVE_VARIANTS) {
    const variantKey = buildVariantKey(objectPath, variant.name);
    const exists = await variantExists(variantKey);
    if (!exists) {
      variantsToGenerate.push(variant);
    }
  }

  return variantsToGenerate;
}

async function processImage(objectPath, buffer, variants) {
  let generated = 0;

  for (const variant of variants) {
    const output = await sharp(buffer)
      .resize({
        width: variant.width,
        height: variant.height,
        fit: 'cover',
        withoutEnlargement: true,
      })
      .webp({
        quality: variant.quality,
        effort: 6,
        smartSubsample: true,
      })
      .toBuffer();

    const targetKey = buildVariantKey(objectPath, variant.name);
    await uploadVariant(targetKey, output);
    console.log(`Uploaded ${SOURCE_BUCKET}/${targetKey}`);
    generated += 1;
  }

  return generated;
}

async function downloadOriginal(objectPath) {
  const tried = [];
  const candidates = [objectPath];
  const encoded = encodePath(objectPath);
  if (!candidates.includes(encoded)) {
    candidates.push(encoded);
  }

  for (const key of candidates) {
    tried.push(key);
    const { data, error } = await supabase.storage.from(SOURCE_BUCKET).download(key);
    if (error || !data) {
      continue;
    }

    if (typeof data.arrayBuffer === 'function') {
      return Buffer.from(await data.arrayBuffer());
    }

    return Buffer.from(data);
  }

  throw new Error(`Failed to download ${SOURCE_BUCKET}/${objectPath}: tried ${tried.join(', ')}`);
}

async function main() {
  let records = [];

  try {
    const dbRows = await loadCardsFromDatabase();
    records = dbRows
      .filter((row) => typeof row?.image_url === 'string' && row.image_url.length > 0)
      .map((row) => ({
        imageUrl: row.image_url,
        id: row?.id != null ? String(row.id) : null,
        source: 'database',
      }));
    console.log(`Loaded ${records.length} image URLs from Supabase table ${CARDS_TABLE}.`);
  } catch (error) {
    console.warn(`Unable to load cards from database (${error.message}). Falling back to ${CARDS_DATA_FILE}.`);
  }

  if (records.length === 0) {
    const fallbackCards = await loadCardsFile();
    records = fallbackCards
      .filter((card) => typeof card?.imageSrc === 'string' && card.imageSrc.length > 0)
      .map((card) => ({
        imageUrl: card.imageSrc,
        id: card?.id != null ? String(card.id) : null,
        source: 'file',
      }));
    console.log(`Loaded ${records.length} image URLs from ${CARDS_DATA_FILE}.`);
  }

  if (CARD_ID_FILTER) {
    console.log(`Filtering to card IDs: ${Array.from(CARD_ID_FILTER).join(', ')}`);
  }

  if (CARD_OBJECT_FILTER) {
    console.log(`Filtering to object paths containing: ${CARD_OBJECT_FILTER.join(', ')}`);
  }

  if (SKIP_EXISTING_VARIANTS) {
    console.log('CARD_SKIP_EXISTING enabled; existing variants will be skipped.');
  }

  const uniqueImages = new Map();

  for (const record of records) {
    if (CARD_ID_FILTER) {
      if (!record.id) {
        continue;
      }
      const recordId = record.id.toLowerCase();
      if (!CARD_ID_FILTER.has(recordId)) {
        continue;
      }
    }

    const parsed = parseSupabaseObject(record.imageUrl);
    if (!parsed) {
      continue;
    }
    if (parsed.bucket !== SOURCE_BUCKET) {
      console.warn(`Skipping image in bucket ${parsed.bucket}; expected ${SOURCE_BUCKET}`);
      continue;
    }

    if (CARD_OBJECT_FILTER && !CARD_OBJECT_FILTER.some((pattern) => parsed.objectPath.includes(pattern))) {
      continue;
    }

    if (!uniqueImages.has(parsed.encodedPath)) {
      uniqueImages.set(parsed.encodedPath, { ...parsed, record });
    }
  }

  if (uniqueImages.size === 0) {
    console.log('No images matched the provided filters.');
    return;
  }

  console.log(`Processing ${uniqueImages.size} unique card images from ${SOURCE_BUCKET}`);

  let processedImages = 0;
  let skippedImages = 0;
  let generatedVariants = 0;

  for (const { objectPath } of uniqueImages.values()) {
    try {
      const variantsToGenerate = await determineVariantsToGenerate(objectPath);
      if (variantsToGenerate.length === 0) {
        if (SKIP_EXISTING_VARIANTS) {
          skippedImages += 1;
          console.log(`Skipping ${objectPath}; all variants already exist.`);
        }
        continue;
      }

      const originalBuffer = await downloadOriginal(objectPath);
      const produced = await processImage(objectPath, originalBuffer, variantsToGenerate);
      generatedVariants += produced;
      processedImages += 1;
    } catch (error) {
      console.error(error);
    }
  }

  console.log(`Finished processing ${processedImages} images.`);
  console.log(`Generated ${generatedVariants} variant files.`);
  if (SKIP_EXISTING_VARIANTS) {
    console.log(`Skipped ${skippedImages} images because all variants were already present.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
