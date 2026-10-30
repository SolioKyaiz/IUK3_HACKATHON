import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polygon, GeoJSON, ScaleControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { useLocation } from "react-router-dom";
import { getState, setState, useStore, toast } from "../store";
import { useT, translate } from "../i18n";
import { snowUrl } from "../api";
import { KG_BOUNDS, KG_MAX_BOUNDS, squareAround, bounds, fromGeoJSON, loadBorder, inKyrgyzstan } from "../lib/geo";
import { selectPlot } from "../lib/actions";

export const mapRef = { current: null };
// The mobile sheet writes its height here so fitBounds can keep the plot above it.
export const overlayPad = { bottom: 0 };

const ARCGIS_KEY = import.meta.env.VITE_ARCGIS_KEY;
const ESRI_URL = ARCGIS_KEY
  ? `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${ARCGIS_KEY}`
  : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Powered by <a href=\"https://www.esri.com\">Esri</a> | Esri, Maxar, Earthstar Geographics";
const OSM_ATTR = "© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors";
// Village and road names on top of the satellite, so farmers keep their bearings.
const ESRI_LABELS_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
// From this zoom fields are easier to recognise on the satellite than on the map.
export const SATELLITE_ZOOM = 15;

export function effectiveBasemap(mode, zoom) {
  if (mode === "auto") return zoom >= SATELLITE_ZOOM ? "satellite" : "osm";
  return mode;
}

export const SNOW_COLORS = { low: "#e8590c", normal: "#2f9e44", high: "#1c7ed6" };

let snowCache = null;
export function loadSnow() {
  if (!snowCache) snowCache = fetch(snowUrl).then((r) => (r.ok ? r.json() : Promise.reject(r))).catch((e) => { snowCache = null; throw e; });
  return snowCache;
}

export function basinAt(fc, lat, lon) {
  return fc?.features.find((f) => booleanPointInPolygon([lon, lat], f)) || null;
}

export default function MapView() {
  const { basemapMode, snowLayer, mapView, draft } = useStore((s) => s);
  const basemap = effectiveBasemap(basemapMode, mapView?.zoom ?? 7);
  const initial = useRef(
    mapView ? { center: mapView.center, zoom: mapView.zoom }
      : draft?.geometry ? { bounds: bounds(draft.geometry) } : { bounds: KG_BOUNDS }
  ).current;

  return (
    <MapContainer
      {...initial}
      className="map"
      zoomControl={false}
      attributionControl={true}
      maxBounds={KG_MAX_BOUNDS}
      maxBoundsViscosity={1}
      minZoom={6}
      maxZoom={19}
      doubleClickZoom={false}
      ref={(m) => { mapRef.current = m; }}
    >
      {basemap === "satellite"
        ? <>
            <TileLayer key="esri" url={ESRI_URL} attribution={ESRI_ATTR} maxZoom={19} />
            <TileLayer key="esri-labels" url={ESRI_LABELS_URL} maxZoom={19} />
          </>
        : <TileLayer key="osm" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM_ATTR} maxZoom={19} />}
      {snowLayer && <SnowLayer />}
      <CountryMask />
      <ScaleControl position="bottomright" imperial={false} />
      <AttributionPrefix />
      <SavedPlots />
      <DraftLayer />
      <MapEvents />
      <FitController />
    </MapContainer>
  );
}

function AttributionPrefix() {
  const map = useMap();
  useEffect(() => { map.attributionControl.setPrefix(false); }, [map]);
  return null;
}

