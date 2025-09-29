import type { Dictionary } from '@/i18n/get-dictionary';

export type DeckBuilderProps = {
  dictionary: Dictionary;
};

export type CardRow = {
  id: string;
  name: string | null;
  affinity: string | null;
  artist: string | null;
  rarity: string | null;
  number: number | null;
  type: string | null;
  subtype: string | null;
  cost: number | null;
  attack: number | null;
  health: number | null;
  influence: number | null;
  rules_text: string | null;
  description: string | null;
  image_url: string | null;
};

export type Card = {
  id: string;
  name: string;
  type: string;
  affinity: string;
  number: number | null;
  cost: number;
  attack: number;
  health: number;
  imageSrc: string;
  searchContent: string;
  detailLabel: string;
};

export type DeckEntry = {
  card: Card;
  count: number;
};

export type CostBucket = {
  cost: number;
  count: number;
};

export type AffinityFilter = {
  value: string;
  label: string;
  filledIcon: string;
  disabledIcon: string;
};

