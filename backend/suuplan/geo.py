"""Geometry helpers: plot validation, area, basins."""
import json
import math
from functools import lru_cache

from shapely.geometry import MultiPoint, Point, mapping, shape
from shapely.ops import voronoi_diagram

from .config import DATA_DIR

EARTH_RADIUS = 6371008.8  # same constant as @turf/area v7, so frontend and backend agree
MIN_HA, MAX_HA = 0.05, 500.0


def ring_area_m2(coords):
    """Spherical ring area, the algorithm used by @turf/area."""
    n = len(coords)
    if n <= 2:
        return 0.0
    total = 0.0
    for i in range(n):
        lo = coords[i]
        mid = coords[(i + 1) % n]
        hi = coords[(i + 2) % n]
        total += (math.radians(hi[0]) - math.radians(lo[0])) * math.sin(math.radians(mid[1]))
    return abs(total * EARTH_RADIUS * EARTH_RADIUS / 2)


def polygon_area_ha(geometry):
    rings = geometry["coordinates"]
    area = ring_area_m2(rings[0]) - sum(ring_area_m2(r) for r in rings[1:])
    return area / 10000.0


@lru_cache
def kg_border():
    with open(DATA_DIR / "kg_border.geojson", encoding="utf-8") as f:
        return shape(json.load(f)["features"][0]["geometry"])


def validate_plot(geometry):
    """Returns (area_ha, error_code or None)."""
    if not isinstance(geometry, dict) or geometry.get("type") != "Polygon":
        return 0.0, "geometry_invalid"
    try:
        ring = geometry["coordinates"][0]
        if len(ring) < 4 or ring[0] != ring[-1]:
            return 0.0, "geometry_invalid"
        poly = shape(geometry)
    except Exception:
        return 0.0, "geometry_invalid"
    if len(ring) - 1 < 3:
        return 0.0, "too_few_vertices"
    if not poly.is_valid:
        return 0.0, "self_intersection"
    # Small tolerance (~200 m) because the border file is simplified.
    if not kg_border().buffer(0.002).contains(poly):
        return 0.0, "outside_kg"
    area = round(polygon_area_ha(geometry), 2)
    if area < MIN_HA:
        return area, "area_too_small"
    if area > MAX_HA:
        return area, "area_too_large"
    return area, None


def centroid(geometry):
    c = shape(geometry).centroid
    return c.y, c.x


@lru_cache
def basins():
    """Basin polygons. Uses HydroBASINS output if present, else demo Voronoi cells."""
    hydro = DATA_DIR / "basins_hydrobasins.geojson"
    if hydro.exists():
        with open(hydro, encoding="utf-8") as f:
            fc = json.load(f)
        return [{"id": str(ft["properties"]["id"]), "name": ft["properties"]["name"],
                 "geom": shape(ft["geometry"]), "source": "HydroBASINS"} for ft in fc["features"]]

    with open(DATA_DIR / "basin_seeds.json", encoding="utf-8") as f:
        seeds = json.load(f)["basins"]
    border = kg_border()
    pts = MultiPoint([(s["lon"], s["lat"]) for s in seeds])
    cells = voronoi_diagram(pts, envelope=border.envelope.buffer(1))
    out = []
    for s in seeds:
        p = Point(s["lon"], s["lat"])
        cell = next(c for c in cells.geoms if c.contains(p))
        geom = cell.intersection(border).simplify(0.01, preserve_topology=True)
        out.append({"id": s["id"], "name": s["name"], "geom": geom, "source": "demo"})
    return out


def basin_for_point(lat, lon):
    p = Point(lon, lat)
    best = None
    for b in basins():
        if b["geom"].contains(p):
            return b
        d = b["geom"].distance(p)
        if best is None or d < best[0]:
            best = (d, b)
    return best[1]


def basin_feature(b):
    return {"type": "Feature", "properties": {"id": b["id"], "name": b["name"], "source": b["source"]},
            "geometry": mapping(b["geom"])}
