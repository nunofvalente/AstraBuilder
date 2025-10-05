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
    signIn: {
      title: string;
      description: string;
      dividerLabel: string;
      form: {
        emailLabel: string;
        passwordLabel: string;
        submit: string;
      };
      google: {
        button: string;
      };
      messages: {
        invalidCredentials: string;
        genericError: string;
        passwordResetSuccess: string;
        passwordResetExpired: string;
        accountDeleted: string;
      };
      footer: {
        noAccount: string;
        signUpLink: string;
      };
      forgotPasswordLink: string;
    };
    forgotPassword: {
      title: string;
      description: string;
      form: {
        emailLabel: string;
        submit: string;
      };
      messages: {
        success: string;
        genericError: string;
      };
      footer: {
        backToSignIn: string;
      };
    };
    resetPassword: {
      title: string;
      description: string;
      form: {
        passwordLabel: string;
        confirmPasswordLabel: string;
        submit: string;
      };
      messages: {
        mismatch: string;
        genericError: string;
        success: string;
      };
      footer: {
        backToHome: string;
      };
    };
    passwordStrength: {
      label: string;
      values: {
        tooWeak: string;
        weak: string;
        medium: string;
        strong: string;
        veryStrong: string;
      };
    };
  };
};

type ProfileDictionaryShape = {
  profile: {
    heading: string;
    description: string;
    fields: {
      username: string;
      usernameHint: string;
      bio: string;
      bioHint: string;
      xLink: string;
      xPlaceholder: string;
      youtubeLink: string;
      youtubePlaceholder: string;
    };
    actions: {
      save: string;
      saving: string;
    };
    deleteAccount: {
      title: string;
      description: string;
      trigger: string;
      confirmationLabel: string;
      confirmationDescription: string;
      confirmationPlaceholder: string;
      confirmationKeyword: string;
      confirmButton: string;
      cancelButton: string;
      success: string;
      error: string;
      keywordMismatch: string;
    };
    messages: {
      loading: string;
      success: string;
      error: string;
      usernameRequired: string;
    };
  };
};
type DictionaryModule = { default: HomeDictionary & BuilderDictionary & CardsDictionary & AuthDictionary & ProfileDictionaryShape };

type ImportDictionary = () => Promise<DictionaryModule>;

const dictionaries: Record<Locale, ImportDictionary> = {
  en: () => import("./locales/en.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"),
  ms: () => import("./locales/ms.json"),
};

export type Dictionary = HomeDictionary & BuilderDictionary & CardsDictionary & AuthDictionary & ProfileDictionaryShape;
export type SignUpDictionary = AuthDictionary["auth"]["signUp"];
export type SignInDictionary = AuthDictionary["auth"]["signIn"];
export type ForgotPasswordDictionary = AuthDictionary["auth"]["forgotPassword"];
export type ResetPasswordDictionary = AuthDictionary["auth"]["resetPassword"];
export type PasswordStrengthDictionary = AuthDictionary["auth"]["passwordStrength"];
export type ProfileDictionary = ProfileDictionaryShape;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]().then((module) => module.default);
}
