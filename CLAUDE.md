# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ISEED (from "ice" and "seed"; formerly SuuPlan) is a PWA for farmers in Kyrgyzstan (NASA Space Apps 2026): mark a field on a map, answer a few questions, pick a priority, get three 3-year crop rotation plans. The original spec is the Russian PDF in the repo root (git-ignored, like `images.png`). Only the user-visible name changed: the Python package `suuplan`, the localStorage key `suuplan.state.v1` (renaming it would wipe saved plans on phones), the service-worker cache and the Render services/URLs keep the old name. Live at https://suuplan.onrender.com; pushing to `main` on GitHub (`SolioKyaiz/IUK3_HACKATHON`) redeploys via `render.yaml`.

Non-negotiable product rules from the spec:
- Plans come only from the deterministic rules engine. The AI helper explains the app; it never builds, ranks or changes plans and refuses "what should I sow?" (handled by a regex before any LLM call, in both `backend/suuplan/assistant.py` and offline in `frontend/src/components/Assistant.jsx`).
- Snow is a water-risk indicator, never presented as a forecast. Anything synthetic is shown with a «Демо» badge.
- The map is restricted to Kyrgyzstan (mask, min zoom, click/locate checks).

## Commands

```bash
# backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn suuplan.main:app --reload --port 8000
.venv/bin/python -m pytest -q                                   # all tests
.venv/bin/python -m pytest -q tests/test_scoring.py::test_snow_ignored_for_well   # one test
DATABASE_URL="postgresql://localhost/suuplan_test?host=/tmp" .venv/bin/python -m pytest -q   # against Postgres
SUUPLAN_EXTERNAL_DATA=0 ...   # disable NASA POWER / SoilGrids / Nominatim calls (tests set this)

# frontend
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api → :8000
npm run build        # Vite; main JS budget is 300 KB gzip excluding the map chunk
npm run check:i18n   # ky/ru/en keys and {placeholders} must match, FAQ lengths must match
```

There is no linter configured. Demo login: any `+996` + 9 digits, code `1234`.

Always run the local backend with `--reload`. A uvicorn started without it keeps serving old code (and cached data such as demo basins) while Vite serves the new frontend, so new screens show old or missing data. If something new doesn't appear locally, check `lsof -iTCP:8000 -sTCP:LISTEN` for a stale process. `npm run dev -- --host` makes the dev site reachable from a phone on the same Wi-Fi. The local SQLite database (`backend/suuplan.db`) is separate from the live Postgres one.

## Architecture

