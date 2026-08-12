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

- Nox cards `IMP001` through `IMP032` are registered and integrated with the simulator, including player-choice discard prompts for Valrathian Zealot and other forced-discard death effects.
- Lux cards `IMP033` through `IMP063` plus balance extra `IMP161` are registered and integrated with the simulator.
- Lux integration includes Provoke, combat stat modifiers, damage prevention, Drone creation, targeted tactics and counters, graveyard recovery, temporary supply, end-turn choices, Quarantine Zone rules, and Fortified Pillbox zone health bonuses.
- Caelum cards `IMP064` through `IMP095` are registered.
- Caelum integration includes targeted unit return, draw and draw-discard effects, Caelum unit cost reduction, temporary influence/stat bonuses, tactic-play stat triggers, ability suppression, skip-ready effects, face-down territory reveal/return, force retreat, combat-zone score locks, extra draw, supply-to-hand choices, territory destruction, combat-card bounce, top-deck removal, delayed death banish-and-return, activated destroy, Disruption Staff equipped-unit death discard, Drifter's Necklace unoccupied-zone rewards, Freight Module equipped-unit score supply, Archive Ruins tactic recovery on scoring, Jamming Tower enemy-score discard, Radar Beacon readying, on-retreat damage, and Unyielding Storm turn-start/end-turn behavior with player destination choices. Optional item and territory triggers from the same score event are queued in rules order, including duplicate Freight Modules and mixed Freight Module, Archive Ruins, War Banner, and Jamming Tower triggers.
- Caelum partial implementations:
  - `IMP073` prevents Caelum tactic targeting through implemented Caelum targeted tactics; cross-affinity tactic targeting protection is limited by each affinity handler's current targeting filters.
  - `IMP083` returns combat units and loose items to hand, sends attached equipment to graveyard with its host leaving combat, and destroys territories.
  - `IMP095` prompts the player for a different combat-zone destination at turn start; bot-controlled copies choose the first legal destination deterministically.
- Solara cards `IMP096` through `IMP126` plus balance extra `IMP162` are registered.
- Solara integration includes supply exhaustion and skip-ready, entry-turn attack restrictions, attacking combat-damage prevention, death draw, temporary and printed Glory, Flanking attacks from combat zones, temporary top-deck play/supply access, Lingyi one-time banish play with Blitz, Rockjaw retreat-and-replace, Fortify, multi-unit sacrifice/destruction, compulsory Voracious Wyvern ready attacks, on-attack damage, defend readying, targeted and mass damage, delayed death rewards, territory/item destruction, temporary attack bonuses, ready/exhaust effects, Glory equipment, optional Vengeance recovery, Ashfang Rally Point base stats, Ruins of the Precursors counters and payout, Wyrmscar Peaks end-turn retreat choices, and Landbreaker same-zone territory destruction with temporary stat bonuses.
- Solara simulator representations:
  - `IMP102` Hongzhen and `IMP109` Ruins Looter move the revealed top card into its controller's hand with a turn marker. It remains public while marked, can be played or supplied through normal actions, and returns to the top of the deck at end of turn if unused.
  - `IMP105` Lingyi marks the chosen banished unit with one-time play permission. Playing it from banish pays its normal cost, grants Blitz for that play, and consumes both markers.
  - `IMP112` Voracious Wyvern uses a visible target choice for the player and the first legal enemy-controlled zone for the bot, then enters the normal counter and combat flow. A skipped ready does not trigger its attack, and resolving its upkeep choice resumes the normal turn-start draw.
