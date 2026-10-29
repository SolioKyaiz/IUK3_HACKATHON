import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { overlayPad } from "./MapView";
import { getState, setState } from "../store";
import { useT } from "../i18n";

// Bottom sheet with three snap points. Drag the handle/header, tap the handle to cycle,
// or pull down when the content is scrolled to the top.
export const SNAPS = { collapsed: 0.15, half: 0.5, full: 0.9 };
const ORDER = ["collapsed", "half", "full"];
const DEFAULT_SNAP = { "/plot": "collapsed", "/field": "half", "/priority": "half", "/plans": "full", "/saved": "full", "/data": "full" };

export const SheetContext = createContext({ snap: "full", setSnap: () => {} });
export const useSheet = () => useContext(SheetContext);

export default function Sheet({ children }) {
  const t = useT();
  const loc = useLocation();
  const [snap, setSnap] = useState(DEFAULT_SNAP[loc.pathname] || "half");
  const [vh, setVh] = useState(window.innerHeight);
  const [dragH, setDragH] = useState(null);
  const sheet = useRef(null);
  const drag = useRef(null);

  useEffect(() => { setSnap(DEFAULT_SNAP[loc.pathname] || "half"); }, [loc.pathname]);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const height = dragH ?? Math.round(vh * SNAPS[snap]);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--sheet-h", `${height}px`);
  }, [height]);
  useEffect(() => {
    if (dragH != null) return;
    overlayPad.bottom = Math.round(vh * SNAPS[snap]);
    setState({ fitRequest: getState().fitRequest + 1 });
    return () => { overlayPad.bottom = 0; };
  }, [snap, vh, dragH]);

  const settle = (h, velocity) => {
    const target = h - velocity * 180; // flick bias
    let best = ORDER[0];
    for (const k of ORDER) if (Math.abs(vh * SNAPS[k] - target) < Math.abs(vh * SNAPS[best] - target)) best = k;
    setSnap(best);
    setDragH(null);
  };

  const begin = (y) => { drag.current = { y0: y, h0: height, last: y, t: performance.now(), v: 0, moved: false }; };
  const move = (y) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    d.v = (y - d.last) / Math.max(1, now - d.t);
    d.last = y; d.t = now;
    if (Math.abs(y - d.y0) > 4) d.moved = true;
    setDragH(Math.max(vh * 0.1, Math.min(vh * 0.94, d.h0 - (y - d.y0))));
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) { setDragH(null); return false; }
    settle(dragH ?? d.h0, -d.v);
    return true;
  };

  // Handle + header: pointer events (touch-action: none there).
  const onPointerDown = (e) => {
    if (e.target.closest("button:not(.sheet-handle), input, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    begin(e.clientY);
  };
  const onPointerUp = (e) => {
    const moved = end();
    if (moved === false && e.target.closest(".sheet-handle")) setSnap(ORDER[(ORDER.indexOf(snap) + 1) % 3]);
  };

  // Content: pull down from the top of the scroll area moves the sheet instead of scrolling.
  useEffect(() => {
    const el = sheet.current?.querySelector(".step-body");
    if (!el) return;
    let startY = null, active = false;
    const ts = (e) => {
      if (e.target.closest("[data-no-sheet-drag]")) { startY = null; return; }
      startY = e.touches[0].clientY; active = false;
    };
    const tm = (e) => {
      if (startY == null) return;
      const y = e.touches[0].clientY;
      if (!active && el.scrollTop <= 0 && y - startY > 8) { active = true; begin(startY); }
      if (active) { e.preventDefault(); move(y); }
    };
    const te = () => { if (active) end(); startY = null; active = false; };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te);
    el.addEventListener("touchcancel", te);
    return () => {
      el.removeEventListener("touchstart", ts); el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te); el.removeEventListener("touchcancel", te);
    };
  });

  return (
    <SheetContext.Provider value={{ snap, setSnap, dragging: dragH != null }}>
      <section
        ref={sheet}
        className={`sheet snap-${snap} ${dragH != null ? "dragging" : ""}`}
        style={{ height }}
        aria-label="steps"
      >
        <div className="sheet-grab" onPointerDown={onPointerDown} onPointerMove={(e) => drag.current && move(e.clientY)} onPointerUp={onPointerUp} onPointerCancel={() => end()}>
          <button className="sheet-handle" aria-label={t("sheet.handle")} onKeyDown={(e) => {
            if (e.key === "ArrowUp") setSnap(ORDER[Math.min(2, ORDER.indexOf(snap) + 1)]);
            if (e.key === "ArrowDown") setSnap(ORDER[Math.max(0, ORDER.indexOf(snap) - 1)]);
          }} />
        </div>
        <div className="sheet-inner" onPointerDown={(e) => e.target.closest(".step-head") && onPointerDown(e)}
          onPointerMove={(e) => drag.current && move(e.clientY)} onPointerUp={onPointerUp} onPointerCancel={() => end()}>
          {children}
        </div>
      </section>
    </SheetContext.Provider>
  );
}
