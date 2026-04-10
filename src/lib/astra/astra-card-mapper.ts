import type { CardRow } from "@/app/[locale]/create/deck-builder/types";

import type { AstraCardRecord } from "./astra-card-types";

function safeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function deriveCardNumber(cardId: string): number | null {
  const match = safeText(cardId).match(/(\d+)$/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStat(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value <= -999) {
    return null;
  }

  return value;
}

function joinSubtypeParts(parts: Array<string | null> | null | undefined): string | null {
  if (!Array.isArray(parts)) {
    return null;
  }

  const joined = parts
    .map((part) => safeText(part))
    .filter(Boolean)
    .join(" ");

  return joined.length > 0 ? joined : null;
}

function resolveCatalogType(card: AstraCardRecord): string | null {
  const cardType = safeText(card.cardType);
  if (!cardType) {
    return null;
  }

  if (cardType === "Unit" && card.renowned) {
    return "Renowned Unit";
  }

  return cardType;
}

export function mapAstraCardsToCardRows(astraCards: AstraCardRecord[]): CardRow[] {
  return astraCards
    .map((card) => {
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
      } satisfies CardRow;
    })
    .sort((a, b) => {
      const nameComparison = (a.name ?? "").localeCompare(b.name ?? "");
      if (nameComparison !== 0) {
        return nameComparison;
      }

      return (a.number ?? Number.POSITIVE_INFINITY) - (b.number ?? Number.POSITIVE_INFINITY);
    });
}
