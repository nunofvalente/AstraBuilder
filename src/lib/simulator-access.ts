export const SIMULATOR_ACCESS_COOKIE = 'astrabuilder_simulator_access';
export const SIMULATOR_ACCESS_PARAM = 'simulatorAccess';

export function isSimulatorFlagEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SIMULATOR === 'true';
}

export function getSimulatorAccessToken(): string | null {
  const token = process.env.SIMULATOR_ACCESS_TOKEN?.trim();

  return token && token.length > 0 ? token : null;
}

export function isValidSimulatorAccessValue(value: string | null | undefined): boolean {
  const token = getSimulatorAccessToken();

  return Boolean(token && value === token);
}
