'use client';

import { useCallback, useEffect, useState } from 'react';

export type Language = 'ko' | 'en';

const LANGUAGE_KEY = 'travel-note-language';
const LANGUAGE_EVENT = 'travel-note-language-change';

function isLanguage(value: string | null): value is Language {
  return value === 'ko' || value === 'en';
}

function storedLanguage(): Language {
  if (typeof window === 'undefined') return 'ko';
  const value = window.localStorage.getItem(LANGUAGE_KEY);
  return isLanguage(value) ? value : 'ko';
}

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>('ko');

  useEffect(() => {
    const apply = (next: Language) => {
      setLanguageState(next);
      document.documentElement.lang = next === 'en' ? 'en' : 'ko';
      document.title = next === 'en' ? 'Let’s Travel — Trip Planner' : '여행을 떠나요 — 여행 동선 플래너';
    };
    apply(storedLanguage());
    const handleChange = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail;
      if (isLanguage(next)) apply(next);
    };
    window.addEventListener(LANGUAGE_EVENT, handleChange);
    return () => window.removeEventListener(LANGUAGE_EVENT, handleChange);
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem(LANGUAGE_KEY, next);
    document.documentElement.lang = next === 'en' ? 'en' : 'ko';
    document.title = next === 'en' ? 'Let’s Travel — Trip Planner' : '여행을 떠나요 — 여행 동선 플래너';
    window.dispatchEvent(new CustomEvent<Language>(LANGUAGE_EVENT, { detail: next }));
  }, []);

  return { language, setLanguage };
}

export function tr(language: Language, korean: string, english: string) {
  return language === 'en' ? english : korean;
}
