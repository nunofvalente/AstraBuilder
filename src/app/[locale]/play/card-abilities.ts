import type { Card } from '../create/deck-builder/types';
import { createCaelumAbilityHandlers } from './caelum-card-ability-handlers';
import { createCaelumCardAbilityRegistry } from './caelum-card-abilities';
import {
  recordCardsDrawn,
  type GameCardInstance,
  type GameState,
  type Owner,
  type ZoneId,
} from './game-rules';
import { createNoxAbilityHandlers } from './nox-card-ability-handlers';
import { createNoxCardAbilityRegistry } from './nox-card-abilities';
import { createLuxAbilityHandlers } from './lux-card-ability-handlers';
import { createLuxCardAbilityRegistry } from './lux-card-abilities';
import { createSolaraCardAbilityRegistry } from './solara-card-abilities';
import { createSolaraAbilityHandlers } from './solara-card-ability-handlers';
import { createTerraAbilityHandlers } from './terra-card-ability-handlers';
import { createTerraCardAbilityRegistry } from './terra-card-abilities';
import { createNeutralAbilityHandlers } from './neutral-card-ability-handlers';
import { createNeutralCardAbilityRegistry } from './neutral-card-abilities';

export type AbilityTrigger =
  | 'onPlay'
  | 'onEnter'
  | 'onDeath'
  | 'onAttack'
  | 'onDefend'
  | 'onScore'
  | 'onReady'
  | 'onFlip'
  | 'onRetreat'
  | 'activated'
  | 'static';

export type AbilityTiming = 'automatic' | 'optional' | 'activated' | 'static';

export type AbilityTargetType = 'card' | 'unit' | 'territory' | 'supply' | 'player' | 'zone' | 'none';

export type AbilityTargetScope =
  | 'self'
  | 'friendly'
  | 'enemy'
  | 'any'
  | 'friendlyZone'
  | 'enemyZone'
  | 'anyZone'
  | 'controller'
  | 'opponent';

export type AbilityTargetRequirement = {
  type: AbilityTargetType;
  scope: AbilityTargetScope;
  optional?: boolean;
  count?: number;
};

export type AbilityEvent = {
  trigger: AbilityTrigger;
  source: GameCardInstance;
  controller: Owner;
  zone: ZoneId | null;
  targets?: AbilityTarget[];
  costsPaid?: boolean;
};

export type AbilityTarget =
  | { type: 'card'; instanceId: string }
  | { type: 'player'; owner: Owner }
  | { type: 'zone'; zone: ZoneId };

export type AbilityContext = {
  state: GameState;
  event: AbilityEvent;
};

export type AbilityResolution = {
  state: GameState;
  resolved: boolean;
  pendingTargets?: AbilityTargetRequirement[];
  followUpEvents?: AbilityEvent[];
  message?: string;
};

export type AbilityHandler = (context: AbilityContext) => AbilityResolution;

export type TriggeredAbilityDefinition = {
  id: string;
  trigger: AbilityTrigger;
  timing: AbilityTiming;
  text: string;
  targets?: AbilityTargetRequirement[];
  resolve?: AbilityHandler;
};

export type CardAbilityDefinition = {
  cardId: string;
  abilities: TriggeredAbilityDefinition[];
};

export function createDrawCardsAbility(count: number): AbilityHandler {
  return ({ state, event }) => {
    if (count <= 0) {
      return { state, resolved: false };
    }

    if (event.controller === 'player') {
      const drawn = state.zones.deck.slice(0, count);

      return {
        state: recordCardsDrawn({
          ...state,
          zones: {
            ...state.zones,
            deck: state.zones.deck.slice(drawn.length),
            hand: [...state.zones.hand, ...drawn],
          },
        }, event.controller, drawn.length),
        resolved: drawn.length > 0,
        message: `${event.source.card.name} drew ${drawn.length} ${drawn.length === 1 ? 'card' : 'cards'}.`,
      };
    }

    const drawn = state.opponentZones.deck.slice(0, count);

    return {
      state: recordCardsDrawn({
        ...state,
        opponentZones: {
          ...state.opponentZones,
          deck: state.opponentZones.deck.slice(drawn.length),
          hand: [...state.opponentZones.hand, ...drawn],
        },
      }, event.controller, drawn.length),
      resolved: drawn.length > 0,
      message: `${event.source.card.name} drew ${drawn.length} ${drawn.length === 1 ? 'card' : 'cards'} for Bot.`,
    };
  };
}

