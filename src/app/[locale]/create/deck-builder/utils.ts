import { AFFINITY_NAME_MAP, FALLBACK_GRADIENTS } from './constants';
import type { Card, CardRow } from './types';

export function createCardArtwork(name: string, colorFrom: string, colorTo: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join('')
    .slice(0, 2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 336" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="gradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${colorFrom}" />
        <stop offset="100%" stop-color="${colorTo}" />
      </linearGradient>
    </defs>
    <rect width="240" height="336" fill="url(#gradient)" rx="18" />
    <rect x="16" y="16" width="208" height="304" rx="14" fill="rgba(0, 0, 0, 0.25)" />
    <text x="50%" y="56" text-anchor="middle" font-family="'Montserrat', 'Arial', sans-serif" font-size="26" fill="#ffffff" opacity="0.85">${name}</text>
    <text x="50%" y="206" text-anchor="middle" font-family="'Montserrat', 'Arial', sans-serif" font-size="92" fill="#ffffff" font-weight="700" opacity="0.85">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function toNumber(value: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function safeText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

export function resolveAffinity(value: string): string {
  const key = value.trim().toLowerCase();
  if (!key) {
    return 'Neutral';
  }

  return AFFINITY_NAME_MAP[key] ?? value;
}

export function normaliseCard(row: CardRow, index: number): Card {
  const safeName = safeText(row.name) || 'Card';
  const safeType = safeText(row.type) || 'Unknown';
  const safeSubtype = safeText(row.subtype);
  const safeRarity = safeText(row.rarity);
  const safeArtist = safeText(row.artist);
  const safeRulesText = safeText(row.rules_text);
  const safeDescription = safeText(row.description);
  const affinity = resolveAffinity(safeText(row.affinity));
  const cardNumber = typeof row.number === 'number' ? row.number : null;
  const cost = toNumber(row.cost);
  const attack = toNumber(row.attack);
  const health = toNumber(row.health);
  const influence = typeof row.influence === 'number' && Number.isFinite(row.influence) ? row.influence : null;
  const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
  const imageSrc = safeText(row.image_url) || createCardArtwork(safeName, gradient[0], gradient[1]);

  const searchContent = [
    safeName,
    safeType,
    safeSubtype,
    affinity,
    safeRarity,
    safeArtist,
    safeRulesText,
    safeDescription,
    row.number ? String(row.number) : '',
    influence != null ? String(influence) : '',
    cost ? String(cost) : '',
    attack ? String(attack) : '',
    health ? String(health) : '',
  ]
    .join(' ')
    .toLowerCase();

  const detailLabel = [
    safeName,
    safeType,
    row.subtype ? `(${row.subtype})` : '',
    `Cost ${cost}`,
    affinity ? `Affinity ${affinity}` : '',
    row.rarity ? `Rarity ${row.rarity}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    id: row.id,
    name: safeName,
    type: safeType,
    affinity,
    number: cardNumber,
    cost,
    attack,
    health,
    subtype: safeSubtype,
    rarity: safeRarity,
    artist: safeArtist,
    influence,
    rulesText: safeRulesText,
    description: safeDescription,
    imageSrc,
    searchContent,
    detailLabel,
  };
}
