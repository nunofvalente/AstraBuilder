import type { Locale } from '@/i18n/config';
import type { Card } from '../create/deck-builder/types';

export type PlayBoardCopy = {
  actionLog: string;
  activateAbility: string;
  attack: (zone: string) => string;
  banish: string;
  banishEmpty: string;
  battlefield: [string, string, string];
  cardActions: string;
  closeCardActions: string;
  captured: string;
  deck: string;
  defender: (name: string) => string;
  enemyTerritory: string;
  emptyHand: string;
  flank: (zone: string) => string;
  graveyard: string;
  graveyardEmpty: string;
  hand: string;
  lost: string;
  openBattlefield: string;
  occupiedBy: (name: string) => string;
  log: string;
  opponentHand: string;
  playFromBanish: string;
  staging: string;
  setup: string;
  supply: string;
  temporarySupply: string;
  turn: string;
  unit: string;
  yourTerritory: string;
};

const BOARD_COPY: Record<Locale, PlayBoardCopy> = {
  en: { actionLog: 'Action log', activateAbility: 'Activate ability', attack: (zone) => `Attack ${zone}`, banish: 'Banish', banishEmpty: 'Banish is empty', battlefield: ['Battlefield 1', 'Battlefield 2', 'Battlefield 3'], cardActions: 'Card actions', closeCardActions: 'Close card actions', captured: 'CAPTURED', deck: 'Deck', defender: (name) => `Defender: ${name}`, enemyTerritory: 'Enemy territory', emptyHand: 'Draw cards to fill your hand.', flank: (zone) => `Flank ${zone}`, graveyard: 'Graveyard', graveyardEmpty: 'Graveyard is empty', hand: 'Hand', log: 'Log', lost: 'LOST', occupiedBy: (name) => `Occupied by ${name}`, openBattlefield: 'Open battlefield', opponentHand: 'Opponent hand', playFromBanish: 'Play from banish', setup: 'Setup', staging: 'Staging', supply: 'Supply', temporarySupply: 'Temporary supply', turn: 'Turn', unit: 'Unit', yourTerritory: 'Your territory' },
  fr: { actionLog: 'Journal des actions', activateAbility: 'Activer la capacité', attack: (zone) => `Attaquer ${zone}`, banish: 'Bannissement', banishEmpty: 'La zone de bannissement est vide', battlefield: ['Champ de bataille 1', 'Champ de bataille 2', 'Champ de bataille 3'], cardActions: 'Actions de carte', closeCardActions: 'Fermer les actions de carte', captured: 'CAPTURÉ', deck: 'Deck', defender: (name) => `Défenseur : ${name}`, enemyTerritory: 'Territoire ennemi', emptyHand: 'Piochez des cartes pour remplir votre main.', flank: (zone) => `Contourner ${zone}`, graveyard: 'Cimetière', graveyardEmpty: 'Le cimetière est vide', hand: 'Main', log: 'Journal', lost: 'PERDU', occupiedBy: (name) => `Occupé par ${name}`, openBattlefield: 'Champ de bataille libre', opponentHand: 'Main adverse', playFromBanish: 'Jouer depuis le bannissement', setup: 'Mise en place', staging: 'Zone de préparation', supply: 'Ravitaillement', temporarySupply: 'Ravitaillement temporaire', turn: 'Tour', unit: 'Unité', yourTerritory: 'Votre territoire' },
  de: { actionLog: 'Aktionsprotokoll', activateAbility: 'Fähigkeit aktivieren', attack: (zone) => `${zone} angreifen`, banish: 'Verbannung', banishEmpty: 'Die Verbannung ist leer', battlefield: ['Schlachtfeld 1', 'Schlachtfeld 2', 'Schlachtfeld 3'], cardActions: 'Kartenaktionen', closeCardActions: 'Kartenaktionen schließen', captured: 'EROBERT', deck: 'Deck', defender: (name) => `Verteidiger: ${name}`, enemyTerritory: 'Gegnerisches Gebiet', emptyHand: 'Ziehe Karten, um deine Hand zu füllen.', flank: (zone) => `${zone} flankieren`, graveyard: 'Friedhof', graveyardEmpty: 'Der Friedhof ist leer', hand: 'Hand', log: 'Protokoll', lost: 'VERLOREN', occupiedBy: (name) => `Besetzt von ${name}`, openBattlefield: 'Freies Schlachtfeld', opponentHand: 'Gegnerische Hand', playFromBanish: 'Aus der Verbannung ausspielen', setup: 'Vorbereitung', staging: 'Vorbereitungsbereich', supply: 'Versorgung', temporarySupply: 'Temporäre Versorgung', turn: 'Zug', unit: 'Einheit', yourTerritory: 'Dein Gebiet' },
  ms: { actionLog: 'Log tindakan', activateAbility: 'Aktifkan kebolehan', attack: (zone) => `Serang ${zone}`, banish: 'Buangan', banishEmpty: 'Buangan kosong', battlefield: ['Medan Tempur 1', 'Medan Tempur 2', 'Medan Tempur 3'], cardActions: 'Tindakan kad', closeCardActions: 'Tutup tindakan kad', captured: 'DIKUASAI', deck: 'Dek', defender: (name) => `Pertahanan: ${name}`, enemyTerritory: 'Wilayah musuh', emptyHand: 'Tarik kad untuk mengisi tangan anda.', flank: (zone) => `Apit ${zone}`, graveyard: 'Perkuburan', graveyardEmpty: 'Perkuburan kosong', hand: 'Tangan', log: 'Log', lost: 'HILANG', occupiedBy: (name) => `Diduduki oleh ${name}`, openBattlefield: 'Medan tempur terbuka', opponentHand: 'Tangan lawan', playFromBanish: 'Main dari buangan', setup: 'Persediaan', staging: 'Kawasan persediaan', supply: 'Bekalan', temporarySupply: 'Bekalan sementara', turn: 'Giliran', unit: 'Unit', yourTerritory: 'Wilayah anda' },
  'zh-CN': { actionLog: '行动记录', activateAbility: '启动能力', attack: (zone) => `攻击${zone}`, banish: '放逐区', banishEmpty: '放逐区为空', battlefield: ['战场 1', '战场 2', '战场 3'], cardActions: '卡牌操作', closeCardActions: '关闭卡牌操作', captured: '已占领', deck: '牌库', defender: (name) => `防守者：${name}`, enemyTerritory: '敌方领地', emptyHand: '抽取卡牌来补充你的手牌。', flank: (zone) => `侧翼攻击${zone}`, graveyard: '墓地区', graveyardEmpty: '墓地区为空', hand: '手牌', log: '记录', lost: '已失守', occupiedBy: (name) => `已被 ${name} 占据`, openBattlefield: '空置战场', opponentHand: '对手手牌', playFromBanish: '从放逐区打出', setup: '设置', staging: '集结区', supply: '补给区', temporarySupply: '临时补给', turn: '回合', unit: '单位', yourTerritory: '你的领地' },
  ja: { actionLog: 'アクションログ', activateAbility: '能力を起動', attack: (zone) => `${zone}を攻撃`, banish: '追放領域', banishEmpty: '追放領域は空です', battlefield: ['戦場 1', '戦場 2', '戦場 3'], cardActions: 'カードアクション', closeCardActions: 'カードアクションを閉じる', captured: '占領中', deck: 'デッキ', defender: (name) => `防御側：${name}`, enemyTerritory: '相手の領地', emptyHand: 'カードを引いて手札を補充してください。', flank: (zone) => `${zone}へ側面攻撃`, graveyard: '墓地', graveyardEmpty: '墓地は空です', hand: '手札', log: 'ログ', lost: '喪失', occupiedBy: (name) => `${name}が占有中`, openBattlefield: '空いている戦場', opponentHand: '相手の手札', playFromBanish: '追放領域からプレイ', setup: 'セットアップ', staging: 'ステージング', supply: 'サプライ', temporarySupply: '一時サプライ', turn: 'ターン', unit: 'ユニット', yourTerritory: 'あなたの領地' },
};

export function getPlayBoardCopy(locale: Locale): PlayBoardCopy {
  return BOARD_COPY[locale];
}

const BANISH_ON_DEATH_COPY: Record<Locale, string> = {
  en: 'Banish on death',
  fr: 'Bannir à la mort',
  de: 'Beim Tod verbannen',
  ms: 'Buang apabila mati',
  'zh-CN': '死亡时放逐',
  ja: '死亡時に追放',
};

export function getBanishOnDeathLabel(locale: Locale): string {
  return BANISH_ON_DEATH_COPY[locale];
}

type LocalizedCardOverride = Partial<Pick<Card, 'name' | 'rulesText' | 'description'>>;

const CARD_TYPE_COPY: Record<Locale, Record<string, string>> = {
  en: { counter: 'Counter', equipment: 'Equipment', item: 'Item', renowned: 'Renowned', tactic: 'Tactic', territory: 'Territory', token: 'Token', unit: 'Unit' },
  fr: { counter: 'Contre', equipment: 'Équipement', item: 'Objet', renowned: 'Renommé', tactic: 'Tactique', territory: 'Territoire', token: 'Jeton', unit: 'Unité' },
  de: { counter: 'Konter', equipment: 'Ausrüstung', item: 'Gegenstand', renowned: 'Berühmt', tactic: 'Taktik', territory: 'Gebiet', token: 'Marker', unit: 'Einheit' },
  ms: { counter: 'Balas', equipment: 'Peralatan', item: 'Item', renowned: 'Ternama', tactic: 'Taktik', territory: 'Wilayah', token: 'Token', unit: 'Unit' },
  'zh-CN': { counter: '反制牌', equipment: '装备', item: '物品', renowned: '著名', tactic: '战术牌', territory: '领地', token: '衍生物', unit: '单位' },
  ja: { counter: 'カウンター', equipment: '装備', item: 'アイテム', renowned: '著名', tactic: '戦術', territory: '領地', token: 'トークン', unit: 'ユニット' },
};

