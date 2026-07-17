'use client';

export const CARD_MOVE_TRANSITION_NAME = 'moving-card';

export type CardAnimationDestination = 'staging' | 'supply' | 'graveyard' | 'banish';

type CardMoveViewTransition = {
  finished: Promise<unknown>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => CardMoveViewTransition;
};

export function animateCardElementFromRect({
  sourceRect,
  destination,
  target,
}: {
  sourceRect: DOMRect;
  destination: CardAnimationDestination;
  target: HTMLElement;
}) {
  if (prefersReducedMotion()) {
    return;
  }

  const targetRect = target.getBoundingClientRect();
  const sourceCenterX = sourceRect.left + sourceRect.width / 2;
  const sourceCenterY = sourceRect.top + sourceRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const scale = targetRect.width > 0 ? sourceRect.width / targetRect.width : 1;
  const duration = destination === 'supply' ? 480 : destination === 'graveyard' || destination === 'banish' ? 420 : 340;
  const startingTransform = `translate3d(${sourceCenterX - targetCenterX}px, ${sourceCenterY - targetCenterY}px, 0) scale(${scale})`;

  if (typeof target.animate === 'function') {
    target.animate(
      [
        { opacity: 0.82, transform: startingTransform },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
      ],
      {
        duration,
        easing: 'cubic-bezier(0.2, 0.78, 0.22, 1)',
      },
    );
    return;
  }

  target.classList.add('card-move-fallback-active');
  target.style.opacity = '0.82';
  target.style.transform = startingTransform;
  target.style.transition = 'none';

  window.requestAnimationFrame(() => {
    target.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.78, 0.22, 1), opacity ${duration}ms ease-out`;
    target.style.opacity = '1';
    target.style.transform = 'translate3d(0, 0, 0) scale(1)';

    window.setTimeout(() => {
      target.classList.remove('card-move-fallback-active');
      target.style.opacity = '';
      target.style.transform = '';
      target.style.transition = '';
    }, duration);
  });
}

function runFallbackCardMove({
  source,
  destination,
  update,
  findTarget,
}: {
  source: HTMLElement;
  destination: 'staging' | 'supply';
  update: () => void;
  findTarget: () => HTMLElement | null;
}) {
  const sourceRect = source.getBoundingClientRect();
  update();

  const target = findTarget();
  if (target) {
    animateCardElementFromRect({ sourceRect, destination, target });
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function startCardMoveViewTransition({
  source,
  destination,
  update,
  findTarget,
}: {
  source: HTMLElement;
  destination: 'staging' | 'supply';
  update: () => void;
  findTarget: () => HTMLElement | null;
}): boolean {
  const transitionDocument = document as ViewTransitionDocument;
  if (prefersReducedMotion()) {
    return false;
  }

  if (typeof transitionDocument.startViewTransition !== 'function') {
    runFallbackCardMove({ source, destination, update, findTarget });
    return true;
  }

  let target: HTMLElement | null = null;
  const destinationClass = `card-move-transition-to-${destination}`;
  source.style.viewTransitionName = CARD_MOVE_TRANSITION_NAME;
  document.documentElement.classList.add('card-move-transition', destinationClass);

  try {
    const transition = transitionDocument.startViewTransition(() => {
      update();
      target = findTarget();
      if (target) {
        target.style.viewTransitionName = CARD_MOVE_TRANSITION_NAME;
      }
    });

    void transition.finished
      .catch(() => undefined)
      .then(() => {
        source.style.viewTransitionName = '';
        if (target) {
          target.style.viewTransitionName = '';
        }
        document.documentElement.classList.remove('card-move-transition', destinationClass);
      });
    return true;
  } catch {
    source.style.viewTransitionName = '';
    document.documentElement.classList.remove('card-move-transition', destinationClass);
    return false;
  }
}
