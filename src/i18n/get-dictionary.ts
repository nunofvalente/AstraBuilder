import type { Locale } from "./config";

type HomeDictionary = {
  home: {
    title: string;
    subtitle: string;
    sections: {
      popular: {
        title: string;
        placeholder: string;
      };
      trending: {
        title: string;
        placeholder: string;
      };
    };
    actions: {
      browse: string;
      create: string;
    };
  };
};

type BuilderDictionary = {
  builder: {
    title: string;
    searchLabel: string;
    searchPlaceholder: string;
    cardsHeading: string;
    filtersHeading: string;
    filtersDescription: string;
    comingSoon: string;
    costCurveHeading: string;
    costCurveEmpty: string;
    deckHeading: string;
    emptyDeck: string;
    totalCardsLabel: string;
    addButton: string;
    removeButton: string;
    noResults: string;
  };
};

type CardsDictionary = {
  cards: {
    title: string;
    empty: string;
    error: string;
    fields: {
      type: string;
      subtype: string;
      cost: string;
      attack: string;
      health: string;
      influence: string;
    };
  };
};

type DictionaryModule = { default: HomeDictionary & BuilderDictionary & CardsDictionary };

type ImportDictionary = () => Promise<DictionaryModule>;

const dictionaries: Record<Locale, ImportDictionary> = {
  en: () => import("./locales/en.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"),
  ms: () => import("./locales/ms.json"),
};

export type Dictionary = HomeDictionary & BuilderDictionary & CardsDictionary;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]().then((module) => module.default);
}

