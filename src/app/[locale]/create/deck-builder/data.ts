import cardsData from "@/data/cards.json";
import devCardsData from "@/data/cards-dev.json";
import { normaliseCard } from "./utils";
import type { Card } from "./types";
import { fetchAstraCardCatalog } from "@/lib/astra/astra-card-catalog";
import { mapAstraCardsToCardRows } from "@/lib/astra/astra-card-mapper";

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

  try {
    const astraCards = await fetchAstraCardCatalog();
    if (astraCards.length === 0) {
      return {
        cards: fallbackCards,
        error: "No card data returned from the Astra API. Showing cached cards.",
      };
    }

    const cardRows = mapAstraCardsToCardRows(astraCards);
    const cards = cardRows.map((row, index) => normaliseCard(row, index));

    return {
      cards,
      error: null,
    };
  } catch (unknownError) {
    const message = unknownError instanceof Error ? unknownError.message : "Unknown error";
    return {
      cards: fallbackCards,
      error: `Unable to load live Astra card data: ${message}`,
    };
  }
}
