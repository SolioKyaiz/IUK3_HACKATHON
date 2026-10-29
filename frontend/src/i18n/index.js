import ky from "./ky.json";
import ru from "./ru.json";
import en from "./en.json";
import faq from "./faq.json";
import { useStore } from "../store";

const DICTS = { ky, ru, en };
export const LANGS = [["ky", "KG"], ["ru", "RU"], ["en", "EN"]];

export function translate(lang, key, params) {
  let s = DICTS[lang]?.[key] ?? DICTS.ru[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export function useT() {
  const lang = useStore((s) => s.lang);
  const t = (key, params) => translate(lang, key, params);
  t.lang = lang;
  return t;
}

export function faqFor(lang) {
  return faq[lang] || faq.ru;
}

// Browsers often lack Kyrgyz locale data, so Kyrgyz numbers use the ru-RU format (12,50)
// and Kyrgyz dates are built by hand ("2026-ж. 29-октябрь").
const NUM_LOCALES = { ky: "ru-RU", ru: "ru-RU", en: "en-GB" };
const KY_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

export function fmtNum(lang, n, digits = 0) {
  return new Intl.NumberFormat(NUM_LOCALES[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function fmtDate(lang, iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (lang === "ky") return `${d.getFullYear()}-ж. ${d.getDate()}-${KY_MONTHS[d.getMonth()]}`;
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
}
