# SuuPlan

PWA for farmers in Kyrgyzstan: mark a field on the map, answer 3 questions, choose a priority and get
three 3-year crop rotation plans that take mountain snow, soil and climate into account.
NASA Space Apps Challenge 2026 — "Field Shift: Adapting Farms with NASA Data".

Plans come from a deterministic rules engine (`backend/suuplan/scoring.py`). AI is used only in the
in-app helper and never touches plans. Snow is a water-risk indicator, not a forecast.

## Run locally

```bash
# backend (Python 3.11+)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn suuplan.main:app --reload --port 8000

# frontend (Node 20+)
cd frontend
npm install
npm run dev            # http://localhost:5173, /api is proxied to :8000
```

Login: any `+996` number, code **1234** (no SMS in the MVP).
SQLite is used by default; set `DATABASE_URL` for PostgreSQL (Neon/Supabase). See `backend/.env.example`
and `frontend/.env.example`.

Checks:

```bash
cd backend && .venv/bin/python -m pytest -q     # engine + API tests
cd frontend && npm run check:i18n && npm run build
```

## Layout

| Path | What |
|---|---|
| `backend/suuplan/main.py` | FastAPI app: auth, plots, context, plans, saved plans, snow layer, places, assistant |
| `backend/suuplan/scoring.py` | rules engine (filter → rotations → scores → 3 diverse plans + reasons as codes) |
| `backend/suuplan/data/crops.csv`, `rules.json` | crop values and engine weights — edit without code changes |
| `backend/suuplan/climate.py` | NASA POWER (cached 30 days per 0.1°) and SoilGrids (cached forever) |
| `backend/suuplan/snow.py`, `geo.py` | basin snow labels, basins, plot validation and area |
| `backend/scripts/snow_job.py` | daily MODIS MOD10A1 job (Earth Engine) → `snow_daily` |
| `backend/scripts/build_basins.py` | HydroBASINS → `basins_hydrobasins.geojson` (replaces demo basins) |
| `backend/scripts/import_places_osm.py` | all KG settlements from OSM → `places.csv` |
| `frontend/src/App.jsx` | one React app; layout switches by window width (`useBreakpoint`) |
| `frontend/src/components/MapView.jsx` | Leaflet map, OSM/Esri layers, snow layer, plot editor |
| `frontend/src/components/Sheet.jsx` | phone bottom sheet with 3 snap points |
| `frontend/src/steps/*` | `/plot`, `/field`, `/priority`, `/plans`, `/saved`, `/data` |
| `frontend/src/i18n/{ky,ru,en}.json`, `faq.json` | all UI strings and helper FAQ |
| `.github/workflows/snow.yml`, `render.yaml` | daily snow job, backend deploy |

## Deploy (free tiers)

- Frontend: Cloudflare Pages or Vercel, build `npm run build`, output `frontend/dist`
  (`public/_redirects` and `vercel.json` handle SPA routes). Set `VITE_API_URL`.
- Backend: Render (`render.yaml`). Set `DATABASE_URL`, `CORS_ORIGINS` (the frontend URL), optionally `ANTHROPIC_API_KEY`.
  The free instance sleeps: open `/health` a minute before the demo.
- Snow: GitHub Actions secrets `DATABASE_URL` and `EE_SERVICE_ACCOUNT_JSON` (Earth Engine service account).

## What is still demo data

Shown with a «Демо» badge in the app until replaced:

- **Snow labels and basins** are synthetic until `snow_job.py` runs and `build_basins.py` is fed HydroBASINS.
  The snow "norm" is defined in `snow_job.py`: median of the same 8-day window, 2001 – last year.
- **Crop values** in `crops.csv` are approximate (FAO-56 style); income is a 1–5 index ("approximate prices").
  Rice is excluded until verified water data exists.
- **Places**: 55 major settlements; run `import_places_osm.py` for the full list.
- Kyrgyz texts need proofreading by a native speaker.

## Decisions and deviations from the spec

- **Plot editor** is custom (Leaflet markers) instead of geoman: needed for long-press vertex delete,
  44 px touch handles and undo. Right-click also deletes a vertex on desktop.
- **Desktop plans** (open question): both views are built — cards with swipe/buttons/← → keys, and a
  list with "Save" on each card; the toggle is remembered.
- **Geometry** is stored as GeoJSON (JSON column) so SQLite works for development; PostGIS is optional.
  Basin lookup uses shapely. Place search uses `pg_trgm` on PostgreSQL and fuzzy matching otherwise.
- **Area** uses the @turf/area algorithm on both sides (same radius); vs. the WGS84 ellipsoid (QGIS) the
  difference is about −0.2%.
- **Satellite**: with `VITE_ARCGIS_KEY` the ArcGIS Location Platform endpoint is used; without it the public
  World Imagery endpoint. A browser tile key cannot be secret — restrict it by referrer.
- **Helper**: model `claude-opus-5-5` by default (`ASSISTANT_MODEL` to change), low effort, server-side
  refusal fallback enabled. Without a key or on error it switches to FAQ mode. "What should I sow?" is
  answered with a fixed refusal and a link to Plans, both online and offline.
- Saved plans are cached in localStorage (offline copy); the service worker caches the app shell and the
  build assets, never map tiles.
