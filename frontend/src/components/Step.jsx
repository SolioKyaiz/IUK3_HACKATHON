import { useNavigate } from "react-router-dom";
import { useT } from "../i18n";
import Icon from "./Icons";
import { useSheet } from "./Sheet";
import { AssistantButton } from "./MapOverlay";

// Common frame of a step: header with back and "n/4", scrollable body, pinned footer.
export default function Step({ title, n, back, footer, children }) {
  const t = useT();
  const nav = useNavigate();
  const { snap } = useSheet();
  return (
    <>
      <header className="step-head">
        {back && (
          <button className="icon-btn" onClick={() => nav(back)} aria-label={t("step.back")} title={t("step.back")}>
            <Icon name="back" />
          </button>
        )}
        <h1>{title}</h1>
        {n && <span className="step-n" aria-label={`${n}/4`}>{t("step.of", { n })}</span>}
        {snap === "full" && <span className="sheet-only"><AssistantButton inline /></span>}
      </header>
      <div className="step-body">{children}</div>
      {footer && <footer className="step-foot">{footer}</footer>}
    </>
  );
}
