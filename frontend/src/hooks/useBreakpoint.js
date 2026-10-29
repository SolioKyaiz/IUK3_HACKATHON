import { useEffect, useState } from "react";

// Layout mode by window size (never by User-Agent).
// mobile < 768, tablet 768–1199, desktop ≥ 1200; a phone held sideways gets a 50% side panel.
function read() {
  const w = window.innerWidth, h = window.innerHeight;
  const landscapePhone = h < 500 && w > h && w < 1200;
  const mode = landscapePhone ? "landscape" : w < 768 ? "mobile" : w < 1200 ? "tablet" : "desktop";
  return { mode, width: w, height: h, narrowDesktop: w < 1440 };
}

export function useBreakpoint() {
  const [bp, setBp] = useState(read);
  useEffect(() => {
    const on = () => setBp((prev) => {
      const next = read();
      return next.mode === prev.mode && next.narrowDesktop === prev.narrowDesktop && Math.abs(next.height - prev.height) < 40 ? prev : next;
    });
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("orientationchange", on); };
  }, []);
  return bp;
}