const CARD_TEXT_OVERRIDES: Partial<Record<Locale, Record<string, LocalizedCardOverride>>> = {
  fr: {
    IMP147: {
      name: 'Hurlement primordial',
      rulesText: 'Épuisez toutes les unités ennemies dans les zones de combat.',
      description: 'Un roi fait connaître sa présence avant même d’être vu.',
    },
    IMP151: {
      name: 'Acrobaties rapides',
      rulesText: 'Forcez la retraite d’une unité alliée ciblée dans une zone de combat.',
      description: 'La survie dans le Voile verdoyant favorise ceux qui ont le pas léger.',
    },
  },
  de: {
    IMP147: {
      name: 'Urtümliches Heulen',
      rulesText: 'Erschöpfe alle gegnerischen Einheiten in Kampfzonen.',
      description: 'Ein König macht seine Anwesenheit bekannt, bevor man ihn sieht.',
    },
    IMP151: {
      name: 'Flinke Akrobatik',
      rulesText: 'Erzwinge den Rückzug einer befreundeten Einheit deiner Wahl in einer Kampfzone.',
      description: 'Das Überleben im Grünen Schleier begünstigt jene mit leichtem Schritt.',
    },
  },
  ms: {
    IMP147: {
      name: 'Lolongan Purba',
      rulesText: 'Letihkan semua unit musuh di zon tempur.',
      description: 'Seorang raja membuat kehadirannya diketahui sebelum dia dilihat.',
    },
    IMP151: {
      name: 'Akrobatik Pantas',
      rulesText: 'Paksa unit mesra sasaran di zon tempur berundur.',
      description: 'Kelangsungan hidup di Verdant Shroud memihak kepada mereka yang melangkah ringan.',
    },
  },
  'zh-CN': {
    IMP147: {
      name: '原初咆哮',
      rulesText: '耗竭战斗区中的所有敌方单位。',
      description: '王者未现身，威势已先至。',
    },
    IMP151: {
      name: '迅捷杂技',
      rulesText: '强制撤退战斗区中的目标友方单位。',
      description: '在翠绿帷幕中求生，更青睐步伐轻盈者。',
    },
  },
  ja: {
    IMP147: {
      name: '原初の咆哮',
      rulesText: '戦闘ゾーンにいるすべての敵ユニットを消耗させる。',
      description: '王は姿を見せる前に、その存在を知らしめる。',
    },
    IMP151: {
      name: '迅速な曲芸',
      rulesText: '戦闘ゾーンにいる味方ユニット1体を対象とし、強制撤退させる。',
      description: '新緑の帳で生き残るには、軽やかな足取りが有利となる。',
    },
  },
};

type CardTextLocale = Exclude<Locale, 'en'>;

