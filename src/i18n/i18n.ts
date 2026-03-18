import { Locale } from '../utils/types';
import { enStrings } from './locales/en';
import { jaStrings } from './locales/ja';
import { jaKanjiStrings } from './locales/jaKanji';

const strings: Record<Locale, Record<string, string>> = {
  en: enStrings,
  ja: jaStrings,
};

let currentLocale: Locale = 'ja';
let kanjiMode = false;
const listeners: ((locale: Locale) => void)[] = [];

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  listeners.forEach(fn => fn(locale));
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setKanjiMode(enabled: boolean): void {
  kanjiMode = enabled;
}

export function getKanjiMode(): boolean {
  return kanjiMode;
}

export function onLocaleChange(fn: (locale: Locale) => void): void {
  listeners.push(fn);
}

export function t(key: string, params?: Record<string, string | number>): string {
  let text: string;
  if (currentLocale === 'ja' && kanjiMode && jaKanjiStrings[key]) {
    text = jaKanjiStrings[key];
  } else {
    text = strings[currentLocale][key] ?? strings['en'][key] ?? `[${key}]`;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
