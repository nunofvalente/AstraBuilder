export function isSimulatorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SIMULATOR === 'true';
}

export function isBuyMeACoffeeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_BUY_ME_A_COFFEE === 'true';
}