const CARD_RULE_REPLACEMENTS: Record<CardTextLocale, Array<[string, string]>> = {
  fr: [
    ['combat zones', 'zones de combat'], ['combat zone', 'zone de combat'], ['staging area', 'zone de préparation'], ['staging', 'zone de préparation'],
    ['graveyard', 'cimetière'], ['supply area', 'zone de ravitaillement'], ['supply', 'ravitaillement'], ['deck', 'deck'], ['hand', 'main'],
    ['On Enter:', 'À l’entrée :'], ['On Play:', 'À la mise en jeu :'], ['On Death:', 'À la mort :'], ['On Attack:', 'À l’attaque :'], ['On Defend:', 'En défense :'], ['On Ready:', 'Au redressement :'], ['On Score:', 'Au score :'], ['On Flip:', 'Au retournement :'], ['On Retreat:', 'À la retraite :'], ['Turn Start:', 'Début du tour :'],
    ['Exhaust all enemy units in zones de combat.', 'Épuisez toutes les unités ennemies dans les zones de combat.'], ['Draw two cards.', 'Piochez deux cartes.'], ['Draw a card.', 'Piochez une carte.'],
    ['This unit enters ready.', 'Cette unité entre redressée.'], ['You can play this as a counter.', 'Vous pouvez jouer ceci comme un contre.'],
    ['Force retreat', 'Forcez la retraite de'], ['force retreat', 'forcer la retraite de'], ['Return', 'Renvoyez'], ['return', 'renvoyer'], ['Destroy', 'Détruisez'], ['destroy', 'détruire'], ['Sacrifice', 'Sacrifiez'], ['sacrifice', 'sacrifier'], ['Exhaust', 'Épuisez'], ['exhaust', 'épuiser'], ['Ready', 'Redressez'], ['ready', 'redresser'], ['Banish', 'Bannissez'], ['banish', 'bannir'], ['Reveal', 'Révélez'], ['reveal', 'révéler'],
    ['target friendly', 'alliée ciblée'], ['target enemy', 'ennemie ciblée'], ['target opponent', 'adversaire ciblé'], ['target defending', 'défenseur ciblé'], ['target exhausted', 'épuisée ciblée'], ['target unit', 'unité ciblée'], ['target territory', 'territoire ciblé'], ['target supply card', 'carte de ravitaillement ciblée'],
    ['friendly units', 'unités alliées'], ['friendly unit', 'unité alliée'], ['enemy units', 'unités ennemies'], ['enemy unit', 'unité ennemie'], ['all units', 'toutes les unités'], ['units', 'unités'], ['unit', 'unité'],
    ['territories', 'territoires'], ['territory', 'territoire'], ['tactics', 'tactiques'], ['tactic', 'tactique'], ['items', 'objets'], ['item', 'objet'], ['card', 'carte'], ['cards', 'cartes'],
    ['damage', 'dégâts'], ['combat damage', 'dégâts de combat'], ['victory points', 'points de victoire'], ['victory point', 'point de victoire'], ['influence', 'influence'], ['attack', 'attaque'], ['health', 'santé'], ['cost', 'coût'], ['counter', 'contre'],
    ['until end of turn', 'jusqu’à la fin du tour'], ['until the start of your next turn', 'jusqu’au début de votre prochain tour'], ['this turn', 'ce tour-ci'], ['during this combat', 'pendant ce combat'], ['once per turn', 'une fois par tour'], ['face down', 'face cachée'], ['facedown', 'face cachée'],
    ['you may', 'vous pouvez'], ['You may', 'Vous pouvez'], ['If you do', 'Si vous le faites'], ['If it would die', 'Si elle devait mourir'], ['instead', 'à la place'], ['another', 'une autre'], ['all', 'toutes'], ['each player', 'chaque joueur'], ['owner', 'propriétaire'], ['controller', 'contrôleur'], ['opponents', 'les adversaires'],
  ],
  de: [
    ['combat zones', 'Kampfzonen'], ['combat zone', 'Kampfzone'], ['staging area', 'Vorbereitungsbereich'], ['staging', 'Vorbereitung'],
    ['graveyard', 'Friedhof'], ['supply area', 'Versorgungsbereich'], ['supply', 'Versorgung'], ['deck', 'Deck'], ['hand', 'Hand'],
    ['On Enter:', 'Beim Betreten:'], ['On Play:', 'Beim Ausspielen:'], ['On Death:', 'Beim Tod:'], ['On Attack:', 'Beim Angriff:'], ['On Defend:', 'Beim Verteidigen:'], ['On Ready:', 'Beim Bereitmachen:'], ['On Score:', 'Beim Punkten:'], ['On Flip:', 'Beim Aufdecken:'], ['On Retreat:', 'Beim Rückzug:'], ['Turn Start:', 'Zugbeginn:'],
    ['Exhaust all enemy units in Kampfzonen.', 'Erschöpfe alle gegnerischen Einheiten in Kampfzonen.'], ['Draw two cards.', 'Ziehe zwei Karten.'], ['Draw a card.', 'Ziehe eine Karte.'],
    ['This unit enters ready.', 'Diese Einheit kommt bereit ins Spiel.'], ['You can play this as a counter.', 'Du kannst dies als Konter spielen.'],
    ['Force retreat', 'Erzwinge den Rückzug von'], ['force retreat', 'den Rückzug erzwingen von'], ['Return', 'Bringe'], ['return', 'zurückbringen'], ['Destroy', 'Zerstöre'], ['destroy', 'zerstören'], ['Sacrifice', 'Opfere'], ['sacrifice', 'opfern'], ['Exhaust', 'Erschöpfe'], ['exhaust', 'erschöpfen'], ['Ready', 'Mache bereit'], ['ready', 'bereit machen'], ['Banish', 'Verbanne'], ['banish', 'verbannen'], ['Reveal', 'Decke auf'], ['reveal', 'aufdecken'],
    ['target friendly', 'befreundete gewählte'], ['target enemy', 'gegnerische gewählte'], ['target opponent', 'gewählter Gegner'], ['target defending', 'gewählte verteidigende'], ['target exhausted', 'gewählte erschöpfte'], ['target unit', 'gewählte Einheit'], ['target territory', 'gewähltes Gebiet'], ['target supply card', 'gewählte Versorgungskarte'],
    ['friendly units', 'befreundete Einheiten'], ['friendly unit', 'befreundete Einheit'], ['enemy units', 'gegnerische Einheiten'], ['enemy unit', 'gegnerische Einheit'], ['all units', 'alle Einheiten'], ['units', 'Einheiten'], ['unit', 'Einheit'],
    ['territories', 'Gebiete'], ['territory', 'Gebiet'], ['tactics', 'Taktiken'], ['tactic', 'Taktik'], ['items', 'Gegenstände'], ['item', 'Gegenstand'], ['cards', 'Karten'], ['card', 'Karte'],
    ['damage', 'Schaden'], ['combat damage', 'Kampfschaden'], ['victory points', 'Siegpunkte'], ['victory point', 'Siegpunkt'], ['influence', 'Einfluss'], ['attack', 'Angriff'], ['health', 'Leben'], ['cost', 'Kosten'], ['counter', 'Konter'],
    ['until end of turn', 'bis zum Ende des Zuges'], ['until the start of your next turn', 'bis zum Beginn deines nächsten Zuges'], ['this turn', 'in diesem Zug'], ['during this combat', 'während dieses Kampfes'], ['once per turn', 'einmal pro Zug'], ['face down', 'verdeckt'], ['facedown', 'verdeckt'],
    ['you may', 'du darfst'], ['You may', 'Du darfst'], ['If you do', 'Wenn du dies tust'], ['If it would die', 'Wenn sie sterben würde'], ['instead', 'stattdessen'], ['another', 'eine andere'], ['all', 'alle'], ['each player', 'jeder Spieler'], ['owner', 'Besitzer'], ['controller', 'Kontrolleur'], ['opponents', 'Gegner'],
  ],
  ms: [
    ['combat zones', 'zon tempur'], ['combat zone', 'zon tempur'], ['staging area', 'kawasan persediaan'], ['staging', 'persediaan'],
    ['graveyard', 'perkuburan'], ['supply area', 'kawasan bekalan'], ['supply', 'bekalan'], ['deck', 'dek'], ['hand', 'tangan'],
    ['On Enter:', 'Apabila masuk:'], ['On Play:', 'Apabila dimainkan:'], ['On Death:', 'Apabila mati:'], ['On Attack:', 'Apabila menyerang:'], ['On Defend:', 'Apabila bertahan:'], ['On Ready:', 'Apabila bersedia:'], ['On Score:', 'Apabila menjaring:'], ['On Flip:', 'Apabila dibalikkan:'], ['On Retreat:', 'Apabila berundur:'], ['Turn Start:', 'Permulaan giliran:'],
    ['Exhaust all enemy units in zon tempur.', 'Letihkan semua unit musuh di zon tempur.'], ['Draw two cards.', 'Tarik dua kad.'], ['Draw a card.', 'Tarik satu kad.'],
    ['This unit enters ready.', 'Unit ini masuk dalam keadaan bersedia.'], ['You can play this as a counter.', 'Anda boleh memainkan ini sebagai balas.'],
    ['Force retreat', 'Paksa berundur'], ['force retreat', 'paksa berundur'], ['Return', 'Kembalikan'], ['return', 'kembalikan'], ['Destroy', 'Musnahkan'], ['destroy', 'musnahkan'], ['Sacrifice', 'Korbankan'], ['sacrifice', 'korbankan'], ['Exhaust', 'Letihkan'], ['exhaust', 'letihkan'], ['Ready', 'Bersediakan'], ['ready', 'bersedia'], ['Banish', 'Buang'], ['banish', 'buang'], ['Reveal', 'Dedahkan'], ['reveal', 'dedahkan'],
    ['target friendly', 'mesra sasaran'], ['target enemy', 'musuh sasaran'], ['target opponent', 'lawan sasaran'], ['target defending', 'bertahan sasaran'], ['target exhausted', 'letih sasaran'], ['target unit', 'unit sasaran'], ['target territory', 'wilayah sasaran'], ['target supply card', 'kad bekalan sasaran'],
    ['friendly units', 'unit mesra'], ['friendly unit', 'unit mesra'], ['enemy units', 'unit musuh'], ['enemy unit', 'unit musuh'], ['all units', 'semua unit'], ['units', 'unit'], ['unit', 'unit'],
    ['territories', 'wilayah'], ['territory', 'wilayah'], ['tactics', 'taktik'], ['tactic', 'taktik'], ['items', 'item'], ['item', 'item'], ['cards', 'kad'], ['card', 'kad'],
    ['damage', 'kerosakan'], ['combat damage', 'kerosakan tempur'], ['victory points', 'mata kemenangan'], ['victory point', 'mata kemenangan'], ['influence', 'pengaruh'], ['attack', 'serangan'], ['health', 'kesihatan'], ['cost', 'kos'], ['counter', 'balas'],
    ['until end of turn', 'hingga akhir giliran'], ['until the start of your next turn', 'hingga permulaan giliran anda seterusnya'], ['this turn', 'giliran ini'], ['during this combat', 'semasa tempur ini'], ['once per turn', 'sekali setiap giliran'], ['face down', 'menghadap ke bawah'], ['facedown', 'menghadap ke bawah'],
    ['you may', 'anda boleh'], ['You may', 'Anda boleh'], ['If you do', 'Jika anda berbuat demikian'], ['If it would die', 'Jika ia akan mati'], ['instead', 'sebaliknya'], ['another', 'lain'], ['all', 'semua'], ['each player', 'setiap pemain'], ['owner', 'pemilik'], ['controller', 'pengawal'], ['opponents', 'lawan'],
  ],
  'zh-CN': [
    ['combat zones', '战斗区'], ['combat zone', '战斗区'], ['staging area', '集结区'], ['staging', '集结区'],
    ['graveyard', '墓地区'], ['supply area', '补给区'], ['supply', '补给'], ['deck', '牌库'], ['hand', '手牌'],
    ['On Enter:', '进场：'], ['On Play:', '打出时：'], ['On Death:', '死亡时：'], ['On Attack:', '攻击时：'], ['On Defend:', '防守时：'], ['On Ready:', '准备时：'], ['On Score:', '得分时：'], ['On Flip:', '翻面时：'], ['On Retreat:', '撤退时：'], ['Turn Start:', '回合开始：'],
    ['Exhaust all enemy units in 战斗区.', '耗竭战斗区中的所有敌方单位。'], ['Draw two cards.', '抽两张卡。'], ['Draw a card.', '抽一张卡。'],
    ['This unit enters ready.', '此单位以准备状态进场。'], ['You can play this as a counter.', '你可以将此牌作为反制牌打出。'],
    ['Force retreat', '强制撤退'], ['force retreat', '强制撤退'], ['Return', '返回'], ['return', '返回'], ['Destroy', '消灭'], ['destroy', '消灭'], ['Sacrifice', '牺牲'], ['sacrifice', '牺牲'], ['Exhaust', '耗竭'], ['exhaust', '耗竭'], ['Ready', '准备'], ['ready', '准备'], ['Banish', '放逐'], ['banish', '放逐'], ['Reveal', '展示'], ['reveal', '展示'],
    ['target friendly', '目标友方'], ['target enemy', '目标敌方'], ['target opponent', '目标对手'], ['target defending', '目标防守'], ['target exhausted', '目标已耗竭'], ['target unit', '目标单位'], ['target territory', '目标领地'], ['target supply card', '目标补给牌'],
    ['friendly units', '友方单位'], ['friendly unit', '友方单位'], ['enemy units', '敌方单位'], ['enemy unit', '敌方单位'], ['all units', '所有单位'], ['units', '单位'], ['unit', '单位'],
    ['territories', '领地'], ['territory', '领地'], ['tactics', '战术牌'], ['tactic', '战术牌'], ['items', '物品'], ['item', '物品'], ['cards', '卡牌'], ['card', '卡牌'],
    ['damage', '伤害'], ['combat damage', '战斗伤害'], ['victory points', '胜利点'], ['victory point', '胜利点'], ['influence', '影响力'], ['attack', '攻击'], ['health', '生命'], ['cost', '费用'], ['counter', '反制牌'],
    ['until end of turn', '直到回合结束'], ['until the start of your next turn', '直到你的下个回合开始'], ['this turn', '本回合'], ['during this combat', '在本次战斗中'], ['once per turn', '每回合一次'], ['face down', '牌面朝下'], ['facedown', '牌面朝下'],
    ['you may', '你可以'], ['You may', '你可以'], ['If you do', '若如此做'], ['If it would die', '如果其将死亡'], ['instead', '改为'], ['another', '另一个'], ['all', '所有'], ['each player', '每位玩家'], ['owner', '拥有者'], ['controller', '操控者'], ['opponents', '对手'],
  ],
  ja: [
    ['combat zones', '戦闘ゾーン'], ['combat zone', '戦闘ゾーン'], ['staging area', 'ステージング'], ['staging', 'ステージング'],
    ['graveyard', '墓地'], ['supply area', 'サプライ領域'], ['supply', 'サプライ'], ['deck', 'デッキ'], ['hand', '手札'],
    ['On Enter:', '登場時：'], ['On Play:', 'プレイ時：'], ['On Death:', '死亡時：'], ['On Attack:', '攻撃時：'], ['On Defend:', '防御時：'], ['On Ready:', '準備時：'], ['On Score:', '得点時：'], ['On Flip:', '公開時：'], ['On Retreat:', '撤退時：'], ['Turn Start:', 'ターン開始時：'],
    ['Exhaust all enemy units in 戦闘ゾーン.', '戦闘ゾーンにいるすべての敵ユニットを消耗させる。'], ['Draw two cards.', 'カードを2枚引く。'], ['Draw a card.', 'カードを1枚引く。'],
    ['This unit enters ready.', 'このユニットは準備状態で登場する。'], ['You can play this as a counter.', 'これはカウンターとしてプレイできる。'],
    ['Force retreat', '強制撤退させる'], ['force retreat', '強制撤退させる'], ['Return', '戻す'], ['return', '戻す'], ['Destroy', '破壊する'], ['destroy', '破壊する'], ['Sacrifice', '生け贄にする'], ['sacrifice', '生け贄にする'], ['Exhaust', '消耗させる'], ['exhaust', '消耗させる'], ['Ready', '準備させる'], ['ready', '準備させる'], ['Banish', '追放する'], ['banish', '追放する'], ['Reveal', '公開する'], ['reveal', '公開する'],
    ['target friendly', '対象の味方'], ['target enemy', '対象の敵'], ['target opponent', '対象の相手'], ['target defending', '対象の防御'], ['target exhausted', '対象の消耗済み'], ['target unit', '対象のユニット'], ['target territory', '対象の領地'], ['target supply card', '対象のサプライカード'],
    ['friendly units', '味方ユニット'], ['friendly unit', '味方ユニット'], ['enemy units', '敵ユニット'], ['enemy unit', '敵ユニット'], ['all units', 'すべてのユニット'], ['units', 'ユニット'], ['unit', 'ユニット'],
    ['territories', '領地'], ['territory', '領地'], ['tactics', '戦術'], ['tactic', '戦術'], ['items', 'アイテム'], ['item', 'アイテム'], ['cards', 'カード'], ['card', 'カード'],
    ['damage', 'ダメージ'], ['combat damage', '戦闘ダメージ'], ['victory points', '勝利点'], ['victory point', '勝利点'], ['influence', '影響力'], ['attack', '攻撃'], ['health', '体力'], ['cost', 'コスト'], ['counter', 'カウンター'],
    ['until end of turn', 'ターン終了時まで'], ['until the start of your next turn', 'あなたの次のターン開始時まで'], ['this turn', 'このターン'], ['during this combat', 'この戦闘中'], ['once per turn', '各ターン1回'], ['face down', '裏向き'], ['facedown', '裏向き'],
    ['you may', 'あなたは'], ['You may', 'あなたは'], ['If you do', 'そうしたなら'], ['If it would die', 'それが死亡するなら'], ['instead', '代わりに'], ['another', '他の'], ['all', 'すべて'], ['each player', '各プレイヤー'], ['owner', '所有者'], ['controller', 'コントローラー'], ['opponents', '相手'],
  ],
};

function applyCardTextReplacements(locale: Locale, text: string): string {
  if (locale === 'en' || text.trim().length === 0) return text;
  const translated = CARD_RULE_REPLACEMENTS[locale].reduce(
    (current, [source, replacement]) => current.replaceAll(source, replacement),
    text
  );
  return locale === 'zh-CN' || locale === 'ja' ? translated.replaceAll('.', '。') : translated;
}

