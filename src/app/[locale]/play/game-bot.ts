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
const MAX_BOT_ATTACK_STEPS = 12;

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

  let nextState = BOT_TURN_STEPS
    .filter((step) => step !== 'attackBattlefield')
    .reduce((currentState, step) => applyBotTurnStep(currentState, step), state);

  for (let index = 0; index < MAX_BOT_ATTACK_STEPS; index += 1) {
    if (
      nextState.winner ||
      nextState.pendingCombat ||
      nextState.pendingChoice ||
      nextState.phase !== 'main' ||
      nextState.activePlayer !== 'opponent'
    ) {
      break;
    }

    const afterAttack = applyBotTurnStep(nextState, 'attackBattlefield');

    if (afterAttack === nextState) {
      break;
    }

    nextState = afterAttack;
  }

  return nextState;
}

export function resolveAutomaticBotTurn(state: GameState): GameState {
  if (state.winner || state.pendingCombat || state.phase !== 'main' || state.activePlayer !== 'opponent') {
    return state;
  }

  return advanceToNextTurn(runBotTurn(state));
}

export function playFirstBotCounter(state: GameState): GameState | null {
  const counterChoice = chooseBotCounter(state);

  if (!counterChoice) {
    return null;
  }

  const result = playCounterCard(
    state,
    'opponent',
    counterChoice.counterInstanceId,
    counterChoice.targetInstanceId ? { targetInstanceId: counterChoice.targetInstanceId } : undefined
  );
  return 'error' in result ? null : result.state;
}

export type { BotTurnStep } from './bot-policy';
