import { useEffect, useState } from "react";
import { getState, setState, useStore } from "../store";
import { useT } from "../i18n";
import { Modal } from "./Dialogs";

const SLIDES = [
  { n: 1, art: "🔍 🏡" },
  { n: 2, art: "👆 🟩" },
  { n: 3, art: "🌾 💧 ❓" },
  { n: 4, art: "📋 👉 ✅" },
];

// Four short screens shown on the first visit; reopened from the Data page.
export default function Onboarding() {
  const t = useT();
  const open = useStore((s) => s.onboardingOpen);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!getState().onboarded) setState({ onboardingOpen: true });
  }, []);
  useEffect(() => { if (open) setI(0); }, [open]);
  if (!open) return null;

  const close = () => setState({ onboardingOpen: false, onboarded: true });
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <Modal label={t(`onboard.${slide.n}.title`)} onClose={close} className="onboarding">
      <div className="onb-top">
        <button className="link" onClick={close}>{t("onboard.skip")}</button>
      </div>
      <div className="onb-art" aria-hidden="true">{slide.art}</div>
      <h2 className="onb-title">{t(`onboard.${slide.n}.title`)}</h2>
      <p className="onb-text">{t(`onboard.${slide.n}.text`)}</p>
      <div className="onb-dots" aria-label={`${i + 1}/${SLIDES.length}`}>
        {SLIDES.map((_, k) => (
          <button key={k} className={k === i ? "on" : ""} aria-label={`${k + 1}`} aria-current={k === i} onClick={() => setI(k)} />
        ))}
      </div>
      <div className="row between onb-nav">
        {i > 0 ? <button className="btn ghost" onClick={() => setI(i - 1)}>{t("onboard.back")}</button> : <span />}
        <button className="btn primary" onClick={() => (last ? close() : setI(i + 1))}>
          {last ? t("onboard.start") : t("onboard.next")}
        </button>
      </div>
    </Modal>
  );
}

export function OnboardingButton() {
  const t = useT();
  return <button className="btn ghost block" onClick={() => setState({ onboardingOpen: true })}>❓ {t("onboard.again")}</button>;
}
