const DEFAULT_ASTRA_API_BASE_URL = "https://api.echoesofastra.com";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getAstraApiBaseUrl(): string {
  const configuredBaseUrl = process.env.ASTRA_API_BASE_URL;
  if (!configuredBaseUrl) {
    return DEFAULT_ASTRA_API_BASE_URL;
  }

  return trimTrailingSlashes(configuredBaseUrl);
}

export function getAstraAllCardsUrl(): string {
  return `${getAstraApiBaseUrl()}/getallcards`;
}
