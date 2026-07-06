import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import {
  getBattlefieldActions,
  getDefaultPendingChoiceSelectionIds,
  getHandActions,
  getPendingChoiceTargetCards,
  isPrivateOpponentSupplyChoiceTarget,
} from './game-client-support';
import {
  buildInitialGameState,
  type GameCardInstance,
  type PendingChoice,
  type SavedDeck,
} from './game-rules';

function makeDeck(): SavedDeck {
  return { id: 'support-test', title: 'Support Test', cardCount: 0, entries: [] };
}

function makeInstance(id: string): GameCardInstance {
  return {
    instanceId: id,
    owner: 'player',
    card: createTestCard({ id, name: id }),
    ready: false,
    faceDown: true,
    attachedToInstanceId: null,
    damage: 0,
    retreatLockedUntilNextTurn: false,
  };
}

describe('game client support', () => {
  it('localizes card actions for every supported non-English locale', () => {
    const base = buildInitialGameState(makeDeck(), makeDeck());
    const unit: GameCardInstance = {
      ...makeInstance('unit'),
      card: createTestCard({ id: 'unit', name: 'Unit', type: 'Unit', cost: 1 }),
      faceDown: false,
      ready: true,
    };
    const chineseActions = getHandActions(unit, {
      canSupplyFromHand: true,
      canPlayFromHand: true,
      gameState: base,
      graveyardCards: [],
      handCards: [unit],
      friendlyUnitsInPlay: [],
      readySupplyCount: 1,
      stagingUnits: [],
      locale: 'zh-CN',
    });

    expect(chineseActions.map((action) => action.label)).toEqual(
      expect.arrayContaining(['打出至集结区', '充作补给'])
    );
    expect(
      getBattlefieldActions('battlefieldLeft', unit, {
        canFlipFaceUp: false,
        locale: 'ja',
      })[0]?.label
    ).toBe('ステージングへ撤退');

    expect(
      getBattlefieldActions('battlefieldLeft', unit, {
        canFlipFaceUp: false,
        locale: 'fr',
      })[0]?.label
    ).toBe('Battre en retraite vers la zone de préparation');
    expect(
      getBattlefieldActions('battlefieldLeft', unit, {
        canFlipFaceUp: false,
        locale: 'de',
      })[0]?.label
    ).toBe('In den Vorbereitungsbereich zurückziehen');
    expect(
      getBattlefieldActions('battlefieldLeft', unit, {
        canFlipFaceUp: false,
        locale: 'ms',
      })[0]?.label
    ).toBe('Berundur ke kawasan persediaan');
  });

  it('preselects Raven for its optional self-retreat score choice', () => {
    const pendingChoice: PendingChoice = {
      kind: 'terraTarget',
      owner: 'player',
      sourceInstanceId: 'raven',
      sourceName: 'Raven Moonwhisper',
      prompt: 'Retreat Raven Moonwhisper after scoring?',
      effect: 'ravenRetreat',
      availableInstanceIds: ['raven'],
      optional: true,
    };

    expect(getDefaultPendingChoiceSelectionIds(pendingChoice)).toEqual(['raven']);
  });

  it('includes supply cards for Wingshield Transport target choices', () => {
    const supplyCard = makeInstance('supply-choice');
    const state = {
      ...buildInitialGameState(makeDeck(), makeDeck()),
      zones: {
        ...buildInitialGameState(makeDeck(), makeDeck()).zones,
        supply: [supplyCard],
      },
    };
    const pendingChoice: PendingChoice = {
      kind: 'caelumTarget',
      owner: 'player',
      sourceInstanceId: 'transport',
      sourceName: 'Wingshield Transport',
      prompt: 'Choose a supply card to reveal and return to your hand.',
      effect: 'wingshieldSupply',
      availableInstanceIds: [supplyCard.instanceId],
      optional: true,
    };

    expect(getPendingChoiceTargetCards(state, pendingChoice)).toEqual([supplyCard]);
  });

  it('marks opponent supply targets as private for player pending choices', () => {
    const base = buildInitialGameState(makeDeck(), makeDeck());
    const playerSupply = makeInstance('player-supply');
    const opponentSupply: GameCardInstance = {
      ...makeInstance('opponent-supply'),
      owner: 'opponent',
      card: createTestCard({ id: 'secret-supply-card', name: 'Secret Supply Card' }),
    };
    const state = {
      ...base,
      zones: {
        ...base.zones,
        supply: [playerSupply],
      },
      opponentZones: {
        ...base.opponentZones,
        supply: [opponentSupply],
      },
    };
    const pendingChoice: PendingChoice = {
      kind: 'solaraTarget',
      owner: 'player',
      sourceInstanceId: 'pillager',
      sourceName: 'Ashfang Pillager',
      prompt: 'Choose a supply card to exhaust and lock for its next ready phase.',
      effect: 'pillagerSupply',
      availableInstanceIds: [playerSupply.instanceId, opponentSupply.instanceId],
    };

    expect(getPendingChoiceTargetCards(state, pendingChoice)).toEqual([playerSupply, opponentSupply]);
    expect(isPrivateOpponentSupplyChoiceTarget(state, pendingChoice, opponentSupply)).toBe(true);
    expect(isPrivateOpponentSupplyChoiceTarget(state, pendingChoice, playerSupply)).toBe(false);
  });
});
