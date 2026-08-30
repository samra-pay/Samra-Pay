import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PublicLanguage = "en" | "am";

export type LocalizedText = {
  en: string;
  am: string;
};

const STORAGE_KEY = "samra-language";

function readStoredLanguage(): PublicLanguage {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "am" ? "am" : "en";
  } catch {
    return "en";
  }
}

type PublicLanguageContextValue = {
  language: PublicLanguage;
  setLanguage: (language: PublicLanguage) => void;
  text: (copy: LocalizedText) => string;
};

const PublicLanguageContext = createContext<PublicLanguageContextValue | undefined>(undefined);

export function PublicLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<PublicLanguage>(readStoredLanguage);

  const setLanguage = useCallback((nextLanguage: PublicLanguage) => {
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch {
      // The language still changes for this page even when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<PublicLanguageContextValue>(
    () => ({
      language,
      setLanguage,
      text: (copy) => copy[language] || copy.en,
    }),
    [language, setLanguage],
  );

  return <PublicLanguageContext.Provider value={value}>{children}</PublicLanguageContext.Provider>;
}

export function usePublicLanguage(): PublicLanguageContextValue {
  const context = useContext(PublicLanguageContext);
  if (!context) {
    throw new Error("usePublicLanguage must be used within PublicLanguageProvider");
  }
  return context;
}

export function localized(en: string, am: string): LocalizedText {
  return { en, am };
}