function translateCardTypePart(locale: Locale, part: string): string {
  return CARD_TYPE_COPY[locale][part.trim().toLowerCase()] ?? part;
}

export function translateCardTypeLabel(locale: Locale, label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => translateCardTypePart(locale, part))
    .join(locale === 'zh-CN' || locale === 'ja' ? '' : ' ');
}

export function getLocalizedCardDisplay(locale: Locale, card: Card): Pick<Card, 'name' | 'rulesText' | 'description'> & { typeLabel: string } {
  const override = CARD_TEXT_OVERRIDES[locale]?.[card.id] ?? {};
  const typeLabel = translateCardTypeLabel(locale, card.subtype || card.type);
  return {
    name: override.name ?? card.name,
    rulesText: override.rulesText ?? applyCardTextReplacements(locale, card.rulesText),
    description: override.description ?? applyCardTextReplacements(locale, card.description),
    typeLabel,
  };
}

export type PlayControlsCopy = {
  bot: string;
  botTurn: string;
  cancel: string;
  concede: string;
  concedeGame: string;
  counterStack: string;
  counterWindow: string;
  enemyVictoryPoints: string;
  gameOver: string;
  passCounter: string;
  passTurn: string;
  waitingForBot: string;
  you: string;
  youLost: string;
  youWon: string;
  yourTurn: string;
  yourVictoryPoints: string;
};

const CONTROLS_COPY: Record<Locale, PlayControlsCopy> = {
  en: { bot: 'Bot', botTurn: 'Bot turn', cancel: 'Cancel', concede: 'Concede', concedeGame: 'Concede game?', counterStack: 'Counter stack', counterWindow: 'Counter window', enemyVictoryPoints: 'Enemy victory points', gameOver: 'Game over', passCounter: 'Pass counter', passTurn: 'Pass turn', waitingForBot: 'Waiting for bot', you: 'You', youLost: 'You lost', youWon: 'You won!', yourTurn: 'Your turn', yourVictoryPoints: 'Your victory points' },
  fr: { bot: 'Bot', botTurn: 'Tour du bot', cancel: 'Annuler', concede: 'Abandonner', concedeGame: 'Abandonner la partie ?', counterStack: 'Pile de contres', counterWindow: 'Fenêtre de contre', enemyVictoryPoints: 'Points de victoire adverses', gameOver: 'Partie terminée', passCounter: 'Passer le contre', passTurn: 'Passer le tour', waitingForBot: 'En attente du bot', you: 'Vous', youLost: 'Vous avez perdu', youWon: 'Vous avez gagné !', yourTurn: 'Votre tour', yourVictoryPoints: 'Vos points de victoire' },
  de: { bot: 'Bot', botTurn: 'Bot-Zug', cancel: 'Abbrechen', concede: 'Aufgeben', concedeGame: 'Spiel aufgeben?', counterStack: 'Konterstapel', counterWindow: 'Konterfenster', enemyVictoryPoints: 'Gegnerische Siegpunkte', gameOver: 'Spiel beendet', passCounter: 'Konter passen', passTurn: 'Zug passen', waitingForBot: 'Warte auf Bot', you: 'Du', youLost: 'Du hast verloren', youWon: 'Du hast gewonnen!', yourTurn: 'Dein Zug', yourVictoryPoints: 'Deine Siegpunkte' },
  ms: { bot: 'Bot', botTurn: 'Giliran Bot', cancel: 'Batal', concede: 'Mengalah', concedeGame: 'Mengalah dalam permainan?', counterStack: 'Tindanan balas', counterWindow: 'Tetingkap balas', enemyVictoryPoints: 'Mata kemenangan musuh', gameOver: 'Permainan tamat', passCounter: 'Lepasi balas', passTurn: 'Lepasi giliran', waitingForBot: 'Menunggu bot', you: 'Anda', youLost: 'Anda kalah', youWon: 'Anda menang!', yourTurn: 'Giliran anda', yourVictoryPoints: 'Mata kemenangan anda' },
  'zh-CN': { bot: '机器人', botTurn: '机器人回合', cancel: '取消', concede: '认输', concedeGame: '要认输吗？', counterStack: '反制堆栈', counterWindow: '反制窗口', enemyVictoryPoints: '敌方胜利点', gameOver: '游戏结束', passCounter: '放弃反制', passTurn: '结束回合', waitingForBot: '等待机器人', you: '你', youLost: '你输了', youWon: '你赢了！', yourTurn: '你的回合', yourVictoryPoints: '你的胜利点' },
  ja: { bot: 'ボット', botTurn: 'ボットのターン', cancel: 'キャンセル', concede: '投了', concedeGame: '投了しますか？', counterStack: 'カウンタースタック', counterWindow: 'カウンターウィンドウ', enemyVictoryPoints: '相手の勝利点', gameOver: 'ゲーム終了', passCounter: 'カウンターをパス', passTurn: 'ターンを終了', waitingForBot: 'ボットを待っています', you: 'あなた', youLost: '敗北しました', youWon: '勝利しました！', yourTurn: 'あなたのターン', yourVictoryPoints: 'あなたの勝利点' },
};

type ExtraControlsCopy = {
  availableCounters: string;
  backToLobby: string;
  botFirst: string;
  concedeDescription: string;
  cost: string;
  lobby: string;
  noCounters: string;
  passTurnDescription: string;
  rematch: string;
  resolvesNext: string;
  setup: string;
  startingSupply: string;
  openingHand: string;
  keepHand: string;
  mulligan: string;
  chooseFirst: string;
  rollingFirst: string;
  youFirst: string;
  opponentFirst: string;
};

const OPENING_HAND_COPY: Record<Locale, Pick<ExtraControlsCopy, 'openingHand' | 'keepHand' | 'mulligan'>> = {
  en: { openingHand: 'Keep this opening hand or mulligan all 6 cards. You can only mulligan once.', keepHand: 'Keep hand', mulligan: 'Mulligan' },
  fr: { openingHand: 'Gardez cette main de départ ou remplacez les 6 cartes. Vous ne pouvez le faire qu’une fois.', keepHand: 'Garder la main', mulligan: 'Mulligan' },
  de: { openingHand: 'Behalte diese Starthand oder tausche alle 6 Karten aus. Ein Mulligan ist nur einmal möglich.', keepHand: 'Hand behalten', mulligan: 'Mulligan' },
  ms: { openingHand: 'Kekalkan tangan permulaan ini atau tukar kesemua 6 kad. Mulligan hanya boleh dibuat sekali.', keepHand: 'Kekalkan tangan', mulligan: 'Mulligan' },
  'zh-CN': { openingHand: '保留这组起始手牌，或将全部 6 张牌调度。每局只能调度一次。', keepHand: '保留手牌', mulligan: '调度' },
  ja: { openingHand: 'この初手をキープするか、6枚すべてを引き直します。マリガンは1回だけです。', keepHand: 'キープ', mulligan: 'マリガン' },
};

const EXTRA_CONTROLS_COPY: Record<Locale, Omit<ExtraControlsCopy, 'openingHand' | 'keepHand' | 'mulligan'>> = {
  en: { availableCounters: 'Available counters', backToLobby: 'Back to lobby', botFirst: 'Bot first', concedeDescription: 'This will leave the current room and return you to the lobby.', cost: 'Cost', lobby: 'Lobby', noCounters: 'No counters played.', passTurnDescription: 'This will end your actions for this turn and pass priority to the bot.', rematch: 'Rematch', resolvesNext: 'Resolves next', setup: 'Setup', startingSupply: 'Choose 1 card from your hand to place as starting supply.', chooseFirst: 'Choose who takes the first turn.', rollingFirst: 'Rolling to choose who takes the first turn.', youFirst: 'You first', opponentFirst: 'Opponent first' },
  fr: { availableCounters: 'Contres disponibles', backToLobby: 'Retour au salon', botFirst: 'Bot en premier', concedeDescription: 'Vous quitterez la partie en cours et retournerez au salon.', cost: 'Coût', lobby: 'Salon', noCounters: 'Aucun contre joué.', passTurnDescription: 'Vos actions se terminent et la priorité passe au bot.', rematch: 'Rejouer', resolvesNext: 'Se résout ensuite', setup: 'Mise en place', startingSupply: 'Choisissez 1 carte de votre main comme ravitaillement de départ.', chooseFirst: 'Choisissez qui joue en premier.', rollingFirst: 'Tirage au sort du premier joueur.', youFirst: 'Vous en premier', opponentFirst: 'Adversaire en premier' },
  de: { availableCounters: 'Verfügbare Konter', backToLobby: 'Zurück zur Lobby', botFirst: 'Bot beginnt', concedeDescription: 'Du verlässt das aktuelle Spiel und kehrst zur Lobby zurück.', cost: 'Kosten', lobby: 'Lobby', noCounters: 'Keine Konter gespielt.', passTurnDescription: 'Deine Aktionen enden und die Priorität geht an den Bot.', rematch: 'Revanche', resolvesNext: 'Wird als Nächstes aufgelöst', setup: 'Vorbereitung', startingSupply: 'Wähle 1 Handkarte als Startversorgung.', chooseFirst: 'Wähle, wer den ersten Zug hat.', rollingFirst: 'Der erste Spieler wird ausgelost.', youFirst: 'Du beginnst', opponentFirst: 'Gegner beginnt' },
  ms: { availableCounters: 'Balas yang tersedia', backToLobby: 'Kembali ke lobi', botFirst: 'Bot dahulu', concedeDescription: 'Anda akan meninggalkan permainan semasa dan kembali ke lobi.', cost: 'Kos', lobby: 'Lobi', noCounters: 'Tiada balas dimainkan.', passTurnDescription: 'Tindakan anda tamat dan keutamaan diberikan kepada bot.', rematch: 'Lawan semula', resolvesNext: 'Diselesaikan seterusnya', setup: 'Persediaan', startingSupply: 'Pilih 1 kad dari tangan sebagai bekalan permulaan.', chooseFirst: 'Pilih siapa mengambil giliran pertama.', rollingFirst: 'Mengundi pemain pertama.', youFirst: 'Anda dahulu', opponentFirst: 'Lawan dahulu' },
  'zh-CN': { availableCounters: '可用反制牌', backToLobby: '返回大厅', botFirst: '机器人先手', concedeDescription: '这将离开当前对局并返回大厅。', cost: '费用', lobby: '大厅', noCounters: '尚未打出反制牌。', passTurnDescription: '这将结束你本回合的行动，并把优先权交给机器人。', rematch: '再来一局', resolvesNext: '下一个结算', setup: '设置', startingSupply: '从手牌中选择 1 张作为起始补给。', chooseFirst: '选择谁先开始回合。', rollingFirst: '正在随机决定先手。', youFirst: '你先手', opponentFirst: '对手先手' },
  ja: { availableCounters: '使用可能なカウンター', backToLobby: 'ロビーに戻る', botFirst: 'ボットが先攻', concedeDescription: '現在のゲームを終了してロビーに戻ります。', cost: 'コスト', lobby: 'ロビー', noCounters: 'カウンターはプレイされていません。', passTurnDescription: 'このターンの行動を終了し、優先権をボットに渡します。', rematch: '再戦', resolvesNext: '次に解決', setup: 'セットアップ', startingSupply: '手札から1枚を開始時のサプライとして選んでください。', chooseFirst: '先攻プレイヤーを選んでください。', rollingFirst: '先攻プレイヤーを抽選しています。', youFirst: 'あなたが先攻', opponentFirst: '相手が先攻' },
};

