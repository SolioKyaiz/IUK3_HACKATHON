// Tiny global store with localStorage persistence: keeps step data, plot, answers and map view
// across reloads, rotation and desktop/mobile layout switches.
import { useSyncExternalStore } from "react";

const KEY = "suuplan.state.v1";
const PERSIST = ["lang", "token", "phone", "plots", "draft", "plotId", "answers", "priority", "plans",
  "shown", "mapView", "panelCollapsed", "basemapMode", "snowLayer", "saved", "planView", "onboarded"];

const initial = {
  lang: "ky",
  token: null,
  phone: null,
  plots: [],          // the user's plots from the API
  draft: null,        // { geometry, history: [], plotId|null }
  plotId: null,       // selected saved plot
  answers: {},        // prev, source, water, soil
  priority: null,
  plans: null,        // last /plans response
  shown: [],          // plan keys already shown (for "other options")
  mapView: null,      // { center: [lat, lon], zoom }
  panelCollapsed: false,
  basemapMode: "auto",  // auto = map when zoomed out, satellite from SATELLITE_ZOOM
  snowLayer: false,
  saved: [],          // saved plans, also the offline copy
  planView: "stack",
  onboarded: false,
  onboardingOpen: false,
  loginOpen: false,
  loginThen: null,
  assistantOpen: false,
  confirm: null,      // { text, onYes }
  toast: null,
  highlightPlotId: null,
  fitRequest: 0,      // bump to ask the map to fit the selected plot
  liveGeometry: null, // plot outline while a corner is being dragged
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...initial, ...Object.fromEntries(PERSIST.filter((k) => k in saved).map((k) => [k, saved[k]])) };
  } catch {
    return { ...initial };
  }
}

let state = load();
const listeners = new Set();
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(PERSIST.map((k) => [k, state[k]]))));
    } catch { /* private mode or full storage: app still works */ }
  }, 150);
}

export function getState() {
  return state;
}

export function setState(patch) {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  persist();
  listeners.forEach((l) => l());
}

export function useStore(selector = (s) => s) {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => selector(state));
}

let toastTimer = null;
export function toast(text) {
  clearTimeout(toastTimer);
  setState({ toast: text });
  toastTimer = setTimeout(() => setState({ toast: null }), 2500);
}

export function logout() {
  setState({ token: null, phone: null, plots: [], plotId: null, saved: [], plans: null, shown: [], draft: null });
}
