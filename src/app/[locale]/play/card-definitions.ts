import type { Card } from '../create/deck-builder/types';
import { getPrintedAbilityTriggers, type AbilityTrigger } from './card-abilities';

export type CardType = 'unit' | 'tactic' | 'territory' | 'item' | 'token' | 'unknown';
export type CardKeyword = 'blitz' | 'flanking' | 'flying' | 'fortify' | 'glory' | 'impede' | 'provoke' | 'radiance' | 'swift';
export type DefaultPlayDestination = 'staging' | 'battlefield' | 'graveyard' | null;

export type CardDefinition = {
  id: string;
  name: string;
  type: CardType;
  printedType: string;
  subtype: string | null;
  affinity: string;
  cost: number;
  attack: number | null;
  health: number | null;
  influence: number | null;
  keywords: CardKeyword[];
  printedTriggers: AbilityTrigger[];
  defaultPlayDestination: DefaultPlayDestination;
  canScore: boolean;
  entersStagingExhausted: boolean;
};

const KEYWORD_PATTERNS: Record<CardKeyword, RegExp> = {
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

export function getCardType(card: Card): CardType {
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

export function getCardKeywords(card: Card): CardKeyword[] {
  return Object.entries(KEYWORD_PATTERNS)
    .filter(([, pattern]) => pattern.test(card.rulesText))
    .map(([keyword]) => keyword as CardKeyword);
}

export function hasCardKeyword(card: Card, keyword: CardKeyword): boolean {
  return KEYWORD_PATTERNS[keyword].test(card.rulesText);
}

export function getDefaultPlayDestination(card: Card): DefaultPlayDestination {
  const type = getCardType(card);

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

export function defineCard(card: Card): CardDefinition {
  const type = getCardType(card);
  const keywords = getCardKeywords(card);
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
