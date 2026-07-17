// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCardExitAnimations } from './card-exit-animation';

function ExitAnimationHarness({ destination }: { destination: 'graveyard' | 'banish' | null }) {
  useCardExitAnimations(destination);

  return destination ? (
    <div
      data-card-instance-id="destroyed-unit"
      data-card-zone={destination}
      data-card-owner="player"
    />
  ) : (
    <div
      data-card-instance-id="destroyed-unit"
      data-card-zone="battlefieldCenter"
      data-card-owner="player"
    />
  );
}

describe('card exit animation', () => {
  it.each(['graveyard', 'banish'] as const)('animates a unit from play into its %s pile', (destination) => {
    const { container, rerender } = render(<ExitAnimationHarness destination={null} />);

    rerender(<ExitAnimationHarness destination={destination} />);

    expect(container.querySelector(`[data-card-zone="${destination}"]`)).toHaveClass('card-move-fallback-active');
  });
});
