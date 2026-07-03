import type { Card, DeckEntry } from '../create/deck-builder/types';
import type { AbilityTarget, AbilityTrigger } from './card-abilities';
export type Owner = 'player' | 'opponent';
export type GamePhase = 'setup' | 'main';
export type GameSessionMode = 'practice' | 'multiplayer';

export type ZoneId =
  | 'deck'
  | 'hand'
  | 'staging'
  | 'supply'
  | 'graveyard'
  | 'banish'
  | 'battlefieldLeft'
  | 'battlefieldCenter'
  | 'battlefieldRight';

export type PrivateZones = Pick<Record<ZoneId, GameCardInstance[]>, 'deck' | 'hand' | 'staging' | 'supply' | 'graveyard' | 'banish'>;

export type SavedDeck = {
  id: string;
  title: string | null;
  cardCount: number;
  entries: DeckEntry[];
};

export type GameCardInstance = {
  instanceId: string;
  owner: Owner;
  card: Card;
  ready: boolean;
  faceDown: boolean;
  attachedToInstanceId: string | null;
  damage: number;
  retreatLockedUntilNextTurn: boolean;
  banishOnDeath?: boolean;
  loseVictoryPointOnDeathThisTurnCount?: number;
  discardCardOnDeathThisTurnCount?: number;
  temporaryInfluenceBonus?: number;
  temporaryInfluenceExpiresAfterTurn?: number;
  preventNextCombatDamageThisTurn?: boolean;
};

export type LogEntry = {
  id: string;
  turn: number | null;
  phase: GamePhase | null;
  activePlayer: Owner | null;
  prefix?: string;
  cardName?: string;
  cardNames?: string[];
  suffix: string;
};

export type LogEntryInput = Omit<LogEntry, 'id' | 'turn' | 'phase' | 'activePlayer'> & Partial<Pick<LogEntry, 'turn' | 'phase' | 'activePlayer'>>;

export type PendingCombat = {
  attackerOwner: Owner;
  attackerInstanceId: string;
  targetZone: ZoneId;
  defenderInstanceId: string | null;
  priorityOwner: Owner;
  lastPassedOwner: Owner | null;
  counterStack: GameCardInstance[];
};

export type PendingChoice =
  | {
      kind: 'lucilleScore';
      owner: Owner;
      sourceInstanceId: string;
      availableUnitInstanceIds: string[];
      remainingScoreTriggers: Array<{ sourceInstanceId: string; controller: Owner; zone: ZoneId }>;
      resumeTurnAdvance: boolean;
    }
  | {
      kind: 'nerezzaSacrifice';
      owner: Owner;
      sourceInstanceId: string;
      availableUnitInstanceIds: string[];
    }
  | {
      kind: 'nerezzaSteal';
      owner: Owner;
      sourceInstanceId: string;
      availableUnitInstanceIds: string[];
    }
  | {
      kind: 'nocturneMark';
      owner: Owner;
      sourceInstanceId: string;
      availableUnitInstanceIds: string[];
    }
  | {
      kind: 'forcedDiscard';
      owner: Owner;
      sourceInstanceId: string;
      availableCardInstanceIds: string[];
      sourceName: string;
    }
  | {
      kind: 'noxTarget';
      owner: 'player';
      sourceInstanceId: string;
      sourceName: string;
      effect:
        | 'retainerBuff'
        | 'contagiousDiscard'
        | 'eyeSacrifice'
        | 'eyeOpponentSacrifice'
        | 'unethicalSacrifice'
        | 'destroyUnit'
        | 'laboratoryUse'
        | 'laboratoryDiscard'
        | 'hideoutSacrifice';
      availableInstanceIds: string[];
      optional?: boolean;
      resumeTurnAdvance?: boolean;
    };

export type GameState = {
  deckId: string;
  deckTitle: string;
  botDeckId: string | null;
  botDeckTitle: string | null;
  sessionMode: GameSessionMode;
  turn: number;
  phase: GamePhase;
  activePlayer: Owner | null;
  firstPlayer: Owner | null;
  hasFirstPlayerSkippedDraw: boolean;
  playerStartingSupplyPlaced: boolean;
  opponentStartingSupplyPlaced: boolean;
  playerSuppliedThisTurn: boolean;
  opponentSuppliedThisTurn: boolean;
  playerVictoryPoints: number;
  opponentVictoryPoints: number;
  playerCardsDrawnThisTurn: number;
  opponentCardsDrawnThisTurn: number;
  playerDemonicAdvanceActive: boolean;
  opponentDemonicAdvanceActive: boolean;
  winner: Owner | null;
  pendingCombat: PendingCombat | null;
  pendingChoice: PendingChoice | null;
  zones: Record<ZoneId, GameCardInstance[]>;
  opponentZones: PrivateZones;
  log: LogEntry[];
};

export type TriggerAbilitiesInput = {
  source: GameCardInstance;
  controller?: Owner;
  zone?: ZoneId | null;
  targets?: AbilityTarget[];
};

export type ActivateCardAbilityResult =
  | { state: GameState; source: GameCardInstance; target: GameCardInstance }
  | { error: string };

export type BattlefieldAttackResult = {
  state: GameState;
  attacker: GameCardInstance;
  defender: GameCardInstance | null;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  captured: boolean;
  scoredVictoryPoints: number;
};

export type DeclareBattlefieldAttackResult = {
  state: GameState;
  pendingCombat: PendingCombat;
  attacker: GameCardInstance;
  defender: GameCardInstance | null;
};

export type CounterPriorityPassResult = {
  state: GameState;
  resolvedCombat: BattlefieldAttackResult | null;
  resolvedCounters: GameCardInstance[];
};

export type PlayCounterCardResult = {
  state: GameState;
  counter: GameCardInstance;
};

