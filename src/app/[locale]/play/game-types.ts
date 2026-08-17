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
  controller?: Owner;
  card: Card;
  ready: boolean;
  faceDown: boolean;
  faceDownEnteredTurn?: number;
  attachedToInstanceId: string | null;
  damage: number;
  retreatLockedUntilNextTurn: boolean;
  banishOnDeath?: boolean;
  selectedAbilityTargetInstanceIds?: string[];
  counterStackEntryKind?: 'activatedAbility';
  loseVictoryPointOnDeathThisTurnCount?: number;
  discardCardOnDeathThisTurnCount?: number;
  temporaryInfluenceBonus?: number;
  temporaryInfluenceExpiresAfterTurn?: number;
  preventNextCombatDamageThisTurn?: boolean;
  temporaryAttackBonus?: number;
  temporaryHealthBonus?: number;
  temporaryStatsExpireAfterTurn?: number;
  temporaryGloryBonus?: number;
  temporaryGloryExpiresAfterTurn?: number;
  attackOnlyUnoccupiedUntilTurn?: number;
  destroyOnNextDamageUntilTurn?: number;
  gainVictoryPointOnDeathUntilTurn?: number;
  gainVictoryPointOnDeathOwner?: Owner;
  flankingOriginZone?: ZoneId;
  flankingAttackUsedTurn?: number;
  lingyiPlayableFromBanishOnce?: boolean;
  lingyiGrantedBlitz?: boolean;
  solaraRevealedFromDeckUntilTurn?: number;
  terraLastStandExpiresAtStartOfOwner?: Owner;
  terraLastStandAttackBonus?: number;
  terraLastStandHealthBonus?: number;
  overgrownFactoryUsedTurn?: number;
  skipCurrentCombat?: boolean;
  combatAttackBonus?: number;
  abilitiesSuppressedUntilTurn?: number;
  protectedFromEnemyTacticsUntilTurn?: number;
  skipNextReady?: boolean;
  progressCounters?: number;
  startTurnAbilityResolvedTurn?: number;
  endTurnAbilityResolvedTurn?: number;
  abandonLabBanishOnDeathUntilTurn?: number;
  abandonLabReturnController?: Owner;
  abandonLabReturnAfterTurn?: number;
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
  privateToOwner?: Owner;
  redactedPrefix?: string;
  redactedSuffix?: string;
};

export type LogEntryInput = Omit<LogEntry, 'id' | 'turn' | 'phase' | 'activePlayer'> & Partial<Pick<LogEntry, 'turn' | 'phase' | 'activePlayer'>>;

export type PendingCombat = {
  attackerOwner: Owner;
  attackerInstanceId: string;
  targetZone: ZoneId;
  defenderInstanceId: string | null;
  flankingOriginZone?: ZoneId;
  priorityOwner: Owner;
  lastPassedOwner: Owner | null;
  lastCounterActionOwner?: Owner | null;
  counterStack: GameCardInstance[];
};