export const TRIGGER_LABELS: Record<AbilityTrigger, string> = {
  onPlay: 'On Play',
  onEnter: 'On Enter',
  onDeath: 'On Death',
  onAttack: 'On Attack',
  onDefend: 'On Defend',
  onScore: 'On Score',
  onReady: 'On Ready',
  onFlip: 'On Flip',
  onRetreat: 'On Retreat',
  activated: 'Activated',
  static: 'Static',
};

const PRINTED_TRIGGER_PATTERNS: Array<{ trigger: AbilityTrigger; pattern: RegExp }> = [
  { trigger: 'onPlay', pattern: /\bon play\b/i },
  { trigger: 'onEnter', pattern: /\bon enter\b/i },
  { trigger: 'onDeath', pattern: /\bon death\b/i },
  { trigger: 'onAttack', pattern: /\bon attack\b/i },
  { trigger: 'onDefend', pattern: /\bon defend\b/i },
  { trigger: 'onScore', pattern: /\bon score\b/i },
  { trigger: 'onReady', pattern: /\bon ready\b/i },
  { trigger: 'onFlip', pattern: /\bon flip\b/i },
  { trigger: 'onRetreat', pattern: /\bon retreat\b/i },
  { trigger: 'activated', pattern: /\{exhaust\}|sacrifice [^:]+:/i },
  { trigger: 'static', pattern: /(?:^|\n)\s*(?:while|your|friendly|enemy|equipped|this unit can't|units in this zone|attacking units)\b/i },
];

const noxHandlers = createNoxAbilityHandlers();
const luxHandlers = createLuxAbilityHandlers();
const caelumHandlers = createCaelumAbilityHandlers();
const solaraHandlers = createSolaraAbilityHandlers();
const terraHandlers = createTerraAbilityHandlers();
const neutralHandlers = createNeutralAbilityHandlers();

export const CARD_ABILITY_REGISTRY: Record<string, CardAbilityDefinition> = {
  ...createNoxCardAbilityRegistry(noxHandlers),
  ...createLuxCardAbilityRegistry(luxHandlers),
  ...createCaelumCardAbilityRegistry(caelumHandlers),
  ...createSolaraCardAbilityRegistry(solaraHandlers),
  ...createTerraCardAbilityRegistry(terraHandlers),
  ...createNeutralCardAbilityRegistry(neutralHandlers),
};

export function getPrintedAbilityTriggers(card: Card): AbilityTrigger[] {
  const triggers = PRINTED_TRIGGER_PATTERNS.filter(({ pattern }) => pattern.test(card.rulesText)).map(({ trigger }) => trigger);
  return Array.from(new Set(triggers));
}

export function getRegisteredCardAbilities(cardId: string): CardAbilityDefinition | null {
  return CARD_ABILITY_REGISTRY[cardId] ?? null;
}

export function getImplementedAbilitiesForTrigger(cardId: string, trigger: AbilityTrigger): TriggeredAbilityDefinition[] {
  return getRegisteredCardAbilities(cardId)?.abilities.filter((ability) => ability.trigger === trigger && ability.resolve) ?? [];
}

export function createUnimplementedAbilityMessage(card: Card, trigger: AbilityTrigger): string {
  return `${TRIGGER_LABELS[trigger]} is detected on ${card.name}, but this ability is not implemented yet.`;
}
