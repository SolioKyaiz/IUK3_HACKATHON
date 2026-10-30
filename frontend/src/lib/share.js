import { translate, fmtNum, fmtDate } from "../i18n";
import { cropEmoji } from "./crops";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const letter = (i) => LETTERS[i % 26];

export function snowText(lang, snow, used) {
  if (!used) return translate(lang, "snow.notUsed");
  if (!snow?.label) return translate(lang, "snow.unknown");
  return translate(lang, `snow.${snow.label}`);
}

// Plain-text version of a saved plan, used for copy, Telegram, WhatsApp and Web Share.
export function planText(lang, saved) {
  const t = (k, p) => translate(lang, k, p);
  const { plan, inputs } = saved;
  const lines = [t("share.header", { plan: inputs.planLabel || t("plans.plan", { letter: "A" }) })];
  lines.push(t("share.plot", { name: inputs.plotName, area: fmtNum(lang, inputs.area_ha, 2) }));
  plan.years.forEach((c, i) => lines.push(`${t("plans.year", { n: i + 1 })}: ${cropEmoji(c)} ${t(`crop.${c}`)}`));
  if (inputs.source !== "none") lines.push(t("share.water", { m3: fmtNum(lang, plan.water_m3_year) }));
  const snow = inputs.snowUsed && inputs.snow?.label
    ? t("share.snow", { label: t(`snow.label.${inputs.snow.label}`), date: fmtDate(lang, inputs.snow.date) })
    : snowText(lang, inputs.snow, inputs.snowUsed);
  lines.push(snow);
  lines.push(t("share.date", { date: fmtDate(lang, saved.created_at) }));
  lines.push("", t("app.hint"));
  return lines.join("\n");
}

export function telegramUrl(text) {
  return `https://t.me/share/url?url=${encodeURIComponent("https://suuplan.app")}&text=${encodeURIComponent(text)}`;
}

export function whatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function reasonText(lang, r) {
  const p = { ...r.params };
  if (p.crop) p.crop = translate(lang, `crop.${p.crop}`);
  if (p.prev) p.prev = translate(lang, `crop.${p.prev}`);
  if (p.texture) p.texture = translate(lang, `soil.${p.texture}`).toLowerCase();
  if (p.m3 != null) p.m3 = fmtNum(lang, p.m3);
  return translate(lang, `reason.${r.code}`, p);
}
