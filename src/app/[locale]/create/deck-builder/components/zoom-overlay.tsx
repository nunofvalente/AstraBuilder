import Image from 'next/image';

import type { Card } from '../types';

export type ZoomOverlayProps = {
  card: Card | null;
  onClose: () => void;
  variant?: 'default' | 'compact';
};

export function ZoomOverlay({ card, onClose, variant = 'default' }: ZoomOverlayProps) {
  if (!card) {
    return null;
  }

  if (variant === 'compact') {
    return (
      <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-4">
        <div className="overflow-hidden rounded-none bg-[color:var(--surface)]/95 p-3 shadow-2xl">
          <Image
            src={card.imageSrc}
            alt={card.name}
            width={400}
            height={560}
            className="h-auto w-full select-none rounded-none"
            sizes="400px"
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
