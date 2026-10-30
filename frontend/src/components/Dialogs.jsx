import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { getState, setState, useStore } from "../store";
import { useT } from "../i18n";
import { refreshPlots, refreshSaved } from "../lib/actions";
import Icon from "./Icons";

// Modal on desktop/tablet, full-height sheet on phones (same markup, CSS decides).
export function Modal({ label, onClose, children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    (el?.querySelector("input") || el?.querySelector(".btn.primary") || el?.querySelector("button:not(.close)"))?.focus();
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        {children}
      </div>
    </div>
  );
}

export function LoginDialog() {
  const t = useT();
  const open = useStore((s) => s.loginOpen);
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState("phone");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const phone = `+996${digits}`;
  const close = () => { setState({ loginOpen: false, loginThen: null }); setStage("phone"); setCode(""); setErr(null); };

  const getCode = async (e) => {
    e.preventDefault();
    if (!/^\d{9}$/.test(digits)) return setErr("phone_invalid");
    setBusy(true); setErr(null);
    try { await api("/auth/otp", { method: "POST", body: { phone } }); setStage("code"); }
    catch (x) { setErr(x.code); }
    setBusy(false);
  };
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const { token } = await api("/auth/verify", { method: "POST", body: { phone, code } });
      const then = getState().loginThen;
      setState({ token, phone, loginOpen: false, loginThen: null });
      setStage("phone"); setCode("");
      await Promise.all([refreshPlots(), refreshSaved()]).catch(() => {});
      then?.();
    } catch (x) { setErr(x.code); }
    setBusy(false);
  };

  return (
    <Modal label={t("auth.title")} onClose={close} className="login">
      <div className="dialog-head">
        <h2>{t("auth.title")}</h2>
        <button className="icon-btn close" onClick={close} aria-label={t("auth.close")}><Icon name="close" /></button>
      </div>
      <p className="muted">{t("auth.why")}</p>
      {stage === "phone" ? (
        <form onSubmit={getCode}>
          <label className="field-label" htmlFor="phone">{t("auth.phone")}</label>
          <div className="phone-input">
            <span>+996</span>
            <input id="phone" inputMode="numeric" autoComplete="tel-national" maxLength={9} placeholder="555 123 456"
              value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 9))} />
          </div>
          {err && <p className="error" role="alert">{t(`err.${err}`)}</p>}
          <button className="btn primary block" disabled={busy || digits.length !== 9}>{t("auth.getCode")}</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <label className="field-label" htmlFor="code">{t("auth.code")}</label>
          <input id="code" className="input code" inputMode="numeric" autoComplete="one-time-code" maxLength={4}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          <p className="hint">{t("auth.demoCode")}</p>
          {err && <p className="error" role="alert">{t(`err.${err}`)}</p>}
          <button className="btn primary block" disabled={busy || code.length !== 4}>{t("auth.submit")}</button>
          <button type="button" className="btn ghost block" onClick={() => setStage("phone")}>{t("auth.changePhone")}</button>
        </form>
      )}
    </Modal>
  );
}

export function ConfirmDialog() {
  const t = useT();
  const confirm = useStore((s) => s.confirm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!confirm) return null;
  const close = () => { setState({ confirm: null }); setErr(null); };
  return (
    <Modal label={confirm.text} onClose={close} className="confirm">
      <p className="confirm-text">{confirm.text}</p>
      {err && <p className="error">{t(`err.${err}`)}</p>}
      <div className="row end">
        <button className="btn ghost" onClick={close}>{t("confirm.no")}</button>
        <button className="btn danger" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await confirm.onYes(); close(); } catch (e) { setErr(e.code || "unknown"); }
          setBusy(false);
        }}>{t("confirm.yes")}</button>
      </div>
    </Modal>
  );
}

export function Toast() {
  const text = useStore((s) => s.toast);
  return <div className={`toast ${text ? "show" : ""}`} role="status" aria-live="polite">{text}</div>;
}
