'use client';

import { useLayoutEffect, useRef, useState } from 'react';

export function useOpeningHandDeal({
  enabled,
  deckSelector,
  fallbackDeckY,
}: {
  enabled: boolean;
  deckSelector: string;
  fallbackDeckY: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measuredRef = useRef(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (!enabled || !containerRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (measuredRef.current) {
        return;
      }
      measuredRef.current = true;

      const deckElement = document.querySelector(deckSelector);
      const deckRect = deckElement?.getBoundingClientRect();
      const deckCenterX = deckRect ? deckRect.left + deckRect.width / 2 : window.innerWidth / 2;
      const deckCenterY = deckRect ? deckRect.top + deckRect.height / 2 : fallbackDeckY;
      const handCards = containerRef.current?.querySelectorAll<HTMLElement>('[data-opening-hand-card]') ?? [];

      handCards.forEach((cardElement, index) => {
        const cardRect = cardElement.getBoundingClientRect();
        cardElement.style.setProperty('--opening-draw-x', `${deckCenterX - (cardRect.left + cardRect.width / 2)}px`);
        cardElement.style.setProperty('--opening-draw-y', `${deckCenterY - (cardRect.top + cardRect.height / 2)}px`);
        cardElement.style.setProperty('--opening-draw-delay', `${index * 85}ms`);
      });
      setReady(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [deckSelector, enabled, fallbackDeckY]);

  return {
    containerRef,
    cardClassName: enabled
      ? ready
        ? 'opening-hand-card-deal'
        : 'opening-hand-card-pending'
      : '',
  };
}
