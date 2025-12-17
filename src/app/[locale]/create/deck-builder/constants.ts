import type { AffinityFilter } from './types';
export { AFFINITY_NAME_MAP } from '@/lib/cards/affinity';

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

export type AffinityName =
  | 'Caelum'
  | 'Lux'
  | 'Neutral'
  | 'Nox'
  | 'Solara'
  | 'Terra';

export type AffinityColorScheme = {
  baseColor: string;
  gradient: string;
  textColor: string;
  mutedTextColor: string;
  chipBackground: string;
  chipTextColor: string;
  borderColor: string;
};

export const AFFINITY_COLOR_SCHEMES: Record<
  AffinityName | 'Default',
  AffinityColorScheme
> = {
  Caelum: {
    baseColor: '#020712',
    gradient:
      'linear-gradient(148deg, rgba(2, 7, 18, 1) 0%, rgba(0, 27, 56, 1) 27%, rgba(22, 40, 64, 1) 48%, rgba(39, 55, 84, 1) 65%, rgba(34, 65, 107, 1) 86%)',
    textColor: '#E6F2FF', // light icy blue
    mutedTextColor: '#AFCBE6', // softer desaturated blue
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  Lux: {
    baseColor: '#1C1C1A',
    gradient:
      'linear-gradient(148deg, rgba(28, 28, 26, 1) 0%, rgba(59, 57, 50, 1) 27%, rgba(97, 91, 79, 1) 48%, rgba(102, 97, 85, 1) 65%, rgba(122, 119, 99, 1) 86%)',
    textColor: '#F9F6E5', // bright parchment white
    mutedTextColor: '#D6CFAF', // soft tan for secondary
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(92, 72, 16, 0.3)',
  },
  Neutral: {
    baseColor: '#1A1513',
    gradient:
      'linear-gradient(148deg, rgba(26, 21, 19, 1) 0%, rgba(46, 43, 41, 1) 20%, rgba(51, 51, 48, 1) 40%, rgba(54, 53, 50, 1) 60%, rgba(67, 69, 66, 1) 80%)',
    textColor: '#F2F2F2', // high-contrast near-white
    mutedTextColor: '#B5B5B5', // neutral gray
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(15, 38, 40, 0.2)',
  },
  Nox: {
    baseColor: '#050105',
    gradient:
      'linear-gradient(148deg, rgba(5, 1, 5, 1) 0%, rgba(16, 2, 23, 1) 20%, rgba(49, 35, 56, 1) 40%, rgba(69, 37, 67, 1) 60%, rgba(99, 37, 82, 1) 80%)',
    textColor: '#F8ECFB', // lavender white
    mutedTextColor: '#D9BCE4', // muted lavender
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  Solara: {
    baseColor: '#140000',
    gradient:
      'linear-gradient(148deg, rgba(20, 0, 0, 1) 0%, rgba(51, 0, 0, 1) 20%, rgba(87, 12, 0, 1) 40%, rgba(84, 15, 0, 1) 60%, rgba(97, 24, 11, 1) 80%)',
    textColor: '#FFF5F2', // already good
    mutedTextColor: '#FBD4C7',
    chipBackground: 'rgba(0, 0, 0, 0.35)',
    chipTextColor: '#FFFFFF',
    borderColor: 'rgba(255, 255, 255, 0.32)',
  },
  Terra: {
    baseColor: '#000F07',
    gradient:
      'linear-gradient(148deg, rgba(0, 15, 7, 1) 0%, rgba(0, 33, 19, 1) 20%, rgba(0, 54, 37, 1) 40%, rgba(27, 64, 47, 1) 60%, rgba(58, 89, 72, 1) 80%)',
    textColor: '#E5F7EA', // soft pale green
    mutedTextColor: '#B1D4B8', // muted mint
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

export const AFFINITY_SORT_ORDER = [
  'Nox',
  'Caelum',
  'Lux',
  'Solara',
  'Neutral',
  'Terra',
];

// Keep sizes close to the real grid column widths so Next.js picks sharp assets, especially on portrait/vertical screens.
export const CARD_IMAGE_SIZES =
  '(min-width: 2200px) 14vw, (min-width: 1536px) 16vw, (min-width: 1280px) 20vw, (min-width: 1024px) 32vw, (min-width: 640px) 32vw, 48vw';
