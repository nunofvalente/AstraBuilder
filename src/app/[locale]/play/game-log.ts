import type {
  GamePhase,
  GameState,
  LogEntry,
  LogEntryInput,
  Owner,
} from './game-types';
export function createLogEntry({
  turn = null,
  phase = null,
  activePlayer = null,
  prefix,
  cardName,
  cardNames,
  suffix,
}: {
  turn?: number | null;
  phase?: GamePhase | null;
  activePlayer?: Owner | null;
  prefix?: string;
  cardName?: string;
  cardNames?: string[];
  suffix: string;
}): LogEntry {
  return {
    id: crypto.randomUUID(),
    turn,
    phase,
    activePlayer,
    prefix,
    cardName,
    cardNames,
    suffix,
  };
}

export function addLogEntry(state: GameState, entry: LogEntryInput): LogEntry[] {
  const message = `${entry.prefix ?? ''}${entry.cardName ?? ''}${entry.suffix}`;
  const stateCardNames = [
    ...Object.values(state.zones).flatMap((zone) => zone.map((instance) => instance.card.name)),
    ...Object.values(state.opponentZones).flatMap((zone) => zone.map((instance) => instance.card.name)),
  ];
  const cardNames = [...new Set([
    ...(entry.cardNames ?? []),
    ...(entry.cardName ? [entry.cardName] : []),
    ...stateCardNames.filter((name) => name && message.includes(name)),
  ])];

  return [
    createLogEntry({
      ...entry,
      cardNames,
      turn: state.turn,
      phase: state.phase,
      activePlayer: state.activePlayer,
    }),
    ...state.log,
  ].slice(0, 40);
}