export function getPlayControlsCopy(locale: Locale): PlayControlsCopy & ExtraControlsCopy {
  return { ...CONTROLS_COPY[locale], ...EXTRA_CONTROLS_COPY[locale], ...OPENING_HAND_COPY[locale] };
}

export type PlayLobbyCopy = {
  botDeck: string;
  botDifficulty: string;
  botOpponent: string;
  buildDeck: string;
  cardCount: (count: number) => string;
  cardCountSelected: (count: number) => string;
  casual: string;
  change: string;
  chooseBotDeck: string;
  chooseBotDeckDescription: string;
  chooseYourDeck: string;
  createLobby: string;
  createLobbyDescription: string;
  cancelRoom: string;
  createRoom: string;
  joinRoom: string;
  roomCode: string;
  roomCodePlaceholder: string;
  roomCancelled: string;
  roomWaiting: string;
  roomReady: string;
  roomRequestFailed: string;
  roomSignInPrompt: string;
  opponentDisconnected: string;
  opponentRequestedRematch: string;
  opponentDeclinedRematch: string;
  shareRoom: string;
  roomLinkCopied: string;
  findMatch: (queue: string) => string;
  loadingDecks: string;
  matchmaking: string;
  matchmakingTitle: (queue: string) => string;
  multiplayerComingSoon: string;
  noSavedDecks: string;
  openMatchRoom: string;
  pickSavedDeckForPractice: string;
  practice: string;
  practiceVsBot: string;
  ranked: string;
  roomLobby: string;
  saveDeckPrompt: string;
  signIn: string;
  signInPrompt: string;
  simulatorUnavailable: string;
  standard: string;
  startPractice: string;
  unableToLoadDecks: string;
  untitledDeck: string;
  usesDefaultBotStrategy: string;
  yourDeck: string;
};

