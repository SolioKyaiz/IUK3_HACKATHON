import { useEffect, useRef, useState } from "react";
import { getState, setState, useStore, logout, toast } from "../store";
import { useT, LANGS, fmtDate } from "../i18n";
import { mapRef, loadSnow, basinAt, SNOW_COLORS } from "./MapView";
import SearchBox from "./SearchBox";
import { inKyrgyzstan } from "../lib/geo";
import Icon from "./Icons";

export default function MapOverlay({ mode }) {
  const mobile = mode === "mobile";
  return (
    <>
      <div className={`map-top ${mobile ? "mobile" : ""}`}>
        {mobile && <SearchBox floating />}
        {mobile ? <CompactProfile /> : null}
      </div>
      <SnowChip mobile={mobile} />
      {!mobile && <div className="map-top-right"><LangSwitch /><ProfileButton /></div>}
      <MapButtons mobile={mobile} />
    </>
  );
}

export function LangSwitch() {
  const lang = useStore((s) => s.lang);
  return (
    <div className="seg map-chip" role="group" aria-label="Language">
      {LANGS.map(([code, label]) => (
        <button key={code} className={lang === code ? "on" : ""} aria-pressed={lang === code}
          onClick={() => { setState({ lang: code }); document.documentElement.lang = code; }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function useOutsideClose(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, setOpen]);
  return ref;
}

function ProfileButton() {
  const { token, phone } = useStore((s) => s);
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  if (!token) return <button className="map-chip btn-login" onClick={() => setState({ loginOpen: true, loginThen: null })}>{t("auth.login")}</button>;
  return (
    <div className="profile" ref={ref}>
      <button className="map-chip" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="user" size={18} /> {phone?.slice(-4)}</button>
      {open && (
        <div className="menu-pop" role="menu">
          <div className="muted">{phone}</div>
          <button role="menuitem" onClick={() => { setOpen(false); logout(); }}>{t("auth.logout")}</button>
        </div>
      )}
    </div>
  );
}

function CompactProfile() {
  const { lang, token, phone } = useStore((s) => s);
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  return (
    <div className="profile" ref={ref}>
      <button className="map-btn round" aria-expanded={open} aria-label={t("menu.open")} onClick={() => setOpen(!open)}>
        {LANGS.find(([c]) => c === lang)[1]}
      </button>
      {open && (
        <div className="menu-pop right" role="menu">
          <LangSwitch />
          {token
            ? <><div className="muted">{phone}</div><button onClick={() => { setOpen(false); logout(); }}>{t("auth.logout")}</button></>
            : <button onClick={() => { setOpen(false); setState({ loginOpen: true, loginThen: null }); }}>{t("auth.login")}</button>}
        </div>
      )}
    </div>
  );
}

function SnowChip({ mobile }) {
  const t = useT();
  const [fc, setFc] = useState(null);
  const [basin, setBasin] = useState(null);
  const [open, setOpen] = useState(false);
  const center = useStore((s) => s.mapView?.center);
  useEffect(() => { loadSnow().then(setFc).catch(() => {}); }, []);
  useEffect(() => {
    if (!fc) return;
    const c = center || [41.5, 74.7];
    setBasin(basinAt(fc, c[0], c[1]));
  }, [fc, center?.[0], center?.[1]]);
  if (!fc) return null;
  const p = basin?.properties;
  const label = p?.label;
  return (
    <div className={`snow-chip-wrap ${mobile ? "mobile" : ""}`}>
      <button className={`map-chip snow-chip ${label || "none"}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="dot" style={{ background: SNOW_COLORS[label] || "#868e96" }} />
        {label ? t(`snow.${label}`) : t("snow.unknown")}
        {p?.demo && <span className="pill demo">{t("app.demo")}</span>}
      </button>
      {open && p && (
        <div className="popover" role="dialog">
          <strong>{t("snow.inBasin", { basin: p.name[t.lang] || p.name.ru, label: t(`snow.label.${label}`) })}</strong>
          <p>{t("snow.explain")}</p>
          <p className="muted">{t("snow.date", { date: fmtDate(t.lang, p.date) })}{p.anomaly != null && ` · ${t("snow.anomaly", { value: (p.anomaly > 0 ? "+" : "") + p.anomaly })}`}</p>
          {p.demo && <p className="muted">{t("data.demo")}</p>}
        </div>
      )}
    </div>
  );
}

function MapButtons({ mobile }) {
  const t = useT();
  const { basemapMode, snowLayer } = useStore((s) => s);
  const [layersOpen, setLayersOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!layersOpen) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setLayersOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [layersOpen]);

  const locate = () => {
    if (!navigator.geolocation) return toast(t("map.locateError"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lon } = pos.coords;
        if (!inKyrgyzstan(lat, lon)) return toast(t("map.outsideKg"));
        mapRef.current?.flyTo([lat, lon], 15);
      },
      () => { setLocating(false); toast(t("map.locateError")); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className={`map-buttons ${mobile ? "mobile" : ""}`} ref={ref}>
      <div className="layers-wrap">
        <button className="map-btn" aria-label={t("map.layers")} title={t("map.layers")} aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>
          <Icon name="layers" />
        </button>
        {layersOpen && (
          <div className="layers-pop" role="dialog" aria-label={t("map.layers")}>
            <div className="muted small">{t("map.base")}</div>
            {[["auto", "map.auto"], ["osm", "map.osm"], ["satellite", "map.satellite"]].map(([v, key]) => (
              <label key={v}><input type="radio" name="base" checked={basemapMode === v} onChange={() => setState({ basemapMode: v })} /> {t(key)}</label>
            ))}
            <hr />
            <label><input type="checkbox" checked={snowLayer} onChange={(e) => setState({ snowLayer: e.target.checked })} /> {t("map.snowLayer")}</label>
            {snowLayer && <SnowLegend />}
          </div>
        )}
      </div>
      {!mobile && (
        <>
          <div className="map-btn-group" role="group" aria-label={`${t("map.zoomIn")} / ${t("map.zoomOut")}`}>
            <button className="map-btn" aria-label={t("map.zoomIn")} title={t("map.zoomIn")} onClick={() => mapRef.current?.zoomIn()}><Icon name="plus" /></button>
            <button className="map-btn" aria-label={t("map.zoomOut")} title={t("map.zoomOut")} onClick={() => mapRef.current?.zoomOut()}><Icon name="minus" /></button>
          </div>
        </>
      )}
      <button className={`map-btn ${locating ? "busy" : ""}`} aria-label={t("map.locate")} title={t("map.locate")} onClick={locate}><Icon name="locate" /></button>
    </div>
  );
}

function SnowLegend() {
  const t = useT();
  const [date, setDate] = useState(null);
  useEffect(() => { loadSnow().then((fc) => setDate(fc.features[0]?.properties.date)).catch(() => {}); }, []);
  return (
    <div className="legend">
      {["low", "normal", "high"].map((l) => (
        <div key={l}><span className="dot" style={{ background: SNOW_COLORS[l] }} /> {t(`snow.label.${l}`)}</div>
      ))}
      <div className="muted small">{t("map.legendDate", { date: fmtDate(t.lang, date) })}</div>
    </div>
  );
}

export function AssistantButton({ inline }) {
  const t = useT();
  return (
    <button className={inline ? "icon-btn" : "map-btn round assistant-btn"} aria-label={t("assistant.open")} title={t("assistant.open")}
      onClick={() => setState({ assistantOpen: !getState().assistantOpen })}>
      <Icon name="chat" />
    </button>
  );
}
