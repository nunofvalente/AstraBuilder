import { describe, expect, it } from 'vitest';

import { getActivatedAbilityModalCopy, getLocalizedCardDisplay, getPlayBoardCopy, getPlayControlsCopy, getPlayLobbyCopy, translateCardTypeLabel, translateGameLogText } from './play-localization';

describe('play localization', () => {
  it('provides localized board labels for every supported locale', () => {
    expect(getPlayBoardCopy('fr').graveyard).toBe('Cimetière');
    expect(getPlayBoardCopy('fr').battlefield[0]).toBe('Champ de bataille 1');
    expect(getPlayBoardCopy('de').staging).toBe('Vorbereitungsbereich');
    expect(getPlayBoardCopy('de').unit).toBe('Einheit');
    expect(getPlayBoardCopy('ms').supply).toBe('Bekalan');
    expect(getPlayBoardCopy('ms').battlefield[1]).toBe('Medan Tempur 2');
    expect(getPlayBoardCopy('zh-CN').opponentHand).toBe('对手手牌');
    expect(getPlayBoardCopy('zh-CN').unit).toBe('单位');
    expect(getPlayBoardCopy('ja').actionLog).toBe('アクションログ');
    expect(getPlayBoardCopy('ja').battlefield[2]).toBe('戦場 3');
  });

  it('localizes common structured game-log phrases while preserving card names', () => {
    expect(translateGameLogText('zh-CN', 'You drew 2 cards.')).toBe('你抽取了 2 张卡。');
    expect(translateGameLogText('ja', 'Reckless Warrior was destroyed.')).toBe('Reckless Warrior は破壊されました。');
    expect(translateGameLogText('fr', 'Your turn 3.')).toBe('Votre tour 3.');
    expect(translateGameLogText('zh-CN', 'Placed Swift Acrobatics as starting supply and drew 1 replacement card.')).not.toMatch(/Placed|starting supply|drew|replacement card/);
    expect(translateGameLogText('ja', 'Declared attack Raven into Battlefield 1, targeting Enemy. Counter priority opened.')).not.toMatch(/Declared attack|Battlefield|targeting|priority opened/);
  });

  it('fully localizes setup and first-draw log templates', () => {
    expect(translateGameLogText(
      'zh-CN',
      'Started setup against Testing Solara. Bot placed starting supply. Choose 1 card from hand as starting supply, then choose who goes first.'
    )).toBe('已开始与 Testing Solara 的对局设置。机器人已放置起始补给。请从手牌中选择 1 张作为起始补给，然后选择谁先手。');
    expect(translateGameLogText('zh-CN', 'You skip the first draw.')).toBe('你跳过第一次抽卡。');
    expect(translateGameLogText('ja', 'Bot skips the first draw.')).toBe('ボットは最初のドローをスキップします。');
    expect(translateGameLogText('zh-CN', 'Kept the opening hand.')).toBe('已保留起始手牌。');
    expect(translateGameLogText('ja', 'Mulliganed the opening hand and drew 6 new cards.')).toBe('初手をマリガンし、新たに6枚引きました。');
  });

  it('localizes every control-panel button label', () => {
    expect(getPlayControlsCopy('zh-CN')).toMatchObject({
      backToLobby: '返回大厅',
      passTurn: '结束回合',
      rematch: '再来一局',
    });
  });

  it('uses each card\'s actual rules text in the activated ability modal', () => {
    const dreadnought = {
      id: 'IMP079',
      name: 'Valrathian Dreadnought',
      type: 'Unit',
      subtype: 'Vehicle',
      rulesText: '{Exhaust},{3}: Destroy target unit. Use this ability only if this is in a combat zone, and only outside of combat.',
      description: '',
    } as Parameters<typeof getActivatedAbilityModalCopy>[1];

    expect(getActivatedAbilityModalCopy('en', dreadnought)).toEqual({
      title: 'Activate ability: Valrathian Dreadnought',
      description: '{Exhaust},{3}: Destroy target unit. Use this ability only if this is in a combat zone, and only outside of combat.',
    });
    expect(getActivatedAbilityModalCopy('fr', dreadnought)).toMatchObject({
      title: 'Activer la capacité: Valrathian Dreadnought',
      description: expect.stringContaining('Détruisez'),
    });
  });

  it('provides localized play lobby labels and card counts', () => {
    expect(getPlayLobbyCopy('zh-CN')).toMatchObject({
      practiceVsBot: '对战机器人练习',
      chooseBotDeck: '选择机器人牌组',
      startPractice: '开始对战机器人练习',
    });
    expect(getPlayLobbyCopy('ja').loadingDecks).toBe('デッキを読み込み中...');
    expect(getPlayLobbyCopy('fr').cardCount(2)).toBe('2 cartes');
    expect(getPlayLobbyCopy('de').cardCountSelected(1)).toBe('1 Karte ausgewählt');
  });

  it('localizes hand modal card type labels and known card copy', () => {
    expect(translateCardTypeLabel('zh-CN', 'Counter')).toBe('反制牌');
    expect(translateCardTypeLabel('ja', 'Renowned Unit')).toBe('著名ユニット');

    const swift = {
      id: 'IMP151',
      name: 'Swift Acrobatics',
      type: 'Tactic',
      subtype: 'Counter',
      rulesText: 'Force retreat target friendly unit in a combat zone.',
      description: 'Survival in the Verdant Shroud favors those with a light step.',
    } as Parameters<typeof getLocalizedCardDisplay>[1];

    expect(getLocalizedCardDisplay('zh-CN', swift)).toMatchObject({
      name: '迅捷杂技',
      typeLabel: '反制牌',
      rulesText: '强制撤退战斗区中的目标友方单位。',
    });

    const howl = {
      id: 'IMP147',
      name: 'Primordial Howl',
      type: 'Tactic',
      subtype: '',
      rulesText: 'Exhaust all enemy units in combat zones.',
      description: 'A king makes his presence known before he is seen.',
    } as Parameters<typeof getLocalizedCardDisplay>[1];

    expect(getLocalizedCardDisplay('zh-CN', howl)).toMatchObject({
      name: '原初咆哮',
      typeLabel: '战术牌',
      rulesText: '耗竭战斗区中的所有敌方单位。',
      description: '王者未现身，威势已先至。',
    });

    const stratagem = {
      id: 'IMP084',
      name: 'Complex Stratagem',
      type: 'Tactic',
      subtype: '',
      rulesText: 'Draw two cards.',
      description: '',
    } as Parameters<typeof getLocalizedCardDisplay>[1];

    expect(getLocalizedCardDisplay('zh-CN', stratagem).rulesText).toBe('抽两张卡。');
    expect(getLocalizedCardDisplay('ja', stratagem).rulesText).toBe('カードを2枚引く。');
  });
});
