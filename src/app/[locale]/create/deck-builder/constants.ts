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
