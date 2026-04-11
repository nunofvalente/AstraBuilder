import type { DeckEntry } from './types';

export type DeckExportFormat = 'tts' | 'text';

export function buildTtsDeckExport(deckEntries: DeckEntry[]): string {
  const payload = deckEntries.map(({ card, count }) => ({ count, name: card.name }));
  return JSON.stringify(payload, null, 2);
}

export function buildTextDeckExport(deckEntries: DeckEntry[]): string {
  return deckEntries.map(({ card, count }) => `${count} ${card.name}`).join('\n');
}

export function buildDeckExportContent(deckEntries: DeckEntry[], format: DeckExportFormat): string {
  if (format === 'text') {
    return buildTextDeckExport(deckEntries);
  }

  return buildTtsDeckExport(deckEntries);
}
