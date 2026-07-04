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

## Implemented Affinities

- Nox cards `IMP001` through `IMP032` are registered and integrated with the simulator.
- Lux cards `IMP033` through `IMP063` are registered and integrated with the simulator.
- Lux integration includes Provoke, combat stat modifiers, damage prevention, Drone creation, targeted tactics and counters, graveyard recovery, temporary supply, end-turn choices, and Quarantine Zone rules.
- Caelum cards `IMP064` through `IMP095` are registered.
- Caelum integration includes targeted unit return, draw and draw-discard effects, Caelum unit cost reduction, temporary influence/stat bonuses, tactic-play stat triggers, ability suppression, skip-ready effects, face-down territory reveal/return, force retreat, combat-zone score locks, extra draw, supply-to-hand choices, territory destruction, combat-card bounce, top-deck removal, delayed death banish-and-return, activated destroy, Disruption Staff equipped-unit death discard, Drifter's Necklace unoccupied-zone rewards, Freight Module equipped-unit score supply, Archive Ruins tactic recovery on scoring, Jamming Tower enemy-score discard, Radar Beacon readying, on-retreat damage, and Unyielding Storm turn-start/end-turn behavior with player destination choices.
- Caelum partial implementations:
  - `IMP073` prevents Caelum tactic targeting through implemented Caelum targeted tactics; cross-affinity tactic targeting protection is limited by each affinity handler's current targeting filters.
  - `IMP083` returns combat units and loose items to hand, sends attached equipment to graveyard with its host leaving combat, and destroys territories.
  - `IMP095` prompts the player for a different combat-zone destination at turn start; bot-controlled copies choose the first legal destination deterministically.

## Simulator Status

- Manual supply is limited to 1 card from hand during your own main turn.
- Staging accepts units only.
- Battlefield zones accept territories from hand and ready units from staging.
- Units enter staging exhausted unless they have `Blitz`.
- Equipment must be attached to one of your units in staging when played.
- Attached equipment is rendered tucked under its host unit instead of as a separate free-standing staging card.
- Attachment state is stabilized after board moves; equipment without a legal same-zone unit host is sent to graveyard automatically.
- Territories can be played face down to a battlefield at 0 cost.
- Face-down territories can be flipped face up on a later turn during your main phase by paying their printed supply cost.
- Manual moves to deck, hand, graveyard, and banish are blocked unless a future card ability implements them.
- Combat, death, scoring, counter windows, targeted choices, token creation, and turn-duration effects are active.

## Database Guidance

Do not add executable rule columns to the database yet. Add database fields only if they support data ownership or querying, such as an official oracle text field, errata version, or card legality metadata.
