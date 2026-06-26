import { afterEach, describe, expect, it } from 'vitest';

import { getAstraAllCardsUrl, getAstraApiBaseUrl } from './astra-config';

const originalBaseUrl = process.env.ASTRA_API_BASE_URL;

afterEach(() => {
  process.env.ASTRA_API_BASE_URL = originalBaseUrl;
});

describe('Astra API config', () => {
  it('uses the default API base URL', () => {
    delete process.env.ASTRA_API_BASE_URL;
    expect(getAstraApiBaseUrl()).toBe('https://api.echoesofastra.com');
    expect(getAstraAllCardsUrl()).toBe('https://api.echoesofastra.com/getallcards');
  });

  it('trims trailing slashes from configured base URLs', () => {
    process.env.ASTRA_API_BASE_URL = 'https://api.example.test///';
    expect(getAstraApiBaseUrl()).toBe('https://api.example.test');
    expect(getAstraAllCardsUrl()).toBe('https://api.example.test/getallcards');
  });
});
