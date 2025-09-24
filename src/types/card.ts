export type Card = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  cost: number | null;
  attack: number | null;
  health: number | null;
  influence: number | null;
  rules_text: string;
  description: string | null;
};
