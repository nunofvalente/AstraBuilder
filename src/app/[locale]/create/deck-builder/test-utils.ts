import type { Card } from './types';

export function createTestCard(overrides: Partial<Card> = {}): Card {
  const name = overrides.name ?? 'Test Card';
  const type = overrides.type ?? 'Unit';
  const affinity = overrides.affinity ?? 'Terra';
  const rarity = overrides.rarity ?? 'Common';
  const artist = overrides.artist ?? 'Artist';
  const rulesText = overrides.rulesText ?? 'Draw a card';
  const description = overrides.description ?? 'Flavor text';
  const number = overrides.number ?? 1;
  const cost = overrides.cost ?? 1;
  const attack = overrides.attack ?? 1;
  const health = overrides.health ?? 1;
  const influence = overrides.influence ?? null;
  const subtype = overrides.subtype ?? 'Mage';
  const searchContent = [
    name,
    type,
    subtype,
    affinity,
    rarity,
    artist,
    rulesText,
    description,
    number,
    influence,
    cost,
    attack,
    health,
  ]
    .filter((value) => value !== null && value !== undefined)
    .join(' ')
    .toLowerCase();

  return {
    id: overrides.id ?? name.toLowerCase().replace(/\s+/g, '-'),
    name,
    type,
    affinity,
    number,
    cost,
    attack,
    health,
    subtype,
    rarity,
    artist,
    influence,
    rulesText,
    description,
    imageSrc: overrides.imageSrc ?? '/card.webp',
    searchContent: overrides.searchContent ?? searchContent,
    detailLabel: overrides.detailLabel ?? `${name} ${type} Cost ${cost} Affinity ${affinity} Rarity ${rarity}`,
  };
}