const LOBBY_COPY: Record<Locale, PlayLobbyCopy> = {
  en: {
    botDeck: 'Bot deck', botDifficulty: 'Bot difficulty', botOpponent: 'Bot opponent', buildDeck: 'Build a deck',
    cardCount: (count) => `${count} ${count === 1 ? 'card' : 'cards'}`,
    cardCountSelected: (count) => `${count} ${count === 1 ? 'card' : 'cards'} selected`,
    casual: 'Casual', change: 'Change', chooseBotDeck: 'Choose bot deck', chooseBotDeckDescription: 'Choose one of your saved decks for the bot opponent.',
    chooseYourDeck: 'Choose your deck', createLobby: 'Create Lobby', createLobbyDescription: 'Create a private game or join a friend with their six-character code.', cancelRoom: 'Cancel room',
    createRoom: 'Create room', joinRoom: 'Join room', roomCode: 'Room code', roomCodePlaceholder: 'ABC123', roomCancelled: 'This room was cancelled.', roomWaiting: 'Waiting for another player...', roomReady: 'Both players joined. Preparing the match…', roomRequestFailed: 'The room request failed. Please try again.', roomSignInPrompt: 'You need to be signed in to create or join a room.', opponentDisconnected: 'Opponent disconnected. Waiting up to 60 seconds for them to reconnect…', opponentRequestedRematch: 'Your opponent requested a rematch.', opponentDeclinedRematch: 'Your opponent declined the rematch.', shareRoom: 'Copy invite link', roomLinkCopied: 'Invite link copied',
    findMatch: (queue) => `Find ${queue} match`, loadingDecks: 'Loading your decks...', matchmaking: 'Matchmaking',
    matchmakingTitle: (queue) => `${queue} matchmaking`, multiplayerComingSoon: 'Multiplayer is coming soon.', noSavedDecks: 'No saved decks found.',
    openMatchRoom: 'Opening match room...', pickSavedDeckForPractice: 'Pick a saved deck for practice', practice: 'Practice', practiceVsBot: 'Practice vs Bot',
    ranked: 'Ranked', roomLobby: 'Room lobby', saveDeckPrompt: 'Save a deck with at least 50 cards before starting a simulator session.', signIn: 'Sign in',
    signInPrompt: 'Sign in to simulate games with your saved decks.', simulatorUnavailable: 'At the moment, simulator is not available on mobile or portrait orientation. Please use a desktop landscape screen.', standard: 'Standard', startPractice: 'Launch Practice vs Bot',
    unableToLoadDecks: 'Unable to load decks.', untitledDeck: 'Untitled deck', usesDefaultBotStrategy: 'Uses the default balanced bot strategy.', yourDeck: 'Your deck',
  },
  fr: {
    botDeck: 'Deck du bot', botDifficulty: 'Difficulté du bot', botOpponent: 'Adversaire bot', buildDeck: 'Construire un deck',
    cardCount: (count) => `${count} carte${count === 1 ? '' : 's'}`,
    cardCountSelected: (count) => `${count} carte${count === 1 ? '' : 's'} sélectionnée${count === 1 ? '' : 's'}`,
    casual: 'amical', change: 'Changer', chooseBotDeck: 'Choisir le deck du bot', chooseBotDeckDescription: 'Choisissez un de vos decks enregistrés pour le bot.',
    chooseYourDeck: 'Choisissez votre deck', createLobby: 'Créer un salon', createLobbyDescription: 'Créez une partie privée ou rejoignez un ami avec son code à six caractères.', cancelRoom: 'Annuler la salle',
    createRoom: 'Créer une salle', joinRoom: 'Rejoindre', roomCode: 'Code de salle', roomCodePlaceholder: 'ABC123', roomCancelled: 'Cette salle a été annulée.', roomWaiting: 'En attente d’un autre joueur…', roomReady: 'Les deux joueurs sont présents. Préparation de la partie…', roomRequestFailed: 'La demande a échoué. Réessayez.', roomSignInPrompt: 'Vous devez être connecté pour créer ou rejoindre une salle.', opponentDisconnected: 'L’adversaire est déconnecté. Reconnexion attendue pendant 60 secondes…', opponentRequestedRematch: 'Votre adversaire demande une revanche.', opponentDeclinedRematch: 'Votre adversaire a refusé la revanche.', shareRoom: 'Copier le lien d’invitation', roomLinkCopied: 'Lien d’invitation copié',
    findMatch: (queue) => `Trouver une partie ${queue}`, loadingDecks: 'Chargement de vos decks...', matchmaking: 'Matchmaking',
    matchmakingTitle: (queue) => `Matchmaking ${queue}`, multiplayerComingSoon: 'Le multijoueur arrive bientôt.', noSavedDecks: 'Aucun deck enregistré trouvé.',
    openMatchRoom: 'Ouverture de la salle de match...', pickSavedDeckForPractice: 'Choisissez un deck enregistré pour l’entraînement', practice: 'Entraînement', practiceVsBot: 'Entraînement contre le bot',
    ranked: 'classé', roomLobby: 'Salon de partie', saveDeckPrompt: "Enregistrez un deck d'au moins 50 cartes avant de lancer une session de simulation.", signIn: 'Se connecter',
    signInPrompt: 'Connectez-vous pour simuler des parties avec vos decks enregistrés.', simulatorUnavailable: "Pour le moment, le simulateur n’est pas disponible sur mobile ni en orientation portrait. Utilisez un écran d’ordinateur en mode paysage.", standard: 'Standard', startPractice: 'Lancer l’entraînement contre le bot',
    unableToLoadDecks: 'Impossible de charger les decks.', untitledDeck: 'Deck sans titre', usesDefaultBotStrategy: 'Utilise la stratégie équilibrée par défaut du bot.', yourDeck: 'Votre deck',
  },
  de: {
    botDeck: 'Bot-Deck', botDifficulty: 'Bot-Schwierigkeit', botOpponent: 'Bot-Gegner', buildDeck: 'Deck bauen',
    cardCount: (count) => `${count} ${count === 1 ? 'Karte' : 'Karten'}`,
    cardCountSelected: (count) => `${count} ${count === 1 ? 'Karte' : 'Karten'} ausgewählt`,
    casual: 'locker', change: 'Ändern', chooseBotDeck: 'Bot-Deck wählen', chooseBotDeckDescription: 'Wähle eines deiner gespeicherten Decks für den Bot-Gegner.',
    chooseYourDeck: 'Wähle dein Deck', createLobby: 'Lobby erstellen', createLobbyDescription: 'Erstelle ein privates Spiel oder tritt mit einem sechsstelligen Code bei.', cancelRoom: 'Raum abbrechen',
    createRoom: 'Raum erstellen', joinRoom: 'Raum beitreten', roomCode: 'Raumcode', roomCodePlaceholder: 'ABC123', roomCancelled: 'Dieser Raum wurde abgebrochen.', roomWaiting: 'Warten auf einen weiteren Spieler…', roomReady: 'Beide Spieler sind beigetreten. Das Spiel wird vorbereitet…', roomRequestFailed: 'Die Raumanfrage ist fehlgeschlagen.', roomSignInPrompt: 'Du musst angemeldet sein, um einen Raum zu erstellen oder beizutreten.', opponentDisconnected: 'Gegner getrennt. Warte bis zu 60 Sekunden auf die Wiederverbindung…', opponentRequestedRematch: 'Dein Gegner hat eine Revanche angefordert.', opponentDeclinedRematch: 'Dein Gegner hat die Revanche abgelehnt.', shareRoom: 'Einladungslink kopieren', roomLinkCopied: 'Einladungslink kopiert',
    findMatch: (queue) => `${queue}-Match suchen`, loadingDecks: 'Deine Decks werden geladen...', matchmaking: 'Matchmaking',
    matchmakingTitle: (queue) => `${queue}-Matchmaking`, multiplayerComingSoon: 'Mehrspieler kommt bald.', noSavedDecks: 'Keine gespeicherten Decks gefunden.',
    openMatchRoom: 'Matchraum wird geöffnet...', pickSavedDeckForPractice: 'Wähle ein gespeichertes Deck fürs Training', practice: 'Training', practiceVsBot: 'Training gegen Bot',
    ranked: 'Rangliste', roomLobby: 'Raum-Lobby', saveDeckPrompt: 'Speichere ein Deck mit mindestens 50 Karten, bevor du eine Simulatorsitzung startest.', signIn: 'Anmelden',
    signInPrompt: 'Melde dich an, um Spiele mit deinen gespeicherten Decks zu simulieren.', simulatorUnavailable: 'Derzeit ist der Simulator auf Mobilgeräten und im Hochformat nicht verfügbar. Bitte verwende einen Desktop-Bildschirm im Querformat.', standard: 'Standard', startPractice: 'Training gegen Bot starten',
    unableToLoadDecks: 'Decks konnten nicht geladen werden.', untitledDeck: 'Unbenanntes Deck', usesDefaultBotStrategy: 'Verwendet die ausgewogene Standardstrategie des Bots.', yourDeck: 'Dein Deck',
  },
  ms: {
    botDeck: 'Dek bot', botDifficulty: 'Kesukaran bot', botOpponent: 'Lawan bot', buildDeck: 'Bina dek',
    cardCount: (count) => `${count} kad`,
    cardCountSelected: (count) => `${count} kad dipilih`,
    casual: 'kasual', change: 'Tukar', chooseBotDeck: 'Pilih dek bot', chooseBotDeckDescription: 'Pilih salah satu dek tersimpan anda untuk lawan bot.',
    chooseYourDeck: 'Pilih dek anda', createLobby: 'Cipta lobi', createLobbyDescription: 'Cipta permainan peribadi atau sertai rakan dengan kod enam aksara.', cancelRoom: 'Batalkan bilik',
    createRoom: 'Cipta bilik', joinRoom: 'Sertai bilik', roomCode: 'Kod bilik', roomCodePlaceholder: 'ABC123', roomCancelled: 'Bilik ini telah dibatalkan.', roomWaiting: 'Menunggu pemain lain…', roomReady: 'Kedua-dua pemain telah sertai. Menyediakan perlawanan…', roomRequestFailed: 'Permintaan bilik gagal. Cuba lagi.', roomSignInPrompt: 'Anda perlu log masuk untuk mencipta atau menyertai bilik.', opponentDisconnected: 'Lawan terputus. Menunggu sehingga 60 saat untuk sambungan semula…', opponentRequestedRematch: 'Lawan anda meminta perlawanan semula.', opponentDeclinedRematch: 'Lawan anda menolak perlawanan semula.', shareRoom: 'Salin pautan jemputan', roomLinkCopied: 'Pautan jemputan disalin',
    findMatch: (queue) => `Cari perlawanan ${queue}`, loadingDecks: 'Memuatkan dek anda...', matchmaking: 'Pencarian lawan',
    matchmakingTitle: (queue) => `Pencarian lawan ${queue}`, multiplayerComingSoon: 'Berbilang pemain akan datang.', noSavedDecks: 'Tiada dek tersimpan ditemui.',
    openMatchRoom: 'Membuka bilik perlawanan...', pickSavedDeckForPractice: 'Pilih dek tersimpan untuk latihan', practice: 'Latihan', practiceVsBot: 'Latihan lawan bot',
    ranked: 'berkedudukan', roomLobby: 'Lobi bilik', saveDeckPrompt: 'Simpan dek dengan sekurang-kurangnya 50 kad sebelum memulakan sesi simulator.', signIn: 'Log masuk',
    signInPrompt: 'Log masuk untuk mensimulasikan permainan dengan dek tersimpan anda.', simulatorUnavailable: 'Pada masa ini, simulator tidak tersedia pada mudah alih atau orientasi potret. Sila gunakan skrin desktop landskap.', standard: 'Standard', startPractice: 'Mulakan latihan lawan bot',
    unableToLoadDecks: 'Tidak dapat memuatkan dek.', untitledDeck: 'Dek tanpa tajuk', usesDefaultBotStrategy: 'Menggunakan strategi bot seimbang lalai.', yourDeck: 'Dek anda',
  },
  'zh-CN': {
    botDeck: '机器人牌组', botDifficulty: '机器人难度', botOpponent: '机器人对手', buildDeck: '构筑牌组',
    cardCount: (count) => `${count} 张卡`,
    cardCountSelected: (count) => `已选择 ${count} 张卡`,
    casual: '休闲', change: '更换', chooseBotDeck: '选择机器人牌组', chooseBotDeckDescription: '为机器人对手选择一个你保存的牌组。',
    chooseYourDeck: '选择你的牌组', createLobby: '创建大厅', createLobbyDescription: '创建私人对局，或使用六位代码加入好友。', cancelRoom: '取消房间',
    createRoom: '创建房间', joinRoom: '加入房间', roomCode: '房间代码', roomCodePlaceholder: 'ABC123', roomCancelled: '该房间已取消。', roomWaiting: '正在等待另一位玩家…', roomReady: '双方均已加入，正在准备对局…', roomRequestFailed: '房间请求失败，请重试。', roomSignInPrompt: '你需要登录才能创建或加入房间。', opponentDisconnected: '对手已断开连接，等待其在 60 秒内重新连接…', opponentRequestedRematch: '你的对手请求再来一局。', opponentDeclinedRematch: '你的对手拒绝了再来一局。', shareRoom: '复制邀请链接', roomLinkCopied: '邀请链接已复制',
    findMatch: (queue) => `寻找${queue}匹配`, loadingDecks: '正在加载你的牌组...', matchmaking: '匹配',
    matchmakingTitle: (queue) => `${queue}匹配`, multiplayerComingSoon: '多人游戏即将推出。', noSavedDecks: '未找到已保存的牌组。',
    openMatchRoom: '正在打开对战房间...', pickSavedDeckForPractice: '选择一个已保存的牌组进行练习', practice: '练习', practiceVsBot: '对战机器人练习',
    ranked: '排位', roomLobby: '房间大厅', saveDeckPrompt: '请先保存一个至少 50 张卡的牌组，再开始模拟器对局。', signIn: '登录',
    signInPrompt: '登录后即可使用你保存的牌组模拟对局。', simulatorUnavailable: '目前，模拟器不支持移动设备或竖屏方向。请使用桌面横屏。', standard: '标准', startPractice: '开始对战机器人练习',
    unableToLoadDecks: '无法加载牌组。', untitledDeck: '未命名牌组', usesDefaultBotStrategy: '使用默认的均衡机器人策略。', yourDeck: '你的牌组',
  },
  ja: {
    botDeck: 'ボットデッキ', botDifficulty: 'ボット難易度', botOpponent: 'ボット対戦相手', buildDeck: 'デッキを作成',
    cardCount: (count) => `${count}枚`,
    cardCountSelected: (count) => `${count}枚選択中`,
    casual: 'カジュアル', change: '変更', chooseBotDeck: 'ボットデッキを選択', chooseBotDeckDescription: 'ボットの対戦相手に使う保存済みデッキを選んでください。',
    chooseYourDeck: 'あなたのデッキを選択', createLobby: 'ロビーを作成', createLobbyDescription: 'プライベートゲームを作成するか、6文字のコードで参加します。', cancelRoom: 'ルームをキャンセル',
    createRoom: 'ルームを作成', joinRoom: 'ルームに参加', roomCode: 'ルームコード', roomCodePlaceholder: 'ABC123', roomCancelled: 'このルームはキャンセルされました。', roomWaiting: 'ほかのプレイヤーを待っています…', roomReady: '両プレイヤーが参加しました。対戦を準備しています…', roomRequestFailed: 'ルームの操作に失敗しました。もう一度お試しください。', roomSignInPrompt: 'ルームを作成または参加するにはサインインが必要です。', opponentDisconnected: '対戦相手が切断しました。再接続を最大60秒待っています…', opponentRequestedRematch: '対戦相手が再戦を希望しています。', opponentDeclinedRematch: '対戦相手が再戦を辞退しました。', shareRoom: '招待リンクをコピー', roomLinkCopied: '招待リンクをコピーしました',
    findMatch: (queue) => `${queue}マッチを探す`, loadingDecks: 'デッキを読み込み中...', matchmaking: 'マッチメイキング',
    matchmakingTitle: (queue) => `${queue}マッチメイキング`, multiplayerComingSoon: 'マルチプレイヤーは近日対応予定です。', noSavedDecks: '保存済みデッキが見つかりません。',
    openMatchRoom: 'マッチルームを開いています...', pickSavedDeckForPractice: '練習用の保存済みデッキを選択', practice: '練習', practiceVsBot: 'ボットと練習',
    ranked: 'ランク', roomLobby: 'ルームロビー', saveDeckPrompt: 'シミュレーターを開始する前に50枚以上のデッキを保存してください。', signIn: 'サインイン',
    signInPrompt: '保存済みデッキでゲームをシミュレートするにはサインインしてください。', simulatorUnavailable: '現時点では、シミュレーターはモバイル端末または縦向き画面では利用できません。デスクトップの横向き画面を使用してください。', standard: '標準', startPractice: 'ボット練習を開始',
    unableToLoadDecks: 'デッキを読み込めません。', untitledDeck: '無題のデッキ', usesDefaultBotStrategy: '標準のバランス型ボット戦略を使用します。', yourDeck: 'あなたのデッキ',
  },
};

export function getPlayLobbyCopy(locale: Locale): PlayLobbyCopy {
  return LOBBY_COPY[locale];
}