- Terra cards `IMP127` through `IMP158` plus balance extra `IMP163` are registered.
- Terra integration includes Fortify, Provoke, Impede from units/equipment/territories, Akeno combat healing, Gaia free plays and death return, top-three unit selection, mass exhaust, Flanking, score-triggered retreat, targeted damage, Sylvan Rallier activation, Verdant Protector scoring locks, forced Yako attacks, multi-step tactic costs and damage, turn-duration counter buffs, combat retreat counters, Lifecycle Katana recovery, Elorhain defend/death effects, Entangling Wilds end-turn exhaustion, Escape Route upkeep, Overgrown Factory draw choices, and Shadowveil Hunter Swift/on-enter damage.
- Terra simulator representations and limitations:
  - `IMP130` Gaia offers the free card first; a chosen territory then opens a combat-zone choice. Bot-controlled Gaia uses the first legal deterministic choice.
  - `IMP131` Grove Shaman preserves the existing relative order when placing unchosen cards on the bottom instead of prompting for a bottom-deck ordering.
  - `IMP144` Yako Illusionist uses a unit choice followed by a zone choice and sends the forced attack through the normal counter/combat flow.
  - `IMP146` Predatory Strike keeps the selected unit's +2/+0 and finishes resolving when no exhausted combat unit is available, instead of opening an empty mandatory target choice.
  - `IMP157` Escape Route applies its -2 attack modifier through the shared current-attack calculation while an enemy unit attacks its zone. At end of turn, players choose whether to pay 2 ready supply or sacrifice each face-up copy; bots pay when possible and otherwise sacrifice.
  - `IMP158` Overgrown Factory triggers for manual and Terra ability retreats and for a successful Flanking capture. Cross-affinity bounce effects that move a unit directly to hand do not currently invoke the Factory.
- Neutral non-token cards `IMP159`, `IMP160`, `IMP164`, and `IMP165` are registered.
- Neutral integration includes Excavator's optional same-zone territory destruction on attack, Supply Carrier's activated temporary supply generation, War Banner equipped-unit score reveal/draw, and Minefield flip damage plus sacrifice.
- Neutral simulator representations:
  - `IMP164` War Banner draws the revealed top card only when it is a unit; non-unit top cards remain on top of the deck and no separate persistent reveal state is created.

## Simulator Status

- Before placing starting supply, the player must either keep the six-card opening hand or take one mulligan. A mulligan shuffles the full opening hand back into the deck and draws six replacement cards; it cannot be repeated.
- Manual supply is limited to 1 card from hand during your own main turn.
- Staging accepts units only.
- Battlefield zones accept territories from hand and ready units from staging.
- Ready units can retreat from a battlefield during their controller's main phase, including immediately after taking control of an empty battlefield. Units exhausted by combat cannot retreat as a manual unit action.
- Units enter staging exhausted unless they have `Blitz`.
- Renowned units are limited to one in play per card name for each controller.
- Equipment must be attached to one of your units in staging when played.
- Attached equipment is rendered tucked under its host unit instead of as a separate free-standing staging card.
- Units with persistent or temporary rule changes render effect badges; this includes Guinea Pig copies played from the graveyard, which are visibly marked to be banished on death.
- Unit cards render their current attack, health, and influence on the board, including Selena's ready/exhausted ally bonus and Vermillion's draw-based influence.
- Attachment state is stabilized after board moves; equipment without a legal same-zone unit host is sent to graveyard automatically.
- Territories can be played face down to a battlefield at 0 cost.
- Face-down territories can be flipped face up on a later turn during your main phase by paying their printed supply cost.
- During a counter window, flipping a face-down territory, playing a counter card, or activating an eligible unit ability passes priority once; if the opponent declines to counter, the window closes without returning priority for another consecutive counter. Activated ability costs, including Assimilating Abomination's sacrifice cost, are paid when the ability is added to the stack, and their effects resolve in normal last-in-first-out order. Abilities restricted to outside combat, such as Valrathian Dreadnought, remain unavailable.
- Manual moves to deck, hand, graveyard, and banish are blocked unless a future card ability implements them.
- Multiplayer projections redact opponent deck, hand, face-down supply, face-down territory, and unrevealed Airdrop identities from both board payloads and action-log metadata.
- Combat, death, scoring, counter windows, targeted choices, token creation, and turn-duration effects are active.

## Database Guidance

Do not add executable rule columns to the database yet. Add database fields only if they support data ownership or querying, such as an official oracle text field, errata version, or card legality metadata.
