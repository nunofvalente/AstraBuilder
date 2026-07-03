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
  const rows = [
    ...astraCards.map(mapAstraCardToSupabaseRow),
    ...manualRows,
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
