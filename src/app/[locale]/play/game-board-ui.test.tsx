// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { CARD_BACK_IMAGE_SRC } from './game-client-support';
import { BattlefieldPanel, CombinedStagingSupplyPanel, HandStrip } from './game-board-ui';
import {
  buildInitialGameState,
  getCurrentUnitAttack,
  getCurrentUnitHealth,
  type GameCardInstance,
  type GameState,
  type SavedDeck,
} from './game-rules';

function makeDeck(): SavedDeck {
  return { id: 'ui-test', title: 'UI Test', cardCount: 0, entries: [] };
}

function makeGameState(): GameState {
  return {
    ...buildInitialGameState(makeDeck(), makeDeck()),
    phase: 'main',
    activePlayer: 'player',
  };
}

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

describe('HandStrip', () => {
  it('does not block pointer events over the lower board outside actual hand cards', () => {
    const handCard: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'hand-card',
      card: createTestCard({ id: 'hand-card', name: 'Hand Card', type: 'Unit' }),
    };

    const { container } = render(
      <HandStrip
        cards={[handCard]}
        gameState={makeGameState()}
        onMove={() => undefined}
        canSupplyFromHand
        canPlayFromHand
        friendlyUnitsInPlay={[]}
        graveyardCards={[]}
        readySupplyCount={0}
        stagingUnits={[]}
        demonicAdvanceActive={false}
        battlefieldCardsByZone={{
          battlefieldLeft: [],
          battlefieldCenter: [],
          battlefieldRight: [],
        }}
      />,
    );

    expect(container.querySelector('section')).toHaveClass('pointer-events-none', 'play-player-hand');
    expect(container.querySelector('[data-card-instance-id="hand-card"]')).toHaveClass('play-player-hand-card');
    expect(container.querySelector('button')).toHaveClass('pointer-events-auto');
    expect(container.querySelector('[data-card-instance-id="hand-card"]')).toHaveAttribute('data-card-zone', 'hand');
  });

  it('deals the opening hand from the player deck in sequence', async () => {
    const openingCards = ['opening-card-1', 'opening-card-2'].map((instanceId) => ({
      ...makeInstance(),
      instanceId,
      card: createTestCard({ id: instanceId, name: instanceId, type: 'Unit' }),
    }));
    const setupState = {
      ...makeGameState(),
      phase: 'setup' as const,
      playerOpeningHandConfirmed: false,
    };

    const { container } = render(
      <>
        <CombinedStagingSupplyPanel
          stagingCards={[]}
          supplyCards={[]}
          graveyardCards={[]}
          banishCards={[]}
          deckCards={[makeInstance()]}
        />
        <HandStrip
          cards={openingCards}
          gameState={setupState}
          onMove={() => undefined}
          canSupplyFromHand
          canPlayFromHand
          friendlyUnitsInPlay={[]}
          graveyardCards={[]}
          readySupplyCount={0}
          stagingUnits={[]}
          demonicAdvanceActive={false}
          battlefieldCardsByZone={{
            battlefieldLeft: [],
            battlefieldCenter: [],
            battlefieldRight: [],
          }}
        />
      </>,
    );

    const dealtCards = container.querySelectorAll('[data-opening-hand-card]');
    expect(container.querySelector('[data-player-deck]')).toBeInTheDocument();
    expect(dealtCards).toHaveLength(2);
    await waitFor(() => expect(dealtCards[0]).toHaveClass('opening-hand-card-deal'));
    expect(dealtCards[0]).toHaveStyle('--opening-draw-delay: 0ms');
    expect(dealtCards[1]).toHaveStyle('--opening-draw-delay: 85ms');
  });
});

