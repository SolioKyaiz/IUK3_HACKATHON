"""Snow labels per basin. Real values come from scripts/snow_job.py (MODIS MOD10A1);
until that job has run, deterministic demo values are seeded and flagged as demo."""
import hashlib
from datetime import date, timedelta

from sqlalchemy import func, select

from .db import SnowDaily
from .geo import basin_feature, basins

LOW_BELOW, HIGH_ABOVE = -15.0, 15.0


def label_for(anomaly):
    if anomaly <= LOW_BELOW:
        return "low"
    if anomaly >= HIGH_ABOVE:
        return "high"
    return "normal"


def seed_demo(db):
    if db.scalar(select(func.count()).select_from(SnowDaily)):
        return
    day = date.today() - timedelta(days=1)
    for b in basins():
        h = int(hashlib.sha256(b["id"].encode()).hexdigest()[:8], 16)
        anomaly = round((h % 700) / 10 - 35, 1)
        fraction = round(0.2 + (h % 500) / 1000, 3)
        db.add(SnowDaily(basin_id=b["id"], date=day, snow_fraction=fraction, anomaly=anomaly,
                         label=label_for(anomaly), source="demo"))
    db.commit()


def latest(db):
    """{basin_id: {label, anomaly, date, demo}} using each basin's newest row."""
    sub = (select(SnowDaily.basin_id, func.max(SnowDaily.date).label("d"))
           .group_by(SnowDaily.basin_id).subquery())
    rows = db.execute(select(SnowDaily).join(
        sub, (SnowDaily.basin_id == sub.c.basin_id) & (SnowDaily.date == sub.c.d))).scalars()
    return {r.basin_id: {"label": r.label, "anomaly": r.anomaly, "date": r.date.isoformat(),
                         "demo": r.source == "demo"} for r in rows}


def basins_geojson(db):
    snow = latest(db)
    feats = []
    for b in basins():
        f = basin_feature(b)
        f["properties"].update(snow.get(b["id"], {"label": None, "anomaly": None, "date": None, "demo": True}))
        feats.append(f)
    return {"type": "FeatureCollection", "features": feats}
