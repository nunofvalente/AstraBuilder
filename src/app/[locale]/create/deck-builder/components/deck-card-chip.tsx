'use client';

import Image from 'next/image';
import { useCallback, type FocusEvent, type MouseEvent } from 'react';

import { getAffinityColorScheme } from '../constants';
import type { Card } from '../types';

const COST_ICON_PATHS: Record<number, string> = {
  0: '/images/icons/cost/frame_number_0.png',
  1: '/images/icons/cost/frame_number_1.png',
  2: '/images/icons/cost/frame_number_2.png',
  3: '/images/icons/cost/frame_number_3.png',
  4: '/images/icons/cost/frame_number_4.png',
  5: '/images/icons/cost/frame_number_5.png',
  6: '/images/icons/cost/frame_number_6.png',
  7: '/images/icons/cost/frame_number_7.png',
  8: '/images/icons/cost/frame_number_8.png',
  9: '/images/icons/cost/frame_number_9.png',
};

const AFFINITY_ICON_PATHS: Record<string, string> = {
  caelum: '/images/icons/affinity/icon_caelum.png',
  lux: '/images/icons/affinity/icon_lux.png',
  neutral: '/images/icons/affinity/icon_neutral.png',
  nox: '/images/icons/affinity/icon_nox.png',
  solara: '/images/icons/affinity/icon_solara.png',
  terra: '/images/icons/affinity/icon_terra.png',
};

type ZoomEvent = MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>;

export type DeckCardChipProps = {
  card: Card;
  count: number;
  labels: {
    add: string;
    remove: string;
  };
  onIncrement: (cardId: string) => void;
  onDecrement: (cardId: string) => void;
  onZoom: (card: Card | null, variant?: 'default' | 'compact', anchorRect?: DOMRect | null) => void;
};

function getCostIconPath(cost: number): string | null {
  if (!Number.isFinite(cost)) {
    return null;
  }

  const rounded = Math.round(cost);
  return COST_ICON_PATHS[rounded] ?? null;
}

function getAffinityIconPath(affinity: string): string | null {
  const key = affinity.trim().toLowerCase();
  return AFFINITY_ICON_PATHS[key] ?? null;
}

export function DeckCardChip({ card, count, labels, onIncrement, onDecrement, onZoom }: DeckCardChipProps) {
  const scheme = getAffinityColorScheme(card.affinity);
  const costIcon = getCostIconPath(card.cost);
  const affinityIcon = getAffinityIconPath(card.affinity);

  const handlePreview = useCallback(
    (event: ZoomEvent) => {
      onZoom(card, 'compact', event.currentTarget.getBoundingClientRect());
    },
    [card, onZoom]
  );

  const handleClosePreview = useCallback(() => onZoom(null), [onZoom]);

  return (
    <li
      className="flex items-center justify-between gap-4 rounded-full border px-4 py-2 shadow-sm transition-shadow hover:shadow-md"
      style={{
        background: scheme.gradient,
        borderColor: scheme.borderColor,
        color: scheme.textColor,
      }}
    >
      <button
        type="button"
        onClick={() => onZoom(card)}
        onMouseEnter={handlePreview}
        onFocus={handlePreview}
        onMouseLeave={handleClosePreview}
        onBlur={handleClosePreview}
        className="group flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
        aria-label={`View details for ${card.name}`}
      >
        <span className="flex items-center gap-2">
          {costIcon ? (
            <Image src={costIcon} alt={`Cost ${card.cost}`} width={28} height={28} className="h-7 w-7" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-xs font-semibold text-white">
              {card.cost}
            </span>
          )}
          {affinityIcon ? (
            <Image src={affinityIcon} alt={`${card.affinity} affinity`} width={28} height={28} className="h-7 w-7" />
          ) : null}
        </span>
        <span className="truncate text-sm font-semibold" style={{ color: scheme.textColor }}>
          {card.name}
        </span>
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDecrement(card.id)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white transition hover:bg-white/30 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          aria-label={`${labels.remove} ${card.name}`}
        >
          -
        </button>
        <span className="min-w-[1.5rem] text-center text-sm font-semibold" style={{ color: scheme.textColor }}>
          {count}
        </span>
        <button
          type="button"
          onClick={() => onIncrement(card.id)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white transition hover:bg-white/30 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          aria-label={`${labels.add} ${card.name}`}
        >
          +
        </button>
      </div>
    </li>
  );
}

