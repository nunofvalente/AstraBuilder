import { describe, expect, it } from 'vitest';

import { parseDeckImport } from './import-formats';

describe('deck import formats', () => {
  it('parses plain text deck lists', () => {
    expect(parseDeckImport('2 Alpha\n1 Beta', 'text')).toEqual([
      { count: 2, name: 'Alpha' },
      { count: 1, name: 'Beta' },
    ]);
  });

  it('rejects malformed plain text deck lists', () => {
    expect(() => parseDeckImport('Alpha x2', 'text')).toThrow('invalid');
    expect(() => parseDeckImport('0 Alpha', 'text')).toThrow('invalid');
  });

  it('parses TTS JSON and skips entries without positive counts or names', () => {
    expect(
      parseDeckImport(
        JSON.stringify([
          { count: 2.9, name: ' Alpha ' },
          { count: 0, name: 'Skip' },
          { count: 3, name: '   ' },
        ]),
        'tts',
      ),
    ).toEqual([{ count: 2, name: 'Alpha' }]);
  });

  it('rejects malformed TTS JSON', () => {
    expect(() => parseDeckImport('{bad json', 'tts')).toThrow('invalid');
    expect(() => parseDeckImport(JSON.stringify({ count: 1, name: 'Alpha' }), 'tts')).toThrow('invalid');
    expect(() => parseDeckImport(JSON.stringify([null]), 'tts')).toThrow('invalid');
  });
});