describe('CombinedStagingSupplyPanel', () => {
  it('provides stable animation anchors for staging and supply cards', () => {
    const stagingCard = { ...makeInstance(), instanceId: 'staging-card', ready: true };
    const supplyCard = { ...makeInstance(), instanceId: 'supply-card' };
    const { container } = render(
      <CombinedStagingSupplyPanel
        stagingCards={[stagingCard]}
        supplyCards={[supplyCard]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        canInspectSupplyCards
      />,
    );

    expect(container.querySelector('section')).toHaveClass('play-zone-panel');
    expect(container.querySelector('.play-zone-panel-rows')).toBeInTheDocument();
    expect(container.querySelector('[data-card-instance-id="staging-card"]')).toHaveAttribute('data-card-zone', 'staging');
    expect(container.querySelector('[data-card-instance-id="staging-card"]')).toHaveAttribute('data-card-owner', 'player');
    expect(container.querySelector('[data-card-instance-id="supply-card"]')).toHaveAttribute('data-card-zone', 'supply');
    expect(container.querySelector('[data-card-instance-id="supply-card"]')).toHaveAttribute('data-card-owner', 'player');
  });

  it('provides opponent deck and destination anchors for bot animations', () => {
    const stagingCard = { ...makeInstance(), instanceId: 'bot-staging-card', owner: 'opponent' as const, ready: true };
    const supplyCard = { ...makeInstance(), instanceId: 'bot-supply-card', owner: 'opponent' as const };
    const graveyardCard = { ...makeInstance(), instanceId: 'bot-graveyard-card', owner: 'opponent' as const };
    const banishCard = { ...makeInstance(), instanceId: 'bot-banish-card', owner: 'opponent' as const };
    const { container } = render(
      <CombinedStagingSupplyPanel
        stagingCards={[stagingCard]}
        supplyCards={[supplyCard]}
        graveyardCards={[graveyardCard]}
        banishCards={[banishCard]}
        deckCards={[makeInstance()]}
        mirror
      />,
    );

    expect(container.querySelector('[data-opponent-deck]')).toBeInTheDocument();
    expect(container.querySelector('[data-card-instance-id="bot-staging-card"]')).toHaveAttribute('data-card-owner', 'opponent');
    expect(container.querySelector('[data-card-instance-id="bot-supply-card"]')).toHaveAttribute('data-card-owner', 'opponent');
    expect(container.querySelector('[data-card-instance-id="bot-graveyard-card"]')).toHaveAttribute('data-card-zone', 'graveyard');
    expect(container.querySelector('[data-card-instance-id="bot-banish-card"]')).toHaveAttribute('data-card-zone', 'banish');
  });

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

    const { container } = render(
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

  it('distinguishes a Guinea Pig played from the graveyard from one played from hand', () => {
    const graveyardGuineaPig: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'graveyard-guinea-pig',
      card: createTestCard({ id: 'IMP007', name: 'Guinea Pig', type: 'Unit' }),
      banishOnDeath: true,
    };
    const handGuineaPig: GameCardInstance = {
      ...graveyardGuineaPig,
      instanceId: 'hand-guinea-pig',
      banishOnDeath: false,
    };

    render(
      <CombinedStagingSupplyPanel
        stagingCards={[graveyardGuineaPig, handGuineaPig]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
      />,
    );

    const markedCard = screen.getByLabelText('Banish on death').closest('[data-card-instance-id]');
    expect(markedCard).toHaveAttribute('data-card-instance-id', graveyardGuineaPig.instanceId);
    expect(screen.getAllByLabelText('Banish on death')).toHaveLength(1);
  });

  it('shows Selena ready and exhausted stat bonuses on allied units', () => {
    const selena: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'selena',
      card: createTestCard({ id: 'IMP046', name: 'Selena, Voice of Unity', type: 'Renowned Unit', attack: 3, health: 5 }),
      ready: true,
    };
    const ally: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'selena-ally',
      card: createTestCard({ id: 'selena-ally', name: 'Selena Ally', type: 'Unit', attack: 2, health: 2 }),
      ready: true,
    };
    const baseState = makeGameState();
    const readyState = { ...baseState, zones: { ...baseState.zones, staging: [selena, ally] } };
    const { rerender } = render(
      <CombinedStagingSupplyPanel
        stagingCards={readyState.zones.staging}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        currentCombatStatsByInstanceId={{
          [ally.instanceId]: {
            attack: getCurrentUnitAttack(readyState, ally),
            health: getCurrentUnitHealth(readyState, ally),
          },
        }}
      />,
    );

    expect(screen.getByLabelText('Selena Ally has 3 attack and 2 health, modified')).toBeInTheDocument();

    const exhaustedSelena = { ...selena, ready: false };
    const exhaustedState = {
      ...baseState,
      zones: { ...baseState.zones, staging: [exhaustedSelena, ally] },
    };
    rerender(
      <CombinedStagingSupplyPanel
        stagingCards={exhaustedState.zones.staging}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        currentCombatStatsByInstanceId={{
          [ally.instanceId]: {
            attack: getCurrentUnitAttack(exhaustedState, ally),
            health: getCurrentUnitHealth(exhaustedState, ally),
          },
        }}
      />,
    );

    expect(screen.getByLabelText('Selena Ally has 2 attack and 3 health, modified')).toBeInTheDocument();
  });

  it('renders generic temporary supply as distinct supply cards', () => {
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
    expect(screen.getAllByTitle('Temporary supply')).toHaveLength(3);
    expect(screen.getAllByText('Supply')).toHaveLength(3);
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

  it('shows implemented item ability badges on equipped staging units', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'equipped-staging-unit',
      card: createTestCard({ id: 'equipped-staging-unit', name: 'Equipped Staging Unit', type: 'Unit' }),
    };
    const glorybringer: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'glorybringer',
      attachedToInstanceId: unit.instanceId,
      card: createTestCard({ id: 'IMP122', name: 'Glorybringer', type: 'Item Equipment' }),
    };
    const vengeance: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'vengeance',
      attachedToInstanceId: unit.instanceId,
      card: createTestCard({ id: 'IMP123', name: 'Vengeance', type: 'Item Equipment' }),
    };

    render(
      <CombinedStagingSupplyPanel
        stagingCards={[unit, glorybringer, vengeance]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
      />,
    );

    expect(screen.getByLabelText('Glorybringer: equipped unit gains Glory 1')).toHaveTextContent('Glory 1');
    expect(screen.getByLabelText('Vengeance: when equipped unit dies while attacking, this may return to hand')).toHaveTextContent('Vengeance');
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

  it('keeps mirrored staging cards at the same full size as player staging cards', () => {
    const opponentUnit = { ...makeInstance(), instanceId: 'opponent-staging-unit', owner: 'opponent' as const };
    const { container } = render(
      <CombinedStagingSupplyPanel
        stagingCards={[opponentUnit]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[]}
        deckCards={[]}
        mirror
      />,
    );

    expect(container.querySelector('[data-card-instance-id="opponent-staging-unit"]')).toHaveClass('h-[7.5rem]');
  });

  it('opens the banish pile and plays a Lingyi-marked unit from the modal', () => {
    const onMove = vi.fn();
    const banished = {
      ...makeInstance(),
      instanceId: 'lingyi-unit',
      card: createTestCard({ id: 'lingyi-unit', name: 'Lingyi Unit', type: 'Unit' }),
      lingyiPlayableFromBanishOnce: true,
    };
    render(
      <CombinedStagingSupplyPanel
        stagingCards={[]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[banished]}
        deckCards={[]}
        onMove={onMove}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /banish/i }));
    expect(screen.getByRole('dialog', { name: /banish/i })).toBeInTheDocument();
    expect(onMove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /lingyi unit/i }));
    expect(onMove).toHaveBeenCalledWith(banished.instanceId, 'banish', 'staging');
  });

  it('opens a read-only banish pile modal for inspecting banished cards', () => {
    const banished = {
      ...makeInstance(),
      instanceId: 'banished-card',
      card: createTestCard({ id: 'banished-card', name: 'Banished Subject', type: 'Unit' }),
    };
    render(
      <CombinedStagingSupplyPanel
        stagingCards={[]}
        supplyCards={[]}
        graveyardCards={[]}
        banishCards={[banished]}
        deckCards={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /banish/i }));

    expect(screen.getByRole('dialog', { name: /banish/i })).toBeInTheDocument();
    expect(screen.getByText('Banished Subject')).toBeInTheDocument();
    expect(screen.queryByText('Play from banish')).not.toBeInTheDocument();
  });
});

