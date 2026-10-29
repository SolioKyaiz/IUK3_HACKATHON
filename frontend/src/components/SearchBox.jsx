import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { mapRef } from "./MapView";
import Icon from "./Icons";

// Suggestions come from our own settlements table; Nominatim is used only on Enter (its policy forbids autocomplete).
export default function SearchBox({ floating }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null); // null | "none" | error code
  const [active, setActive] = useState(-1);
  const box = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); setStatus(null); return; }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      api(`/places?q=${encodeURIComponent(q.trim())}&lang=${t.lang}`, { signal: ctrl.signal })
        .then((r) => { setItems(r); setStatus(r.length ? null : "none"); setActive(-1); })
        .catch((e) => { if (e.name !== "AbortError") setStatus(e.code); });
    }, 250);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q, t.lang]);

  useEffect(() => {
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const go = (p) => {
    setQ(p.name); setOpen(false); setItems([]);
    mapRef.current?.flyTo([p.lat, p.lon], 14, { duration: 1.2 });
  };

  const onKey = async (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter") {
      e.preventDefault();
      if (items.length) return go(items[Math.max(active, 0)]);
      if (q.trim().length < 2) return;
      try {
        const r = await api(`/geocode?q=${encodeURIComponent(q.trim())}`);
        if (r.length) go(r[0]); else setStatus("none");
      } catch (err) { setStatus(err.code); }
      setOpen(true);
    }
  };

  return (
    <div className={`search ${floating ? "floating" : ""}`} ref={box}>
      <Icon name="search" size={18} className="search-icon" />
      <input
        type="search" value={q} placeholder={t("search.placeholder")} aria-label={t("search.placeholder")}
        role="combobox" aria-expanded={open && items.length > 0} aria-autocomplete="list" aria-controls="search-list"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
      />
      {open && q.trim().length >= 2 && (
        <div className="search-pop">
          {items.length > 0 && (
            <ul id="search-list" role="listbox">
              {items.map((p, i) => (
                <li key={`${p.name}${p.lat}`} role="option" aria-selected={i === active}>
                  <button className={i === active ? "on" : ""} onClick={() => go(p)}>
                    <span>{p.name}</span><span className="muted small">{p.region}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {status === "none" && <div className="muted pad">{t("search.none")}. {t("search.enter")}</div>}
          {status && status !== "none" && <div className="error pad">{t(`err.${status}`)}</div>}
          <div className="muted tiny pad">{t("search.osm")}</div>
        </div>
      )}
    </div>
  );
}
