import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { setState, useStore } from "./store";
import { useT } from "./i18n";
import { useBreakpoint } from "./hooks/useBreakpoint";
import MapView, { overlayPad } from "./components/MapView";
import MapOverlay, { AssistantButton } from "./components/MapOverlay";
import SearchBox from "./components/SearchBox";
import Sheet, { SheetContext } from "./components/Sheet";
import Assistant from "./components/Assistant";
import Onboarding from "./components/Onboarding";
import Icon from "./components/Icons";
import { ConfirmDialog, LoginDialog, Toast } from "./components/Dialogs";
import PlotStep from "./steps/PlotStep";
import FieldStep from "./steps/FieldStep";
import PriorityStep from "./steps/PriorityStep";
import PlansStep from "./steps/PlansStep";
import SavedStep from "./steps/SavedStep";
import DataPage from "./steps/DataPage";
import { refreshPlots, refreshSaved } from "./lib/actions";

function Steps() {
  const plotId = useStore((s) => s.plotId);
  return (
    <Routes>
      <Route path="/plot" element={<PlotStep />} />
      <Route path="/field" element={plotId ? <FieldStep /> : <Navigate to="/plot" replace />} />
      <Route path="/priority" element={plotId ? <PriorityStep /> : <Navigate to="/plot" replace />} />
      <Route path="/plans" element={plotId ? <PlansStep /> : <Navigate to="/plot" replace />} />
      <Route path="/saved" element={<SavedStep />} />
      <Route path="/data" element={<DataPage />} />
      <Route path="*" element={<Navigate to="/plot" replace />} />
    </Routes>
  );
}

function SideMenu() {
  const t = useT();
  const items = [["/plot", "field", "menu.plots"], ["/saved", "plans", "menu.plans"], ["/data", "data", "menu.data"]];
  const loc = useLocation();
  const inFlow = ["/plot", "/field", "/priority", "/plans"].includes(loc.pathname);
  return (
    <nav className="side-menu" aria-label="SuuPlan">
      <div className="logo" aria-label="SuuPlan">
        <span className="logo-mark"><Icon name="drop" size={20} /></span>
        <span className="logo-word">Suu<b>Plan</b></span>
      </div>
      {items.map(([to, icon, key]) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive || (to === "/plot" && inFlow) ? "active" : "")}>
          <Icon name={icon} size={22} />
          <span>{t(key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function TabletMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="tablet-menu">
      <button className="icon-btn" aria-expanded={open} aria-label={t("menu.open")} onClick={() => setOpen(!open)}><Icon name="menu" /></button>
      {open && (
        <div className="menu-pop" onClick={() => setOpen(false)}>
          <NavLink to="/plot">{t("menu.plots")}</NavLink>
          <NavLink to="/saved">{t("menu.plans")}</NavLink>
          <NavLink to="/data">{t("menu.data")}</NavLink>
        </div>
      )}
    </div>
  );
}

function OfflineBanner() {
  const t = useT();
  const [off, setOff] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOff(false), offF = () => setOff(true);
    window.addEventListener("online", on); window.addEventListener("offline", offF);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", offF); };
  }, []);
  return off ? <div className="offline" role="status">{t("app.offline")}</div> : null;
}

export default function App() {
  const t = useT();
  const { mode, narrowDesktop } = useBreakpoint();
  const { panelCollapsed, token, assistantOpen } = useStore((s) => s);
  const loc = useLocation();

  useEffect(() => { document.documentElement.lang = t.lang; }, [t.lang]);
  useEffect(() => {
    if (token) { refreshPlots().catch(() => {}); refreshSaved().catch(() => {}); }
  }, [token]);
  // Desktop/tablet: the panel sits beside the map, nothing overlaps it.
  useEffect(() => { if (mode !== "mobile") overlayPad.bottom = 0; }, [mode]);

  const mobile = mode === "mobile";
  const collapsed = !mobile && panelCollapsed;

  return (
    <div className={`app mode-${mode} ${narrowDesktop ? "narrow" : ""} ${collapsed ? "collapsed" : ""}`} data-route={loc.pathname.slice(1)}>
      {mode === "desktop" && <SideMenu />}
      {mobile ? (
        <Sheet><Steps /></Sheet>
      ) : (
        <SheetContext.Provider value={{ snap: "panel", setSnap: () => {} }}>
          <aside className="panel" aria-hidden={collapsed} inert={collapsed ? "" : undefined}>
            <div className="panel-top">
              {mode !== "desktop" && <TabletMenu />}
              <SearchBox />
            </div>
            <Steps />
          </aside>
          <button className="collapse-btn" onClick={() => setState({ panelCollapsed: !panelCollapsed })}
            aria-label={collapsed ? t("panel.expand") : t("panel.collapse")} title={collapsed ? t("panel.expand") : t("panel.collapse")}>
            <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} />
          </button>
        </SheetContext.Provider>
      )}
      <main className="map-area">
        <MapView />
        <MapOverlay mode={mode} />
        {!assistantOpen && <div className="assistant-fab"><AssistantButton /></div>}
        <OfflineBanner />
      </main>
      <Assistant />
      <LoginDialog />
      <Onboarding />
      <ConfirmDialog />
      <Toast />
    </div>
  );
}
