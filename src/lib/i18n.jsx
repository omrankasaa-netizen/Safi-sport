import { createContext, useContext, useEffect, useState } from 'react';

/**
 * SAFI SPORT language provider.
 *
 * The storefront launches in English; Arabic (RTL) is phase 2 — the plumbing
 * (lang/dir on <html>, storage, hook API) is already here so flipping the
 * switch later is a content job, not a code job.
 *
 * API: useI18n() → { lang, dir, t, setLang }
 *   lang: 'en' | 'ar'
 *   dir:  'ltr' | 'rtl'  (applied to document.documentElement)
 *   t:    dictionary for the active language (flat key → string)
 */

const dictionaries = {
  en: {
    dir: 'ltr',
    storeName: 'SAFI SPORT',
    tagline: 'Move Different',
    branchElMina: 'El Mina',
    branchDam: 'Dam w Farez',
  },
  ar: {
    dir: 'rtl',
    storeName: 'SAFI SPORT',
    tagline: 'تحرّك بشكل مختلف',
    branchElMina: 'الميناء',
    branchDam: 'ضم و فرز',
  },
};

const LANG_KEY = 'safi_lang';
let memoryLang = 'en';

function loadLang() {
  try {
    const stored = window.localStorage.getItem(LANG_KEY);
    return stored === 'ar' ? 'ar' : 'en';
  } catch {
    // Sandboxed preview iframes block storage — fall back to memory.
    return memoryLang;
  }
}

const I18nContext = createContext({ lang: 'en', dir: 'ltr', t: dictionaries.en, setLang: () => {} });

export const I18nProvider = ({ children }) => {
  const [lang, setLangState] = useState(loadLang);
  const t = dictionaries[lang];
  const dir = t.dir;

  const setLang = (next) => {
    const value = next === 'ar' ? 'ar' : 'en';
    memoryLang = value;
    try {
      window.localStorage.setItem(LANG_KEY, value);
    } catch {
      /* storage blocked — memory only */
    }
    setLangState(value);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  return (
    <I18nContext.Provider value={{ lang, dir, t, setLang }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
