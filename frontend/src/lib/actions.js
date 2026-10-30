import { api } from "../api";
import { getState, setState, toast } from "../store";
import { translate } from "../i18n";
import { toGeoJSON, fromGeoJSON, squareAround, inKyrgyzstan } from "./geo";
import { letter } from "./share";

const t = (k, p) => translate(getState().lang, k, p);

export function requireLogin(then) {
  if (getState().token) return then();
  setState({ loginOpen: true, loginThen: then });
}

export async function refreshPlots() {
  if (!getState().token) return;
  const plots = await api("/plots");
  setState({ plots });
}

export async function refreshSaved() {
  if (!getState().token) return;
  const saved = await api("/saved-plans");
  setState({ saved });
}

export function selectPlot(plot) {
  setState({
    plotId: plot.id,
    draft: { geometry: fromGeoJSON(plot.geometry), history: [], plotId: plot.id },
    answers: { ...plot.answers },
    priority: plot.answers?.priority || null,
    plans: null,
    shown: [],
    fitRequest: getState().fitRequest + 1,
  });
}

// "I'm on my field": a plot around the phone's position. Resolves to an error code or null.
export function plotHere() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve("map.locateError");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!inKyrgyzstan(coords.latitude, coords.longitude)) return resolve("map.outsideKg");
        setState((s) => ({
          plotId: null, answers: {}, priority: null, plans: null, shown: [],
          draft: { geometry: squareAround(coords.latitude, coords.longitude), history: [], plotId: null },
          fitRequest: s.fitRequest + 1,
        }));
        resolve(null);
      },
      (err) => resolve(err.code === err.PERMISSION_DENIED ? "plot.hereDenied" : "map.locateError"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

export function newPlot() {
  setState({ plotId: null, draft: null, answers: {}, priority: null, plans: null, shown: [] });
}

function sameGeometry(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Saves the draft as a new plot or updates the selected one. Returns the plot.
export async function saveDraft() {
  const { draft, plots } = getState();
  const geometry = toGeoJSON(draft.geometry);
  let plot;
  if (draft.plotId) {
    const old = plots.find((p) => p.id === draft.plotId);
    plot = old && sameGeometry(old.geometry, geometry) ? old : await api(`/plots/${draft.plotId}`, { method: "PATCH", body: { geometry } });
  } else {
    plot = await api("/plots", { method: "POST", body: { name: t("plot.defaultName", { n: plots.length + 1 }), geometry } });
  }
  const others = getState().plots.filter((p) => p.id !== plot.id);
  setState({ plots: [...others, plot].sort((a, b) => a.id - b.id), plotId: plot.id, draft: { ...draft, plotId: plot.id } });
  if (!draft.plotId) setState({ answers: {}, priority: null, plans: null, shown: [] });
  return plot;
}

export async function renamePlot(plot, name) {
  const updated = await api(`/plots/${plot.id}`, { method: "PATCH", body: { name } });
  setState((s) => ({ plots: s.plots.map((p) => (p.id === plot.id ? updated : p)) }));
}

export async function deletePlot(plot) {
  await api(`/plots/${plot.id}`, { method: "DELETE" });
  setState((s) => ({
    plots: s.plots.filter((p) => p.id !== plot.id),
    ...(s.plotId === plot.id ? { plotId: null, draft: null, answers: {}, priority: null, plans: null, shown: [] } : {}),
  }));
}

export async function saveAnswers(answers) {
  const { plotId } = getState();
  setState({ answers });
  const plot = await api(`/plots/${plotId}`, { method: "PATCH", body: { answers } });
  setState((s) => ({ plots: s.plots.map((p) => (p.id === plot.id ? plot : p)) }));
}

export async function fetchPlans({ more = false } = {}) {
  const { plotId, answers, priority, shown } = getState();
  const body = {
    plot_id: plotId, prev: answers.prev || "none", source: answers.source,
    water: answers.source === "none" ? "enough" : answers.water, soil: answers.soil, priority,
    exclude: more ? shown : [],
  };
  const res = await api("/plans", { method: "POST", body });
  const prevShown = more ? shown : [];
  setState({ plans: { ...res, offset: prevShown.length, request: body }, shown: [...prevShown, ...res.plans.map((p) => p.key)] });
  return res;
}

export async function savePlan(plan, index) {
  const { plans, plots, plotId } = getState();
  const plot = plots.find((p) => p.id === plotId);
  const ctx = plans.context;
  const inputs = {
    ...plans.request,
    planLabel: t("plans.plan", { letter: letter(index) }),
    plotName: plot?.name, area_ha: plot?.area_ha, geometry: plot?.geometry,
    snow: ctx.snow, snowUsed: plans.snow_used, basin: ctx.basin,
    climate: { ffd: ctx.ffd, rain: ctx.rain, heat: ctx.heat, source: ctx.climate_source },
    soilData: ctx.soil,
    demo: Boolean(ctx.snow?.demo || ctx.basin?.source === "demo" || ctx.climate_source !== "NASA POWER"),
  };
  const row = await api("/saved-plans", { method: "POST", body: { plot_id: plotId, plan, inputs } });
  setState((s) => ({ saved: [row, ...s.saved] }));
  toast(t("plans.savedToast"));
}

export async function deleteSaved(row) {
  await api(`/saved-plans/${row.id}`, { method: "DELETE" });
  setState((s) => ({ saved: s.saved.filter((x) => x.id !== row.id) }));
}

export function confirmThen(text, onYes) {
  setState({ confirm: { text, onYes } });
}
