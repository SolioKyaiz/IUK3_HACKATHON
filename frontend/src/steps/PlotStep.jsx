import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setState, useStore } from "../store";
import { useT, fmtNum } from "../i18n";
import Step from "../components/Step";
import Icon from "../components/Icons";
import { areaHa, loadBorder, validate } from "../lib/geo";
import { confirmThen, deletePlot, newPlot, plotHere, renamePlot, requireLogin, saveDraft, selectPlot } from "../lib/actions";

export default function PlotStep() {
  const t = useT();
  const nav = useNavigate();
  const { plots, draft, liveGeometry, token } = useStore((s) => s);
  const [kg, setKg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [here, setHere] = useState(null); // null | "busy" | i18n key of an error
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
      <section className="section">
        <button className="btn secondary block" disabled={here === "busy"} onClick={async () => {
          setHere("busy");
          setHere(await plotHere());
        }}>
          <Icon name="pin" size={20} /> {here === "busy" ? t("plot.hereBusy") : t("plot.here")}
        </button>
        {here && here !== "busy" && <p className="error" role="alert">{t(here)}</p>}
      </section>

      <section className="section">
        {draft ? (
          <div className={`plot-current ${invalid ? "invalid" : ""}`}>
            <div className="plot-current-head">
              <span className="plot-current-name">
                {draft.plotId ? plots.find((p) => p.id === draft.plotId)?.name : t("plot.unsaved")}
              </span>
              <strong className="plot-current-area">{t("plot.ha", { value: fmtNum(t.lang, area, 2) })}</strong>
            </div>
            <p className="hint">{t("plot.hintEdit")}</p>
            <div className="toolbar">
              <button className="btn subtle small" onClick={undo} disabled={!draft.history?.length}>
                <Icon name="undo" size={16} /> {t("plot.undo")}
              </button>
              <button className="btn subtle small" onClick={newPlot}>{t("plot.new")}</button>
            </div>
          </div>
        ) : (
          <div className="callout">
            <Icon name="field" size={22} />
            <div>
              <p>{t("plot.hint")}</p>
              <p className="hint">{t("plot.hereHint")}</p>
            </div>
          </div>
        )}
      </section>

      {token && plots.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t("plot.saved")}</h2>
          <ul className="plot-list">
            {plots.map((p) => {
              const on = draft?.plotId === p.id;
              return (
                <li key={p.id} className={`plot-item ${on ? "on" : ""}`}>
                  <button className="plot-pick" aria-pressed={on} onClick={() => selectPlot(p)}>
                    <span className="plot-pick-name">{p.name}</span>
                    <span className="muted small">{t("plot.ha", { value: fmtNum(t.lang, p.area_ha, 2) })}</span>
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
        </section>
      )}
      {err && <p className="error" role="alert">{t(`plot.err.${err}`) !== `plot.err.${err}` ? t(`plot.err.${err}`) : t(`err.${err}`)}</p>}
    </Step>
  );
}
