import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setState, useStore } from "../store";
import { useT } from "../i18n";
import Step from "../components/Step";
import Icon from "../components/Icons";
import { fetchPlans } from "../lib/actions";

const OPTIONS = [["water", "drop"], ["income", "coin"], ["soil", "sprout"]];

export default function PriorityStep() {
  const t = useT();
  const nav = useNavigate();
  const priority = useStore((s) => s.priority);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const go = async () => {
    setBusy(true); setErr(null);
    try { await fetchPlans(); nav("/plans"); } catch (e) { setErr(e.code); }
    setBusy(false);
  };

  return (
    <Step title={t("priority.title")} n={3} back="/field" footer={
      <>
        {err ? <span className="error">{t(`err.${err}`)} <button className="link" onClick={go}>{t("app.retry")}</button></span> : <span />}
        <button className="btn primary" disabled={!priority || busy} onClick={go}>
          {busy ? t("app.loading") : t("priority.get")} <Icon name="chevronRight" size={18} />
        </button>
      </>
    }>
      <div className="priority-grid" role="radiogroup" aria-label={t("priority.title")}>
        {OPTIONS.map(([p, icon]) => (
          <button key={p} role="radio" aria-checked={priority === p} className={`priority-card ${priority === p ? "on" : ""}`}
            onClick={() => setState({ priority: p })}>
            <span className="priority-icon" aria-hidden="true"><Icon name={icon} size={26} /></span>
            <span className="priority-text">
              <span className="priority-title">{t(`priority.${p}`)}</span>
              <span className="priority-desc">{t(`priority.${p}.desc`)}</span>
            </span>
            <span className="radio" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="hint">{t("priority.hint")}</p>
    </Step>
  );
}
