import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { setState, useStore } from "../store";
import { useT, fmtNum, fmtDate } from "../i18n";
import Step from "../components/Step";
import Icon from "../components/Icons";
import { fetchPlans, savePlan } from "../lib/actions";
import { letter, reasonText } from "../lib/share";

const SWIPE_PX = 100;

export default function PlansStep() {
  const t = useT();
  const nav = useNavigate();
  const { plans, saved, planView } = useStore((s) => s);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [savedKeys, setSavedKeys] = useState(() => new Set());
  const page = plans?.plans || [];
  const offset = plans?.offset || 0;

  useEffect(() => { setIndex(0); }, [plans]);

  const decide = async (i, keep) => {
    if (keep && !savedKeys.has(page[i].key)) {
      setSavedKeys((s) => new Set(s).add(page[i].key));
      try { await savePlan(page[i], offset + i); } catch (e) {
        setErr(e.code);
        setSavedKeys((s) => { const n = new Set(s); n.delete(page[i].key); return n; });
      }
    }
    if (planView === "stack") setIndex((x) => Math.max(x, i + 1));
  };

  useEffect(() => {
    if (planView !== "stack") return;
    const key = (e) => {
      if (e.target.closest("input, textarea") || index >= page.length) return;
      if (e.key === "ArrowRight") decide(index, true);
      if (e.key === "ArrowLeft") decide(index, false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  if (!plans) return <Navigate to="/priority" replace />;

  const more = async () => {
    setBusy(true); setErr(null);
    try { await fetchPlans({ more: true }); } catch (e) { setErr(e.code); }
    setBusy(false);
  };

  const ctx = plans.context;
  const snow = ctx.snow;
  const done = planView === "stack" ? index >= page.length : true;

  return (
    <Step title={t("plans.title")} n={4} back="/priority">
      <div className={`snow-banner ${plans.snow_used ? snow?.label : "unused"}`}>
        {plans.snow_used
          ? <>{t(`snow.${snow?.label || "unknown"}`)} · {t("snow.date", { date: fmtDate(t.lang, snow?.date) })}</>
          : t("snow.notUsed")}
        {(snow?.demo || ctx.climate_source !== "NASA POWER") && <span className="pill demo">{t("app.demo")}</span>}
      </div>
      <p className="muted small">{t("plans.climate", { ffd: ctx.ffd, rain: ctx.rain, heat: ctx.heat })}</p>

      <div className="row between">
        <div className="seg small" role="group">
          <button className={planView === "stack" ? "on" : ""} onClick={() => setState({ planView: "stack" })}>{t("plans.stackView")}</button>
          <button className={planView === "list" ? "on" : ""} onClick={() => setState({ planView: "list" })}>{t("plans.listView")}</button>
        </div>
        <button className="link" onClick={() => nav("/saved")}>{t("plans.saved", { n: saved.length })}</button>
      </div>

      {page.length === 0 && <p className="empty">{t("plans.noPlans")}</p>}

      {planView === "stack" ? (
        <div className="stack" data-no-sheet-drag>
          {page.map((p, i) => i >= index && (
            <PlanCard key={p.key} plan={p} label={letter(offset + i)} depth={i - index} top={i === index}
              source={plans.request.source} onDecide={(keep) => decide(i, keep)} saved={savedKeys.has(p.key)} />
          )).reverse()}
          {done && page.length > 0 && <div className="stack-done muted">{t("plans.done")}</div>}
        </div>
      ) : (
        <div className="plan-list">
          {page.map((p, i) => (
            <PlanCard key={p.key} plan={p} label={letter(offset + i)} list source={plans.request.source}
              onDecide={(keep) => decide(i, keep)} saved={savedKeys.has(p.key)} />
          ))}
        </div>
      )}

      {planView === "stack" && !done && (
        <>
          <div className="decide">
            <button className="round-btn no" onClick={() => decide(index, false)} aria-label={t("plans.skip")} title={t("plans.skip")}><Icon name="close" size={26} /></button>
            <button className="round-btn yes" onClick={() => decide(index, true)} aria-label={t("plans.save")} title={t("plans.save")}><Icon name="check" size={26} /></button>
          </div>
          <p className="muted small center">{t("plans.swipeHint")}<span className="desktop-only"> · {t("plans.keysHint")}</span></p>
        </>
      )}

      {err && <p className="error" role="alert">{t(`err.${err}`)}</p>}

      {done && (
        <div className="col">
          {plans.has_more && <button className="btn primary block" disabled={busy} onClick={more}>{busy ? t("app.loading") : t("plans.more")}</button>}
          <button className="btn ghost block" onClick={() => nav("/saved")}>{t("plans.saved", { n: saved.length })}</button>
        </div>
      )}

      {plans.excluded?.length > 0 && (
        <div className="excluded">
          <h3>{t("plans.notIncluded")}</h3>
          <ul>
            {plans.excluded.map((e) => (
              <li key={e.crop}><strong>{t(`crop.${e.crop}`)}</strong> — {t(`excluded.${e.code}`, e.params)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small">{t("app.hint")}</p>
    </Step>
  );
}

function PlanCard({ plan, label, depth = 0, top, list, source, onDecide, saved }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [dx, setDx] = useState(0);
  const drag = useRef(null);

  const down = (e) => {
    if (!top || e.target.closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
  };
  const moveP = (e) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x, my = e.clientY - d.y;
    if (d.horizontal == null && Math.hypot(mx, my) > 6) {
      d.horizontal = Math.abs(mx) > Math.abs(my);
      if (d.horizontal) e.currentTarget.setPointerCapture(d.id);
    }
    if (d.horizontal) setDx(mx);
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.horizontal && Math.abs(dx) > SWIPE_PX) {
      const keep = dx > 0;
      setDx(keep ? 600 : -600);
      setTimeout(() => onDecide(keep), 180);
    } else setDx(0);
  };

  const style = list ? undefined : {
    transform: `translate(${dx}px, ${depth * 10}px) rotate(${dx / 25}deg) scale(${1 - depth * 0.04})`,
    zIndex: 10 - depth,
    transition: drag.current ? "none" : "transform .2s ease",
  };

  return (
    <article className={`plan-card ${list ? "in-list" : ""} ${top ? "top" : ""}`} style={style}
      onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}
      aria-label={t("plans.plan", { letter: label })} aria-hidden={!list && !top}>
      {!list && dx !== 0 && <div className={`swipe-tag ${dx > 0 ? "yes" : "no"}`} style={{ opacity: Math.min(1, Math.abs(dx) / SWIPE_PX) }}>{dx > 0 ? t("plans.save") : t("plans.skip")}</div>}
      <h2>{t("plans.plan", { letter: label })} {saved && <span className="pill ok"><Icon name="check" size={14} /></span>}</h2>
      <ol className="years">
        {plan.years.map((c, i) => <li key={i}><span className="muted">{t("plans.year", { n: i + 1 })}</span> <strong>{t(`crop.${c}`)}</strong></li>)}
      </ol>
      <p className="water">{source === "none" ? t("plans.rainfed", { mm: plan.deficit_mm }) : t("plans.water", { m3: fmtNum(t.lang, plan.water_m3_year) })}</p>
      <p className="why">{reasonText(t.lang, plan.reasons[0])}</p>
      <button className="link" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t("plans.hideDetails") : t("plans.details")}</button>
      {open && (
        <div className="details">
          {["water", "soil", "income", "risk"].map((k) => (
            <div key={k} className="score">
              <span>{t(`plans.score.${k}`)}{k === "income" && <span className="muted tiny"> ({t("plans.approxPrices")})</span>}</span>
              <span className="bar"><span className={k === "risk" ? "risk" : ""} style={{ width: `${plan.scores[k]}%` }} /></span>
              <span className="num">{plan.scores[k]}</span>
            </div>
          ))}
          <ul className="reasons">{plan.reasons.map((r, i) => <li key={i}>{reasonText(t.lang, r)}</li>)}</ul>
        </div>
      )}
      {list && (
        <button className={`btn ${saved ? "ghost" : "primary"} block`} disabled={saved} onClick={() => onDecide(true)}>
          {saved ? <><Icon name="check" size={18} /> {t("plans.savedToast")}</> : t("plans.save")}
        </button>
      )}
    </article>
  );
}