describe('BattlefieldPanel', () => {
  it('offers Flanking attacks from a combat zone', () => {
    const onAttack = vi.fn();
    const flanker = {
      ...makeInstance(),
      instanceId: 'flanker',
      ready: true,
      card: createTestCard({ id: 'flanker', name: 'Flanker', type: 'Unit', rulesText: 'Flanking' }),
    };
    const { container } = render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[flanker]}
        onMove={() => undefined}
        onAttack={onAttack}
        battlefieldCardsByZone={{
          battlefieldLeft: [flanker],
          battlefieldCenter: [],
          battlefieldRight: [],
        }}
      />,
    );

    expect(container.querySelector('section')).toHaveClass('play-battlefield-panel');
    expect(container.querySelector('.play-battlefield-lane')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /open flanker actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /flank battlefield 2/i }));
    expect(onAttack).toHaveBeenCalledWith(flanker.instanceId, 'battlefieldCenter');
  });

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

  it('opens Battlefield 3 card previews in the center of the viewport', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'right-battlefield-unit',
      card: createTestCard({ id: 'right-battlefield-unit', name: 'Right Battlefield Unit', type: 'Unit' }),
    };
    const { container } = render(
      <BattlefieldPanel
        zone="battlefieldRight"
        cards={[unit]}
        onMove={() => undefined}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: /open right battlefield unit actions/i }));

    expect(container.querySelector('[data-card-zoom-preview]')).toHaveClass('left-[55%]', '-translate-x-1/2', 'top-8');
    expect(container.querySelector('[data-card-zoom-preview]')).not.toHaveClass('left-5');
    expect(container.querySelector('[data-card-zoom-preview]')).not.toHaveClass('right-5');
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

  it('shows a Mark of Death effect badge on marked battlefield units', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'marked-unit',
      card: createTestCard({ id: 'marked-unit', name: 'Marked Unit', type: 'Unit' }),
      destroyOnNextDamageUntilTurn: 3,
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit]}
        onMove={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Mark of Death: next damage destroys this unit')).toHaveTextContent('Marked');
  });

  it('shows granted ability and turn-duration effect badges on battlefield units', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'granted-effects-unit',
      card: createTestCard({ id: 'granted-effects-unit', name: 'Granted Effects Unit', type: 'Unit' }),
      temporaryGloryBonus: 1,
      temporaryGloryExpiresAfterTurn: 3,
      preventNextCombatDamageThisTurn: true,
      abilitiesSuppressedUntilTurn: 3,
      skipNextReady: true,
      gainVictoryPointOnDeathUntilTurn: 3,
      gainVictoryPointOnDeathOwner: 'player',
      abandonLabBanishOnDeathUntilTurn: 3,
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit]}
        onMove={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Granted Glory 1 until end of turn')).toHaveTextContent('Glory 1');
    expect(screen.getByLabelText('Next combat damage to this unit is prevented this turn')).toHaveTextContent('Prevent dmg');
    expect(screen.getByLabelText('Abilities are suppressed this turn')).toHaveTextContent('No abilities');
    expect(screen.getByLabelText("Won't ready during its next ready phase")).toHaveTextContent('Skip ready');
    expect(screen.getByLabelText('If this unit dies this turn, the marked player gains 1 victory point')).toHaveTextContent('Death: +1 VP');
    expect(screen.getByLabelText('If this unit would die this turn, banish it and return it next main phase')).toHaveTextContent('Death: return');
  });

  it('does not show Ashfang Raider entry restrictions as an ongoing effect badge', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'ashfang-raider',
      card: createTestCard({ id: 'IMP097', name: 'Ashfang Raider', type: 'Unit' }),
      attackOnlyUnoccupiedUntilTurn: 3,
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit]}
        onMove={() => undefined}
      />,
    );

    expect(screen.queryByText('Unoccupied only')).not.toBeInTheDocument();
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

  it('shows implemented item ability badges on equipped battlefield units', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'equipped-battlefield-unit',
      card: createTestCard({ id: 'equipped-battlefield-unit', name: 'Equipped Battlefield Unit', type: 'Unit' }),
    };
    const caltrops: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'caltrops',
      attachedToInstanceId: unit.instanceId,
      card: createTestCard({ id: 'IMP152', name: 'Caltrops', type: 'Item Equipment' }),
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit, caltrops]}
        onMove={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Caltrops: equipped unit gains Impede 1')).toHaveTextContent('Impede 1');
  });

  it('disables manual retreat for units that captured this turn', () => {
    const unit: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'locked-battlefield-unit',
      card: createTestCard({ id: 'IMP107', name: 'Reckless Warrior', type: 'Unit' }),
      ready: false,
      retreatLockedUntilNextTurn: true,
    };
    const onMove = vi.fn();
    const { container } = render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[unit]}
        onMove={onMove}
      />,
    );

    fireEvent.click(container.querySelector('[data-card-instance-id="locked-battlefield-unit"]')!);

    expect(screen.getByRole('menuitem', { name: /retreat to staging/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: /retreat to staging/i }));
    expect(onMove).not.toHaveBeenCalled();
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

  it('shows Ruins of the Precursors dig counters while face up', () => {
    const ruins: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'ruins-of-the-precursors',
      card: createTestCard({
        id: 'IMP125',
        name: 'Ruins of the Precursors',
        type: 'Territory',
      }),
      progressCounters: 2,
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[ruins]}
        onMove={() => undefined}
      />,
    );

    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByLabelText('Ruins of the Precursors has 2 of 3 dig counters')).toBeInTheDocument();
  });

  it('does not reveal Ruins of the Precursors dig counters while face down', () => {
    const ruins: GameCardInstance = {
      ...makeInstance(),
      instanceId: 'hidden-ruins-of-the-precursors',
      card: createTestCard({
        id: 'IMP125',
        name: 'Ruins of the Precursors',
        type: 'Territory',
      }),
      faceDown: true,
      progressCounters: 2,
    };

    render(
      <BattlefieldPanel
        zone="battlefieldLeft"
        cards={[ruins]}
        onMove={() => undefined}
      />,
    );

    expect(screen.queryByText('2/3')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ruins of the Precursors has 2 of 3 dig counters')).not.toBeInTheDocument();
  });
});
