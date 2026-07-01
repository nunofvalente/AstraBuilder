import { getAstraAllCardsUrl } from "./astra-config";
import type { AstraCardRecord } from "./astra-card-types";

const DEFAULT_ASTRA_CARD_CATALOG_REVALIDATE_SECONDS = 86400;

export function getAstraCardCatalogRevalidateSeconds(): number {
  const configuredValue = process.env.ASTRA_CARD_CATALOG_REVALIDATE_SECONDS;

  if (!configuredValue) {
    return DEFAULT_ASTRA_CARD_CATALOG_REVALIDATE_SECONDS;
  }

  const parsedValue = Number(configuredValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return DEFAULT_ASTRA_CARD_CATALOG_REVALIDATE_SECONDS;
  }

  return Math.floor(parsedValue);
}

export async function fetchAstraCardCatalog(): Promise<AstraCardRecord[]> {
  const response = await fetch(getAstraAllCardsUrl(), {
    next: {
      revalidate: getAstraCardCatalogRevalidateSeconds(),
    },
  });

  if (!response.ok) {
    throw new Error(`Astra card request failed with status ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Astra card request returned an invalid payload.");
  }

  return payload as AstraCardRecord[];
}
