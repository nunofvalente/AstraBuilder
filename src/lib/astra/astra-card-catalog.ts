import { getAstraAllCardsUrl } from "./astra-config";
import type { AstraCardRecord } from "./astra-card-types";

const ASTRA_CARD_CATALOG_REVALIDATE_SECONDS = 300;

export async function fetchAstraCardCatalog(): Promise<AstraCardRecord[]> {
  const response = await fetch(getAstraAllCardsUrl(), {
    next: {
      revalidate: ASTRA_CARD_CATALOG_REVALIDATE_SECONDS,
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
