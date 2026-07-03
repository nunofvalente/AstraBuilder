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

  it('folds temporary influence bonuses into the staging influence total', () => {
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

    expect(screen.getByLabelText('Buffed Staging Unit has 1 influence')).toHaveTextContent('1');
    expect(screen.queryByText('+1 INF')).not.toBeInTheDocument();
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

    expect(screen.getByLabelText('Vermillion, Ghastly Researcher has 2 influence')).toHaveTextContent('2');
  });

  it('renders Fortuna temporary supply as distinct supply cards', () => {
    const { container } = render(
      <CombinedStagingSupplyPanel
        stagingCards={[]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        temporarySupplyCount={3}
      />,
    );

    expect(screen.getByLabelText('3 total supply, including 3 temporary')).toBeInTheDocument();
    expect(screen.getAllByTitle('Temporary supply from Fortuna Bank')).toHaveLength(3);
    expect(container.querySelectorAll('[data-temporary-supply]')).toHaveLength(3);
  });

  it('shows current modified attack and health on staging units', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'vero-buffed-unit',
      card: createTestCard({
        id: 'vero-buffed-unit',
        name: 'Vero Buffed Unit',
        type: 'Unit',
        attack: 4,
        health: 6,
      }),
      ready: true,
    };

    render(
      <CombinedStagingSupplyPanel
        stagingCards={[unit]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        currentCombatStatsByInstanceId={{
          [unit.instanceId]: { attack: 5, health: 7 },
        }}
      />,
    );

    const stats = screen.getByLabelText('Vero Buffed Unit has 5 attack and 7 health, modified');
    expect(stats).toHaveAttribute('data-combat-stats-modified', 'true');
    expect(stats).toHaveClass('bg-black/80', 'border-amber-300/90');
    expect(stats).toHaveAttribute('title', 'Current stats: 5 attack, 7 health (printed 4/6)');
  });

  it('places the opponent deck above the banish pile', () => {
    render(
      <CombinedStagingSupplyPanel
        stagingCards={[]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        mirror
      />,
    );

    const deckLabel = screen.getByText('Deck');
    const banishLabel = screen.getByText('Banish');
    expect(deckLabel.compareDocumentPosition(banishLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    expect(screen.getByText('CAPTURED')).toHaveClass('text-emerald-400');
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

    expect(screen.getByText('LOST')).toHaveClass('text-red-400');
  });

  it('folds temporary influence bonuses into the battlefield influence total', () => {
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

    expect(screen.getByLabelText('Buffed Battlefield Unit has 1 influence')).toHaveTextContent('1');
    expect(screen.queryByText('+1 INF')).not.toBeInTheDocument();
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

    expect(screen.getByLabelText('Vermillion, Ghastly Researcher has 3 influence')).toHaveTextContent('3');
  });

  it('shows Quarantine Zone progress and remaining turns', () => {
    const quarantine: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'quarantine-zone',
      card: createTestCard({
        id: 'IMP063',
        name: 'Quarantine Zone',
        type: 'Territory',
      }),
      progressCounters: 1,
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[quarantine]}
        onMove={() => undefined}
      />,
    );

    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('1 turn left')).toBeInTheDocument();
    expect(screen.getByLabelText('Quarantine Zone has 1 of 2 progress counters and 1 turn left')).toBeInTheDocument();
  });

  it('does not reveal Quarantine progress while the territory is face down', () => {
    const quarantine: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'hidden-quarantine-zone',
      card: createTestCard({
        id: 'IMP063',
        name: 'Quarantine Zone',
        type: 'Territory',
      }),
      faceDown: true,
      progressCounters: 1,
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[quarantine]}
        onMove={() => undefined}
      />,
    );

    expect(screen.queryByText('1/2')).not.toBeInTheDocument();
    expect(screen.queryByText('1 turn left')).not.toBeInTheDocument();
  });
});
