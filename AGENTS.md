# Agent Guidance

This repository is a Next.js app for building decks and simulating games of Echoes of Astra. Keep changes scoped, deterministic, and consistent with the existing play-module architecture.

## Working Practices

- Always run Git and project commands from the repository root: `C:\Users\nunov\Documents\astrabuilder`.
- On Windows shells used by Codex, `workdir` may not be honored. Prefer prefixing shell commands with:
  `Set-Location -LiteralPath 'C:\Users\nunov\Documents\astrabuilder';`
- Inspect `git status -sb` before edits. The worktree may contain user or agent changes; do not revert changes you did not make.
- Prefer `rg` for searching and read the local implementation before introducing new patterns.
- Use `apply_patch` for hand edits.
- Keep files ASCII unless the edited file already requires non-ASCII content.

## Validation Commands

Use these checks before committing simulator changes:

```powershell
Set-Location -LiteralPath 'C:\Users\nunov\Documents\astrabuilder'; node node_modules\typescript\bin\tsc --noEmit --project tsconfig.json
Set-Location -LiteralPath 'C:\Users\nunov\Documents\astrabuilder'; node node_modules\vitest\vitest.mjs run "src/app/[locale]/play"
Set-Location -LiteralPath 'C:\Users\nunov\Documents\astrabuilder'; npm test -- --run
```

The focused play suite is usually enough while iterating. Run the full test suite before publishing a branch or PR.

## Simulator Architecture

The play simulator lives under `src/app/[locale]/play`.

- `game-types.ts` defines serialized game state and pending-choice shapes.
- `game-rules.ts` owns deterministic state transitions, combat, turn advance, scoring, choices, and ability trigger resolution.
- `game-actions.ts` handles manual card movement and play costs.
- `card-definitions.ts` derives card type, keywords, default play destinations, and printed triggers from card text.
- `card-abilities.ts` is the shared registry that wires card ids to executable ability handlers.
- Affinity-specific files hold ability metadata and handler logic, for example:
  - `nox-card-abilities.ts`
  - `nox-card-ability-handlers.ts`
  - `lux-card-abilities.ts`
  - `lux-card-ability-handlers.ts`
- Tests should sit beside the module they cover, especially `*-card-abilities.test.ts`, `game-rules.test.ts`, `game-actions.test.ts`, and UI tests when rendering behavior changes.

## Card Ability Patterns

When implementing a new affinity or card group:

- Read the equivalent Nox, Lux, and Solara implementations first.
- Define ability metadata in an affinity-specific `*-card-abilities.ts` file.
- Put state-changing behavior in an affinity-specific `*-card-ability-handlers.ts` file.
- Register implemented abilities through `CARD_ABILITY_REGISTRY` in `card-abilities.ts`.
- Prefer small, reusable helpers in `game-rules.ts` only when multiple cards need the same deterministic operation.
- Keep card-specific special cases close to handlers unless they are part of the core rules model.
- Trigger behavior should follow the existing flow:
  - Playing from hand fires `onPlay`.
  - Entering staging or a battlefield from play fires `onEnter`.
  - Ordinary movement, attacking into zones, and retreating do not fire `onEnter`.
  - Death and ready triggers run through `triggerCardAbilities`.
- If printed text requires an unmodeled mechanic, implement the smallest useful deterministic behavior, add tests, and document the limitation.

## Choices, Targets, and Bot Behavior

- Player decisions should use `pendingChoice` rather than hidden synchronous prompts.
- Add new pending-choice variants in `game-types.ts` only when existing variants do not fit.
- Preserve turn advancement by using `resumeTurnAdvance` for choices that interrupt scoring or end-turn flow.
- Bot choices should be deterministic and simple. Prefer existing first-legal-target behavior unless a card needs a stronger policy.
- Do not skip visible combat feedback. Bot combat should leave damage and exhaustion visible briefly before automatic turn advance readies cards.

## UI Expectations

- Keep the simulator dense and board-focused. Do not add landing-page or marketing-style layouts.
- Render combat-relevant state directly on cards where possible: damage, ready/exhausted state, current attack/health, influence, counters, and attachments.
- Use existing components in `game-board-ui.tsx` and `game-client-ui.tsx`.
- Localise user-facing strings whenever adding or changing UI text. Use the existing locale dictionaries and helpers instead of hard-coded English strings, including labels, buttons, empty states, modal text, logs, and card text displayed to players.
- Avoid adding visible explanatory text for mechanics unless the user needs to make a decision.
- If a rules change affects targeting or card state visibility, add or update UI tests.

## Documentation

Update `src/app/[locale]/play/CARD_RULES_IMPLEMENTATION.md` whenever card rules coverage changes.

Document:

- newly implemented card ids or affinity ranges
- partial implementations and why they are partial
- intentionally skipped behavior
- any simulator limitation that differs from printed card text

Do not add executable rule columns to the database. Card text and card facts remain data; executable rules belong in the simulator code.

## Git and PRs

- Do not create a commit for every prompt or iteration. Keep related work uncommitted while a feature is being refined, then create one intentional commit only when the user explicitly asks to commit/push or confirms the feature is complete.
- Stage explicit paths. Do not use `git add -A` when unrelated files are present.
- Use terse commit messages that describe the implemented behavior.
- Open draft PRs by default unless asked otherwise.
- PR descriptions should include what changed, why, user impact, root cause for fixes, and validation commands.
