export const AFFINITY_NAME_MAP: Record<string, string> = {
  caelum: 'Caelum',
  lux: 'Lux',
  neutral: 'Neutral',
  nox: 'Nox',
  solara: 'Solara',
  terra: 'Terra',
};

const AFFINITY_ICON_PATHS: Record<string, string> = {
  caelum: '/images/icons/affinity/icon_caelum.png',
  lux: '/images/icons/affinity/icon_lux.png',
  neutral: '/images/icons/affinity/icon_neutral.png',
  nox: '/images/icons/affinity/icon_nox.png',
  solara: '/images/icons/affinity/icon_solara.png',
  terra: '/images/icons/affinity/icon_terra.png',
};

const AFFINITY_BASE_COLORS: Record<string, string> = {
  Caelum: '#1b4d8b',
  Lux: '#B38A2E',
  Neutral: '#8a857d',
  Nox: '#5b224b',
  Solara: '#A62614',
  Terra: '#4F8F63',
};

const DEFAULT_BASE_COLOR = '#4b5563';
const DEFAULT_SECONDARY_COLOR = '#9ca3af';

export function normalizeAffinity(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const key = trimmed.toLowerCase();
  return AFFINITY_NAME_MAP[key] ?? trimmed;
}


export function getAffinityBaseColor(affinity: string | null | undefined): string {
  const normalized = normalizeAffinity(affinity);
  if (!normalized || normalized === 'Neutral') {
    return DEFAULT_BASE_COLOR;
  }
  return AFFINITY_BASE_COLORS[normalized] ?? DEFAULT_BASE_COLOR;
}
export function getAffinityIconPath(affinity: string | null | undefined): string | null {
  const key = affinity?.trim().toLowerCase();
  if (!key) {
    return null;
  }
  return AFFINITY_ICON_PATHS[key] ?? null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return null;
  }
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const clamp = (component: number) => Math.max(0, Math.min(255, Math.round(component)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`;
}

function mixHexColors(colorA: string, colorB: string, amount: number): string {
  const rgbA = hexToRgb(colorA);
  const rgbB = hexToRgb(colorB);
  if (!rgbA || !rgbB) {
    return colorA;
  }
  const mix = (channelA: number, channelB: number) => channelA * (1 - amount) + channelB * amount;
  return rgbToHex({
    r: mix(rgbA.r, rgbB.r),
    g: mix(rgbA.g, rgbB.g),
    b: mix(rgbA.b, rgbB.b),
  });
}

export function buildAffinityGradient(affinities: Array<string | null | undefined>): string {
  const uniqueNormalized: string[] = [];
  for (const affinity of affinities) {
    const normalized = normalizeAffinity(affinity);
    if (!normalized || normalized === 'Neutral') {
      continue;
    }
    if (!uniqueNormalized.includes(normalized)) {
      uniqueNormalized.push(normalized);
    }
  }

  const baseColors = uniqueNormalized.map((affinity) => getAffinityBaseColor(affinity));

  const primaryColor = baseColors[0] ?? DEFAULT_BASE_COLOR;
  const secondaryColor = baseColors[1]
    ? mixHexColors(baseColors[1], '#ffffff', 0.2)
    : mixHexColors(primaryColor, '#ffffff', 0.25);

  return `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
}
