export function isPlaytestEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_PLAYTEST === 'true';
}
