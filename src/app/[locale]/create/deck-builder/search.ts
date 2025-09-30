import type { Card } from './types';

export type SearchFieldType = 'number' | 'text';

export type SearchField = {
  key: string;
  label: string;
  type: SearchFieldType;
  aliases?: string[];
  getValue: (card: Card) => string | number | null;
};

export type SearchQuery = {
  field: SearchField;
  rawKey: string;
  value: string;
};

export type SearchSuggestion = {
  key: string;
  label: string;
  value: string;
  display: string;
};

export type ParsedSearch = {
  queries: SearchQuery[];
  terms: string[];
};

export const SEARCH_FIELDS: SearchField[] = [
  { key: 'cost', label: 'Cost', type: 'number', getValue: (card) => card.cost },
  { key: 'attack', label: 'Attack', type: 'number', getValue: (card) => card.attack },
  { key: 'health', label: 'Health', type: 'number', getValue: (card) => card.health },
  { key: 'influence', label: 'Influence', type: 'number', getValue: (card) => card.influence ?? null },
  { key: 'number', label: 'Card Number', type: 'number', getValue: (card) => card.number ?? null },
  { key: 'name', label: 'Name', type: 'text', getValue: (card) => card.name },
  { key: 'type', label: 'Type', type: 'text', getValue: (card) => card.type },
  { key: 'subtype', label: 'Subtype', type: 'text', getValue: (card) => card.subtype },
  { key: 'abilities', label: 'Abilities', type: 'text', aliases: ['ability', 'rules', 'rules_text'], getValue: (card) => card.rulesText },
  { key: 'affinity', label: 'Affinity', type: 'text', getValue: (card) => card.affinity },
  { key: 'rarity', label: 'Rarity', type: 'text', getValue: (card) => card.rarity },
  { key: 'artist', label: 'Artist', type: 'text', aliases: ['author'], getValue: (card) => card.artist },
  { key: 'description', label: 'Description', type: 'text', getValue: (card) => card.description },
];

const SEARCH_FIELD_MAP: Map<string, SearchField> = (() => {
  const map = new Map<string, SearchField>();
  for (const field of SEARCH_FIELDS) {
    map.set(field.key, field);
    for (const alias of field.aliases ?? []) {
      map.set(alias, field);
    }
  }
  return map;
})();

const NUMBER_FIELDS = SEARCH_FIELDS.filter((field) => field.type === 'number');
const TEXT_FIELDS = SEARCH_FIELDS.filter((field) => field.type === 'text');

const KEY_VALUE_PATTERN = /^([^:\s]+)\s*:\s*(.+)$/;

export function parseSearchInput(input: string): ParsedSearch {
  const lines = input.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const queries: SearchQuery[] = [];
  const terms: string[] = [];

  for (const line of lines) {
    const match = line.match(KEY_VALUE_PATTERN);
    if (!match) {
      terms.push(line.toLowerCase());
      continue;
    }

    const rawKey = match[1]?.toLowerCase();
    const value = match[2]?.trim();
    if (!rawKey || !value) {
      continue;
    }

    const field = SEARCH_FIELD_MAP.get(rawKey);
    if (!field) {
      terms.push(line.toLowerCase());
      continue;
    }

    queries.push({ field, rawKey, value });
  }

  return { queries, terms };
}

export function doesCardMatchQuery(card: Card, query: SearchQuery): boolean {
  const fieldValue = query.field.getValue(card);

  if (query.field.type === 'number') {
    const numericTarget = Number(query.value);
    if (!Number.isFinite(numericTarget)) {
      return false;
    }

    if (typeof fieldValue !== 'number') {
      return false;
    }

    return fieldValue === numericTarget;
  }

  const textValue = (fieldValue ?? '').toString().toLowerCase();
  return textValue.includes(query.value.toLowerCase());
}

export function buildSearchSuggestions(input: string): SearchSuggestion[] {
  const lines = input.split(/\n/);
  const current = lines[lines.length - 1] ?? '';
  const trimmed = current.trim();

  if (!trimmed || current.includes(':')) {
    return [];
  }

  const numericPattern = /^-?\d+$/;
  const alphaPattern = /^[a-z_]+$/i;
  const isNumeric = numericPattern.test(trimmed);
  const lowerTrimmed = trimmed.toLowerCase();

  if (isNumeric) {
    const candidates = NUMBER_FIELDS.slice(0, 6);
    return candidates.map((field) => ({
      key: field.key,
      label: field.label,
      value: `${field.key}: ${trimmed}`,
      display: `${field.label}: ${trimmed}`,
    }));
  }

  if (alphaPattern.test(trimmed)) {
    const matches = SEARCH_FIELDS.filter((field) =>
      field.key.includes(lowerTrimmed) || field.label.toLowerCase().includes(lowerTrimmed),
    ).slice(0, 6);

    return matches.map((field) => ({
      key: field.key,
      label: field.label,
      value: `${field.key}: `,
      display: `${field.label}:`,
    }));
  }

  const candidates = TEXT_FIELDS.slice(0, 6);
  return candidates.map((field) => ({
    key: field.key,
    label: field.label,
    value: `${field.key}: ${trimmed}`,
    display: `${field.label}: ${trimmed}`,
  }));
}
