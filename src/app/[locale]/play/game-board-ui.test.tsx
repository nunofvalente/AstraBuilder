// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { CARD_BACK_IMAGE_SRC } from './game-client-support';
import { BattlefieldPanel, CombinedStagingSupplyPanel } from './game-board-ui';
import type { GameCardInstance } from './game-rules';

function makeInstance(): GameCardInstance {
  return {
    instanceId: 'graveyard-card',
    owner: 'player',
    card: createTestCard({ name: 'Graveyard Subject' }),
    ready: false,
    faceDown: false,
    attachedToInstanceId: null,
    damage: 0,
    retreatLockedUntilNextTurn: false,
  };
}

describe('CombinedStagingSupplyPanel', () => {
  it('zooms graveyard cards on hover above the graveyard dialog', () => {
    const graveyardCard = makeInstance();
    const { container } = render(
      <CombinedStagingSupplyPanel
        stagingCards={[]}
        supplyCards={[]}
        graveyardCards={[graveyardCard]}
        banishCards={[]}
        deckCards={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /graveyard/i }));
    fireEvent.mouseEnter(screen.getByTitle(graveyardCard.card.name).closest('article')!);

    expect(container.querySelector('[data-card-zoom-preview]')).toHaveClass('z-[100]');
  });

  it('shows temporary influence bonuses on staging units', () => {
    const buffedUnit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'buffed-staging-unit',
      card: createTestCard({ id: 'buffed-staging-unit', name: 'Buffed Staging Unit', type: 'Unit' }),
      temporaryInfluenceBonus: 1,
    };

    render(
      <CombinedStagingSupplyPanel
        stagingCards={[buffedUnit]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
      />,
    );

    expect(screen.getByText('+1 INF')).toBeInTheDocument();
  });

  it('shows Vermillion current influence on staging units', () => {
    const vermillion: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'staging-vermillion',
      card: createTestCard({
        id: 'IMP019',
        name: 'Vermillion, Ghastly Researcher',
        type: 'Unit',
        influence: null,
      }),
    };

    render(
      <CombinedStagingSupplyPanel
        stagingCards={[vermillion]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        cardsDrawnThisTurnByOwner={{ player: 2, opponent: 0 }}
      />,
    );

    expect(screen.getByText('INF 2')).toBeInTheDocument();
  });
});

describe('BattlefieldPanel', () => {
  it('zooms face-down player territories face up', () => {
    const territory: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'hidden-territory',
      card: createTestCard({
        id: 'hidden-territory',
        name: 'Hidden Territory',
        type: 'Territory',
        imageSrc: '/hidden-territory.webp',
      }),
      faceDown: true,
    };
    const { container } = render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[territory]}
        onMove={() => undefined}
        canFlipFaceUp
        readySupplyCount={1}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: /open hidden territory actions/i }));

    const preview = container.querySelector('[data-card-zoom-preview]');
    const previewImage = preview?.querySelector('img');

    expect(previewImage).toHaveAttribute('src', expect.stringContaining('hidden-territory.webp'));
    expect(previewImage).not.toHaveAttribute('src', expect.stringContaining(encodeURIComponent(CARD_BACK_IMAGE_SRC)));
  });

  it('zooms face-down opponent territories as card backs', () => {
    const territory: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'enemy-hidden-territory',
      owner: 'opponent',
      card: createTestCard({
        id: 'enemy-hidden-territory',
        name: 'Enemy Hidden Territory',
        type: 'Territory',
        imageSrc: '/enemy-hidden-territory.webp',
      }),
      faceDown: true,
    };
    const { container } = render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[territory]}
        onMove={() => undefined}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: /open enemy hidden territory actions/i }));

    const preview = container.querySelector('[data-card-zoom-preview]');
    const previewImage = preview?.querySelector('img');

    expect(previewImage).toHaveAttribute('src', expect.stringContaining(encodeURIComponent(CARD_BACK_IMAGE_SRC)));
    expect(previewImage).not.toHaveAttribute('src', expect.stringContaining('enemy-hidden-territory.webp'));
  });

  it('shows player battlefield control in the zone title', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'controlling-unit',
      card: createTestCard({ id: 'controlling-unit', name: 'Controlling Unit', type: 'Unit' }),
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit]}
        onMove={() => undefined}
      />,
    );

    expect(screen.getByText('Battlefield 1 (Captured)')).toBeInTheDocument();
  });

  it('shows enemy battlefield control in the zone title', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'enemy-controlling-unit',
      owner: 'opponent',
      card: createTestCard({ id: 'enemy-controlling-unit', name: 'Enemy Controlling Unit', type: 'Unit' }),
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit]}
        onMove={() => undefined}
      />,
    );

    expect(screen.getByText('Battlefield 1 (Lost)')).toBeInTheDocument();
  });

  it('shows temporary influence bonuses on battlefield units', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'buffed-battlefield-unit',
      card: createTestCard({ id: 'buffed-battlefield-unit', name: 'Buffed Battlefield Unit', type: 'Unit' }),
      temporaryInfluenceBonus: 1,
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit]}
        onMove={() => undefined}
      />,
    );

    expect(screen.getByText('+1 INF')).toBeInTheDocument();
  });

  it('shows Vermillion current influence on battlefield units capped at three', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'battlefield-vermillion',
      card: createTestCard({
        id: 'IMP019',
        name: 'Vermillion, Ghastly Researcher',
        type: 'Unit',
        influence: null,
      }),
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit]}
        onMove={() => undefined}
        cardsDrawnThisTurnByOwner={{ player: 5, opponent: 0 }}
      />,
    );

    expect(screen.getByText('INF 3')).toBeInTheDocument();
  });
});
