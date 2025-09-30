import cardsData from '@/data/cards.json';
import type { Card } from './types';

type CardsFile = {
  generatedAt: string;
  cards: Card[];
};

const typedData = cardsData as CardsFile;

export async function getStaticCards(): Promise<{ cards: Card[]; error: string | null }> {
  return { cards: typedData.cards, error: null };
}
