import type { DeckExportFormat } from './export-formats';

export type DeckImportEntry = {
  name: string;
  count: number;
};

function parseTtsDeckImport(raw: unknown): DeckImportEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error('invalid');
  }

  const entries: DeckImportEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      throw new Error('invalid');
    }

    const name = typeof (item as { name?: unknown }).name === 'string' ? (item as { name: string }).name.trim() : '';
    const countValue = (item as { count?: unknown }).count;
    const count = typeof countValue === 'number' ? Math.floor(countValue) : 0;

    if (!name || count <= 0) {
      continue;
    }

    entries.push({ name, count });
  }

  return entries;
}

function parseTextDeckImport(input: string): DeckImportEntry[] {
  const entries: DeckImportEntry[] = [];
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) {
      throw new Error('invalid');
    }

    const count = Number.parseInt(match[1], 10);
    const name = match[2].trim();

    if (!Number.isFinite(count) || count <= 0 || name.length === 0) {
      throw new Error('invalid');
    }

    entries.push({ name, count });
  }

  return entries;
}

export function parseDeckImport(input: string, format: DeckExportFormat): DeckImportEntry[] {
  if (format === 'text') {
    return parseTextDeckImport(input);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('invalid');
  }

  return parseTtsDeckImport(parsed);
}
