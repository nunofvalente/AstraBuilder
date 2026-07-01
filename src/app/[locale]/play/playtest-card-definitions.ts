import type { Card } from '../create/deck-builder/types';
import { getPrintedAbilityTriggers, type AbilityTrigger } from './playtest-abilities';

export type PlaytestCardType = 'unit' | 'tactic' | 'territory' | 'item' | 'token' | 'unknown';
export type PlaytestKeyword = 'blitz' | 'flanking' | 'flying' | 'fortify' | 'glory' | 'impede' | 'provoke' | 'radiance' | 'swift';
export type DefaultPlayDestination = 'staging' | 'battlefield' | 'graveyard' | null;

export type PlaytestCardDefinition = {
  id: string;
  name: string;
  type: PlaytestCardType;
  printedType: string;
  subtype: string | null;
  affinity: string;
  cost: number;
  attack: number | null;
  health: number | null;
  influence: number | null;
  keywords: PlaytestKeyword[];
  printedTriggers: AbilityTrigger[];
  defaultPlayDestination: DefaultPlayDestination;
  canScore: boolean;
  entersStagingExhausted: boolean;
};

const KEYWORD_PATTERNS: Record<PlaytestKeyword, RegExp> = {
  blitz: /\bblitz\b/i,
  flanking: /\bflanking\b/i,
  flying: /\bflying\b/i,
  fortify: /\bfortify\b/i,
  glory: /\bglory\b/i,
  impede: /\bimpede\b/i,
  provoke: /\bprovoke\b/i,
  radiance: /\bradiance\b/i,
  swift: /\bswift\b/i,
};

export function getPlaytestCardType(card: Card): PlaytestCardType {
  const type = card.type.toLowerCase();

  if (type.includes('token')) {
    return 'token';
  }

  if (type.includes('unit')) {
    return 'unit';
  }

  if (type.includes('tactic')) {
    return 'tactic';
  }

  if (type.includes('territory')) {
    return 'territory';
  }

  if (type.includes('item') || type.includes('equipment')) {
    return 'item';
  }

  return 'unknown';
}

export function getPlaytestKeywords(card: Card): PlaytestKeyword[] {
  return Object.entries(KEYWORD_PATTERNS)
    .filter(([, pattern]) => pattern.test(card.rulesText))
    .map(([keyword]) => keyword as PlaytestKeyword);
}

export function hasPlaytestKeyword(card: Card, keyword: PlaytestKeyword): boolean {
  return KEYWORD_PATTERNS[keyword].test(card.rulesText);
}

export function getDefaultPlayDestination(card: Card): DefaultPlayDestination {
  const type = getPlaytestCardType(card);

  if (type === 'unit' || type === 'item') {
    return 'staging';
  }

  if (type === 'territory') {
    return 'battlefield';
  }

  if (type === 'tactic') {
    return 'graveyard';
  }

  return null;
}

export function definePlaytestCard(card: Card): PlaytestCardDefinition {
  const type = getPlaytestCardType(card);
  const keywords = getPlaytestKeywords(card);
  const isUnit = type === 'unit' || type === 'token';

  return {
    id: card.id,
    name: card.name,
    type,
    printedType: card.type,
    subtype: card.subtype || null,
    affinity: card.affinity,
    cost: card.cost,
    attack: isUnit ? card.attack : null,
    health: isUnit ? card.health : null,
    influence: card.influence,
    keywords,
    printedTriggers: getPrintedAbilityTriggers(card),
    defaultPlayDestination: getDefaultPlayDestination(card),
    canScore: isUnit && card.influence !== null && !/\bcan't score\b/i.test(card.rulesText),
    entersStagingExhausted: isUnit && !keywords.includes('blitz'),
  };
}
