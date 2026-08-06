// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { CARD_BACK_IMAGE_SRC } from './game-client-support';
import { ActionLogList, CardZoomPreview, OpponentHandStrip, useLongPressPreview } from './game-client-ui';
import type { GameCardInstance, LogEntry } from './game-rules';

function makeInstance(overrides: Partial<GameCardInstance> = {}): GameCardInstance {
  return {
    instanceId: 'opponent-card',
    owner: 'opponent',
    card: createTestCard({
      id: 'opponent-card',
      name: 'Opponent Card',
      imageSrc: '/opponent-card.webp',
    }),
    ready: false,
    faceDown: false,
    attachedToInstanceId: null,
    damage: 0,
    retreatLockedUntilNextTurn: false,
    ...overrides,
  };
}

function LongPressPreviewHarness() {
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const getLongPressProps = useLongPressPreview(
    () => setIsPreviewVisible(true),
    () => setIsPreviewVisible(false),
    100,
  );

  return (
    <>
      <button type="button" {...getLongPressProps('card')} onClick={() => setTapCount((count) => count + 1)}>
        Card
      </button>
      <span>Tap count: {tapCount}</span>
      {isPreviewVisible ? <span>Zoomed card</span> : null}
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('mobile card zoom', () => {
  it('shows a preview after a touch hold and suppresses the resulting tap', () => {
    vi.useFakeTimers();
    render(<LongPressPreviewHarness />);
    const card = screen.getByRole('button', { name: 'Card' });

    fireEvent.pointerDown(card, { pointerType: 'touch', pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByText('Zoomed card')).toBeInTheDocument();

    fireEvent.pointerUp(card, { pointerType: 'touch', pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.click(card);
    expect(screen.queryByText('Zoomed card')).not.toBeInTheDocument();
    expect(screen.getByText('Tap count: 0')).toBeInTheDocument();
  });

  it('keeps a short touch as a normal tap', () => {
    vi.useFakeTimers();
    render(<LongPressPreviewHarness />);
    const card = screen.getByRole('button', { name: 'Card' });

    fireEvent.pointerDown(card, { pointerType: 'touch', pointerId: 2, button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(50));
    fireEvent.pointerUp(card, { pointerType: 'touch', pointerId: 2, button: 0, clientX: 10, clientY: 10 });
    fireEvent.click(card);

    expect(screen.queryByText('Zoomed card')).not.toBeInTheDocument();
    expect(screen.getByText('Tap count: 1')).toBeInTheDocument();
  });

  it('makes the existing zoom preview visible below the desktop breakpoint when requested', () => {
    const card = createTestCard({ id: 'zoom-card', name: 'Zoom Card', imageSrc: '/zoom-card.webp' });
    const { container } = render(<CardZoomPreview card={card} mobileVisible />);

    expect(container.querySelector('[data-card-zoom-preview]')).toHaveClass('block');
  });
});

describe('ActionLogList', () => {
  it('bolds every occurrence of every card name in a log message', () => {
    const entry: LogEntry = {
      id: 'log-1',
      turn: 1,
      phase: 'main',
      activePlayer: 'player',
      cardNames: ['Nerezza, Umbrasco Scion', 'Test Subject'],
      suffix: 'Nerezza, Umbrasco Scion took Test Subject. Test Subject entered staging.',
    };

    const { container } = render(
      <ol>
        <ActionLogList entries={[entry]} />
      </ol>,
    );

    expect(container.querySelector('ol ol li')).toHaveTextContent(entry.suffix);
    expect([...container.querySelectorAll('strong')].map((element) => element.textContent)).toEqual([
      'Nerezza, Umbrasco Scion',
      'Test Subject',
      'Test Subject',
    ]);
  });
});

describe('OpponentHandStrip', () => {
  it('keeps normal opponent hand cards hidden as card backs', () => {
    const { container } = render(<OpponentHandStrip cards={[makeInstance()]} />);
    const image = container.querySelector('img');

    expect(container.querySelector('section')).toHaveClass('play-opponent-hand');
    expect(container.querySelector('[data-card-owner="opponent"]')).toHaveClass('play-opponent-hand-card');
    expect(image).toHaveAttribute('src', expect.stringContaining(encodeURIComponent(CARD_BACK_IMAGE_SRC)));
    expect(image).not.toHaveAttribute('src', expect.stringContaining('opponent-card.webp'));
  });

  it('shows Solara revealed-until-end-turn opponent hand cards face up', () => {
    const revealed = makeInstance({ solaraRevealedFromDeckUntilTurn: 3 });
    const { container } = render(<OpponentHandStrip cards={[revealed]} />);
    const image = container.querySelector('img');

    expect(image).toHaveAttribute('src', expect.stringContaining('opponent-card.webp'));
    expect(image).not.toHaveAttribute('src', expect.stringContaining(encodeURIComponent(CARD_BACK_IMAGE_SRC)));
    expect(container).toHaveTextContent('Revealed');
  });

  it('deals face-down opening cards from the opponent deck', async () => {
    const { container } = render(
      <>
        <div data-opponent-deck />
        <OpponentHandStrip cards={[makeInstance()]} dealOpeningHand />
      </>,
    );

    const dealtCard = container.querySelector('[data-opening-hand-card]');
    await waitFor(() => expect(dealtCard).toHaveClass('opening-hand-card-deal'));
    expect(dealtCard).toHaveStyle('--opening-draw-delay: 0ms');
    expect(container.querySelector('[data-card-owner="opponent"]')).toHaveAttribute('data-card-zone', 'hand');
    expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(encodeURIComponent(CARD_BACK_IMAGE_SRC)));
  });
});
