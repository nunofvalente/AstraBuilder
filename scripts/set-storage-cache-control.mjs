#!/usr/bin/env node
// Bulk-sets Cache-Control metadata on Supabase Storage objects by re-uploading
// the current content with updated headers. Paths stay the same, so URLs do not
// change, but caches see the refreshed metadata.

import { createClient } from '@supabase/supabase-js';

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
`);
}

async function main() {
  const { bucket, seconds, cacheControl: cacheControlArg, prefix, dryRun } = parseArgs();
  const cacheControl = cacheControlArg ?? (seconds != null ? String(seconds) : null);

  if (!bucket || !cacheControl) {
    printHelp();
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let updated = 0;
  let visited = 0;

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

  async function walk(currentPrefix = '') {
    const { data: entries, error } = await supabase.storage.from(bucket).list(currentPrefix, { limit: 1000 });
    if (error) {
      throw new Error(`List failed at "${currentPrefix}": ${error.message}`);
    }

    for (const entry of entries ?? []) {
      const path = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
      const isFile = entry.metadata && (typeof entry.metadata.size === 'number' || typeof entry.metadata.mimetype === 'string');

      if (isFile) {
        visited++;
        try {
          await updateOne(path, entry.metadata?.mimetype);
          if (!dryRun) {
            console.log(`Updated ${path}`);
          }
        } catch (error_) {
          console.error(String(error_));
        }
      } else {
        await walk(path);
      }
    }
  }

  const displayPrefix = prefix || '';
  console.log(
    `${dryRun ? '[dry-run] ' : ''}Setting Cache-Control="${cacheControl}" on bucket="${bucket}" prefix="${displayPrefix}"...`
  );

  await walk(displayPrefix);

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