// Only Kyrgyzstan is usable: everything outside the border is covered, and the map
// cannot be zoomed out further than the whole country.
function CountryMask() {
  const map = useMap();
  const [kg, setKg] = useState(null);
  useEffect(() => { loadBorder().then(setKg).catch(() => {}); }, []);
  useEffect(() => {
    const fit = () => map.setMinZoom(Math.max(5, map.getBoundsZoom(KG_BOUNDS)));
    fit();
    map.on("resize", fit);
    return () => map.off("resize", fit);
  }, [map]);
  if (!kg) return null;
  const parts = kg.geometry.type === "Polygon" ? [kg.geometry.coordinates] : kg.geometry.coordinates;
  const holes = parts.map((poly) => poly[0].map(([lon, lat]) => [lat, lon]));
  const world = [[-89, -179.9], [89, -179.9], [89, 179.9], [-89, 179.9]];
  return (
    <>
      <Polygon positions={[world, ...holes]} interactive={false} pathOptions={{ stroke: false, fillOpacity: 0.88, className: "kg-mask" }} />
      {holes.map((ring, i) => (
        <Polygon key={i} positions={ring} interactive={false} pathOptions={{ color: "#238B45", weight: 2.5, opacity: 0.85, fill: false }} />
      ))}
    </>
  );
}

function SnowLayer() {
  const [fc, setFc] = useState(null);
  const lang = useStore((s) => s.lang);
  useEffect(() => { loadSnow().then(setFc).catch(() => {}); }, []);
  if (!fc) return null;
  return (
    <GeoJSON
      key={lang}
      data={fc}
      interactive={false}
      style={(f) => ({ color: SNOW_COLORS[f.properties.label] || "#868e96", weight: 1.5, fillOpacity: 0.22, fillColor: SNOW_COLORS[f.properties.label] || "#868e96" })}
    />
  );
}

function SavedPlots() {
  const { plots, draft, highlightPlotId } = useStore((s) => s);
  const loc = useLocation();
  return plots
    .filter((p) => p.id !== draft?.plotId || p.id === highlightPlotId)
    .map((p) => (
      <Polygon
        key={p.id + (p.id === highlightPlotId ? "h" : "")}
        positions={fromGeoJSON(p.geometry)}
        pathOptions={p.id === highlightPlotId
          ? { color: "#f08c00", weight: 4, fillOpacity: 0.25, fillColor: "#ffd43b" }
          : { color: "#495057", weight: 2, dashArray: "6 4", fillColor: "#868e96", fillOpacity: 0.12 }}
        eventHandlers={{
          click: (e) => {
            L.DomEvent.stopPropagation(e);
            if (loc.pathname === "/plot") selectPlot(p);
          },
        }}
      />
    ));
}

function MapEvents() {
  const loc = useLocation();
  const map = useMapEvents({
    click(e) {
      const s = getState();
      if (loc.pathname !== "/plot" || s.draft) return;
      if (!inKyrgyzstan(e.latlng.lat, e.latlng.lng)) return toast(translate(s.lang, "map.outsideKg"));
      setState({ draft: { geometry: squareAround(e.latlng.lat, e.latlng.lng), history: [], plotId: null }, plotId: null });
    },
    moveend() {
      const c = map.getCenter();
      setState({ mapView: { center: [c.lat, c.lng], zoom: map.getZoom() } });
    },
  });
  return null;
}

// Keeps the selected plot in the visible part of the map when the panel or sheet changes size.
function FitController() {
  const map = useMap();
  const { fitRequest, draft, panelCollapsed } = useStore((s) => s);
  const first = useRef(true);
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const geom = getState().draft?.geometry;
    if (!geom) return;
    const id = setTimeout(() => {
      map.invalidateSize({ pan: false });
      map.fitBounds(bounds(geom), {
        paddingTopLeft: [40, 90],
        paddingBottomRight: [70, overlayPad.bottom + 40],
        maxZoom: 17,
        animate: true,
      });
    }, 260);
    return () => clearTimeout(id);
  }, [fitRequest, panelCollapsed, draft?.plotId, map]);
  return null;
}

function DraftLayer() {
  const loc = useLocation();
  const draft = useStore((s) => s.draft);
  if (!draft?.geometry) return null;
  if (loc.pathname === "/plot") return <PlotEditor key={draft.plotId ?? "new"} />;
  return (
    <>
      <Polygon positions={draft.geometry} pathOptions={{ color: "#1864ab", weight: 6, opacity: 0.55, fill: false }} interactive={false} />
      <Polygon positions={draft.geometry} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#3ba7ff", fillOpacity: 0.28 }} interactive={false} />
    </>
  );
}

