// Checks that ky/ru/en have the same keys and the same {placeholders}, and that FAQ lists match.
import { readFileSync } from "node:fs";

const load = (f) => JSON.parse(readFileSync(new URL(`../src/i18n/${f}`, import.meta.url), "utf8"));
const langs = { ky: load("ky.json"), ru: load("ru.json"), en: load("en.json") };
const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
let errors = 0;
const ref = langs.en;
for (const [lang, dict] of Object.entries(langs)) {
  for (const k of Object.keys(ref)) {
    if (!(k in dict)) { console.error(`${lang}: missing ${k}`); errors++; }
    else if (params(dict[k]) !== params(ref[k])) { console.error(`${lang}: placeholders differ in ${k}`); errors++; }
  }
  for (const k of Object.keys(dict)) if (!(k in ref)) { console.error(`${lang}: extra key ${k}`); errors++; }
}
const faq = load("faq.json");
const n = faq.en.length;
for (const l of ["ky", "ru"]) if (faq[l].length !== n) { console.error(`faq ${l}: ${faq[l].length} items, en has ${n}`); errors++; }
// Every crop the engine knows needs a name in all three languages.
try {
  const csv = readFileSync(new URL("../../backend/suuplan/data/crops.csv", import.meta.url), "utf8");
  const ids = csv.trim().split("\n").slice(1).map((l) => l.split(",")[0]);
  for (const id of ids) for (const [lang, dict] of Object.entries(langs)) {
    if (!dict[`crop.${id}`]) { console.error(`${lang}: no name for crop "${id}" from crops.csv`); errors++; }
  }
} catch { /* backend not next to the frontend: skip */ }
console.log(errors ? `${errors} problem(s)` : `i18n OK: ${Object.keys(ref).length} keys × 3 languages, ${n} FAQ`);
process.exit(errors ? 1 : 0);