**Backend** (`backend/suuplan/`, FastAPI, SQLAlchemy 2.1):
- `main.py` holds every route. Errors are `{code, message}`; the frontend maps `code` to translated text (`err.*` / `plot.err.*` keys), so new error codes need i18n entries. Auth is a JWT in `Authorization: Bearer`; every plot/saved-plan query is scoped to the user. Rate limits are in-memory and keyed by the first `X-Forwarded-For` entry (Render proxies everything).
- `scoring.py` is the engine: filter crops (no verified water data, too short frost-free period) → enumerate 3-year sequences valid against last year's crop → score water/soil/income/risk → weighted total `(a·m·Water + b·Soil + c·Income + d·(100−Risk)) / (a·m+b+c+d)` where `m = snow × shortage` → pick 3 plans differing in ≥2 years and not permutations of each other or of `exclude`. Reasons are returned as codes with params; the frontend writes the sentences. Also returns a wheat-every-year `baseline` used for "X% less water than wheat", and per plan `natural` water (season rain m³ and plant-available soil water on year 1's sowing date, from NASA POWER `GWETROOT` averaged over 5 years; shown on saved plans, never as a forecast) and `by_year` (crop, typical sowing date from `crops.csv` `sow_mmdd` with its citation in `sow_source` — FAO Crop Calendar for Kyrgyzstan; an empty `sow_source` is shown as "our estimate" with the «Демо» badge — and water per year) with `water_m3_total`. Saved-plan extras are built in `frontend/src/lib/share.js` (`yearRows`, `sourceLines`, `naturalLines`) and shared by the card, share text and PDF; old saved plans without these fields simply skip them. Each basin in `basin_seeds.json` names its feeding mountain ranges (`mountains`, ky/ru/en).
- `delivery.py` estimates the water that realistically reaches the field, for river/reservoir sources only (parameters and citations in `rules.json`, `_delivery_comment`):
  1. allocation per ha = national irrigation use (`national_irrigation_m3`, 6.19 km³ in 2024) ÷ all satellite farmland (sum of `crops_ha` in `data/basin_cropland.json`, ESA WorldCereal per basin);
  2. basin cap: `pressure = basin farmland × allocation ÷ river volume per year` (HydroRIVERS long-term mean flow at the basin's largest reach, `data/rivers_kg.geojson`); above 100% everyone gets `allocation ÷ pressure`;
  3. canal seepage (Kostyakov): `σ = A / Q^m` % per km (`kostyakov` by soil texture, `canal_flow_m3s`) over the straight-line km to the nearest river reach;
  4. field losses: `field_efficiency` (furrows, 0.6).
  `plot_context` adds the result as `delivery` (`useful_m3`, `canal_eff`, `pressure_pct`, `river_m3`, `basin_need_m3`, …). In `score_plan`, useful water ÷ the plan's mean need becomes a shortage level (`delivery_levels`); when it is worse than the farmer's answer it replaces it (`supply` per plan, reason `delivery_short`, listed last because the card already shows the number). Each `by_year` row also gets `supply_pct`/`supply_level` for that season's crop. Results for wells and rainfed fields must not change (there are tests).
  Display (all marked «Демо», built in `frontend/src/lib/share.js` and shared by the saved card, share text and PDF): right under «Река / канал», `basinWaterLines` gives the water this field needs from the river (plan need ÷ canal and field efficiency) and all the basin's farmland need vs. what the river brings; `deliveryLines` gives what reaches the field and the losses; `yearRows` adds "доходит N%" per season. Plan cards show the same per season (`SeasonReach` in `PlansStep.jsx`).
- Districts and agronomists: `data/districts_kg.geojson` (41 districts, geoBoundaries ADM2, ids/names from `scripts/district_names.csv`), `geo.district_for_point` (nearest district for gaps like Bishkek). `GET /agronomists?lat&lon` (no login) returns every district with its contact from `data/agronomists.csv` and the district of the point. The CSV is empty on purpose: add only verified contacts, never invent names or numbers. The `/agronomist` page (`steps/AgronomistPage.jsx`) falls back to the ministry farmer hotline `1210` (constant `HOTLINE`, source 24.kg, April 2026).
- Rebuilding the static data (rarely): `scripts/build_rivers.py` (HydroRIVERS Asia shapefile), `scripts/build_districts.py` (geoBoundaries KGZ ADM2 simplified GeoJSON) and `scripts/cropland_job.py` (Earth Engine; needs the `EE_SERVICE_ACCOUNT_JSON` secret, so it runs on GitHub Actions via `.github/workflows/cropland.yml`, triggered by a push to the `cropland-data` branch or `gh workflow run cropland.yml` once the workflow is on `main`; download the `basin_cropland` artifact with `gh run download`). Each script's docstring says where to download its input.
- Crop values and weights live in `data/crops.csv` and `data/rules.json` (meant to be edited by an agronomist, not in code). A new crop needs a row there, `crop.<id>` names in all three i18n files (`npm run check:i18n` enforces this), an entry in `CROPS` in `frontend/src/steps/FieldStep.jsx` and a drawing in `CropIcon.jsx` (otherwise the empty-field icon is shown). Snow only affects river/reservoir sources; for wells and rainfed fields it must not change results (there is a test).
- `/plans` computes context server-side (`plot_context` in `main.py`): NASA POWER climate (cached 30 days per 0.1°), SoilGrids soil only when the answer is "unknown" (cached forever, including "no data"), basin + latest snow label.
- `geo.py`: plot validation (inside KG border, 0.05–500 ha, no self-intersection) and area using the same spherical formula and radius (6371008.8) as `@turf/area` v7, so frontend and backend areas match. Basins come from `data/basins_hydrobasins.geojson` (HydroBASINS level 5, 10 basins, built by `scripts/build_basins.py` with names, stable ids and feeding mountains from `scripts/basin_names.csv`); without that file the code falls back to demo Voronoi cells from `data/basin_seeds.json`. `snow.seed_demo` adds demo snow rows for any basin id that has none, so switching basin sets never leaves basins without a label.
- `snow.py` seeds deterministic demo rows into `snow_daily` when empty; `scripts/snow_job.py` is the real MODIS/Earth Engine job, run daily at 08:30 Bishkek time by `.github/workflows/snow.yml` (also on demand: `gh workflow run snow.yml`). It needs the repo secrets `EE_SERVICE_ACCOUNT_JSON` (service account of Cloud project `suuproject-513820`, Earth Engine Community tier, non-commercial until 6 May 2028) and `DATABASE_URL` (Render Postgres external URL); its first run deletes the demo rows.
- `db.py`: SQLite by default, Postgres via `DATABASE_URL`. `config.py` rewrites `postgres://`/`postgresql://` to `postgresql+psycopg2://` (SQLAlchemy 2.1 would otherwise pick psycopg 3, which isn't installed). Geometry is stored as GeoJSON in a JSON column; place search uses `pg_trgm` on Postgres and fuzzy Python matching otherwise.

**Frontend** (`frontend/src/`, React 18 + Vite, plain JS):
- One app for desktop and phone. `hooks/useBreakpoint.js` picks `mobile` (<768), `tablet`, `desktop` (≥1200) or `landscape` (phone sideways) by window size; `App.jsx` renders steps in a side panel or in the `components/Sheet.jsx` bottom sheet (3 snap points, default per route). The map must stay mounted across layout switches, so keep `<main className="map-area">` at the same position in the tree.
- `store.js` is a tiny global store (`useSyncExternalStore`) persisted to localStorage; only keys in `PERSIST` survive reloads. Saved plans live there too, which is how they open offline. `lib/actions.js` holds everything that talks to the API and mutates the store.
- Routes are the steps: `/plot` → `/field` → `/priority` → `/plans`, plus `/saved`, `/agronomist` and `/data`. The page menu (`lib/menu.js`) is shared by the desktop side menu, the tablet menu and the phone profile menu. Later steps redirect to `/plot` without a selected plot.
- `components/MapView.jsx`: Leaflet with a hand-written plot editor (draggable corners, midpoint handles add a vertex, long-press/right-click removes one, undo history in `draft.history`), the outside-Kyrgyzstan mask, auto satellite from zoom 15, and `FitController`, which refits the plot when the panel/sheet changes size (`overlayPad.bottom` carries the sheet height).
- All UI text is in `i18n/{ky,ru,en}.json` (Kyrgyz is the default language) plus `i18n/faq.json`; no strings in components. Kyrgyz numbers use the ru-RU format and Kyrgyz dates are built by hand in `i18n/index.js`. The rotation steps are called seasons (`plans.year` = "{n}-й сезон", water "за сезон"); Kyrgyz uses «алап» for a river basin.
- The data page (`steps/DataPage.jsx`, `SOURCES`) lists every dataset with its status (live / reference / approx); a new data source needs an entry there and `data.<key>` / `data.name.<key>` texts.
- Styling: one design system in `styles.css` (the «Луг» theme): tokens on `:root` with a dark override under `prefers-color-scheme`, spacing/type/radius/shadow scales, Nunito via @fontsource, brand green `#0B7A3E`. Use the tokens rather than literal colours; `--cta`/`--cta-ink` for primary actions. White text on `#238B45` fails the 4.5:1 contrast target. Crop answers use `.choice-grid.tiles`; selection always has a non-colour cue (`.radio`).
- No emoji in the UI: crops use the drawn SVGs in `components/CropIcon.jsx`, other icons are stroke paths in `components/Icons.jsx`. The plot outline stays blue (spec) regardless of theme.
- PDF (`lib/pdf.js`) lazy-loads jsPDF and the subset Noto Sans fonts in `public/fonts` (Latin + Cyrillic incl. Kyrgyz letters; no "≈" glyph, so it is replaced with "~", and no "≥", so texts say "at least" instead). Long plans move the footer to a second page (`y > 262`).
- `public/sw.js` precaches the shell and the hashed assets listed in `index.html`; it never caches map tiles (OSM tile policy).

## External APIs

Called by the backend (the app only talks to our API), except the map tiles, which the browser loads directly:
- NASA POWER daily point API (`power.larc.nasa.gov/api/temporal/daily/point`, AG community): `T2M_MIN, T2M_MAX, PRECTOTCORR, GWETROOT`. Free, no key. `climate.py`.
- NASA MODIS MOD10A1 v6.1 via the Google Earth Engine API (`MODIS/061/MOD10A1`, `NDSI_Snow_Cover`): daily snow job only. Service account, non-commercial tier. `scripts/snow_job.py`.
- ISRIC SoilGrids v2.0 (`rest.isric.org/soilgrids/v2.0/properties/query`): sand, clay, pH when soil is "unknown". Free, no key, often slow or down (falls back to "medium", not cached). `climate.py`.
- OpenStreetMap Nominatim (`nominatim.openstreetmap.org/search`): place search on Enter only; 1 request/s, own User-Agent, cached. `places.py`.
- Anthropic Messages API (Python SDK): optional help chat; off when `ANTHROPIC_API_KEY` is unset. `assistant.py`.
- Map tiles: OpenStreetMap (`tile.openstreetmap.org`) and Esri World Imagery plus its labels layer (`server.arcgisonline.com`, optional `VITE_ARCGIS_KEY`). `MapView.jsx`.

Static data, not APIs: HydroBASINS level 5 (basins), HydroRIVERS v1.0 (rivers and mean flow), ESA WorldCereal 2021 and WorldCover 2021 (farmland per basin, read once through Earth Engine), geoBoundaries ADM2 (districts), FAO Crop Calendar for Kyrgyzstan (sowing dates in `crops.csv`), FAO-56 Table 19 and Rawls et al. 1982 (soil water in `rules.json`).

## Deployment notes

- Render free tier: the API sleeps after ~15 minutes idle (first request takes about a minute), and the free Postgres expires after 30 days.
- The static site rewrites `/api/*` to `https://suuplan-api.onrender.com/*` (see `render.yaml`), so the frontend always calls `/api` and needs no CORS or `VITE_API_URL` in production.
- The assistant uses the Anthropic SDK (`ASSISTANT_MODEL`, default `claude-opus-5-5`, low effort, server-side refusal fallback). Without `ANTHROPIC_API_KEY` the endpoint returns `assistant_unavailable` and the frontend switches to FAQ mode.
