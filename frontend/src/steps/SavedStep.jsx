import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getState, setState, useStore } from "../store";
import { useT, fmtNum, fmtDate } from "../i18n";
import Step from "../components/Step";
import Icon, { PdfLogo, TelegramLogo, WhatsAppLogo } from "../components/Icons";
import { confirmThen, deleteSaved, refreshSaved } from "../lib/actions";
import { deliveryLines, naturalLines, planText, sourceLines, telegramUrl, whatsappUrl, yearRows } from "../lib/share";
import { fromGeoJSON } from "../lib/geo";
import { InstallButton } from "../components/Install";
import CropIcon from "../components/CropIcon";

export default function SavedStep() {
  const t = useT();
  const nav = useNavigate();
  const { saved, token, plans } = useStore((s) => s);
  const [status, setStatus] = useState(null); // null | "loading" | error code

  const load = () => {
    if (!token) return;
    setStatus("loading");
    refreshSaved().then(() => setStatus(null)).catch((e) => setStatus(e.code));
  };
  useEffect(load, [token]);
  useEffect(() => () => setState({ highlight: null }), []);

  // Only shows the plan's plot on the map: the plot being edited, its answers and plans stay as they are.
  const highlight = (row) => {
    if (!row.inputs.geometry) return;
    setState({ highlight: fromGeoJSON(row.inputs.geometry), fitRequest: getState().fitRequest + 1 });
  };

  return (
    <Step title={t("saved.title")} back={plans ? "/plans" : null}>
      {status === "loading" && saved.length === 0 && <div className="skeleton" aria-busy="true"><div /><div /></div>}
      {status && status !== "loading" && (
        <p className="notice">{t(`err.${status}`)}{saved.length > 0 && ` · ${t("saved.offline")}`} <button className="link" onClick={load}>{t("app.retry")}</button></p>
      )}
      {saved.length === 0 && status !== "loading" && (
        <div className="empty">
          <span className="empty-art" aria-hidden="true"><Icon name="plans" size={40} /></span>
          <p>{t("saved.empty")}</p>
          <button className="btn primary" onClick={() => nav("/plot")}>{t("saved.start")}</button>
        </div>
      )}
      <ul className="saved-list">
        {saved.map((row) => <SavedCard key={row.id} row={row} onFocus={() => highlight(row)} />)}
      </ul>
      <InstallButton />
    </Step>
  );
}

// Numbers with their units in bold ("≈20 409 м³", "146%", "4,5 км"), so the water figures stand out.
// Thousands separators may be regular, non-breaking or narrow spaces depending on the language.
// A number followed by a word is a date ("~1 апр.", "1-апрель") and stays plain.
const NUM = /(?:[≈~]\s?)?\d+(?:[ \u00A0\u202F]\d{3})*(?:[.,]\d+)?(?:\s?(?:млн м³|million m³|м³|m³|га|ha|км|km|мм|mm)|%|(?![\s\u00A0-]?[A-Za-zА-Яа-яЁёӨөҮүҢң]))/g;

function BoldNumbers({ text }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(NUM)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<b key={m.index}>{m[0]}</b>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <span>{parts}</span>;
}

