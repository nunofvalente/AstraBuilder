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

type DictionaryModule = { default: HomeDictionary & CardsDictionary };

type ImportDictionary = () => Promise<DictionaryModule>;

const dictionaries: Record<Locale, ImportDictionary> = {
  en: () => import("./locales/en.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"),
  ms: () => import("./locales/ms.json"),
};

export type Dictionary = HomeDictionary & CardsDictionary;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]().then((module) => module.default);
}
