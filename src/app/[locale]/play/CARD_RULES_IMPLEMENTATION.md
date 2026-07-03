# Card Rules Implementation

Card rules are implemented from canonical card text, not stored as executable database logic.

## Sources of Truth

- `src/data/cards.json` and Supabase `cards.rules_text` hold printed card text and card facts.
- `card-definitions.ts` derives card type, keywords, default play destination, and printed triggers from that text.
- `card-abilities.ts` maps stable card ids to executable ability handlers.
- `game-rules.ts` owns deterministic game-state transitions and ability trigger resolution.

## Current Trigger Flow

- Playing a card from hand fires `onPlay`.
- Playing a card into staging or a battlefield zone fires `onEnter`.
- Ordinary board movement, including attacks into combat zones and retreats to staging, does not fire `onEnter`.
- Implemented ability handlers resolve through `CARD_ABILITY_REGISTRY`.
- Printed but unimplemented triggers are logged in the action log.

## Phase 1 Status

- Manual supply is limited to 1 card from hand during your own main turn.
- Staging accepts units only.
- Battlefield zones accept territories from hand and ready units from staging.
- Units enter staging exhausted unless they have `Blitz`.
- Equipment must be attached to one of your units in staging when played.
- Attached equipment is rendered tucked under its host unit instead of as a separate free-standing staging card.
- Attachment state is stabilized after board moves; equipment without a legal same-zone unit host is sent to graveyard automatically.
- Territories can be played face down to a battlefield at 0 cost.
- Face-down territories can be flipped face up during your main phase by paying their printed supply cost.
- Manual moves to deck, hand, graveyard, and banish are blocked unless a future card ability implements them.

## Next Rule Work

1. Add combat/death transitions, then fire `onDeath` when a unit leaves play because it died.
2. Add target selection state for abilities with required targets.
3. Add token creation helpers before implementing token-producing cards.
4. Add turn-duration effect state for effects that last until end of turn, next ready phase, or next main phase.
5. Add scoring resolution and fire `onScore`.
6. Add activated ability UI for `{Exhaust}` abilities.

## Database Guidance

Do not add executable rule columns to the database yet. Add database fields only if they support data ownership or querying, such as an official oracle text field, errata version, or card legality metadata.
