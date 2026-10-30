import { useEffect, useState } from "react";
import { getState, setState, useStore } from "../store";
import { useT } from "../i18n";
import { Modal } from "./Dialogs";
import Icon from "./Icons";
import CropIcon from "./CropIcon";

// Each slide: a large icon in a circle with two small companions.
const SLIDES = [
  { n: 1, main: <Icon name="search" size={52} />, side: [<Icon key="h" name="home" size={26} />, <Icon key="p" name="pin" size={26} />] },
  { n: 2, main: <Icon name="field" size={52} />, side: [<Icon key="p" name="pin" size={26} />, <Icon key="e" name="edit" size={26} />] },
  { n: 3, main: <CropIcon id="wheat" size={64} />, side: [<Icon key="d" name="drop" size={26} />, <Icon key="h" name="help" size={26} />] },
  { n: 4, main: <Icon name="plans" size={52} />, side: [<Icon key="s" name="sprout" size={26} />, <Icon key="c" name="check" size={26} />] },
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
      <div className="onb-art" aria-hidden="true">
        <span className="onb-side">{slide.side[0]}</span>
        <span className="onb-main">{slide.main}</span>
        <span className="onb-side">{slide.side[1]}</span>
      </div>
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
  return <button className="btn ghost block" onClick={() => setState({ onboardingOpen: true })}><Icon name="help" size={18} /> {t("onboard.again")}</button>;
}
