import { useNavigate } from "react-router-dom";
import { useT } from "../i18n";
import Icon from "./Icons";
import { useSheet } from "./Sheet";
import { AssistantButton } from "./MapOverlay";

function Stepper({ n }) {
  const t = useT();
  return (
    <ol className="stepper" aria-label={t("step.progress", { n })}>
      {[1, 2, 3, 4].map((i) => (
        <li key={i} className={i < n ? "done" : i === n ? "current" : ""} aria-current={i === n ? "step" : undefined}>
          <span className="stepper-bar" aria-hidden="true" />
          <span className="stepper-label">{t(`step.label.${i}`)}</span>
        </li>
      ))}
    </ol>
  );
}

// Common frame of a step: header (back, title, progress), scrollable body, pinned footer.
export default function Step({ title, n, back, footer, children }) {
  const t = useT();
  const nav = useNavigate();
  const { snap } = useSheet();
  return (
    <>
      <header className="step-head">
        <div className="step-title-row">
          {back && (
            <button className="icon-btn" onClick={() => nav(back)} aria-label={t("step.back")} title={t("step.back")}>
              <Icon name="back" />
            </button>
          )}
          <h1>{title}</h1>
          {snap === "full" && <span className="sheet-only"><AssistantButton inline /></span>}
        </div>
        {n && <Stepper n={n} />}
      </header>
      <div className="step-body">{children}</div>
      {footer && <footer className="step-foot">{footer}</footer>}
    </>
  );
}
