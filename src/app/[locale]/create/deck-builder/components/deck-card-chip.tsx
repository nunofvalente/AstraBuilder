'use client';

import Image from 'next/image';
import { useCallback, type FocusEvent, type MouseEvent as ReactMouseEvent } from 'react';

import { getAffinityColorScheme } from '../constants';
import type { Card } from '../types';
import type { ZoomAnchor } from './zoom-overlay';

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

type ZoomEvent = ReactMouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>;

export type DeckCardChipProps = {
  card: Card;
  count: number;
  labels: {
    add: string;
    remove: string;
  };
  onIncrement: (cardId: string) => void;
  onDecrement: (cardId: string) => void;
  onZoom: (card: Card | null, variant?: 'default' | 'compact', anchor?: ZoomAnchor | null) => void;
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
      const rect = event.currentTarget.getBoundingClientRect();
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : rect.right;
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : rect.bottom;

      let pointerX = rect.left + rect.width / 2;
      let pointerY = rect.top + rect.height / 2;

      if ('clientX' in event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        pointerX = event.clientX;
        pointerY = event.clientY;
      } else if (
        event.nativeEvent &&
        typeof (event.nativeEvent as MouseEvent).clientX === 'number' &&
        typeof (event.nativeEvent as MouseEvent).clientY === 'number'
      ) {
        const native = event.nativeEvent as globalThis.MouseEvent;
        pointerX = native.clientX;
        pointerY = native.clientY;
      }

      const anchor: ZoomAnchor = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        viewportWidth,
        viewportHeight,
        pointerX,
        pointerY,
      };

      onZoom(card, 'compact', anchor);
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
            <Image src={costIcon} alt={`Cost ${card.cost}`} width={32} height={32} className="h-8 w-8" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-xs font-semibold text-white">
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



