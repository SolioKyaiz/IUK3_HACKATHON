"""Daily snow job: MODIS MOD10A1 v6.1 snow cover per basin vs. the multi-year norm for the date.

Run once a day (GitHub Actions, see .github/workflows/snow.yml):
    DATABASE_URL=... EE_SERVICE_ACCOUNT_JSON='{...}' python -m scripts.snow_job

Method (simple and explainable):
- window: the 8 days ending yesterday (fills cloud gaps of the daily product);
- snow fraction: share of valid pixels in the basin with NDSI_Snow_Cover >= 40;
- norm: median snow fraction for the same 8-day window in 2001 .. last year;
- anomaly %: (fraction - norm) / norm * 100; label: <= -15% low, >= +15% high, else normal.
"""
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path
from statistics import median

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ee  # pip install earthengine-api
from shapely.geometry import mapping
from sqlalchemy import delete

from suuplan.db import SessionLocal, SnowDaily, init_db
from suuplan.geo import basins
from suuplan.snow import label_for

WINDOW_DAYS = 8
NDSI_THRESHOLD = 40
FIRST_YEAR = 2001


def ee_init():
    info = json.loads(os.environ["EE_SERVICE_ACCOUNT_JSON"])
    creds = ee.ServiceAccountCredentials(info["client_email"], key_data=json.dumps(info))
    ee.Initialize(creds, project=info.get("project_id"))


def snow_fraction(geom, start, end):
    col = ee.ImageCollection("MODIS/061/MOD10A1").filterDate(start.isoformat(), end.isoformat()).select("NDSI_Snow_Cover")
    img = col.max()  # max over the window = snow seen on any clear day
    snow = img.gte(NDSI_THRESHOLD).rename("snow")
    valid = img.mask().rename("valid")
    stats = snow.addBands(valid).reduceRegion(ee.Reducer.mean(), geom, scale=500, maxPixels=1e10, bestEffort=True)
    return stats.get("snow")


def main():
    ee_init()
    init_db()
    end = date.today()
    start = end - timedelta(days=WINDOW_DAYS)
    day = end - timedelta(days=1)
    rows = []
    for b in basins():
        geom = ee.Geometry(mapping(b["geom"]))
        current = ee.Number(snow_fraction(geom, start, end)).getInfo()
        hist = []
        for y in range(FIRST_YEAR, end.year):
            s, e = start.replace(year=y), end.replace(year=y)
            v = snow_fraction(geom, s, e).getInfo()
            if v is not None:
                hist.append(v)
        norm = median(hist) if hist else None
        if current is None or not norm:
            print(f"{b['id']}: no data", file=sys.stderr)
            continue
        anomaly = round((current - norm) / norm * 100, 1)
        rows.append(SnowDaily(basin_id=b["id"], date=day, snow_fraction=round(current, 4), anomaly=anomaly,
                              label=label_for(anomaly), source="MODIS MOD10A1.061"))
        print(f"{b['id']}: {current:.3f} vs norm {norm:.3f} -> {anomaly:+.1f}% {label_for(anomaly)}")
    with SessionLocal() as db:
        db.execute(delete(SnowDaily).where(SnowDaily.source == "demo"))
        db.execute(delete(SnowDaily).where(SnowDaily.date == day))
        db.add_all(rows)
        db.commit()


if __name__ == "__main__":
    main()
