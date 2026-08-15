import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Lightweight EN ↔ Amharic i18n for key UI strings (labels, CTAs, navigation).
 * Numeric/financial content is intentionally not translated.
 *
 * Per the DS voice-tone guide, Amharic renders in `font-ethiopic`, one size
 * down from its English sibling, with relaxed leading — use `amharicTextClass`
 * (exposed as `langClass`) on elements that display translated strings.
 */

export type Language = 'en' | 'am';

const STORAGE_KEY = 'samra-language';

const STRINGS = {
  // Public navigation
  'nav.cards': { en: 'Cards', am: 'ካርዶች' },
  'nav.remittance': { en: 'Remittance', am: 'ሐዋላ' },
  'nav.socialHouse': { en: 'Tomoca Social House', am: 'ቶሞካ ማህበራዊ ቤት' },
  'nav.askSamra': { en: 'Ask Samra', am: 'ሳምራን ይጠይቁ' },
  'nav.signIn': { en: 'Sign In', am: 'ይግቡ' },
  'nav.applyNow': { en: 'Apply Now', am: 'አሁን ያመልክቱ' },

  // Dashboard navigation
  'dash.overview': { en: 'Overview', am: 'አጠቃላይ እይታ' },
  'dash.cardsAccounts': { en: 'Cards & Accounts', am: 'ካርዶች እና አካውንቶች' },
  'dash.creditHealth': { en: 'Credit Health', am: 'የብድር ጤና' },
  'dash.analytics': { en: 'Analytics', am: 'ትንታኔ' },
  'dash.remittance': { en: 'Remittance', am: 'ሐዋላ' },
  'dash.rewards': { en: 'Rewards', am: 'ሽልማቶች' },
  'dash.settings': { en: 'Settings', am: 'ቅንብሮች' },
  'dash.signOut': { en: 'Sign Out', am: 'ይውጡ' },
  'dash.dashboard': { en: 'Dashboard', am: 'ዳሽቦርድ' },

  // Language toggle
  'lang.label': { en: 'Language', am: 'ቋንቋ' },
} as const;

export type StringKey = keyof typeof STRINGS;

function readStoredLanguage(): Language {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'am' ? 'am' : 'en';
  } catch {
    return 'en';
  }
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: StringKey) => string;
  /**
   * Class names to apply to elements rendering translated strings.
   * Empty in English; `font-ethiopic leading-relaxed` in Amharic per the
   * DS voice-tone guide. Pair with `lang={langAttr}` for accessibility.
   */
  langClass: string;
  /** Value for the `lang` attribute on translated elements. */
  langAttr: Language;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // preference just won't persist — non-fatal
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) => STRINGS[key][language],
      langClass: language === 'am' ? 'font-ethiopic leading-relaxed' : '',
      langAttr: language,
    }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
