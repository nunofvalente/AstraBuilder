import type { AffinityFilter } from './types';

export const AFFINITY_NAME_MAP: Record<string, string> = {
  caelum: 'Caelum',
  lux: 'Lux',
  neutral: 'Neutral',
  nox: 'Nox',
  solara: 'Solara',
  terra: 'Terra',
};

export const AFFINITY_FILTERS: ReadonlyArray<AffinityFilter> = [
  {
    value: 'Caelum',
    label: 'Caelum',
    filledIcon: '/images/icons/caelum_icon_filled.png',
    disabledIcon: '/images/icons/caelum_icon_grayscale.png',
  },
  {
    value: 'Lux',
    label: 'Lux',
    filledIcon: '/images/icons/lux_icon_filled.png',
    disabledIcon: '/images/icons/lux_icon_greyscale.png',
  },
  {
    value: 'Neutral',
    label: 'Neutral',
    filledIcon: '/images/icons/neutral_icon_filled.png',
    disabledIcon: '/images/icons/neutral_icon_greyscale.png',
  },
  {
    value: 'Nox',
    label: 'Nox',
    filledIcon: '/images/icons/nox_icon_filled.png',
    disabledIcon: '/images/icons/nox_icon_grayscale.png',
  },
  {
    value: 'Solara',
    label: 'Solara',
    filledIcon: '/images/icons/solara_icon_filled.png',
    disabledIcon: '/images/icons/solara_icon_grayscale.png',
  },
  {
    value: 'Terra',
    label: 'Terra',
    filledIcon: '/images/icons/terra_icon_filled.png',
    disabledIcon: '/images/icons/terra_icon_greyscale.png',
  },
] as const;

export type AffinityName = 'Caelum' | 'Lux' | 'Neutral' | 'Nox' | 'Solara' | 'Terra';

export type AffinityColorScheme = {
  baseColor: string;
  gradient: string;
  textColor: string;
  mutedTextColor: string;
  chipBackground: string;
  chipTextColor: string;
  borderColor: string;
};

export const AFFINITY_COLOR_SCHEMES: Record<AffinityName | 'Default', AffinityColorScheme> = {
  Caelum: {
    baseColor: '#52A6BF',
    gradient:
      'linear-gradient(90deg, rgba(82,166,191,1) 0%, rgba(116,191,216,1) 65%, rgba(164,221,240,1) 76%, rgba(190,240,251,1) 100%)',
    textColor: '#0C2B35',
    mutedTextColor: '#165A6E',
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  Lux: {
    baseColor: '#D5C694',
    gradient:
      'linear-gradient(90deg, rgba(213,198,148,1) 0%, rgba(238,228,171,1) 65%, rgba(255,254,189,1) 76%)',
    textColor: '#3A2E07',
    mutedTextColor: '#5A4810',
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(92, 72, 16, 0.3)',
  },
  Neutral: {
    baseColor: '#778E8F',
    gradient:
      'linear-gradient(148deg, rgba(119,142,143,1) 0%, rgba(141,163,163,1) 38%, rgba(173,197,198,1) 53%, rgba(223,240,239,1) 81%, rgba(227,243,242,1) 93%)',
    textColor: '#0F2628',
    mutedTextColor: '#2D4F51',
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(15, 38, 40, 0.2)',
  },
  Nox: {
    baseColor: '#82449A',
    gradient:
      'linear-gradient(148deg, rgba(130,68,154,1) 0%, rgba(140,68,157,1) 35%, rgba(192,144,197,1) 76%, rgba(222,195,221,1) 91%)',
    textColor: '#FDF5FF',
    mutedTextColor: '#E3C8ED',
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  Solara: {
    baseColor: '#BB3F20',
    gradient:
      'linear-gradient(148deg, rgba(187,63,32,1) 0%, rgba(242,92,49,1) 39%, rgba(239,135,102,1) 64%, rgba(251,200,183,1) 88%)',
    textColor: '#FFF5F2',
    mutedTextColor: '#FBD4C7',
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(255, 255, 255, 0.32)',
  },
  Terra: {
    baseColor: '#6C9555',
    gradient:
      'linear-gradient(148deg, rgba(108,149,85,1) 0%, rgba(143,210,114,1) 39%, rgba(194,225,185,1) 64%, rgba(218,236,211,1) 88%)',
    textColor: '#143015',
    mutedTextColor: '#355F2E',
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(20, 48, 21, 0.24)',
  },
  Default: {
    baseColor: '#3B3B3B',
    gradient: 'linear-gradient(135deg, #5b5b5b 0%, #6f6f6f 50%, #8d8d8d 100%)',
    textColor: '#FFFFFF',
    mutedTextColor: '#E6E6E6',
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
};

export function getAffinityColorScheme(affinity: string): AffinityColorScheme {
  const key = affinity as AffinityName;
  return AFFINITY_COLOR_SCHEMES[key] ?? AFFINITY_COLOR_SCHEMES.Default;
}

export const FALLBACK_GRADIENTS: Array<[string, string]> = [
  ['#f97316', '#ea580c'],
  ['#6366f1', '#8b5cf6'],
  ['#0ea5e9', '#06b6d4'],
  ['#22c55e', '#16a34a'],
  ['#38bdf8', '#2563eb'],
  ['#f472b6', '#ec4899'],
  ['#fb7185', '#f97316'],
  ['#a855f7', '#ec4899'],
];

export const CARD_SKELETON_COUNT = 8;

export const AFFINITY_SORT_ORDER = ['Nox', 'Caelum', 'Lux', 'Solara', 'Neutral', 'Terra'];

export const CARD_IMAGE_SIZES =
  '(min-width: 1600px) 12vw, (min-width: 1280px) 14vw, (min-width: 1024px) 20vw, (min-width: 640px) 40vw, 90vw';
