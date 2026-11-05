import { translate, fmtNum, fmtDate, fmtDayMonth } from "../i18n";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const letter = (i) => LETTERS[i % 26];

export function snowText(lang, snow, used) {
  if (!used) return translate(lang, "snow.notUsed");
  if (!snow?.label) return translate(lang, "snow.unknown");
  return translate(lang, `snow.${snow.label}`);
}

// Natural water for a saved plan: season rain and soil water at sowing of year 1.
// Plans saved before this existed have no `natural` and get no lines.
export function naturalLines(lang, saved) {
  const t = (k, p) => translate(lang, k, p);
  const n = saved.plan.natural;
  if (!n) return [];
  const out = [{ key: "rain", text: t("saved.rain", { m3: fmtNum(lang, n.rain_m3) }), demo: saved.inputs.climate?.source !== "NASA POWER" }];
  if (n.soil_m3 != null) {
    out.push({
      key: "soil", demo: true, // sowing dates and soil water parameters are demo values
      text: t("saved.soilWater", { crop: t(`crop.${n.sow_crop}`).toLowerCase(), date: fmtDayMonth(lang, n.sow_date), m3: fmtNum(lang, n.soil_m3) }),
    });
  }
  return out;
}

// Per-year rows (crop, typical sowing date, water for the whole plot) and the 3-year total.
// Null for plans saved before the breakdown existed.
export function yearRows(lang, saved) {
  const t = (k, p) => translate(lang, k, p);
  const { plan, inputs } = saved;
  if (!plan.by_year) return null;
  const rainfed = inputs.source === "none";
  return {
    rows: plan.by_year.map((r, i) => ({
      year: t("plans.year", { n: i + 1 }),
      crop: r.crop,
      sow: t("saved.sow", { date: fmtDayMonth(lang, r.sow_date) }),
      water: rainfed ? t("saved.short", { mm: r.deficit_mm }) : t("saved.m3", { m3: fmtNum(lang, r.water_m3) }),
    })),
    total: rainfed ? null : t("saved.total", { m3: fmtNum(lang, plan.water_m3_total) }),
  };
}

// Where the water comes from: the farmer's source, plus basin and feeding mountains for rivers and reservoirs.
export function sourceLines(lang, saved) {
  const t = (k, p) => translate(lang, k, p);
  const { source, basin } = saved.inputs;
  const name = (x) => x?.[lang] || x?.ru || x;
  const demo = basin?.source === "demo";
  if (source !== "river" && source !== "reservoir") return [{ key: "from", text: t(`saved.from.${source}`), demo: false }];
  if (!basin) return [{ key: "from", text: t(`source.${source}`), demo: false }];
  const out = [{ key: "from", text: t(`saved.from.${source}`, { basin: name(basin.name) }), demo }];
  if (basin.mountains) out.push({ key: "mountains", text: t("saved.mountains", { mountains: name(basin.mountains) }), demo });
  return out;
}

// Plain-text version of a saved plan, used for copy, Telegram, WhatsApp and Web Share.
export function planText(lang, saved) {
  const t = (k, p) => translate(lang, k, p);
  const { plan, inputs } = saved;
  const lines = [t("share.header", { plan: inputs.planLabel || t("plans.plan", { letter: "A" }) })];
  lines.push(t("share.plot", { name: inputs.plotName, area: fmtNum(lang, inputs.area_ha, 2) }));
  const years = yearRows(lang, saved);
  if (years) {
    years.rows.forEach((r) => lines.push(`${r.year}: ${t(`crop.${r.crop}`)}, ${r.sow}, ${r.water}`));
    if (years.total) lines.push(years.total);
  } else {
    plan.years.forEach((c, i) => lines.push(`${t("plans.year", { n: i + 1 })}: ${t(`crop.${c}`)}`));
    if (inputs.source !== "none") lines.push(t("share.water", { m3: fmtNum(lang, plan.water_m3_year) }));
  }
  sourceLines(lang, saved).forEach((l) => lines.push(l.text));
  const natural = naturalLines(lang, saved);
  natural.forEach((l) => lines.push(l.text));
  if (natural.length) lines.push(t("saved.naturalNote"));
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
