import cardsData from "@/data/cards.json";
import devCardsData from "@/data/cards-dev.json";
import { getSupabaseCardRows } from "@/lib/supabase/cards";
import { normaliseCard } from "./utils";
import type { Card } from "./types";

type CardsFile = {
  generatedAt: string;
  cards: Card[];
};

const typedCardsData = cardsData as CardsFile;
const typedDevCardsData = devCardsData as CardsFile;

export async function getStaticCards(): Promise<{ cards: Card[]; error: string | null }> {
  const useDevCards = process.env.NEXT_PUBLIC_USE_DEV_CARDS === "true";
  if (useDevCards) {
    return { cards: typedDevCardsData.cards, error: null };
  }

  const fallbackCards = typedCardsData.cards;

  const { rows, error } = await getSupabaseCardRows();
  if (rows.length === 0) {
    return {
      cards: fallbackCards,
      error: error ?? "No card data returned from Supabase. Showing cached cards.",
    };
  }

  return {
    cards: rows.map((row, index) => normaliseCard(row, index)),
    error,
  };
}
