import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import Step from "../components/Step";
import Icon from "../components/Icons";
import { saveAnswers } from "../lib/actions";
import CropIcon from "../components/CropIcon";

export const CROPS = ["wheat", "barley", "maize", "potato", "beans", "sugar_beet", "sunflower", "cotton", "alfalfa", "rice"];

function Choice({ legend, help, options, value, onChange, cols = 2 }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <fieldset className="choice">
      <legend className="choice-legend">
        <span>{legend}</span>
        {help && (
          <button type="button" className={`help-btn ${open ? "on" : ""}`} aria-expanded={open}
            aria-label={`${t("help.show")}: ${legend}`} title={t("help.show")} onClick={() => setOpen(!open)}>?</button>
        )}
      </legend>
      {help && open && <p className="help-box">{help}</p>}
      <div className={`choice-grid cols-${cols}`}>
        {options.map(([v, label]) => (
          <button key={v} type="button" className={`choice-btn ${value === v ? "on" : ""}`} aria-pressed={value === v} onClick={() => onChange(v)}>
            {value === v && <Icon name="check" size={18} />}{label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function FieldStep() {
  const t = useT();
  const nav = useNavigate();
  const { answers, plotId } = useStore((s) => s);
  const [a, setA] = useState(answers);
  const [soilInfo, setSoilInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // "Don't know" soil: fetch SoilGrids texture and pH for the plot centre.
  useEffect(() => {
    if (a.soil !== "unknown" || !plotId) { setSoilInfo(null); return; }
    let live = true;
    setSoilInfo("loading");
    saveAnswers({ ...a })
      .then(() => api(`/plots/${plotId}/context`))
      .then((ctx) => live && setSoilInfo(ctx.soil))
      .catch(() => live && setSoilInfo("error"));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.soil, plotId]);

  const set = (k) => (v) => setA((prev) => ({ ...prev, [k]: v }));
  const complete = a.prev && a.source && a.soil && (a.source === "none" || a.water);

  const next = async () => {
    setBusy(true); setErr(null);
    try { await saveAnswers(a); nav("/priority"); } catch (e) { setErr(e.code); }
    setBusy(false);
  };

  return (
    <Step title={t("field.title")} n={2} back="/plot" footer={
      <>
        {err ? <span className="error">{t(`err.${err}`)}</span> : <span />}
        <button className="btn primary" disabled={!complete || busy} onClick={next}>{t("step.next")} <Icon name="chevronRight" size={18} /></button>
      </>
    }>
      <Choice legend={t("field.prev")} help={t("help.prev")} value={a.prev} onChange={set("prev")}
        options={[...CROPS.map((c) => [c, <><CropIcon id={c} size={30} className="ce" /><span>{t(`crop.${c}`)}</span></>]),
          ["none", <><CropIcon id="none" size={30} className="ce" /><span>{t("field.none")}</span></>]]} />
      <Choice legend={t("field.source")} help={t("help.source")} value={a.source} onChange={set("source")}
        options={["river", "well", "reservoir", "none"].map((s) => [s, t(`source.${s}`)])} />
      {a.source !== "none" && (
        <Choice legend={t("field.water")} help={t("help.water")} value={a.water} onChange={set("water")} cols={1}
          options={["enough", "sometimes", "often"].map((w) => [w, t(`water.${w}`)])} />
      )}
      <Choice legend={t("field.soil")} help={t("help.soil")} value={a.soil} onChange={set("soil")}
        options={["sandy", "medium", "clay", "unknown"].map((s) => [s, t(`soil.${s}`)])} />
      {a.soil === "unknown" && (
        <p className="hint" aria-live="polite">
          {soilInfo === "loading" ? t("app.loading")
            : soilInfo === "error" ? t("err.network")
            : soilInfo?.source === "SoilGrids" ? t("field.soilSatellite", { texture: t(`soil.${soilInfo.texture}`).toLowerCase(), ph: soilInfo.ph ?? "—" })
            : soilInfo ? t("field.soilDefault") : null}
        </p>
      )}
    </Step>
  );
}
