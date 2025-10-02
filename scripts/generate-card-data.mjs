import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function resolveAffinity(value) {
  const key = value.trim().toLowerCase();
  if (!key) {
    return 'Neutral';
  }

  const map = {
    caelum: 'Caelum',
    lux: 'Lux',
    solara: 'Solara',
    terra: 'Terra',
    nox: 'Nox',
    neutral: 'Neutral',
  };

  return map[key] ?? value;
}

const FALLBACK_GRADIENTS = [
  ['#b589d6', '#5f3fb7'],
  ['#f7c97f', '#f56d3a'],
  ['#a8e063', '#56ab2f'],
  ['#7f7fd5', '#86a8e7'],
  ['#ff9966', '#ff5e62'],
  ['#56ccf2', '#2f80ed'],
  ['#43cea2', '#185a9d'],
  ['#f3904f', '#3b4371'],
];

function createCardArtwork(name, colorFrom, colorTo) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
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

function normaliseCard(row, index) {
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

async function main() {
  const { data, error } = await supabase
    .from('cards')
    .select(
      'id,name,affinity,artist,rarity,number,type,subtype,cost,attack,health,influence,rules_text,description,image_url',
    )
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch cards:', error.message);
    process.exit(1);
  }

  const rows = Array.isArray(data) ? data : [];
  const cards = rows.map((row, index) => normaliseCard(row, index));

  const rootDir = dirname(fileURLToPath(import.meta.url));
  const outputPath = resolve(rootDir, '..', 'src', 'data');
  await mkdir(outputPath, { recursive: true });

  const jsonPath = resolve(outputPath, 'cards.json');
  await writeFile(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), cards }, null, 2));

  console.log(`Saved ${cards.length} cards to ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
