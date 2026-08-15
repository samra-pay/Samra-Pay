import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Lightweight EN ↔ Amharic i18n for key UI strings (labels, CTAs, navigation).
 * Numeric/financial content is intentionally not translated.
 *
 * Per the DS voice-tone guide, Amharic renders in the Ethiopic serif font,
 * one size down from its English sibling, with relaxed leading — use the
 * exposed `isAmharic` flag with the DS `fontFamily.ethiopic` mapping.
 */

export type Language = 'en' | 'am';

const STORAGE_KEY = 'samra-pay-language';

const STRINGS = {
  // Tab navigation
  'tabs.home': { en: 'Home', am: 'ቤት' },
  'tabs.cards': { en: 'Cards', am: 'ካርዶች' },
  'tabs.send': { en: 'Send', am: 'ላክ' },
  'tabs.rewards': { en: 'Rewards', am: 'ሽልማቶች' },

  // Settings screen
  'settings.title': { en: 'Settings', am: 'ቅንብሮች' },
  'settings.subtitle': {
    en: 'Manage your profile and preferences.',
    am: 'መገለጫዎን እና ምርጫዎችዎን ያስተዳድሩ።',
  },
  'settings.profile': { en: 'Profile Information', am: 'የመገለጫ መረጃ' },
  'settings.email': { en: 'Email', am: 'ኢሜይል' },
  'settings.phone': { en: 'Phone', am: 'ስልክ' },
  'settings.memberSince': { en: 'Member since', am: 'አባል ከ' },
  'settings.language': { en: 'Language', am: 'ቋንቋ' },
  'settings.languageDetail': {
    en: 'Choose the language for labels and navigation.',
    am: 'ለመለያዎች እና ለአሰሳ ቋንቋ ይምረጡ።',
  },
  'settings.notifications': { en: 'Notifications', am: 'ማሳወቂያዎች' },
  'settings.security': { en: 'Security', am: 'ደህንነት' },
  'settings.signOut': { en: 'Sign out', am: 'ይውጡ' },
} as const;

export type StringKey = keyof typeof STRINGS;

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: StringKey) => string;
  /** True when Amharic is active — switch text styles to the Ethiopic font. */
  isAmharic: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'am') setLanguageState('am');
      })
      .catch(() => {
        // preference just won't restore — non-fatal
      });
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {
      // preference just won't persist — non-fatal
    });
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key: StringKey) => STRINGS[key][language],
      isAmharic: language === 'am',
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
