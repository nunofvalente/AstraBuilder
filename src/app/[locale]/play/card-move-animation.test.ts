// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  CARD_MOVE_TRANSITION_NAME,
  startCardMoveViewTransition,
} from './card-move-animation';

describe('card move animation', () => {
  it('shares the moving card between its old and new rendered positions', async () => {
    const source = document.createElement('div');
    const target = document.createElement('div');
    let resolveFinished!: () => void;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    const update = vi.fn();
    const startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return { finished };
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    });

    expect(
      startCardMoveViewTransition({
        source,
        destination: 'supply',
        update,
        findTarget: () => target,
      })
    ).toBe(true);
    expect(update).toHaveBeenCalledOnce();
    expect(source.style.viewTransitionName).toBe(CARD_MOVE_TRANSITION_NAME);
    expect(target.style.viewTransitionName).toBe(CARD_MOVE_TRANSITION_NAME);
    expect(document.documentElement).toHaveClass('card-move-transition');
    expect(document.documentElement).toHaveClass('card-move-transition-to-supply');

    resolveFinished();
    await finished;
    await Promise.resolve();
    expect(source.style.viewTransitionName).toBe('');
    expect(target.style.viewTransitionName).toBe('');
    expect(document.documentElement).not.toHaveClass('card-move-transition');
    expect(document.documentElement).not.toHaveClass('card-move-transition-to-supply');
  });

  it('does not start a transition when reduced motion is requested', () => {
    const originalMatchMedia = window.matchMedia;
    const source = document.createElement('div');
    const update = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });

    expect(
      startCardMoveViewTransition({
        source,
        destination: 'staging',
        update,
        findTarget: () => null,
      })
    ).toBe(false);
    expect(update).not.toHaveBeenCalled();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it('animates the actual destination card when view transitions are unavailable', () => {
    const source = document.createElement('div');
    const target = document.createElement('div');
    const animate = vi.fn();
    target.animate = animate;
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 100,
      height: 140,
      right: 110,
      bottom: 160,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      left: 210,
      top: 320,
      width: 50,
      height: 70,
      right: 260,
      bottom: 390,
      x: 210,
      y: 320,
      toJSON: () => ({}),
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    const update = vi.fn();

    expect(
      startCardMoveViewTransition({
        source,
        destination: 'supply',
        update,
        findTarget: () => target,
      }),
    ).toBe(true);
    expect(update).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ transform: 'translate3d(-175px, -265px, 0) scale(2)' }),
      ]),
      expect.objectContaining({ duration: 480 }),
    );
  });

  it('uses a CSS transition when no browser animation API is available', () => {
    const source = document.createElement('div');
    const target = document.createElement('div');
    Object.defineProperty(target, 'animate', { configurable: true, value: undefined });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    expect(
      startCardMoveViewTransition({
        source,
        destination: 'staging',
        update: () => undefined,
        findTarget: () => target,
      }),
    ).toBe(true);
    expect(target).toHaveClass('card-move-fallback-active');
    expect(target.style.transition).toBe('none');
  });
});
