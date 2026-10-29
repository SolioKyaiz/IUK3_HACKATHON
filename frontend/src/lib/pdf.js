// Loaded only when the user taps "PDF" (jsPDF and the font are not in the main bundle).
import { translate, fmtNum, fmtDate } from "../i18n";
import { snowText, reasonText } from "./share";

async function fontBase64(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function makePdf(lang, saved) {
  const { jsPDF } = await import("jspdf");
  const t = (k, p) => translate(lang, k, p);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  // Noto Sans covers Cyrillic including Kyrgyz ө, ү, ң.
  const [reg, bold] = await Promise.all([fontBase64("/fonts/NotoSans-Regular.ttf"), fontBase64("/fonts/NotoSans-Bold.ttf")]);
  doc.addFileToVFS("NotoSans-Regular.ttf", reg);
  doc.addFont("NotoSans-Regular.ttf", "Noto", "normal");
  doc.addFileToVFS("NotoSans-Bold.ttf", bold);
  doc.addFont("NotoSans-Bold.ttf", "Noto", "bold");

  // Noto Sans has no "≈" glyph: print "~" instead.
  const text = doc.text.bind(doc);
  doc.text = (str, ...rest) => text(Array.isArray(str) ? str.map((x) => x.replaceAll("≈", "~")) : String(str).replaceAll("≈", "~"), ...rest);

  const { plan, inputs } = saved;
  let y = 22;
  doc.setFont("Noto", "bold"); doc.setFontSize(20);
  doc.text(`SuuPlan — ${t("pdf.title")}`, 18, y);
  y += 9;
  doc.setFont("Noto", "normal"); doc.setFontSize(11); doc.setTextColor(90);
  doc.text(`${inputs.planLabel} · ${t("share.date", { date: fmtDate(lang, saved.created_at) })}`, 18, y);
  doc.setTextColor(0);

  // Mini map of the plot outline (vector only, no tiles).
  drawOutline(doc, inputs.geometry, 128, 26, 64, 52);

  y += 12;
  doc.setFontSize(12);
  doc.text(t("share.plot", { name: inputs.plotName, area: fmtNum(lang, inputs.area_ha, 2) }), 18, y);
  y += 12;
  doc.setFont("Noto", "bold"); doc.setFontSize(14);
  plan.years.forEach((c, i) => {
    doc.text(`${t("plans.year", { n: i + 1 })}: ${t(`crop.${c}`)}`, 18, y);
    y += 9;
  });
  doc.setFont("Noto", "normal"); doc.setFontSize(12);
  y += 4;
  const water = inputs.source === "none" ? t("plans.rainfed", { mm: plan.deficit_mm }) : t("plans.water", { m3: fmtNum(lang, plan.water_m3_year) });
  doc.text(doc.splitTextToSize(water, 170), 18, y); y += 8;
  const snow = inputs.snowUsed && inputs.snow?.label
    ? `${t(`snow.${inputs.snow.label}`)} · ${t("snow.date", { date: fmtDate(lang, inputs.snow.date) })}`
    : snowText(lang, inputs.snow, inputs.snowUsed);
  doc.text(doc.splitTextToSize(snow, 170), 18, y); y += 10;

  doc.setFont("Noto", "bold");
  const s = plan.scores;
  doc.text(`${t("plans.score.water")} ${s.water} · ${t("plans.score.soil")} ${s.soil} · ${t("plans.score.income")} ${s.income}* · ${t("plans.score.risk")} ${s.risk}`, 18, y);
  y += 6;
  doc.setFont("Noto", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`* ${t("plans.approxPrices")}`, 18, y);
  doc.setTextColor(0); doc.setFontSize(12);
  y += 10;
  for (const r of plan.reasons || []) {
    doc.text(doc.splitTextToSize(`• ${reasonText(lang, r)}`, 170), 18, y); y += 7;
  }

  y = Math.max(y + 8, 230);
  doc.setDrawColor(200); doc.line(18, y, 192, y); y += 8;
  doc.setFont("Noto", "bold"); doc.setFontSize(12);
  doc.text(t("app.hint"), 18, y); y += 7;
  doc.setFont("Noto", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  if (inputs.demo) { doc.text(t("app.demoNote"), 18, y); y += 5; }
  doc.text(doc.splitTextToSize(t("pdf.sources"), 174), 18, y);

  const name = `SuuPlan-${(inputs.plotName || "plan").replace(/[^\p{L}\p{N}]+/gu, "_")}.pdf`;
  const blob = doc.output("blob");
  const file = new File([blob], name, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] }) && window.matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ files: [file], title: name }); return; } catch { /* fall back to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function drawOutline(doc, geometry, x, y, w, h) {
  const ring = geometry.coordinates[0];
  const lat0 = ring[0][1] * Math.PI / 180;
  const pts = ring.map(([lon, lat]) => [lon * Math.cos(lat0), lat]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const k = Math.min(w / (maxX - minX || 1), h / (maxY - minY || 1)) * 0.85;
  const ox = x + (w - (maxX - minX) * k) / 2, oy = y + (h - (maxY - minY) * k) / 2;
  const P = pts.map(([px, py]) => [ox + (px - minX) * k, oy + (maxY - py) * k]);
  doc.setDrawColor(220); doc.setFillColor(245, 248, 252); doc.roundedRect(x, y, w, h, 3, 3, "FD");
  doc.setDrawColor(31, 111, 235); doc.setFillColor(214, 230, 252); doc.setLineWidth(0.8);
  const segs = P.slice(1).map((p, i) => [p[0] - P[i][0], p[1] - P[i][1]]);
  doc.lines(segs, P[0][0], P[0][1], [1, 1], "FD", true);
  doc.setLineWidth(0.2);
}
