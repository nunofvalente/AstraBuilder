import type {
  AbilityHandler,
  CardAbilityDefinition,
  TriggeredAbilityDefinition,
} from './card-abilities';

type NoxAbilityHandlers = {
  acknowledgeRule: AbilityHandler;
  assimilatingAbomination: AbilityHandler;
  cadaverSupplier: AbilityHandler;
  ebonblightInvoker: AbilityHandler;
  lucilleEnter: AbilityHandler;
  lucilleScore: AbilityHandler;
  nerezza: AbilityHandler;
  nocturneAgent: AbilityHandler;
  noxhavenResearcher: AbilityHandler;
  tenebrosaDefend: AbilityHandler;
  valrathianCommissar: AbilityHandler;
  valrathianZealot: AbilityHandler;
  vampireRetainer: AbilityHandler;
  contagiousDisposal: AbilityHandler;
  demonicAdvance: AbilityHandler;
  exterminate: AbilityHandler;
  eyeForAnEye: AbilityHandler;
  unethicalResearch: AbilityHandler;
  blindingMist: AbilityHandler;
  killingBlow: AbilityHandler;
  quashInsurrection: AbilityHandler;
};

function rule(
  id: string,
  trigger: TriggeredAbilityDefinition['trigger'],
  timing: TriggeredAbilityDefinition['timing'],
  text: string,
  resolve: AbilityHandler,
  targets?: TriggeredAbilityDefinition['targets']
): TriggeredAbilityDefinition {
  return { id, trigger, timing, text, resolve, ...(targets ? { targets } : null) };
}

