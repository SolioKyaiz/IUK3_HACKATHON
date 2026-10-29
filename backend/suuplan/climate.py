"""Climate (NASA POWER) and soil (ISRIC SoilGrids) lookups with DB caching."""
from datetime import date, datetime, timedelta, timezone
from statistics import mean

import httpx

from .config import EXTERNAL_DATA, POWER_CACHE_DAYS
from .db import CachePower, CacheSoil

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"

FALLBACK_CLIMATE = {"ffd": 160, "rain": 200, "heat": 5, "source": "fallback"}
FALLBACK_SOIL = {"texture": "medium", "ph": 7.5, "source": "fallback"}


def summarize_power(daily, years):
    """daily: {param: {YYYYMMDD: value}} -> frost-free days, Apr–Sep rain, hot days (yearly means)."""
    tmin, tmax, rain = daily["T2M_MIN"], daily["T2M_MAX"], daily["PRECTOTCORR"]
    ffds, rains, heats = [], [], []
    for y in years:
        days = sorted(k for k in tmin if k.startswith(str(y)) and tmin[k] > -900)
        if len(days) < 300:
            continue
        spring = [d for d in days if d[4:] < "0701" and tmin[d] <= 0]
        autumn = [d for d in days if d[4:] >= "0701" and tmin[d] <= 0]
        last_spring = datetime.strptime(spring[-1], "%Y%m%d") if spring else datetime(y, 1, 1)
        first_autumn = datetime.strptime(autumn[0], "%Y%m%d") if autumn else datetime(y, 12, 31)
        ffds.append((first_autumn - last_spring).days - 1)
        rains.append(sum(rain[d] for d in days if "0401" <= d[4:] <= "0930" and rain[d] > -900))
        heats.append(sum(1 for d in days if tmax[d] >= 35))
    if not ffds:
        raise ValueError("no complete years")
    return {"ffd": round(mean(ffds)), "rain": round(mean(rains)), "heat": round(mean(heats), 1),
            "source": "NASA POWER", "years": f"{years[0]}–{years[-1]}"}


def get_climate(db, lat, lon):
    key = f"{lat:.1f},{lon:.1f}"
    row = db.get(CachePower, key)
    now = datetime.now(timezone.utc)
    if row and (now - row.fetched_at.replace(tzinfo=timezone.utc)) < timedelta(days=POWER_CACHE_DAYS):
        return row.data
    if not EXTERNAL_DATA:
        return FALLBACK_CLIMATE
    last = date.today().year - 1
    years = list(range(last - 4, last + 1))
    params = {"parameters": "T2M_MIN,T2M_MAX,PRECTOTCORR", "community": "AG",
              "latitude": round(lat, 2), "longitude": round(lon, 2),
              "start": f"{years[0]}0101", "end": f"{years[-1]}1231", "format": "JSON"}
    try:
        r = httpx.get(POWER_URL, params=params, timeout=25)
        r.raise_for_status()
        data = summarize_power(r.json()["properties"]["parameter"], years)
    except Exception:
        return row.data if row else FALLBACK_CLIMATE
    if row:
        row.data, row.fetched_at = data, now
    else:
        db.add(CachePower(key=key, data=data, fetched_at=now))
    db.commit()
    return data


def texture_from(sand, clay):
    if sand is None or clay is None:
        return "medium"
    if sand >= 60:
        return "sandy"
    if clay >= 35:
        return "clay"
    return "medium"


def get_soil(db, lat, lon):
    key = f"{lat:.2f},{lon:.2f}"
    row = db.get(CacheSoil, key)
    if row:  # SoilGrids is static: cache forever
        return row.data
    if not EXTERNAL_DATA:
        return FALLBACK_SOIL
    params = [("lon", round(lon, 4)), ("lat", round(lat, 4)), ("property", "sand"),
              ("property", "clay"), ("property", "phh2o"), ("depth", "0-5cm"), ("depth", "15-30cm"),
              ("value", "mean")]
    try:
        r = httpx.get(SOILGRIDS_URL, params=params, timeout=12)
        r.raise_for_status()
        vals = {}
        for layer in r.json()["properties"]["layers"]:
            nums = [d["values"]["mean"] for d in layer["depths"] if d["values"]["mean"] is not None]
            factor = layer["unit_measure"]["d_factor"]
            vals[layer["name"]] = mean(nums) / factor if nums else None
        sand, clay = vals.get("sand"), vals.get("clay")  # percent after d_factor
        if sand is None:  # SoilGrids has no value here (towns, water, rock): remember that too
            data = FALLBACK_SOIL
        else:
            data = {"texture": texture_from(sand, clay),
                    "ph": round(vals["phh2o"], 1) if vals.get("phh2o") else None,
                    "sand": round(sand), "clay": clay and round(clay), "source": "SoilGrids"}
    except Exception:
        return FALLBACK_SOIL  # network problem: do not cache, try again next time
    db.add(CacheSoil(key=key, data=data))
    db.commit()
    return data