const LOG_REPLACEMENTS: Record<Exclude<Locale, 'en'>, Array<[string, string]>> = {
  fr: [['victory points', 'points de victoire'], ['victory point', 'point de victoire'], ['battlefield control', 'le contrôle du champ de bataille'], ['Counter window closes', 'La fenêtre de contre se ferme'], ['counter priority', 'la priorité de contre'], ['was destroyed', 'a été détruit'], ['were destroyed', 'ont été détruits'], ['damage to', 'dégâts à'], ['You drew', 'Vous avez pioché'], ['Bot drew', 'Le bot a pioché'], ['Your turn', 'Votre tour'], ['Bot turn', 'Tour du bot'], ['Turn', 'Tour'], ['You pass', 'Vous passez'], ['Bot passes', 'Le bot passe'], ['You score', 'Vous marquez'], ['Bot scores', 'Le bot marque'], ['card.', 'carte.'], ['cards.', 'cartes.']],
  de: [['victory points', 'Siegpunkte'], ['victory point', 'Siegpunkt'], ['battlefield control', 'Schlachtfeldkontrolle'], ['Counter window closes', 'Das Konterfenster schließt sich'], ['counter priority', 'Konterpriorität'], ['was destroyed', 'wurde zerstört'], ['were destroyed', 'wurden zerstört'], ['damage to', 'Schaden an'], ['You drew', 'Du hast gezogen:'], ['Bot drew', 'Der Bot zog'], ['Your turn', 'Dein Zug'], ['Bot turn', 'Bot-Zug'], ['Turn', 'Zug'], ['You pass', 'Du passt'], ['Bot passes', 'Der Bot passt'], ['You score', 'Du erhältst'], ['Bot scores', 'Der Bot erhält'], ['card.', 'Karte.'], ['cards.', 'Karten.']],
  ms: [['victory points', 'mata kemenangan'], ['victory point', 'mata kemenangan'], ['battlefield control', 'penguasaan medan tempur'], ['Counter window closes', 'Tetingkap balas ditutup'], ['counter priority', 'keutamaan balas'], ['was destroyed', 'telah dimusnahkan'], ['were destroyed', 'telah dimusnahkan'], ['damage to', 'kerosakan kepada'], ['You drew', 'Anda menarik'], ['Bot drew', 'Bot menarik'], ['Your turn', 'Giliran anda'], ['Bot turn', 'Giliran Bot'], ['Turn', 'Giliran'], ['You pass', 'Anda melepasi'], ['Bot passes', 'Bot melepasi'], ['You score', 'Anda mendapat'], ['Bot scores', 'Bot mendapat'], ['card.', 'kad.'], ['cards.', 'kad.']],
  'zh-CN': [['victory points', '点胜利点'], ['victory point', '点胜利点'], ['battlefield control', '战场控制'], ['Counter window closes', '反制窗口关闭'], ['counter priority', '反制优先权'], ['was destroyed', '被消灭'], ['were destroyed', '被消灭'], ['damage to', '点伤害给'], ['You drew', '你抽取了'], ['Bot drew', '机器人抽取了'], ['Your turn', '你的回合'], ['Bot turn', '机器人回合'], ['Turn', '回合'], ['You pass', '你放弃'], ['Bot passes', '机器人放弃'], ['You score', '你获得'], ['Bot scores', '机器人获得'], ['card.', '张卡。'], ['cards.', '张卡。'], ['Captured', '占领'], ['Attacked', '攻击']],
  ja: [['victory points', '勝利点'], ['victory point', '勝利点'], ['battlefield control', '戦場の支配'], ['Counter window closes', 'カウンターウィンドウを閉じます'], ['counter priority', 'カウンター優先権'], ['was destroyed', 'は破壊されました'], ['were destroyed', 'は破壊されました'], ['damage to', 'ダメージを'], ['You drew', 'あなたは引きました：'], ['Bot drew', 'ボットは引きました：'], ['Your turn', 'あなたのターン'], ['Bot turn', 'ボットのターン'], ['Turn', 'ターン'], ['You pass', 'あなたはパスします'], ['Bot passes', 'ボットはパスします'], ['You score', 'あなたは獲得します：'], ['Bot scores', 'ボットは獲得します：'], ['card.', '枚。'], ['cards.', '枚。'], ['Captured', '占領'], ['Attacked', '攻撃']],
};

const ACTION_LOG_REPLACEMENTS: Record<Exclude<Locale, 'en'>, Array<[string, string]>> = {
  fr: [
    ['Counter priority opened', 'Priorité de contre ouverte'], ['Declared attack', 'Attaque déclarée'], ['Resolved counter', 'Contre résolu'],
    ['You played a face-down territory in', 'Vous avez joué un territoire face cachée dans'], ['Bot played a face-down territory in', 'Le bot a joué un territoire face cachée dans'], ['played a face-down territory in', 'a joué un territoire face cachée dans'],
    ['moved the top card to supply exhausted', 'a déplacé la carte du dessus vers le ravitaillement épuisé'], ['put the top card into hand', 'a mis la carte du dessus en main'],
    ['as starting supply', 'comme ravitaillement de départ'], ['replacement card', 'carte de remplacement'], ['and drew', 'et a pioché'],
    ['Bot supplied a card', 'Le bot a ravitaillé une carte'], ['Supplied', 'Ravitaillé'], ['Bot played', 'Le bot a joué'], ['You played', 'Vous avez joué'], ['Played', 'Joué'],
    ['Bot moved', 'Le bot a déplacé'], ['Moved', 'Déplacé'], ['Bot discarded', 'Le bot a défaussé'], ['Discarded', 'Défaussé'],
    ['Bot sacrificed', 'Le bot a sacrifié'], ['Sacrificed', 'Sacrifié'], ['Placed', 'Placé'], ['Flipped', 'Retourné'],
    ['Flanked', 'Contourné'], ['Attacked', 'Attaqué'], ['Captured', 'Capturé'], ['fighting', 'affrontant'], ['targeting', 'ciblant'],
    ['dealt', 'a infligé'], ['gained', 'a gagné'], ['retreated', 'a battu en retraite'], ['returned to hand', 'est retourné en main'],
    ['to Staging', 'vers la zone de préparation'], ['to supply exhausted', 'vers le ravitaillement épuisé'], ['Battlefield', 'Champ de bataille'],
  ],
  de: [
    ['Counter priority opened', 'Konterpriorität eröffnet'], ['Declared attack', 'Angriff angesagt'], ['Resolved counter', 'Konter aufgelöst'],
    ['You played a face-down territory in', 'Du spieltest ein verdecktes Gebiet in'], ['Bot played a face-down territory in', 'Der Bot spielte ein verdecktes Gebiet in'], ['played a face-down territory in', 'spielte ein verdecktes Gebiet in'],
    ['moved the top card to supply exhausted', 'legte die oberste Karte erschöpft in die Versorgung'], ['put the top card into hand', 'nahm die oberste Karte auf die Hand'],
    ['as starting supply', 'als Startversorgung'], ['replacement card', 'Ersatzkarte'], ['and drew', 'und zog'],
    ['Bot supplied a card', 'Der Bot versorgte eine Karte'], ['Supplied', 'Versorgt'], ['Bot played', 'Der Bot spielte'], ['You played', 'Du spieltest'], ['Played', 'Ausgespielt'],
    ['Bot moved', 'Der Bot bewegte'], ['Moved', 'Bewegt'], ['Bot discarded', 'Der Bot warf ab'], ['Discarded', 'Abgeworfen'],
    ['Bot sacrificed', 'Der Bot opferte'], ['Sacrificed', 'Geopfert'], ['Placed', 'Platziert'], ['Flipped', 'Aufgedeckt'],
    ['Flanked', 'Flankiert'], ['Attacked', 'Angegriffen'], ['Captured', 'Erobert'], ['fighting', 'im Kampf gegen'], ['targeting', 'mit Ziel'],
    ['dealt', 'verursachte'], ['gained', 'erhielt'], ['retreated', 'zog sich zurück'], ['returned to hand', 'kehrte auf die Hand zurück'],
    ['to Staging', 'in den Vorbereitungsbereich'], ['to supply exhausted', 'erschöpft in die Versorgung'], ['Battlefield', 'Schlachtfeld'],
  ],
  ms: [
    ['Counter priority opened', 'Keutamaan balas dibuka'], ['Declared attack', 'Serangan diisytiharkan'], ['Resolved counter', 'Balas diselesaikan'],
    ['You played a face-down territory in', 'Anda memainkan wilayah tertutup di'], ['Bot played a face-down territory in', 'Bot memainkan wilayah tertutup di'], ['played a face-down territory in', 'memainkan wilayah tertutup di'],
    ['moved the top card to supply exhausted', 'memindahkan kad teratas ke bekalan dalam keadaan letih'], ['put the top card into hand', 'meletakkan kad teratas ke dalam tangan'],
    ['as starting supply', 'sebagai bekalan permulaan'], ['replacement card', 'kad gantian'], ['and drew', 'dan menarik'],
    ['Bot supplied a card', 'Bot membekalkan satu kad'], ['Supplied', 'Dibekalkan'], ['Bot played', 'Bot memainkan'], ['You played', 'Anda memainkan'], ['Played', 'Dimainkan'],
    ['Bot moved', 'Bot memindahkan'], ['Moved', 'Dipindahkan'], ['Bot discarded', 'Bot membuang'], ['Discarded', 'Dibuang'],
    ['Bot sacrificed', 'Bot mengorbankan'], ['Sacrificed', 'Dikorbankan'], ['Placed', 'Diletakkan'], ['Flipped', 'Diterbalikkan'],
    ['Flanked', 'Diapit'], ['Attacked', 'Diserang'], ['Captured', 'Dikuasai'], ['fighting', 'melawan'], ['targeting', 'menyasarkan'],
    ['dealt', 'memberikan'], ['gained', 'mendapat'], ['retreated', 'berundur'], ['returned to hand', 'kembali ke tangan'],
    ['to Staging', 'ke kawasan persediaan'], ['to supply exhausted', 'ke bekalan dalam keadaan letih'], ['Battlefield', 'Medan Tempur'],
  ],
  'zh-CN': [
    ['Counter priority opened', '反制优先权已开启'], ['Declared attack', '宣告攻击'], ['Resolved counter', '已结算反制'],
    ['You played a face-down territory in', '你在以下位置打出了一张面朝下的领地：'], ['Bot played a face-down territory in', '机器人在以下位置打出了一张面朝下的领地：'], ['played a face-down territory in', '在以下位置打出了一张面朝下的领地：'],
    ['moved the top card to supply exhausted', '将牌库顶牌以耗竭状态移至补给区'], ['put the top card into hand', '将牌库顶牌置入手牌'],
    ['as starting supply', '作为起始补给'], ['replacement card', '替代卡'], ['and drew', '并抽取了'],
    ['Bot supplied a card', '机器人将一张卡充作补给'], ['Supplied', '充作补给'], ['Bot played', '机器人打出了'], ['You played', '你打出了'], ['Played', '打出'],
    ['Bot moved', '机器人移动了'], ['Moved', '移动'], ['Bot discarded', '机器人弃置了'], ['Discarded', '弃置'],
    ['Bot sacrificed', '机器人牺牲了'], ['Sacrificed', '牺牲'], ['Placed', '放置'], ['Flipped', '翻面'],
    ['Flanked', '侧翼攻击'], ['Attacked', '攻击'], ['Captured', '占领'], ['fighting', '与之战斗：'], ['targeting', '目标：'],
    ['dealt', '造成了'], ['gained', '获得了'], ['retreated', '撤退'], ['returned to hand', '返回手牌'],
    ['to Staging', '至集结区'], ['to supply exhausted', '以耗竭状态移至补给区'], ['Battlefield', '战场'],
    ['counter.', '反制牌。'], ['as a counter', '作为反制牌'], ['priority opened', '优先权已开启'],
  ],
  ja: [
    ['Counter priority opened', 'カウンター優先権を開始'], ['Declared attack', '攻撃を宣言'], ['Resolved counter', 'カウンターを解決'],
    ['You played a face-down territory in', 'あなたは裏向きの領地を次にプレイしました：'], ['Bot played a face-down territory in', 'ボットは裏向きの領地を次にプレイしました：'], ['played a face-down territory in', 'は裏向きの領地を次にプレイしました：'],
    ['moved the top card to supply exhausted', 'はデッキの一番上のカードを消耗状態でサプライに移しました'], ['put the top card into hand', 'はデッキの一番上のカードを手札に加えました'],
    ['as starting supply', '開始時のサプライとして'], ['replacement card', '補充カード'], ['and drew', 'さらに引きました：'],
    ['Bot supplied a card', 'ボットはカード1枚をサプライに置き'], ['Supplied', 'サプライに置いたカード：'], ['Bot played', 'ボットがプレイ：'], ['You played', 'あなたがプレイ：'], ['Played', 'プレイ：'],
    ['Bot moved', 'ボットが移動：'], ['Moved', '移動：'], ['Bot discarded', 'ボットが捨てたカード：'], ['Discarded', '捨てたカード：'],
    ['Bot sacrificed', 'ボットが生け贄にしたカード：'], ['Sacrificed', '生け贄：'], ['Placed', '配置：'], ['Flipped', '表向き：'],
    ['Flanked', '側面攻撃：'], ['Attacked', '攻撃：'], ['Captured', '占領：'], ['fighting', '戦闘相手：'], ['targeting', '対象：'],
    ['dealt', 'が与えたダメージ：'], ['gained', 'が獲得：'], ['retreated', 'が撤退'], ['returned to hand', 'が手札に戻りました'],
    ['to Staging', 'ステージングへ'], ['to supply exhausted', '消耗状態でサプライへ'], ['Battlefield', '戦場'],
    ['counter.', 'カウンター。'], ['as a counter', 'カウンターとして'], ['priority opened', '優先権を開始'],
  ],
};

