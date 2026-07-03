import { applyCardAction } from './game-actions';
import {
  chooseBotCounter,
  chooseBotTurnCommand,
  type BotTurnStep,
} from './bot-policy';
import {
  advanceToNextTurn,
  declareBattlefieldAttack,
  playCounterCard,
  resolveBattlefieldAttack,
  type GameState,
} from './game-rules';

export const BOT_TURN_STEPS = ['supply', 'stageUnit', 'stageUnit', 'attackBattlefield'] as const satisfies BotTurnStep[];

export function applyBotTurnStep(state: GameState, step: BotTurnStep): GameState {
  const command = chooseBotTurnCommand(state, step);

  if (!command) {
    return state;
  }

  if (command.type === 'card') {
    return applyCardAction(state, command.action).state;
  }

  const declared = declareBattlefieldAttack(
    state,
    'opponent',
    command.attackerInstanceId,
    command.targetZone
  );

  if (!('error' in declared)) {
    return declared.state;
  }

  const resolved = resolveBattlefieldAttack(
    state,
    'opponent',
    command.attackerInstanceId,
    command.targetZone
  );
  return 'error' in resolved ? state : resolved.state;
}

export function runBotTurn(state: GameState): GameState {
  if (state.winner || state.pendingCombat || state.phase !== 'main' || state.activePlayer !== 'opponent') {
    return state;
  }

  return BOT_TURN_STEPS.reduce((nextState, step) => applyBotTurnStep(nextState, step), state);
}

export function resolveAutomaticBotTurn(state: GameState): GameState {
  if (state.winner || state.pendingCombat || state.phase !== 'main' || state.activePlayer !== 'opponent') {
    return state;
  }

  return advanceToNextTurn(runBotTurn(state));
}

export function playFirstBotCounter(state: GameState): GameState | null {
  const counterInstanceId = chooseBotCounter(state);

  if (!counterInstanceId) {
    return null;
  }

  const result = playCounterCard(state, 'opponent', counterInstanceId);
  return 'error' in result ? null : result.state;
}

export type { BotTurnStep } from './bot-policy';
