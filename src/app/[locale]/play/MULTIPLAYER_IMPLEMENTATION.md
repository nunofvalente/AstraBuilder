# Private Room Multiplayer

Private multiplayer uses short room codes and a server-authoritative match state.
Bot practice remains client-side and continues to use the same deterministic rule
functions.

## Data model

- `game_rooms` stores the code, two seats, selected deck ids, lifecycle status,
  expiry, presence timestamps, and the optional rematch room.
- `game_matches` stores immutable deck snapshots, setup state, the canonical
  serialized `GameState`, status, first player, and an optimistic revision.
- `game_match_actions` stores the accepted action payload for each revision.
- `game_rematch_requests` and `game_rematch_runs` coordinate a race-safe rematch.

Raw `game_matches` rows are not client-readable. They contain both private hands
and deck order. All reads go through `/api/rooms/[code]/match`, which verifies the
seat and returns a perspective-specific projection with the opponent's private
cards replaced by placeholders.

## Match flow

1. A signed-in player creates a room with a saved legal deck or bundled starter.
2. A second signed-in player joins by code with their deck.
3. The server snapshots both decks and deals each private opening hand.
4. Keep/mulligan and starting supply resolve independently on the normal board.
5. The server rolls the first player and persists the canonical board.
6. Every action includes the last observed revision. The server maps either seat
   to the human `player` perspective, runs the shared rules, maps back to canonical
   host/guest state, increments the revision, and records the action.
7. A rules victory, concession, setup departure, or expired reconnect grace marks
   both room and match finished.

## Supported interactions

- keep, mulligan, and starting supply
- normal manual supply and hand plays
- sacrifice, discard, and reanimation additional play costs
- staging attacks, combat, counter priority, and targeted counters
- activated abilities and pending card/zone choices
- pass turn, concede, setup leave, reconnect grace, result screen, and rematch

## Presence and recovery

Participants heartbeat every ten seconds. After twenty seconds the opponent sees
a reconnect warning. After sixty seconds, the connected participant is awarded
the win. Refreshing reconstructs the board from the persisted match revision.

Expired waiting rooms are removed opportunistically when a new room is created.
Finished rooms are retained for private match history and action replay data.

## Deferred scope

Public spectators, a live-games directory, and matchmaking are intentionally
deferred. Private code rooms are the current product scope.
