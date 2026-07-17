'use client';

import { useLayoutEffect, useRef } from 'react';

import { animateCardElementFromRect, type CardAnimationDestination } from './card-move-animation';

const PLAY_ZONES = new Set([
  'staging',
  'battlefieldLeft',
  'battlefieldCenter',
  'battlefieldRight',
]);

type TrackedCardPosition = {
  rect: DOMRect;
  zone: string;
};

export function useCardExitAnimations(stateKey: unknown) {
  const previousPositionsRef = useRef(new Map<string, TrackedCardPosition>());

  useLayoutEffect(() => {
    const previousPositions = previousPositionsRef.current;
    const visibleCards = document.querySelectorAll<HTMLElement>('[data-card-instance-id][data-card-zone]');

    visibleCards.forEach((element) => {
      const instanceId = element.dataset.cardInstanceId;
      const destination = element.dataset.cardZone as CardAnimationDestination | undefined;
      const previous = instanceId ? previousPositions.get(instanceId) : null;

      if (
        previous &&
        PLAY_ZONES.has(previous.zone) &&
        (destination === 'graveyard' || destination === 'banish')
      ) {
        animateCardElementFromRect({ sourceRect: previous.rect, destination, target: element });
      }
    });

    const nextPositions = new Map<string, TrackedCardPosition>();
    visibleCards.forEach((element) => {
      const instanceId = element.dataset.cardInstanceId;
      const zone = element.dataset.cardZone;
      if (instanceId && zone && PLAY_ZONES.has(zone)) {
        nextPositions.set(instanceId, { rect: element.getBoundingClientRect(), zone });
      }
    });
    previousPositionsRef.current = nextPositions;
  }, [stateKey]);
}
