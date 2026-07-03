import { cookies } from 'next/headers';

import {
  SIMULATOR_ACCESS_COOKIE,
  isSimulatorFlagEnabled,
  isValidSimulatorAccessValue,
} from '@/lib/simulator-access';

export function isSimulatorEnabled(): boolean {
  return isSimulatorFlagEnabled();
}

export async function canAccessSimulator(): Promise<boolean> {
  if (isSimulatorFlagEnabled()) {
    return true;
  }

  const cookieStore = await cookies();

  return isValidSimulatorAccessValue(cookieStore.get(SIMULATOR_ACCESS_COOKIE)?.value);
}
