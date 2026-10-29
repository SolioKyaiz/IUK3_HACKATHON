import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setState, useStore } from "../store";
import { useT, fmtNum } from "../i18n";
import Step from "../components/Step";
import Icon from "../components/Icons";
import { areaHa, loadBorder, validate } from "../lib/geo";
import { confirmThen, deletePlot, newPlot, renamePlot, requireLogin, saveDraft, selectPlot } from "../lib/actions";

export default function PlotStep() {
  const t = useT();
  const nav = useNavigate();
  const { plots, draft, liveGeometry, token } = useStore((s) => s);
  const [kg, setKg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { loadBorder().then(setKg).catch(() => {}); }, []);

  const geom = liveGeometry || draft?.geometry;
  const area = geom ? areaHa(geom) : 0;
  const invalid = geom ? validate(geom, kg) : null;

  const undo = () => setState((s) => {
    const h = s.draft.history;
    if (!h.length) return {};
    return { draft: { ...s.draft, geometry: h[h.length - 1], history: h.slice(0, -1) } };
  });

  const next = () => requireLogin(async () => {
    setBusy(true); setErr(null);
    try { await saveDraft(); nav("/field"); } catch (e) { setErr(e.code); }
    setBusy(false);
  });

  const footer = (
    <>
      <div className="foot-sum">
        {invalid && geom
          ? <span className="error small" role="alert">{t(`plot.err.${invalid}`)}</span>
          : <span className="muted small">{geom ? t("plot.selected") : t("plot.none")}</span>}
        <strong>{geom ? t("plot.ha", { value: fmtNum(t.lang, area, 2) }) : "—"}</strong>
      </div>
      <button className="btn primary" disabled={!geom || !!invalid || busy} onClick={next}>
        {t("step.next")} <Icon name="chevronRight" size={18} />
      </button>
    </>
  );

  return (
    <Step title={t("plot.title")} n={1} footer={footer}>
      {token && plots.length > 0 && (
        <ul className="plot-list" aria-label={t("plot.saved")}>
          {plots.map((p) => {
            const on = draft?.plotId === p.id;
            return (
              <li key={p.id} className={`plot-item ${on ? "on" : ""}`}>
                <button className="plot-pick" aria-pressed={on} onClick={() => selectPlot(p)}>
                  <span>{p.name}</span>
                  <span className="muted">{t("plot.ha", { value: fmtNum(t.lang, p.area_ha, 2) })}</span>
                </button>
                <button className="icon-btn" title={t("plot.rename")} aria-label={`${t("plot.rename")}: ${p.name}`} onClick={async () => {
                  const name = window.prompt(t("plot.namePrompt"), p.name);
                  if (name?.trim()) await renamePlot(p, name.trim()).catch((e) => setErr(e.code));
                }}><Icon name="edit" size={18} /></button>
                <button className="icon-btn" title={t("plot.delete")} aria-label={`${t("plot.delete")}: ${p.name}`}
                  onClick={() => confirmThen(t("plot.deleteConfirm", { name: p.name }), () => deletePlot(p))}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {draft && !draft.plotId && (
        <div className="plot-item on new"><span>{t("plot.ha", { value: fmtNum(t.lang, area, 2) })}</span><span className="muted small">{t("plot.unsaved")}</span></div>
      )}
      <div className="row">
        <button className="btn ghost" onClick={newPlot}>{t("plot.new")}</button>
        {draft?.history?.length > 0 && <button className="btn ghost" onClick={undo}><Icon name="undo" size={18} /> {t("plot.undo")}</button>}
      </div>
      <p className="hint">{draft ? t("plot.hintEdit") : t("plot.hint")}</p>
      {err && <p className="error" role="alert">{t(`plot.err.${err}`) !== `plot.err.${err}` ? t(`plot.err.${err}`) : t(`err.${err}`)}</p>}
    </Step>
  );
}
