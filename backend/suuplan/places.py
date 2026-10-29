"""Settlement search (own table, no Nominatim autocomplete) and Nominatim fallback on Enter."""
import asyncio
import csv
import time
from difflib import SequenceMatcher
from functools import lru_cache

import httpx
from sqlalchemy import func, select, text

from .config import DATA_DIR, EXTERNAL_DATA, NOMINATIM_URL, NOMINATIM_USER_AGENT
from .db import CacheGeocode, Place

LANGS = ("ky", "ru", "en")


@lru_cache
def load_places():
    with open(DATA_DIR / "places.csv", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def seed_places(db):
    if db.scalar(select(func.count()).select_from(Place)):
        return
    for p in load_places():
        db.add(Place(**{k: (float(v) if k in ("lat", "lon") else v) for k, v in p.items()}))
    db.commit()


def _norm(s):
    return s.lower().replace("ё", "е").replace("-", " ").strip()


def _out(p, lang):
    return {"name": p[f"name_{lang}"], "region": p[f"region_{lang}"], "lat": float(p["lat"]), "lon": float(p["lon"])}


def search_places(q, lang, db=None, limit=8):
    lang = lang if lang in LANGS else "ky"
    q = _norm(q)
    if not q:
        return []
    if db is not None and db.bind.dialect.name == "postgresql":
        rows = db.execute(text(
            "SELECT * FROM places WHERE name_ky % :q OR name_ru % :q OR name_en % :q "
            "OR name_ky ILIKE :p OR name_ru ILIKE :p OR name_en ILIKE :p "
            "ORDER BY GREATEST(similarity(name_ky,:q), similarity(name_ru,:q), similarity(name_en,:q)) DESC "
            "LIMIT :n"), {"q": q, "p": f"{q}%", "n": limit}).mappings().all()
        if rows:
            return [_out(r, lang) for r in rows]

    def score(p):
        best = 0.0
        for lg in LANGS:
            name = _norm(p[f"name_{lg}"])
            if name.startswith(q):
                best = max(best, 2.0 + len(q) / len(name))
            elif q in name:
                best = max(best, 1.5)
            else:
                best = max(best, SequenceMatcher(None, q, name[:len(q) + 2]).ratio())
        return best

    ranked = sorted(((score(p), p) for p in load_places()), key=lambda x: -x[0])
    return [_out(p, lang) for s, p in ranked if s >= 0.6][:limit]


# Nominatim policy: max 1 request/second for the whole app, no autocomplete, own User-Agent, cache.
_nominatim_lock = asyncio.Lock()
_last_call = 0.0


async def geocode(q, db):
    global _last_call
    key = _norm(q)[:200]
    cached = db.get(CacheGeocode, key)
    if cached:
        return cached.data
    if not EXTERNAL_DATA:
        return []
    async with _nominatim_lock:
        wait = 1.0 - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with httpx.AsyncClient(timeout=10, headers={"User-Agent": NOMINATIM_USER_AGENT}) as c:
                r = await c.get(NOMINATIM_URL, params={"q": q, "format": "jsonv2", "countrycodes": "kg", "limit": 5})
            r.raise_for_status()
            data = [{"name": x["display_name"].split(",")[0], "region": ", ".join(x["display_name"].split(",")[1:3]).strip(),
                     "lat": float(x["lat"]), "lon": float(x["lon"])} for x in r.json()]
        finally:
            _last_call = time.monotonic()
    db.add(CacheGeocode(key=key, data=data))
    db.commit()
    return data
