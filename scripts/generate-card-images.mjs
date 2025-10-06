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

const VARIANTS = [
  { name: 'small', width: 220, height: 308, quality: 70 },
  { name: 'medium', width: 400, height: 560, quality: 80 },
  { name: 'large', width: 600, height: 840, quality: 85 },
];

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

async function uploadVariant(key, buffer) {
  const { error } = await supabase.storage.from(SOURCE_BUCKET).upload(key, buffer, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (error) {
    throw new Error(`Upload failed for ${SOURCE_BUCKET}/${key}: ${error.message}`);
  }
}

async function processImage(objectPath, buffer) {
  for (const variant of VARIANTS) {
    const output = await sharp(buffer)
      .resize({ width: variant.width, height: variant.height, fit: 'cover' })
      .webp({ quality: variant.quality })
      .toBuffer();

    const targetKey = buildVariantKey(objectPath, variant.name);
    await uploadVariant(targetKey, output);
    console.log(`Uploaded ${SOURCE_BUCKET}/${targetKey}`);
  }
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
  let images = [];

  try {
    const dbRows = await loadCardsFromDatabase();
    images = dbRows
      .map((row) => row?.image_url ?? null)
      .filter((value) => typeof value === 'string' && value.length > 0);
    console.log(`Loaded ${images.length} image URLs from Supabase table ${CARDS_TABLE}.`);
  } catch (error) {
    console.warn(`Unable to load cards from database (${error.message}). Falling back to ${CARDS_DATA_FILE}.`);
  }

  if (images.length === 0) {
    const fallbackCards = await loadCardsFile();
    images = fallbackCards
      .map((card) => card?.imageSrc ?? null)
      .filter((value) => typeof value === 'string' && value.length > 0);
    console.log(`Loaded ${images.length} image URLs from ${CARDS_DATA_FILE}.`);
  }

  const uniqueImages = new Map();

  for (const imageSrc of images) {
    const parsed = parseSupabaseObject(imageSrc);
    if (!parsed) {
      continue;
    }
    if (parsed.bucket !== SOURCE_BUCKET) {
      console.warn(`Skipping image in bucket ${parsed.bucket}; expected ${SOURCE_BUCKET}`);
      continue;
    }
    if (!uniqueImages.has(parsed.encodedPath)) {
      uniqueImages.set(parsed.encodedPath, parsed);
    }
  }

  console.log(`Processing ${uniqueImages.size} unique card images from ${SOURCE_BUCKET}`);

  let processed = 0;
  for (const { objectPath } of uniqueImages.values()) {
    try {
      const originalBuffer = await downloadOriginal(objectPath);
      await processImage(objectPath, originalBuffer);
      processed += 1;
    } catch (error) {
      console.error(error);
    }
  }

  console.log(`Finished processing ${processed} images.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