export type PendingChoice = (
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
      resumeTurnAdvance?: boolean;
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
    }
  | {
      kind: 'caelumTarget';
      owner: 'player';
      sourceInstanceId: string;
      sourceName: string;
      prompt: string;
      effect:
        | 'airdrop'
        | 'abandonLab'
        | 'archiveReturn'
        | 'confessionDamage'
        | 'discard'
        | 'fortifyDiscard'
        | 'droneReveal'
        | 'enforcerExhaust'
        | 'inquisitorSuppress'
        | 'leviathanReturn'
        | 'renataProtect'
        | 'renataReady'
        | 'skybreakerDamage'
        | 'strategistDiscard'
        | 'valeriaExhaust'
        | 'valeriaRetreat'
        | 'voidWarp'
        | 'wingshieldSupply'
        | 'freightModuleSupply'
        | 'unyieldingStormSweep';
      availableInstanceIds: string[];
      optional?: boolean;
      contextInstanceIds?: string[];
      resumeTurnAdvance?: boolean;
    }
  | {
      kind: 'caelumZone';
      owner: 'player';
      sourceInstanceId: string;
      sourceName: string;
      prompt: string;
      effect: 'unyieldingStormMove';
      availableZoneIds: ZoneId[];
      resumeTurnStart?: boolean;
    }
  | {
      kind: 'luxTarget';
      owner: 'player';
      sourceInstanceId: string;
      sourceName: string;
      prompt: string;
      effect:
        | 'artilleryDamage'
        | 'biscuitBottom'
        | 'biscuitReturn'
        | 'celesteExhaust'
        | 'communityEffort'
        | 'strategistReady'
        | 'emergencyReturn'
        | 'farsightDamage'
        | 'fortunaSacrifice'
        | 'hallowedReturn'
        | 'musterReady'
        | 'medicPrevent'
        | 'resuscitate'
        | 'seraphielReturn'
        | 'smokescreen'
        | 'stormhammerExhaust'
        | 'stormhammerDamage'
        | 'suppression';
      availableInstanceIds: string[];
      optional?: boolean;
      maxSelections?: number;
      contextInstanceIds?: string[];
      resumeTurnAdvance?: boolean;
    }
  | {
      kind: 'solaraTarget';
      owner: 'player';
      sourceInstanceId: string;
      sourceName: string;
      prompt: string;
      effect:
        | 'pillagerSupply'
        | 'lingyiBanish'
        | 'grantGlory'
        | 'rockjawRetreat'
        | 'varenthusSacrifice'
        | 'varenthusDestroy'
        | 'brandDamage'
        | 'lavaSacrifice'
        | 'markOfDeath'
        | 'ransackDestroy'
        | 'rocketDamage'
        | 'uprisingBuff'
        | 'uprisingExhaust'
        | 'enrageReady'
        | 'vengeanceReturn'
        | 'wyvernAttack'
        | 'peaksRetreat'
        | 'landbreakerDestroy';
      availableInstanceIds: string[];
      optional?: boolean;
      minSelections?: number;
      maxSelections?: number;
      contextInstanceIds?: string[];
      resumeTurnAdvance?: boolean;
    }
  | {
      kind: 'terraTarget';
      owner: 'player';
      sourceInstanceId: string;
      sourceName: string;
      prompt: string;
      effect:
        | 'gaiaFreePlay'
        | 'shamanUnit'
        | 'ravenRetreat'
        | 'rallierBuff'
        | 'wyrmDamage'
        | 'illusionistUnit'
        | 'coordinatedExhaust'
        | 'coordinatedDamage'
        | 'predatoryBuff'
        | 'predatoryDamage'
        | 'sporeExhaust'
        | 'lastStand'
        | 'swiftRetreat'
        | 'katanaReturn'
        | 'escapeRoutePay'
        | 'factoryDraw'
        | 'shadowveilDamage';
      availableInstanceIds: string[];
      optional?: boolean;
      minSelections?: number;
      maxSelections?: number;
      contextInstanceIds?: string[];
      effectAmount?: number;
      resumeTurnAdvance?: boolean;
    }
  | {
      kind: 'terraZone';
      owner: 'player';
      sourceInstanceId: string;
      sourceName: string;
      prompt: string;
      effect: 'gaiaTerritory' | 'illusionistAttack';
      availableZoneIds: ZoneId[];
      contextInstanceIds?: string[];
    }
  | {
      kind: 'neutralTarget';
      owner: 'player';
      sourceInstanceId: string;
      sourceName: string;
      prompt: string;
      effect: 'excavatorDestroy' | 'warBannerReveal' | 'warBannerDraw';
      availableInstanceIds: string[];
      optional?: boolean;
      resumeTurnAdvance?: boolean;
    }
) & {
  remainingScoreItemTriggerIds?: string[];
  scoreTriggerOwner?: Owner;
  scoreTriggerZone?: ZoneId;
  resumeCombat?: boolean;
  resumeTurnAdvance?: boolean;
  resumeTurnStart?: boolean;
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
  playerOpeningHandConfirmed: boolean;
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
  playerTemporarySupply: number;
  opponentTemporarySupply: number;
  winner: Owner | null;
  pendingCombat: PendingCombat | null;
  pendingChoice: PendingChoice | null;
  scoreLocks?: Array<{ zone: ZoneId; blockedOwner: Owner; expiresAtStartOfOwner: Owner }>;
  zones: Record<ZoneId, GameCardInstance[]>;
  opponentZones: PrivateZones;
  log: LogEntry[];
};

export type TriggerAbilitiesInput = {
  source: GameCardInstance;
  controller?: Owner;
  zone?: ZoneId | null;
  targets?: AbilityTarget[];
  costsPaid?: boolean;
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

export type DeclareBattlefieldAttackResult =
  | {
      state: GameState;
      pendingCombat: PendingCombat;
      attacker: GameCardInstance;
      defender: GameCardInstance | null;
      resolvedCombat?: null;
    }
  | {
      state: GameState;
      pendingCombat: null;
      attacker: GameCardInstance;
      defender: null;
      resolvedCombat: BattlefieldAttackResult;
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

