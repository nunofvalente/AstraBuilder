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

type DictionaryModule = { default: HomeDictionary };

type ImportDictionary = () => Promise<DictionaryModule>;

const dictionaries: Record<Locale, ImportDictionary> = {
  en: () => import("./locales/en.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"),
  ms: () => import("./locales/ms.json"),
};

export type Dictionary = HomeDictionary;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]().then((module) => module.default);
}