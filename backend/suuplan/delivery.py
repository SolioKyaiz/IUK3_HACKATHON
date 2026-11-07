"""How much river water realistically reaches a field. An estimate built from reference data:

1. Allocation per hectare: national irrigation use (rules `national_irrigation_m3`) / all farmland in
   Kyrgyzstan seen from satellite (ESA WorldCereal temporary crops, data/basin_cropland.json from
   scripts/cropland_job.py).
2. Basin cap: if the basin's farmland would need more than its rivers carry (natural long-term mean flow
   at the main river, HydroRIVERS `DIS_AV_CMS`, data/rivers_kg.geojson), everyone gets proportionally less.
   pressure = farmland x allocation / yearly river volume; allocation / max(1, pressure).
3. Canal losses (Kostyakov): sigma = A / Q^m percent per km, over L km = straight-line distance from the
   field to the nearest river reach (the shortest possible canal).
4. Field application efficiency (furrows): the share that reaches the root zone.
"""
import json
import math
from functools import lru_cache

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from .config import DATA_DIR
from .geo import basins

SECONDS_PER_YEAR = 365 * 24 * 3600
KM_PER_DEG_LAT = 110.57
LAT0 = 41.5  # Kyrgyzstan spans 39.2–43.3°N: a fixed scale keeps distances within ~3%
KM_PER_DEG_LON = 111.32 * math.cos(math.radians(LAT0))


def _km(x, y):
    return x * KM_PER_DEG_LON, y * KM_PER_DEG_LAT


@lru_cache
def _rivers():
    path = DATA_DIR / "rivers_kg.geojson"
    if not path.exists():
        return None
    feats = json.loads(path.read_text())["features"]
    lines = [shape({"type": "LineString", "coordinates": [_km(x, y) for x, y in f["geometry"]["coordinates"]]})
             for f in feats]
    return feats, lines, STRtree(lines)


@lru_cache
def _cropland():
    path = DATA_DIR / "basin_cropland.json"
    return json.loads(path.read_text())["basins"] if path.exists() else None


@lru_cache
def basin_flows():
    """{basin_id: natural mean flow at its main river, m³/s}."""
    rv = _rivers()
    if not rv:
        return {}
    feats, lines, _ = rv
    out = {}
    for b in basins():
        best = None
        for f, line in zip(feats, lines):
            mid = line.interpolate(0.5, normalized=True)
            if b["geom"].contains(Point(mid.x / KM_PER_DEG_LON, mid.y / KM_PER_DEG_LAT)):
                if best is None or f["properties"]["up"] > best["up"]:
                    best = f["properties"]
        if best:
            out[b["id"]] = best["q"]
    return out


def nearest_river(lat, lon):
    """(distance km, reach properties) to the nearest river reach big enough for a canal intake."""
    feats, lines, tree = _rivers()
    p = Point(_km(lon, lat))
    i = int(tree.nearest(p))
    return lines[i].distance(p), feats[i]["properties"]


def estimate(lat, lon, area_ha, texture, basin_id, rules):
    """Water for this field per year (m³), from the river intake to the root zone. None without data."""
    crops, flows = _cropland(), basin_flows()
    if not crops or basin_id not in flows or basin_id not in crops:
        return None
    total_farmland = sum(b["crops_ha"] for b in crops.values())
    farmland = crops[basin_id]["crops_ha"]
    avg = rules["national_irrigation_m3"] / total_farmland
    river_m3 = flows[basin_id] * SECONDS_PER_YEAR
    pressure = farmland * avg / river_m3
    per_ha = avg / max(1.0, pressure)
    km, reach = nearest_river(lat, lon)
    k = rules["kostyakov"][texture]
    loss_pct = k["A"] / rules["canal_flow_m3s"] ** k["m"]
    canal_eff = (1 - loss_pct / 100) ** km
    intake = per_ha * area_ha
    gate = intake * canal_eff
    return {"per_ha_m3": round(per_ha), "avg_ha_m3": round(avg), "intake_m3": round(intake), "gate_m3": round(gate),
            "useful_m3": round(gate * rules["field_efficiency"]),
            "river_km": round(km, 1), "river_q": reach["q"], "loss_pct_km": round(loss_pct, 2),
            "canal_eff": round(canal_eff, 2), "field_eff": rules["field_efficiency"],
            "farmland_ha": farmland, "basin_q": flows[basin_id], "pressure_pct": round(pressure * 100),
            "river_m3": round(river_m3), "basin_need_m3": round(farmland * avg)}
