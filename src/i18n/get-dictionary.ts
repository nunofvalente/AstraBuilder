import type { Locale } from "./config";

type HomeDictionary = {
  home: {
    title: string;
    tagline: {
      intro: string;
      highlight: string;
    };
    sections: {
      affinityPairings: {
        title: string;
        placeholder: string;
        deckLabel: string;
        decksLabel: string;
        unknownLabel: string;
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

type AffinityPageDictionary = {
  affinityPage: {
    resultsHeading: string;
    empty: string;
    backLink: string;
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
    save: {
      heading: string;
      titleLabel: string;
      titlePlaceholder: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      cancel: string;
      submit: string;
      saving: string;
      signInPrompt: string;
      signInButton: string;
      emptyDeckError: string;
      genericError: string;
    successMessage: string;
    dismissNotice: string;
    publicLabel: string;
    publicHelp: string;
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

type PublicProfileDictionary = {
  publicProfile: {
    heading: string;
    subtitle: string;
    socialsHeading: string;
    socialsEmpty: string;
    decksHeading: string;
    noDecks: string;
    backButton: string;
    xLabel: string;
    youtubeLabel: string;
    unknownUser: string;
  };
};

type MyDecksDictionary = {
  myDecks: {
    heading: string;
    description: string;
    tabs: {
      mine: string;
      favorites: string;
    };
    empty: string;
    favoritesEmpty: string;
    loading: string;
    error: string;
    signInPrompt: string;
    favoritesSignInPrompt: string;
    signInButton: string;
    publicTag: string;
    privateTag: string;
    createdLabel: string;
    cardsLabel: string;
    emptyStateCta: string;
    untitledLabel: string;
    openButton: string;
    favoritesLabel: string;
    viewsLabel: string;
    retryButton: string;
    editLabel: string;
    editHeading: string;
    editTitleLabel: string;
    editTitlePlaceholder: string;
    editDescriptionLabel: string;
    editDescriptionPlaceholder: string;
    editPublicLabel: string;
    editPublicHelp: string;
    editCancel: string;
    editSave: string;
    editSaving: string;
    editOpenBuilder: string;
    editError: string;
    editSuccess: string;
    editDelete: string;
    editDeleteConfirm: string;
    editDeleteConfirmLabel: string;
    editDeletePlaceholder: string;
    editDeleteError: string;
    editDeleteSuccess: string;
    editDeleteConfirmButton: string;
  };
};
type DeckDetailsDictionary = {
  deckDetails: {
    heading: string;
    description: string;
    sectionsHeading: string;
    notesHeading: string;
    privateNotice: string;
    publicNotice: string;
    backButton: string;
    favoriteAdd: string;
    favoriteRemove: string;
    favoriteSignIn: string;
    favoriteError: string;
  };
};

type DeckFeedDictionary = {
  deckFeed: {
    heading: string;
    description: string;
    empty: string;
    authorLabel: string;
    createdLabel: string;
    cardsLabel: string;
    favoritesLabel: string;
    viewsLabel: string;
    sortOptions: {
      popular: string;
      trending: string;
      new: string;
    };
  };
};

type SettingsDictionaryShape = {
  settings: {
    heading: string;
    description: string;
    language: {
      title: string;
      description: string;
      active: string;
    };
    theme: {
      title: string;
      description: string;
      options: {
        light: string;
        dark: string;
      };
    };
  };
};

type DictionaryModule = {
  default: HomeDictionary &
    AffinityPageDictionary &
    BuilderDictionary &
    CardsDictionary &
    AuthDictionary &
    ProfileDictionaryShape &
    PublicProfileDictionary &
    MyDecksDictionary &
    DeckDetailsDictionary &
    DeckFeedDictionary &
    SettingsDictionaryShape;
};

type ImportDictionary = () => Promise<DictionaryModule>;

const dictionaries: Record<Locale, ImportDictionary> = {
  en: () => import("./locales/en.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"),
  ms: () => import("./locales/ms.json"),
};

export type Dictionary = HomeDictionary &
  AffinityPageDictionary &
  BuilderDictionary &
  CardsDictionary &
  AuthDictionary &
  ProfileDictionaryShape &
  PublicProfileDictionary &
  MyDecksDictionary &
  DeckDetailsDictionary &
  DeckFeedDictionary &
  SettingsDictionaryShape;
export type SignUpDictionary = AuthDictionary["auth"]["signUp"];
export type SignInDictionary = AuthDictionary["auth"]["signIn"];
export type ForgotPasswordDictionary = AuthDictionary["auth"]["forgotPassword"];
export type ResetPasswordDictionary = AuthDictionary["auth"]["resetPassword"];
export type PasswordStrengthDictionary = AuthDictionary["auth"]["passwordStrength"];
export type ProfileDictionary = ProfileDictionaryShape["profile"];
export type SettingsDictionary = SettingsDictionaryShape["settings"];

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]().then((module) => module.default);
}
