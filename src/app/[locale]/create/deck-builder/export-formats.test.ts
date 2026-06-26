import { describe, expect, it } from 'vitest';

import { buildDeckExportContent, buildTextDeckExport, buildTtsDeckExport } from './export-formats';
import { createTestCard } from './test-utils';

const deckEntries = [
  { card: createTestCard({ name: 'Alpha' }), count: 2 },
  { card: createTestCard({ name: 'Beta' }), count: 1 },
];

describe('deck export formats', () => {
  it('builds Tabletop Simulator JSON exports', () => {
    expect(buildTtsDeckExport(deckEntries)).toBe(
      JSON.stringify(
        [
          { count: 2, name: 'Alpha' },
          { count: 1, name: 'Beta' },
        ],
        null,
        2,
      ),
    );
  });

  it('builds plain text exports', () => {
    expect(buildTextDeckExport(deckEntries)).toBe('2 Alpha\n1 Beta');
    expect(buildDeckExportContent(deckEntries, 'text')).toBe('2 Alpha\n1 Beta');
  });

  it('defaults combined export helper to TTS format', () => {
    expect(buildDeckExportContent(deckEntries, 'tts')).toBe(buildTtsDeckExport(deckEntries));
  });
});
