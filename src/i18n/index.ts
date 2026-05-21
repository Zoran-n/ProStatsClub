import { useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import { translations, type Lang } from "./translations";
export type { Lang } from "./translations";
export { LANGUAGES } from "./translations";

/** Returns the translated string for the given key, falling back to French */
export function t(key: string, lang?: Lang): string {
  const entry = translations[key];
  if (!entry) return key;
  const l = lang ?? useAppStore.getState().language;
  return entry[l] ?? entry.fr ?? key;
}

/** React hook: returns a stable t() function bound to the current language (reactive) */
export function useT() {
  const language = useAppStore((s) => s.language);
  return useCallback((key: string) => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[language] ?? entry.fr ?? key;
  }, [language]);
}
