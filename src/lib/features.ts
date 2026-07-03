export function isSimulatorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SIMULATOR === 'true';
}
