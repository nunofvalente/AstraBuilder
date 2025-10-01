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
    showCostCurve: string;
    hideCostCurve: string;
    menuImport: string;
    menuExport: string;
    menuShare: string;
    menuSave: string;
    importHeading: string;
    importInstructions: string;
    importPlaceholder: string;
    importUploadLabel: string;
    importButton: string;
    importCancel: string;
    importErrorInvalid: string;
    importErrorUnknown: string;
    importErrorEmpty: string;
    deckHeading: string;
    emptyDeck: string;
    totalCardsLabel: string;
    addButton: string;
    removeButton: string;
    noResults: string;
    menuButton: string;
    exportOptionTTS: string;
    exportCopy: string;
    exportCopySuccess: string;
    exportCopyError: string;
    shareButton: string;
    shareGenerating: string;
    shareDownload: string;
    shareCopy: string;
    shareCopySuccess: string;
    shareCopyError: string;
    shareEmpty: string;
    shareError: string;
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

type AuthDictionary = {
  auth: {
    signUp: {
      title: string;
      description: string;
      dividerLabel: string;
      form: {
        emailLabel: string;
        passwordLabel: string;
        confirmPasswordLabel: string;
        passwordHint: string;
        submit: string;
      };
      google: {
        button: string;
      };
      messages: {
        passwordMismatch: string;
        genericError: string;
        checkInbox: string;
      };
      footer: {
        haveAccount: string;
        signInLink: string;
      };
    };
  };
};

type DictionaryModule = { default: HomeDictionary & BuilderDictionary & CardsDictionary & AuthDictionary };

type ImportDictionary = () => Promise<DictionaryModule>;

const dictionaries: Record<Locale, ImportDictionary> = {
  en: () => import("./locales/en.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"),
  ms: () => import("./locales/ms.json"),
};

export type Dictionary = HomeDictionary & BuilderDictionary & CardsDictionary & AuthDictionary;
export type SignUpDictionary = AuthDictionary["auth"]["signUp"];

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]().then((module) => module.default);
}
