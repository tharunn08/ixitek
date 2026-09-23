// LocaleContext — visitor's country, language and currency.
// Guests: stored in this browser. Signed-in users: saved to their profile.
// Detection is only a suggestion — the visitor always confirms or changes it.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { setCatalogCurrency } from "../lib/catalogApi.js";
import { translate } from "../i18n/strings.js";
import { useAdminAuth } from "./AdminAuthContext.jsx";

const KEY = "ixitek_locale_v1";
const LocaleContext = createContext(null);

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export function LocaleProvider({ children }) {
  const { session } = useAdminAuth();
  const [locales, setLocales] = useState(null);
  const [locale, setLocaleState] = useState(() => readStored());
  const [detected, setDetected] = useState(null);

  useEffect(() => {
    apiFetch("/api/intl/locales").then(setLocales).catch(() => setLocales({ countries: [], languages: [], currencies: [], defaultCountry: "IN" }));
  }, []);

  // Pick an initial locale: saved profile → this browser → default country; detection offered separately.
  useEffect(() => {
    if (!locales) return;
    const pref = session?.preferences;
    if (pref?.country && pref?.currency && !readStored()) {
      setLocaleState({ country: pref.country, currency: pref.currency, language: pref.language || "en", confirmed: true });
      return;
    }
    if (!locale) {
      const c = locales.countries.find((x) => x.code === locales.defaultCountry) || locales.countries[0];
      if (c) setLocaleState({ country: c.code, currency: c.currency, language: c.language, confirmed: false });
      apiFetch("/api/intl/detect")
        .then(({ detected: d }) => d && setDetected(d))
        .catch(() => {});
    }
  }, [locales, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const currencyInfo = useMemo(() => locales?.currencies.find((c) => c.code === locale?.currency), [locales, locale]);
  // Display currency: the chosen one if a valid exchange rate exists, otherwise USD.
  const displayCurrency = currencyInfo?.available ? locale.currency : "USD";
  // Set synchronously during render (not in an effect) so that child pages
  // re-fetching because `currency` changed already request the new currency —
  // child effects run before a parent's effects.
  setCatalogCurrency(displayCurrency);

  const setLocale = useCallback(
    (next) => {
      const value = { ...locale, ...next, confirmed: true };
      setLocaleState(value);
      setDetected(null);
      try {
        localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        /* ignore */
      }
      if (session) apiFetch("/api/intl/preferences", { method: "PUT", body: { country: value.country, currency: value.currency, language: value.language } }).catch(() => {});
      window.dispatchEvent(new CustomEvent("ixitek:locale-changed", { detail: value }));
    },
    [locale, session]
  );

  const country = locales?.countries.find((c) => c.code === locale?.country) || null;
  const language = locale?.language || "en";
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = {
    locales,
    locale,
    country,
    language,
    currency: displayCurrency,
    requestedCurrency: locale?.currency,
    currencyUnavailable: Boolean(locale && currencyInfo && !currencyInfo.available),
    detected: locale && !locale.confirmed && detected && detected.country !== undefined ? detected : null,
    setLocale,
    dismissDetection: () => setLocale({}),
    t: (key) => translate(language, key),
  };
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}
