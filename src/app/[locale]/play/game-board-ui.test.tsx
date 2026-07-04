// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

  it('zooms inspectable supply cards face up while keeping the board card back face down', () => {
    const supplyCard: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'player-supply-card',
      card: createTestCard({
        id: 'player-supply-card',
        name: 'Player Supply Card',
        imageSrc: '/player-supply-card.webp',
      }),
      faceDown: true,
    };
    const { container } = render(
      <CombinedStagingSupplyPanel
        stagingCards={[]}
        supplyCards={[supplyCard]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        canInspectSupplyCards
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: /inspect supply card player supply card/i }));

    const preview = container.querySelector('[data-card-zoom-preview]');
    const previewImage = preview?.querySelector('img');
    const boardBack = screen.getByRole('button', { name: /inspect supply card player supply card/i }).querySelector('img');

    expect(previewImage).toHaveAttribute('src', expect.stringContaining('player-supply-card.webp'));
    expect(previewImage).not.toHaveAttribute('src', expect.stringContaining(encodeURIComponent(CARD_BACK_IMAGE_SRC)));
    expect(boardBack).toHaveAttribute('src', expect.stringContaining(encodeURIComponent(CARD_BACK_IMAGE_SRC)));
  });

  it('does not expose supply cards unless inspection is enabled', () => {
    const supplyCard: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'opponent-supply-card',
      owner: 'opponent',
      card: createTestCard({
        id: 'opponent-supply-card',
        name: 'Opponent Supply Card',
        imageSrc: '/opponent-supply-card.webp',
      }),
      faceDown: true,
    };
    const { container } = render(
      <CombinedStagingSupplyPanel
        stagingCards={[]}
        supplyCards={[supplyCard]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
      />,
    );

    expect(screen.queryByRole('button', { name: /inspect supply card opponent supply card/i })).not.toBeInTheDocument();
    expect(container.querySelector('[data-card-zoom-preview]')).not.toBeInTheDocument();
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

  it('shows an effect badge on protected staging units', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'renata-protected-staging-unit',
      card: createTestCard({ id: 'renata-protected-staging-unit', name: 'Renata Protected Staging Unit', type: 'Unit' }),
      protectedFromEnemyTacticsUntilTurn: 3,
    };

    render(
      <CombinedStagingSupplyPanel
        stagingCards={[unit]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
      />,
    );

    expect(screen.getByLabelText("Can't be targeted by enemy tactics until end of turn")).toHaveTextContent("Can't be targeted by enemy tactics");
  });

  it('offers Genesis III activated ability from staging', () => {
    const genesis: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'genesis',
      card: createTestCard({
        id: 'IMP066',
        name: 'Genesis III, Deus Volare',
        type: 'Renowned Unit',
        affinity: 'Caelum',
      }),
      ready: true,
    };
    const onActivate = vi.fn();
    const { container } = render(
      <CombinedStagingSupplyPanel
        stagingCards={[genesis]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        onActivate={onActivate}
      />,
    );

    fireEvent.click(container.querySelector('[data-card-instance-id="genesis"]')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /activate ability/i }));

    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ instanceId: 'genesis' }));
  });

  it('does not offer Valrathian Dreadnought activated ability from staging', () => {
    const dreadnought: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'dreadnought',
      card: createTestCard({
        id: 'IMP079',
        name: 'Valrathian Dreadnought',
        type: 'Unit',
        affinity: 'Caelum',
      }),
      ready: true,
    };

    const { container } = render(
      <CombinedStagingSupplyPanel
        stagingCards={[dreadnought]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        onActivate={() => undefined}
      />,
    );

    fireEvent.click(container.querySelector('[data-card-instance-id="dreadnought"]')!);

    expect(screen.queryByRole('menuitem', { name: /activate ability/i })).not.toBeInTheDocument();
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

  it('shows an effect badge on protected battlefield units', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'renata-protected-unit',
      card: createTestCard({ id: 'renata-protected-unit', name: 'Renata Protected Unit', type: 'Unit' }),
      protectedFromEnemyTacticsUntilTurn: 3,
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit]}
        onMove={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Can't be targeted by enemy tactics until end of turn")).toHaveTextContent("Can't be targeted by enemy tactics");
  });

  it('shows a Radar Beacon effect badge on friendly units in its zone', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'radar-unit',
      card: createTestCard({ id: 'radar-unit', name: 'Radar Unit', type: 'Unit' }),
    };
    const beacon: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'radar-beacon',
      card: createTestCard({ id: 'IMP094', name: 'Radar Beacon', type: 'Territory' }),
      ready: true,
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit, beacon]}
        onMove={() => undefined}
      />,
    );

    expect(screen.getByLabelText('On Defend: Ready this unit')).toHaveTextContent('On Defend: Ready');
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

  it('offers retreat for exhausted battlefield units', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'exhausted-battlefield-unit',
      card: createTestCard({ id: 'exhausted-battlefield-unit', name: 'Exhausted Battlefield Unit', type: 'Unit' }),
      ready: false,
    };
    const onMove = vi.fn();
    const { container } = render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit]}
        onMove={onMove}
      />,
    );

    fireEvent.click(container.querySelector('[data-card-instance-id="exhausted-battlefield-unit"]')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /retreat to staging/i }));

    expect(onMove).toHaveBeenCalledWith(unit.instanceId, 'battlefieldLeft', 'staging', { enterExhausted: true });
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
