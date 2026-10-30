# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SuuPlan is a PWA for farmers in Kyrgyzstan (NASA Space Apps 2026): mark a field on a map, answer a few questions, pick a priority, get three 3-year crop rotation plans. The original spec is the Russian PDF in the repo root (git-ignored, like `images.png`). Live at https://suuplan.onrender.com; pushing to `main` on GitHub (`SolioKyaiz/IUK3_HACKATHON`) redeploys via `render.yaml`.

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

## Architecture

**Backend** (`backend/suuplan/`, FastAPI, SQLAlchemy 2.1):
- `main.py` holds every route. Errors are `{code, message}`; the frontend maps `code` to translated text (`err.*` / `plot.err.*` keys), so new error codes need i18n entries. Auth is a JWT in `Authorization: Bearer`; every plot/saved-plan query is scoped to the user. Rate limits are in-memory and keyed by the first `X-Forwarded-For` entry (Render proxies everything).
- `scoring.py` is the engine: filter crops (no verified water data, too short frost-free period) → enumerate 3-year sequences valid against last year's crop → score water/soil/income/risk → weighted total `(a·m·Water + b·Soil + c·Income + d·(100−Risk)) / (a·m+b+c+d)` where `m = snow × shortage` → pick 3 plans differing in ≥2 years and not permutations of each other or of `exclude`. Reasons are returned as codes with params; the frontend writes the sentences. Also returns a wheat-every-year `baseline` used for "X% less water than wheat".
- Crop values and weights live in `data/crops.csv` and `data/rules.json` (meant to be edited by an agronomist, not in code). Snow only affects river/reservoir sources; for wells and rainfed fields it must not change results (there is a test).
- `/plans` computes context server-side (`plot_context` in `main.py`): NASA POWER climate (cached 30 days per 0.1°), SoilGrids soil only when the answer is "unknown" (cached forever, including "no data"), basin + latest snow label.
- `geo.py`: plot validation (inside KG border, 0.05–500 ha, no self-intersection) and area using the same spherical formula and radius (6371008.8) as `@turf/area` v7, so frontend and backend areas match. Basins are demo Voronoi cells from `data/basin_seeds.json` unless `data/basins_hydrobasins.geojson` exists (built by `scripts/build_basins.py`).
- `snow.py` seeds deterministic demo rows into `snow_daily` when empty; `scripts/snow_job.py` is the real MODIS/Earth Engine job (not running yet; its GitHub Actions workflow is git-ignored until a token with `workflow` scope is used).
- `db.py`: SQLite by default, Postgres via `DATABASE_URL`. `config.py` rewrites `postgres://`/`postgresql://` to `postgresql+psycopg2://` (SQLAlchemy 2.1 would otherwise pick psycopg 3, which isn't installed). Geometry is stored as GeoJSON in a JSON column; place search uses `pg_trgm` on Postgres and fuzzy Python matching otherwise.

**Frontend** (`frontend/src/`, React 18 + Vite, plain JS):
- One app for desktop and phone. `hooks/useBreakpoint.js` picks `mobile` (<768), `tablet`, `desktop` (≥1200) or `landscape` (phone sideways) by window size; `App.jsx` renders steps in a side panel or in the `components/Sheet.jsx` bottom sheet (3 snap points, default per route). The map must stay mounted across layout switches, so keep `<main className="map-area">` at the same position in the tree.
- `store.js` is a tiny global store (`useSyncExternalStore`) persisted to localStorage; only keys in `PERSIST` survive reloads. Saved plans live there too, which is how they open offline. `lib/actions.js` holds everything that talks to the API and mutates the store.
- Routes are the steps: `/plot` → `/field` → `/priority` → `/plans`, plus `/saved` and `/data`. Later steps redirect to `/plot` without a selected plot.
- `components/MapView.jsx`: Leaflet with a hand-written plot editor (draggable corners, midpoint handles add a vertex, long-press/right-click removes one, undo history in `draft.history`), the outside-Kyrgyzstan mask, auto satellite from zoom 15, and `FitController`, which refits the plot when the panel/sheet changes size (`overlayPad.bottom` carries the sheet height).
- All UI text is in `i18n/{ky,ru,en}.json` (Kyrgyz is the default language) plus `i18n/faq.json`; no strings in components. Kyrgyz numbers use the ru-RU format and Kyrgyz dates are built by hand in `i18n/index.js`.
- Styling: one design system in `styles.css` (the «Луг» theme): tokens on `:root` with a dark override under `prefers-color-scheme`, spacing/type/radius/shadow scales, Nunito via @fontsource, brand green `#0B7A3E`. Use the tokens rather than literal colours; `--cta`/`--cta-ink` for primary actions. White text on `#238B45` fails the 4.5:1 contrast target. Crop answers use `.choice-grid.tiles`; selection always has a non-colour cue (`.radio`).
- No emoji in the UI: crops use the drawn SVGs in `components/CropIcon.jsx`, other icons are stroke paths in `components/Icons.jsx`. The plot outline stays blue (spec) regardless of theme.
- PDF (`lib/pdf.js`) lazy-loads jsPDF and the subset Noto Sans fonts in `public/fonts` (Latin + Cyrillic incl. Kyrgyz letters; no "≈" glyph, so it is replaced with "~").
- `public/sw.js` precaches the shell and the hashed assets listed in `index.html`; it never caches map tiles (OSM tile policy).

## Deployment notes

- Render free tier: the API sleeps after ~15 minutes idle (first request takes about a minute), and the free Postgres expires after 30 days.
- The static site rewrites `/api/*` to `https://suuplan-api.onrender.com/*` (see `render.yaml`), so the frontend always calls `/api` and needs no CORS or `VITE_API_URL` in production.
- The assistant uses the Anthropic SDK (`ASSISTANT_MODEL`, default `claude-opus-5-5`, low effort, server-side refusal fallback). Without `ANTHROPIC_API_KEY` the endpoint returns `assistant_unavailable` and the frontend switches to FAQ mode.