function vertexIcon(coarse) {
  const s = coarse ? 44 : 28;
  return L.divIcon({ className: "vx", html: "<span></span>", iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
}
function midIcon(coarse) {
  const s = coarse ? 40 : 24;
  return L.divIcon({ className: "vx mid", html: "<span></span>", iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
}

function pushHistory(draft, geometry) {
  return { ...draft, geometry, history: [...draft.history.slice(-30), draft.geometry] };
}

// Plot outline editor: drag corners, drag side midpoints to add a corner,
// long-press (or right-click) a corner to remove it. Built on plain Leaflet markers so the
// 44 px touch targets and long-press behave the same on phones and desktops.
function PlotEditor() {
  const map = useMap();
  const geometry = useStore((s) => s.draft.geometry);
  const t = useT();

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const pts = geometry.map((p) => L.latLng(p[0], p[1]));
    const halo = L.polygon(pts, { color: "#1864ab", weight: 6, opacity: 0.55, fill: false, interactive: false }).addTo(map);
    const poly = L.polygon(pts, { color: "#ffffff", weight: 3, fillColor: "#3ba7ff", fillOpacity: 0.28, interactive: false }).addTo(map);
    const group = L.layerGroup().addTo(map);
    let frame = 0;

    const live = () => {
      halo.setLatLngs(pts); poly.setLatLngs(pts);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setState({ liveGeometry: pts.map((p) => [p.lat, p.lng]) }));
    };
    const commit = () => {
      const next = pts.map((p) => [p.lat, p.lng]);
      setState((s) => ({ draft: pushHistory(s.draft, next), liveGeometry: null }));
    };

    const mids = [];
    const midPos = (i) => {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      return L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    };

    pts.forEach((p, i) => {
      const m = L.marker(p, { draggable: true, icon: vertexIcon(coarse), keyboard: false, title: t("plot.hintEdit") }).addTo(group);
      let timer = null, start = null;
      const cancel = () => { clearTimeout(timer); timer = null; };
      const remove = () => {
        if (pts.length <= 3) return;
        pts.splice(i, 1);
        commit();
      };
      m.on("add", () => {
        const el = m.getElement();
        el.addEventListener("pointerdown", (e) => {
          start = [e.clientX, e.clientY];
          timer = setTimeout(() => { timer = null; navigator.vibrate?.(30); remove(); }, 650);
        });
        el.addEventListener("pointermove", (e) => {
          if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 8) cancel();
        });
        el.addEventListener("pointerup", cancel);
        el.addEventListener("pointercancel", cancel);
      });
      m.on("contextmenu", (e) => { L.DomEvent.preventDefault(e.originalEvent); remove(); });
      m.on("dragstart", cancel);
      m.on("drag", (e) => {
        pts[i] = e.target.getLatLng();
        mids.forEach((mm, j) => mm.setLatLng(midPos(j)));
        live();
      });
      m.on("dragend", commit);
    });

    pts.forEach((_, i) => {
      const mm = L.marker(midPos(i), { draggable: true, icon: midIcon(coarse), keyboard: false }).addTo(group);
      mids.push(mm);
      let inserted = false;
      mm.on("dragstart", () => { pts.splice(i + 1, 0, mm.getLatLng()); inserted = true; });
      mm.on("drag", (e) => { if (inserted) { pts[i + 1] = e.target.getLatLng(); live(); } });
      mm.on("dragend", commit);
    });

    return () => {
      cancelAnimationFrame(frame);
      map.removeLayer(group); map.removeLayer(poly); map.removeLayer(halo);
    };
    // Rebuild handles whenever the committed geometry changes (edit, undo, select).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(geometry)]);

  return null;
}