function SavedCard({ row, onFocus }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { plan, inputs } = row;
  const text = () => planText(t.lang, row);
  const natural = naturalLines(t.lang, row);
  const years = yearRows(t.lang, row);
  const sources = sourceLines(t.lang, row);
  const delivery = deliveryLines(t.lang, row);

  const pdf = async () => {
    setPdfBusy(true);
    try { const { makePdf } = await import("../lib/pdf"); await makePdf(t.lang, row); }
    finally { setPdfBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); }
    catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text() });
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <li className="saved-card">
      <button className="saved-main" onClick={onFocus}>
        <div className="saved-head">
          <strong className="saved-title">{inputs.planLabel}</strong>
          <span className="muted small">{fmtDate(t.lang, row.created_at)}</span>
        </div>
        <div className="saved-meta"><Icon name="field" size={15} /> {t("saved.plot", { name: inputs.plotName, area: fmtNum(t.lang, inputs.area_ha || 0, 2) })}</div>
        <ol className="crop-seq" aria-label={plan.years.map((c) => t(`crop.${c}`)).join(", ")}>
          {plan.years.map((c, i) => (
            <li key={i}><CropIcon id={c} size={26} /><span>{t(`crop.${c}`)}</span></li>
          ))}
        </ol>
        <div className="saved-water"><Icon name="drop" size={15} /> {inputs.source === "none" ? t("plans.rainfed", { mm: plan.deficit_mm }) : t("plans.water", { m3: fmtNum(t.lang, plan.water_m3_year) })}</div>
        {years && (
          <div className="saved-years">
            {years.rows.map((r) => (
              <div key={r.year} className="saved-year">
                <span className="muted">{r.year}</span>
                <span className="saved-year-crop"><CropIcon id={r.crop} size={20} /> {t(`crop.${r.crop}`)}</span>
                <span className="muted saved-year-sow">{r.sow}</span>
                <span className="saved-year-water">{r.water}</span>
                {r.reach && <span className={`saved-year-reach ${r.reachLevel}`}>{r.reach}</span>}
              </div>
            ))}
            {years.total && <div className="saved-year-total">{years.total}</div>}
            <p className="muted tiny">{years.note}{years.demo && <> <span className="pill demo">{t("app.demo")}</span></>}</p>
          </div>
        )}
        <div className="saved-source">
          {sources.map((l) => (
            <div key={l.key} className="saved-natural-line">
              <Icon name={{ mountains: "snow", intake: "drop", basin: "field" }[l.key] || "pin"} size={15} /> <BoldNumbers text={l.text} />
              {l.demo && <span className="pill demo">{t("app.demo")}</span>}
            </div>
          ))}
        </div>
        {delivery.length > 0 && (
          <div className="saved-natural">
            {delivery.map((l) => (
              <div key={l.key} className="saved-natural-line">
                <Icon name="drop" size={15} /> <BoldNumbers text={l.text} />
                {l.demo && <span className="pill demo">{t("app.demo")}</span>}
              </div>
            ))}
            <p className="muted tiny">{t("saved.reachNote")}</p>
          </div>
        )}
        {natural.length > 0 && (
          <div className="saved-natural">
            {natural.map((l) => (
              <div key={l.key} className="saved-natural-line">
                <Icon name={l.key === "rain" ? "drop" : "sprout"} size={15} /> <BoldNumbers text={l.text} />
                {l.demo && <span className="pill demo">{t("app.demo")}</span>}
              </div>
            ))}
            <p className="muted tiny">{t("saved.naturalNote")}</p>
          </div>
        )}
      </button>
      <div className="actions">
        <button className="share-btn pdf" onClick={pdf} disabled={pdfBusy} aria-label={t("saved.pdf")} title={t("saved.pdf")}>
          {pdfBusy ? "…" : <PdfLogo />}
        </button>
        <a className="share-btn" href={telegramUrl(text())} target="_blank" rel="noopener" aria-label={t("saved.telegram")} title={t("saved.telegram")}>
          <TelegramLogo />
        </a>
        <a className="share-btn" href={whatsappUrl(text())} target="_blank" rel="noopener" aria-label={t("saved.whatsapp")} title={t("saved.whatsapp")}>
          <WhatsAppLogo />
        </a>
        <button className={`share-btn plain ${copied ? "done" : ""}`} onClick={copy} aria-label={copied ? t("saved.copied") : t("saved.copy")} title={copied ? t("saved.copied") : t("saved.copy")}>
          <Icon name={copied ? "check" : "copy"} size={20} />
        </button>
        {navigator.share && (
          <button className="share-btn plain mobile-only" onClick={() => navigator.share({ title: "ISEED", text: text() }).catch(() => {})}
            aria-label={t("saved.share")} title={t("saved.share")}>
            <Icon name="share" size={20} />
          </button>
        )}
        <button className="btn subtle small danger-ghost push-right" onClick={() => confirmThen(t("saved.deleteConfirm"), () => deleteSaved(row))}>
          <Icon name="trash" size={16} /> {t("saved.delete")}
        </button>
      </div>
    </li>
  );
}
