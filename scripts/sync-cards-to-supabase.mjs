import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const DEFAULT_ASTRA_API_BASE_URL = 'https://api.echoesofastra.com';
const BATCH_SIZE = 100;
const MANUAL_CARD_ROWS = [
  {
    id: 'IMP000',
    name: 'Experiment',
    affinity: 'Neutral',
    artist: 'Parhelion Studio',
    rarity: 'Token',
    number: 0,
    type: 'Unit',
    subtype: 'Experiment Token',
    cost: 0,
    attack: 2,
    health: 2,
    influence: 0,
    rules_text: null,
    description: '"Not my most impressive work, but this should suffice." - Vermillion',
    image_url: '/images/tokens/experiment-token.png',
    raw_payload: {
      source: 'manual-token',
      printedId: 'IMP 000/160',
    },
  },
  {
    id: 'IMPT001',
    name: 'Drone',
    affinity: 'Neutral',
    artist: 'Parhelion Studio',
    rarity: 'Token',
    number: null,
    type: 'Unit',
    subtype: 'Drone Token',
    cost: 0,
    attack: 1,
    health: 1,
    influence: 0,
    rules_text: null,
    description: '"The future of warfare is here. Deadly, nimble, and at an affordable price!" - Falrich, Merchant of War',
    image_url: '/images/tokens/drone-token.png',
    raw_payload: {
      source: 'manual-token',
      printedId: null,
    },
  },
];

const EXTRA_BALANCE_CARD_ROWS = [
  {
    id: 'IMP161',
    name: 'Fortified Pillbox',
    affinity: 'Lux',
    artist: 'EliasArt',
    rarity: 'Promo',
    number: 161,
    type: 'Territory',
    subtype: null,
    cost: 3,
    attack: 0,
    health: 0,
    influence: null,
    rules_text: 'Friendly units occupying this zone get +0/+2.',
    description: null,
    image_url: '/images/cards/imperion-extras/IMP161_FortifiedPillbox.png',
    raw_payload: {
      source: 'manual-balance-extra',
      printedId: 'IMP 161',
    },
  },
  {
    id: 'IMP162',
    name: 'Landbreaker',
    affinity: 'Solara',
    artist: 'Hachii',
    rarity: 'Promo',
    number: 162,
    type: 'Unit',
    subtype: 'Beast',
    cost: 7,
    attack: 5,
    health: 6,
    influence: 2,
    rules_text: 'Flanking (This unit can attack from a combat zone once per turn)\n\nOn Attack: You may destroy a territory in the same combat zone as this unit. If you do, this gets +2/+2 until end of turn.',
    description: null,
    image_url: '/images/cards/imperion-extras/IMP162_Landbreaker.png',
    raw_payload: {
      source: 'manual-balance-extra',
      printedId: 'IMP 162',
    },
  },
  {
    id: 'IMP163',
    name: 'Shadowveil Hunter',
    affinity: 'Terra',
    artist: 'SuL',
    rarity: 'Promo',
    number: 163,
    type: 'Unit',
    subtype: 'Sylvan',
    cost: 2,
    attack: 1,
    health: 3,
    influence: 1,
    rules_text: 'Swift (You can play this as a counter.)\n\nOn Enter: Deal 1 damage to target enemy unit in a combat zone.',
    description: null,
    image_url: '/images/cards/imperion-extras/IMP163_ShadowveilHunter.png',
    raw_payload: {
      source: 'manual-balance-extra',
      printedId: 'IMP 163',
    },
  },
  {
    id: 'IMP164',
    name: 'War Banner',
    affinity: 'Neutral',
    artist: 'EliasArt',
    rarity: 'Promo',
    number: 164,
    type: 'Item',
    subtype: 'Equipment',
    cost: 4,
    attack: 1,
    health: 1,
    influence: 1,
    rules_text: 'When equipped unit scores, you may reveal the top card of your deck. If that card is a unit, you may draw it.',
    description: null,
    image_url: '/images/cards/imperion-extras/IMP164_WarBanner.png',
    raw_payload: {
      source: 'manual-balance-extra',
      printedId: 'IMP 164',
    },
  },
  {
    id: 'IMP165',
    name: 'Minefield',
    affinity: 'Neutral',
    artist: 'Parhelion Studio',
    rarity: 'Promo',
    number: 165,
    type: 'Territory',
    subtype: null,
    cost: 2,
    attack: 0,
    health: 0,
    influence: null,
    rules_text: 'On Flip: Deal 3 damage to all units in this zone.\nSacrifice this territory.',
    description: null,
    image_url: '/images/cards/imperion-extras/IMP165_Minefield.png',
    raw_payload: {
      source: 'manual-balance-extra',
      printedId: 'IMP 165',
    },
  },
];

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, '');
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function deriveCardNumber(cardId) {
  const match = safeText(cardId).match(/(\d+)$/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStat(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value <= -999) {
    return null;
  }

  return value;
}

function joinSubtypeParts(parts) {
  if (!Array.isArray(parts)) {
    return null;
  }

  const joined = parts.map((part) => safeText(part)).filter(Boolean).join(' ');
  return joined.length > 0 ? joined : null;
}

function resolveCatalogType(card) {
  const cardType = safeText(card.cardType);
  if (!cardType) {
    return null;
  }

  if (cardType === 'Unit' && card.renowned) {
    return 'Renowned Unit';
  }

  return cardType;
}

function mapAstraCardToSupabaseRow(card) {
  return {
    id: safeText(card.cardId),
    name: safeText(card.cardName) || safeText(card.cardId),
    affinity: safeText(card.cardAffinity) || null,
    artist: safeText(card.artistName) || null,
    rarity: safeText(card.rarity) || null,
    number: deriveCardNumber(card.cardId),
    type: resolveCatalogType(card),
    subtype: joinSubtypeParts(card.cardSubTypes),
    cost: normalizeStat(card.statSupplyCost),
    attack: normalizeStat(card.statAttack),
    health: normalizeStat(card.statHealth),
    influence: normalizeStat(card.statInfluence),
    rules_text: safeText(card.abilityText) || null,
    description: safeText(card.flavorText) || null,
    image_url: safeText(card.cardImageUrl) || safeText(card.cardImageLargeUrl) || null,
    raw_payload: card,
    source_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function fetchAstraCards() {
  const baseUrl = trimTrailingSlashes(process.env.ASTRA_API_BASE_URL || DEFAULT_ASTRA_API_BASE_URL);
  const response = await fetch(`${baseUrl}/getallcards`);

  if (!response.ok) {
    throw new Error(`Astra card request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Astra card request returned an invalid payload.');
  }

  return payload;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const astraCards = await fetchAstraCards();
  const syncedAt = new Date().toISOString();
  const manualRows = MANUAL_CARD_ROWS.map((row) => ({
    ...row,
    source_updated_at: syncedAt,
    updated_at: syncedAt,
  }));
  const extraBalanceRows = EXTRA_BALANCE_CARD_ROWS.map((row) => ({
    ...row,
    source_updated_at: syncedAt,
    updated_at: syncedAt,
  }));
  const rows = [
    ...astraCards.map(mapAstraCardToSupabaseRow),
    ...manualRows,
    ...extraBalanceRows,
  ].filter((row) => row.id);

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const { error } = await supabase.from('cards').upsert(batch, { onConflict: 'id' });

    if (error) {
      throw error;
    }
  }

  console.log(`Synced ${rows.length} cards to Supabase.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