export function translateGameLogText(locale: Locale, text: string): string {
  if (locale === 'en') return text;
  if (text === 'Opponent did not reconnect before the grace period expired.') {
    return {
      fr: 'L’adversaire ne s’est pas reconnecté avant la fin du délai.',
      de: 'Der Gegner hat sich nicht innerhalb der Frist wieder verbunden.',
      ms: 'Lawan tidak menyambung semula sebelum tempoh tamat.',
      'zh-CN': '对手未在宽限时间结束前重新连接。',
      ja: '対戦相手は猶予時間内に再接続しませんでした。',
    }[locale];
  }
  if (text === 'Kept the opening hand.') {
    return {
      fr: 'Main de départ conservée.',
      de: 'Starthand behalten.',
      ms: 'Tangan permulaan dikekalkan.',
      'zh-CN': '已保留起始手牌。',
      ja: '初手をキープしました。',
    }[locale];
  }
  const mulliganMatch = text.match(/^Mulliganed the opening hand and drew (\d+) new cards\.$/);
  if (mulliganMatch) {
    const count = mulliganMatch[1];
    return {
      fr: `Main de départ remplacée et ${count} nouvelles cartes piochées.`,
      de: `Starthand ausgetauscht und ${count} neue Karten gezogen.`,
      ms: `Tangan permulaan ditukar dan ${count} kad baharu ditarik.`,
      'zh-CN': `已调度起始手牌并抽取 ${count} 张新牌。`,
      ja: `初手をマリガンし、新たに${count}枚引きました。`,
    }[locale];
  }
  const setupMatch = text.match(/^Started setup against (.+)\. Bot placed starting supply\. Choose 1 card from hand as starting supply, then choose who goes first\.$/);
  if (setupMatch) {
    const deckName = setupMatch[1];
    const templates: Record<Exclude<Locale, 'en'>, string> = {
      fr: `Mise en place commencée contre ${deckName}. Le bot a placé son ravitaillement de départ. Choisissez 1 carte de votre main comme ravitaillement de départ, puis choisissez qui joue en premier.`,
      de: `Vorbereitung gegen ${deckName} gestartet. Der Bot hat seine Startversorgung platziert. Wähle 1 Handkarte als Startversorgung und bestimme dann, wer beginnt.`,
      ms: `Persediaan dimulakan menentang ${deckName}. Bot telah meletakkan bekalan permulaan. Pilih 1 kad dari tangan sebagai bekalan permulaan, kemudian pilih siapa bermain dahulu.`,
      'zh-CN': `已开始与 ${deckName} 的对局设置。机器人已放置起始补给。请从手牌中选择 1 张作为起始补给，然后选择谁先手。`,
      ja: `${deckName}とのセットアップを開始しました。ボットは開始時のサプライを配置しました。手札から1枚を開始時のサプライとして選び、その後に先攻を選んでください。`,
    };
    return templates[locale];
  }
  const practiceMatch = text.match(/^Started practice with (\d+) cards\. Choose 1 card from hand as starting supply\.$/);
  if (practiceMatch) {
    const count = practiceMatch[1];
    const templates: Record<Exclude<Locale, 'en'>, string> = {
      fr: `Entraînement commencé avec ${count} cartes. Choisissez 1 carte de votre main comme ravitaillement de départ.`,
      de: `Training mit ${count} Karten gestartet. Wähle 1 Handkarte als Startversorgung.`,
      ms: `Latihan dimulakan dengan ${count} kad. Pilih 1 kad dari tangan sebagai bekalan permulaan.`,
      'zh-CN': `已使用 ${count} 张卡开始练习。请从手牌中选择 1 张作为起始补给。`,
      ja: `${count}枚のカードで練習を開始しました。手札から1枚を開始時のサプライとして選んでください。`,
    };
    return templates[locale];
  }
  const skipDrawMatch = text.match(/^(You skip|Bot skips) the first draw\.$/);
  if (skipDrawMatch) {
    const player = skipDrawMatch[1] === 'You skip';
    const templates: Record<Exclude<Locale, 'en'>, string> = {
      fr: player ? 'Vous passez la première pioche.' : 'Le bot passe la première pioche.',
      de: player ? 'Du überspringst das erste Ziehen.' : 'Der Bot überspringt das erste Ziehen.',
      ms: player ? 'Anda melangkau tarikan pertama.' : 'Bot melangkau tarikan pertama.',
      'zh-CN': player ? '你跳过第一次抽卡。' : '机器人跳过第一次抽卡。',
      ja: player ? 'あなたは最初のドローをスキップします。' : 'ボットは最初のドローをスキップします。',
    };
    return templates[locale];
  }
  const turnMatch = text.match(/^(Your|Bot) turn (\d+)\.$/);
  if (turnMatch) {
    const owner = turnMatch[1] === 'Your' ? CONTROLS_COPY[locale].yourTurn : CONTROLS_COPY[locale].botTurn;
    return `${owner} ${turnMatch[2]}${locale === 'zh-CN' || locale === 'ja' ? '。' : '.'}`;
  }
  const drawMatch = text.match(/^(You|Bot) drew (\d+) cards?\.$/);
  if (drawMatch) {
    const [, owner, count] = drawMatch;
    const templates: Record<Exclude<Locale, 'en'>, string> = {
      fr: owner === 'You' ? `Vous avez pioché ${count} carte(s).` : `Le bot a pioché ${count} carte(s).`,
      de: owner === 'You' ? `Du hast ${count} Karte(n) gezogen.` : `Der Bot hat ${count} Karte(n) gezogen.`,
      ms: owner === 'You' ? `Anda menarik ${count} kad.` : `Bot menarik ${count} kad.`,
      'zh-CN': owner === 'You' ? `你抽取了 ${count} 张卡。` : `机器人抽取了 ${count} 张卡。`,
      ja: owner === 'You' ? `あなたはカードを${count}枚引きました。` : `ボットはカードを${count}枚引きました。`,
    };
    return templates[locale];
  }
  const firstMatch = text.match(/^(You go|Bot goes) first\. Turn 1 begins\.$/);
  if (firstMatch) {
    const playerFirst = firstMatch[1] === 'You go';
    const templates: Record<Exclude<Locale, 'en'>, string> = {
      fr: `${playerFirst ? 'Vous jouez' : 'Le bot joue'} en premier. Le tour 1 commence.`,
      de: `${playerFirst ? 'Du beginnst' : 'Der Bot beginnt'}. Zug 1 beginnt.`,
      ms: `${playerFirst ? 'Anda' : 'Bot'} bermain dahulu. Giliran 1 bermula.`,
      'zh-CN': `${playerFirst ? '你' : '机器人'}先手。第 1 回合开始。`,
      ja: `${playerFirst ? 'あなた' : 'ボット'}が先攻です。ターン1を開始します。`,
    };
    return templates[locale];
  }
  const translated = [...ACTION_LOG_REPLACEMENTS[locale], ...LOG_REPLACEMENTS[locale]].reduce(
    (translated, [source, replacement]) => translated.replaceAll(source, replacement),
    text
  );
  return locale === 'zh-CN' || locale === 'ja' ? translated.replaceAll('.', '。') : translated;
}
