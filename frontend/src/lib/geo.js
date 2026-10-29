import turfArea from "@turf/area";
import kinks from "@turf/kinks";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

export const KG_BOUNDS = [[39.1, 69.2], [43.3, 80.3]];
export const KG_MAX_BOUNDS = [[38.8, 68.7], [43.6, 80.8]];
export const MIN_HA = 0.05;
export const MAX_HA = 500;

let border = null;
let borderFeature = null;
export async function loadBorder() {
  if (!border) border = fetch("/kg_border.geojson").then((r) => r.json()).then((fc) => (borderFeature = fc.features[0]));
  return border;
}
loadBorder().catch(() => { border = null; });

// True inside Kyrgyzstan; true as well while the border file is still loading.
export function inKyrgyzstan(lat, lon) {
  return !borderFeature || booleanPointInPolygon([lon, lat], borderFeature);
}

// Vertices are kept as [lat, lon] (Leaflet order); GeoJSON uses [lon, lat].
export function toGeoJSON(latlngs) {
  const ring = latlngs.map(([lat, lon]) => [round(lon), round(lat)]);
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

export function fromGeoJSON(geometry) {
  return geometry.coordinates[0].slice(0, -1).map(([lon, lat]) => [lat, lon]);
}

const round = (x) => Math.round(x * 1e7) / 1e7;

export function areaHa(latlngs) {
  if (!latlngs || latlngs.length < 3) return 0;
  return turfArea(toGeoJSON(latlngs)) / 10000;
}

export function squareAround(lat, lon, sideM = 200) {
  const dLat = sideM / 2 / 111320;
  const dLon = sideM / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[lat - dLat, lon - dLon], [lat - dLat, lon + dLon], [lat + dLat, lon + dLon], [lat + dLat, lon - dLon]];
}

// Returns an error code (same codes as the API) or null. `kg` is the border feature, if loaded.
export function validate(latlngs, kg) {
  if (!latlngs || latlngs.length < 3) return "too_few_vertices";
  const geo = toGeoJSON(latlngs);
  if (kinks(geo).features.length) return "self_intersection";
  if (kg && !latlngs.every(([lat, lon]) => booleanPointInPolygon([lon, lat], kg))) return "outside_kg";
  const ha = turfArea(geo) / 10000;
  if (ha < MIN_HA) return "area_too_small";
  if (ha > MAX_HA) return "area_too_large";
  return null;
}

export function bounds(latlngs) {
  const lats = latlngs.map((p) => p[0]), lons = latlngs.map((p) => p[1]);
  return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
}

export function centroidOf(latlngs) {
  const n = latlngs.length;
  return [latlngs.reduce((a, p) => a + p[0], 0) / n, latlngs.reduce((a, p) => a + p[1], 0) / n];
}
