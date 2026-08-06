import type { Locale } from '@/i18n/config';

export type CollectionCopy = {
  title: string;
  description: string;
  sets: string;
  ownedCards: string;
  totalCopies: string;
  collected: string;
  cards: string;
  copies: string;
  openSet: string;
  loading: string;
  loadError: string;
  signInPrompt: string;
  signIn: string;
  back: string;
  searchPlaceholder: string;
  ownedOnly: string;
  noResults: string;
  quantity: string;
  saveError: string;
  analytics: string;
  rarityBreakdown: string;
  collectionTotals: string;
  cardsByType: string;
  catalogProgress: string;
};

const COPY: Record<Locale, CollectionCopy> = {
  en: { title: 'My Collection', description: 'Track the cards you own, organised by set.', sets: 'Sets', ownedCards: 'Unique cards', totalCopies: 'Total cards', collected: 'collected', cards: 'cards', copies: 'owned cards', openSet: 'Open set', loading: 'Loading your collection...', loadError: 'Your collection could not be loaded.', signInPrompt: 'Sign in to track your card collection.', signIn: 'Sign in', back: 'Back to collection', searchPlaceholder: 'Search this set', ownedOnly: 'Owned only', noResults: 'No cards match this search.', quantity: 'Owned quantity', saveError: 'That quantity could not be saved.', analytics: 'Collection breakdown', rarityBreakdown: 'Cards by rarity', collectionTotals: 'Collection totals', cardsByType: 'Cards by type', catalogProgress: 'Unique catalog progress' },
  fr: { title: 'Ma collection', description: 'Suivez les cartes que vous possédez, classées par extension.', sets: 'Extensions', ownedCards: 'Cartes uniques', totalCopies: 'Total de cartes', collected: 'collectionné', cards: 'cartes', copies: 'cartes possédées', openSet: 'Ouvrir l’extension', loading: 'Chargement de votre collection...', loadError: 'Impossible de charger votre collection.', signInPrompt: 'Connectez-vous pour suivre votre collection.', signIn: 'Se connecter', back: 'Retour à la collection', searchPlaceholder: 'Rechercher dans cette extension', ownedOnly: 'Possédées uniquement', noResults: 'Aucune carte ne correspond.', quantity: 'Quantité possédée', saveError: 'Impossible d’enregistrer cette quantité.', analytics: 'Analyse de la collection', rarityBreakdown: 'Cartes par rareté', collectionTotals: 'Totaux de la collection', cardsByType: 'Cartes par type', catalogProgress: 'Progression du catalogue unique' },
  de: { title: 'Meine Sammlung', description: 'Verwalte deine Karten, nach Sets geordnet.', sets: 'Sets', ownedCards: 'Einzigartige Karten', totalCopies: 'Karten gesamt', collected: 'gesammelt', cards: 'Karten', copies: 'Karten im Besitz', openSet: 'Set öffnen', loading: 'Sammlung wird geladen...', loadError: 'Deine Sammlung konnte nicht geladen werden.', signInPrompt: 'Melde dich an, um deine Sammlung zu verwalten.', signIn: 'Anmelden', back: 'Zurück zur Sammlung', searchPlaceholder: 'Dieses Set durchsuchen', ownedOnly: 'Nur eigene', noResults: 'Keine passenden Karten gefunden.', quantity: 'Eigene Anzahl', saveError: 'Diese Anzahl konnte nicht gespeichert werden.', analytics: 'Sammlungsübersicht', rarityBreakdown: 'Karten nach Seltenheit', collectionTotals: 'Sammlung gesamt', cardsByType: 'Karten nach Typ', catalogProgress: 'Fortschritt einzigartiger Karten' },
  ms: { title: 'Koleksi Saya', description: 'Jejaki kad yang anda miliki, disusun mengikut set.', sets: 'Set', ownedCards: 'Kad unik', totalCopies: 'Jumlah kad', collected: 'dikumpul', cards: 'kad', copies: 'kad dimiliki', openSet: 'Buka set', loading: 'Memuatkan koleksi anda...', loadError: 'Koleksi anda tidak dapat dimuatkan.', signInPrompt: 'Log masuk untuk menjejaki koleksi kad anda.', signIn: 'Log masuk', back: 'Kembali ke koleksi', searchPlaceholder: 'Cari dalam set ini', ownedOnly: 'Dimiliki sahaja', noResults: 'Tiada kad yang sepadan.', quantity: 'Kuantiti dimiliki', saveError: 'Kuantiti itu tidak dapat disimpan.', analytics: 'Pecahan koleksi', rarityBreakdown: 'Kad mengikut kelangkaan', collectionTotals: 'Jumlah koleksi', cardsByType: 'Kad mengikut jenis', catalogProgress: 'Kemajuan katalog unik' },
  'zh-CN': { title: '我的收藏', description: '按系列记录你拥有的卡牌。', sets: '系列', ownedCards: '不同卡牌', totalCopies: '卡牌总数', collected: '已收藏', cards: '张卡牌', copies: '已拥有卡牌', openSet: '打开系列', loading: '正在加载收藏...', loadError: '无法加载你的收藏。', signInPrompt: '登录后即可记录卡牌收藏。', signIn: '登录', back: '返回收藏', searchPlaceholder: '搜索此系列', ownedOnly: '仅显示已拥有', noResults: '没有符合条件的卡牌。', quantity: '拥有数量', saveError: '无法保存该数量。', analytics: '收藏分析', rarityBreakdown: '按稀有度统计', collectionTotals: '收藏总览', cardsByType: '按类型统计', catalogProgress: '不同卡牌收集进度' },
  ja: { title: 'マイコレクション', description: '所有カードをセット別に記録できます。', sets: 'セット', ownedCards: 'ユニークカード', totalCopies: 'カード合計', collected: '収集済み', cards: 'カード', copies: '所有カード', openSet: 'セットを開く', loading: 'コレクションを読み込み中...', loadError: 'コレクションを読み込めませんでした。', signInPrompt: 'ログインしてカードコレクションを記録しましょう。', signIn: 'ログイン', back: 'コレクションに戻る', searchPlaceholder: 'このセットを検索', ownedOnly: '所有カードのみ', noResults: '該当するカードはありません。', quantity: '所有枚数', saveError: '枚数を保存できませんでした。', analytics: 'コレクション分析', rarityBreakdown: 'レアリティ別カード', collectionTotals: 'コレクション合計', cardsByType: 'タイプ別カード', catalogProgress: 'ユニークカード進捗' },
};

export function getCollectionCopy(locale: Locale): CollectionCopy {
  return COPY[locale];
}