export function createNoxCardAbilityRegistry(
  handlers: NoxAbilityHandlers
): Record<string, CardAbilityDefinition> {
  const staticRule = (id: string, text: string) =>
    rule(id, 'static', 'static', text, handlers.acknowledgeRule);

  return {
    IMP001: {
      cardId: 'IMP001',
      abilities: [
        rule(
          'IMP001-sacrifice-unit-ready-self',
          'activated',
          'activated',
          'Sacrifice another unit: Ready this unit.',
          handlers.assimilatingAbomination,
          [{ type: 'unit', scope: 'friendly', count: 1 }]
        ),
      ],
    },
    IMP002: {
      cardId: 'IMP002',
      abilities: [
        rule(
          'IMP002-on-death-create-experiment',
          'onDeath',
          'automatic',
          'On Death: Create a 2/2 Experiment unit token with 0 influence.',
          handlers.cadaverSupplier
        ),
      ],
    },
    IMP003: {
      cardId: 'IMP003',
      abilities: [staticRule('IMP003-tactic-discount', 'Your tactics cost {1} less to play.')],
    },
    IMP004: {
      cardId: 'IMP004',
      abilities: [staticRule('IMP004-additional-sacrifice-cost', 'As an additional cost to play this unit, sacrifice a unit.')],
    },
    IMP005: {
      cardId: 'IMP005',
      abilities: [staticRule('IMP005-additional-discard-cost', 'As an additional cost to play this unit, discard a card.')],
    },
    IMP006: {
      cardId: 'IMP006',
      abilities: [
        rule(
          'IMP006-on-play-reanimate-non-renowned-unit',
          'onPlay',
          'automatic',
          'On Play: Return a non-Renowned unit from your graveyard to your staging area.',
          handlers.ebonblightInvoker,
          [{ type: 'unit', scope: 'friendly', count: 1 }]
        ),
      ],
    },
    IMP007: {
      cardId: 'IMP007',
      abilities: [staticRule('IMP007-graveyard-play', 'You may play this card from your graveyard. If you do, banish it when it dies.')],
    },
    IMP008: {
      cardId: 'IMP008',
      abilities: [
        rule(
          'IMP008-on-attack-death-victory-loss',
          'onAttack',
          'automatic',
          'On Attack: When target defending unit dies this turn, its controller loses 1 victory point.',
          handlers.acknowledgeRule
        ),
      ],
    },
    IMP009: {
      cardId: 'IMP009',
      abilities: [staticRule('IMP009-graveyard-play-ready', 'You may play this card from your graveyard. If you do, it enters ready and is banished when it dies.')],
    },
    IMP010: {
      cardId: 'IMP010',
      abilities: [
        rule('IMP010-on-enter-create-experiment', 'onEnter', 'automatic', 'On Enter: Create a 2/2 Experiment unit token with 0 influence.', handlers.lucilleEnter),
        rule('IMP010-on-score-sacrifice-staging-units', 'onScore', 'optional', 'On Score: You may sacrifice any number of units in your staging area to gain that many victory points.', handlers.lucilleScore),
      ],
    },
    IMP011: {
      cardId: 'IMP011',
      abilities: [
        rule('IMP011-on-play-sacrifice-and-steal', 'onPlay', 'optional', 'On Play: Sacrifice another unit. If you do, take control of target enemy unit in a combat zone and move it into your staging area exhausted.', handlers.nerezza),
      ],
    },
    IMP012: {
      cardId: 'IMP012',
      abilities: [
        rule('IMP012-on-enter-mark-discard', 'onEnter', 'automatic', 'On Enter: If target enemy unit dies this turn, its controller discards a card.', handlers.nocturneAgent),
      ],
    },
    IMP013: { cardId: 'IMP013', abilities: [] },
    IMP014: {
      cardId: 'IMP014',
      abilities: [
        rule('IMP014-on-enter-create-experiment', 'onEnter', 'automatic', 'On Enter: Create a 2/2 Experiment unit token with 0 influence.', handlers.noxhavenResearcher),
      ],
    },
    IMP015: {
      cardId: 'IMP015',
      abilities: [
        rule('IMP015-on-defend-ready', 'onDefend', 'automatic', 'On Defend: Ready this unit.', handlers.tenebrosaDefend),
        staticRule('IMP015-block-opponent-victory-points', "While this unit controls a combat zone, opponents can't gain victory points."),
      ],
    },
    IMP016: {
      cardId: 'IMP016',
      abilities: [
        rule('IMP016-exhaust-sacrifice-drain', 'activated', 'activated', '{Exhaust}, Sacrifice a unit: Target opponent loses 1 victory point.', handlers.valrathianCommissar, [{ type: 'unit', scope: 'friendly', count: 1 }]),
      ],
    },
    IMP017: {
      cardId: 'IMP017',
      abilities: [
        rule('IMP017-on-death-opponent-discard', 'onDeath', 'automatic', 'On Death: Target opponent discards a card.', handlers.valrathianZealot),
      ],
    },
    IMP018: {
      cardId: 'IMP018',
      abilities: [
        rule('IMP018-on-death-influence', 'onDeath', 'automatic', 'On Death: Target friendly unit gets +1 influence until the end of your next turn.', handlers.vampireRetainer),
      ],
    },
    IMP019: {
      cardId: 'IMP019',
      abilities: [staticRule('IMP019-drawn-cards-influence', "This unit has base influence equal to the number of cards you've drawn this turn, to a maximum of 3.")],
    },
    IMP020: {
      cardId: 'IMP020',
      abilities: [
        rule('IMP020-each-player-discard-create', 'onPlay', 'automatic', 'Starting from the next player, each player discards a card from their hand. If they do, they create a 2/2 Experiment unit token with 0 influence.', handlers.contagiousDisposal),
      ],
    },
    IMP021: {
      cardId: 'IMP021',
      abilities: [
        rule('IMP021-next-unit-combat-zone', 'onPlay', 'automatic', 'The next unit you play this turn can be played directly into an unoccupied combat zone. If you do, it enters ready.', handlers.demonicAdvance),
      ],
    },
    IMP022: {
      cardId: 'IMP022',
      abilities: [rule('IMP022-destroy-all-units', 'onPlay', 'automatic', 'Destroy all units.', handlers.exterminate)],
    },
    IMP023: {
      cardId: 'IMP023',
      abilities: [
        rule('IMP023-eye-for-an-eye', 'onPlay', 'automatic', 'Sacrifice a unit. If you do, target opponent sacrifices a unit with the highest supply cost among units they control.', handlers.eyeForAnEye),
      ],
    },
    IMP024: {
      cardId: 'IMP024',
      abilities: [rule('IMP024-sacrifice-draw-two', 'onPlay', 'automatic', 'Sacrifice target friendly unit. If you do, draw 2 cards.', handlers.unethicalResearch)],
    },
    IMP025: {
      cardId: 'IMP025',
      abilities: [rule('IMP025-prevent-defender-damage', 'onPlay', 'automatic', 'The next time target defending unit would be dealt combat damage this turn, prevent that damage.', handlers.blindingMist)],
    },
    IMP026: {
      cardId: 'IMP026',
      abilities: [rule('IMP026-destroy-combat-unit', 'onPlay', 'automatic', 'Destroy target unit in a combat zone.', handlers.killingBlow)],
    },
    IMP027: {
      cardId: 'IMP027',
      abilities: [rule('IMP027-destroy-cheap-combat-unit', 'onPlay', 'automatic', 'Destroy target unit in a combat zone with cost {2} or less.', handlers.quashInsurrection)],
    },
    IMP028: {
      cardId: 'IMP028',
      abilities: [staticRule('IMP028-equipped-unit-cant-score', "Equipped unit can't score.")],
    },
    IMP029: {
      cardId: 'IMP029',
      abilities: [staticRule('IMP029-equipped-unit-death-damage', 'When equipped unit dies in a combat zone, deal 3 damage to units in that zone.')],
    },
    IMP030: {
      cardId: 'IMP030',
      abilities: [staticRule('IMP030-score-lose-draw', 'Whenever a friendly unit scores this zone, lose 1 victory point. If you do, draw a card.')],
    },
    IMP031: {
      cardId: 'IMP031',
      abilities: [staticRule('IMP031-control-loot', 'Whenever a unit takes control of this zone, you may draw a card. If you do, discard a card.')],
    },
    IMP032: {
      cardId: 'IMP032',
      abilities: [
        staticRule('IMP032-tactic-protection', "Your units in this combat zone can't be targeted by enemy tactics."),
        staticRule('IMP032-end-turn-sacrifice', 'At the end of your turn, sacrifice a unit or sacrifice this territory.'),
      ],
    },
  };
}
