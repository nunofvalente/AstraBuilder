import Image from 'next/image';

import type { Card } from '../types';

export type ZoomAnchor = {
  top: number;
  left: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  pointerX: number;
  pointerY: number;
};

export type ZoomOverlayProps = {
  card: Card | null;
  onClose: () => void;
  variant?: 'default' | 'compact';
  anchor?: ZoomAnchor | null;
};

const EDGE_MARGIN = 16;
const GAP = 12;
const COMPACT_MAX_WIDTH = 26 * 16; // 26rem expressed in px
const IMAGE_ASPECT_RATIO = 560 / 400;
const PADDING_VERTICAL = 24; // padding from p-3 (12px top/bottom)

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ZoomOverlay({ card, onClose, variant = 'default', anchor = null }: ZoomOverlayProps) {
  if (!card) {
    return null;
  }

  if (variant === 'compact') {
    const canAnchor =
      anchor != null &&
      anchor.viewportWidth > EDGE_MARGIN * 2 &&
      anchor.viewportHeight > EDGE_MARGIN * 2;

    let widthValue = 'min(26rem, calc(100vw - 2rem))';
    let positionStyle: { [key: string]: string } = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };

    if (canAnchor && anchor) {
      const viewportWidth = anchor.viewportWidth;
      const viewportHeight = anchor.viewportHeight;
      const containerWidth = Math.min(COMPACT_MAX_WIDTH, Math.max(viewportWidth - EDGE_MARGIN * 2, 0));
      const estimatedHeight = Math.min(
        viewportHeight - EDGE_MARGIN * 2,
        containerWidth * IMAGE_ASPECT_RATIO + PADDING_VERTICAL
      );

      if (containerWidth > 0 && estimatedHeight > 0) {
        const pointerX = anchor.pointerX ?? anchor.left + anchor.width / 2;
        const pointerY = anchor.pointerY ?? anchor.top + anchor.height / 2;
        const prefersRight = pointerX <= viewportWidth / 2;

        let left = prefersRight ? pointerX + GAP : pointerX - containerWidth - GAP;
        if (left < EDGE_MARGIN) {
          left = EDGE_MARGIN;
        } else if (left + containerWidth > viewportWidth - EDGE_MARGIN) {
          left = viewportWidth - EDGE_MARGIN - containerWidth;
        }

        const top = clamp(
          pointerY - estimatedHeight / 2,
          EDGE_MARGIN,
          viewportHeight - EDGE_MARGIN - estimatedHeight
        );

        positionStyle = {
          top: `${Math.round(top)}px`,
          left: `${Math.round(left)}px`,
          transform: 'none',
        };
        widthValue = `${Math.round(containerWidth)}px`;
      }
    }

    return (
      <div className="pointer-events-none fixed inset-0 z-[70]">
        <div
          className="absolute overflow-hidden rounded-none bg-[color:var(--surface)]/95 p-3 shadow-2xl"
          style={{
            maxWidth: 'min(26rem, calc(100vw - 2rem))',
            width: widthValue,
            ...positionStyle,
          }}
        >
          <Image
            src={card.imageSrc}
            alt={card.name}
            width={400}
            height={560}
            className="h-auto max-h-[80vh] w-full select-none rounded-none"
            sizes="(max-width: 768px) 80vw, 416px"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-6" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-[92vw] sm:max-w-[30rem]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          aria-label="Close zoomed card"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
        <div className="overflow-hidden rounded-none bg-[color:var(--surface)] p-4 shadow-2xl">
          <Image
            src={card.imageSrc}
            alt={card.name}
            width={400}
            height={560}
            className="h-auto w-full select-none rounded-none"
            sizes="(min-width: 640px) 400px, 92vw"
          />
        </div>
      </div>
    </div>
  );
}
