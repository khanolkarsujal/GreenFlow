# GreenFlow — Smart Lawn Irrigation Advisor

GreenFlow turns a saved lawn profile and live weather into a watering recommendation **in minutes**, explains every number behind it, records what the homeowner actually did, and updates estimated water savings.

> **GreenFlow provides irrigation advice. It does not control or modify your irrigation timer.**
> The homeowner always makes the final watering decision.

This is a hackathon MVP with a connected end-to-end pipeline, not a hardware controller and not a commercial production service.

## What works today

| Stage | Implementation |
| --- | --- |
| Lawn profile | Saved through the backend to SQLite; reloaded by every screen |
| Live weather | Open-Meteo forecast API (`past_days=7`, `forecast_days=7`, timezone auto) |
| Scientific constants | Cited FAO-56 / Penn State / CSU values, resolved per soil and grass type |
| Irrigation engine | Daily soil-water balance → SKIP / REDUCE / WATER |
| Recommendation | Depth in mm, duration in minutes, day-by-day projection, applied vs. context factors |
| Explanation | "Show the math", source strip with only the sources actually used, data freshness |
| Confirmation | Stored once per recommendation; repeats return `already_confirmed` |
| Savings | Confirmed events only; estimates with the formula shown, never measured claims |

## Architecture

```
React 19 SPA (Vite, hash routing)
  #dashboard  #lawn-profile  #water-savings  #recommendation
        │  fetch(JSON)
        ▼
FastAPI (app/main.py)
  /profiles  /profiles/{id}/recommendation  /recommendations/{id}/feedback  /profiles/{id}/savings
        │                         │
        │ SQLAlchemy 2 / SQLite   │ httpx, 10 s timeout
        ▼                         ▼
backend/lawn_advisor.db      Open-Meteo forecast API
                                  precipitation_sum
                                  et0_fao_evapotranspiration
                                  temperature_2m_max/min
                                  wind_speed_10m_max
```

The calculation engine (`backend/app/engine/`) is pure Python: no network, database, or framework calls. The orchestration service (`backend/app/services/recommendation.py`) fetches weather, builds engine input, persists the recommendation, and produces the explanation payload.

## Stack

- Frontend: React 19.1, TypeScript 5.8 (strict), Vite 6.4, lucide-react, Recharts
- Backend: FastAPI, Pydantic v2, SQLAlchemy 2, SQLite, httpx
- Tests: pytest (backend). The frontend is verified with `tsc --noEmit` plus a production build; there is no frontend test runner.

## Quickstart

```bash
# Terminal 1
cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000

# Terminal 2
cd frontend && npm install
npm run dev
# open http://127.0.0.1:5173/#lawn-profile
```

The paths above work in PowerShell and Git Bash. On macOS/Linux use `python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt` and `.venv/bin/python -m uvicorn ...`.

The SQLite database is created automatically at `backend/lawn_advisor.db`. Delete that file to start from an empty database.

### Configuration

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | frontend env | `http://localhost:8000` | Backend base URL used by every API call |
| `DATABASE_URL` | backend env | `sqlite:///./lawn_advisor.db` | SQLAlchemy connection string |

Backend CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`. Serving the frontend from another origin requires editing `LOCAL_FRONTEND_ORIGINS` in `backend/app/main.py`.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| POST | `/profiles` | Create a lawn profile |
| GET | `/profiles/{profile_id}` | Load a saved profile |
| PATCH | `/profiles/{profile_id}` | Update a saved profile |
| GET | `/profiles/{profile_id}/recommendation` | Fetch live weather, calculate, persist, explain |
| POST | `/recommendations/{recommendation_id}/feedback` | Confirm followed / not followed (idempotent) |
| GET | `/profiles/{profile_id}/savings?window_days=30` | Confirmed events, pending events, estimated totals |

## How the recommendation is calculated

1. **Root-zone capacity.** `TAW = (FC − WP) × root_depth × 1000` in mm, using FAO-56 Table 19 midpoints and a 0.15 m root zone.
2. **Readily available water.** `RAW = p × TAW`, with `p` from FAO-56 Table 22 (0.40 cool season, 0.50 warm season).
3. **Depletion after the last watering.** `clamp(RAW − applied_depth, 0, TAW)`, assuming the root zone was at the refill point before that watering.
4. **Rain since the last watering.** Observed Open-Meteo daily rainfall is credited against depletion.
5. **Forecast horizon.** `ceil(7 / events_per_week)` days, capped at 7. No irrigation is assumed on forecast days.
6. **Projection.** Each day: `depletion += Kc × ET₀ − effective_rain`, clamped to `[0, TAW]`.
7. **Decision.**
   - `max(projected depletion) ≤ 0.5 × RAW` → **SKIP**
   - otherwise `recommended_depth = min(max_projection ÷ 0.60, baseline_event_depth)`
   - `recommended_depth ≥ baseline_event_depth` → **WATER**, else **REDUCE**
8. **Runtime.** `minutes = depth_mm ÷ precipitation_rate_mm_per_hour × 60`.
9. **Volume estimate.** `litres = minutes ÷ 60 × precipitation_rate × lawn_area_m2` (1 mm over 1 m² = 1 L).
10. **Savings.** `avoided = (baseline_minutes − recommended_minutes) ÷ 60 × rate × area`, summed over **confirmed, followed** recommendations only.

Skip threshold (50% of RAW) and the 7-day horizon cap are **product policies**, labelled as such in the app. Everything else is a cited constant or a user-reported value.

## Scientific sources

| Input | Value used | Source |
| --- | --- | --- |
| Crop coefficient | 0.95 cool season / 0.85 warm season | FAO-56 Table 12, p. 112 (footnote 15) |
| Depletion fraction `p` | 0.40 cool season / 0.50 warm season | FAO-56 Table 22, p. 165 |
| Soil water | FC/WP midpoints: sand 0.12/0.045, loam 0.25/0.12, silt loam 0.29/0.15, clay 0.36/0.22 m³/m³ | FAO-56 Table 19, p. 144 |
| Root depth | 0.15 m (6 in upper bound of a 2–6 in range) | Penn State Extension, *The Cool-Season Turfgrasses* |
| Irrigation efficiency | 60% (midpoint of a 50–70% range) | Colorado State University Extension, *Drip Irrigation for Home Gardens* |
| Weather and ET₀ | Daily precipitation, reference ET₀, temperatures, wind | Open-Meteo forecast API |

The app shows the source strip only for sources that fed the current calculation. Product policies are shown separately, not dressed up as science.

## Honest failure states

| Condition | API response | What the UI does |
| --- | --- | --- |
| Profile not found | 404 `profile_not_found` | Offers profile setup and retry |
| No cited constants for soil/grass | 503 `constants_unavailable` | Explains which input is unsupported |
| Open-Meteo timeout / HTTP error / missing variable | 503 `weather_unavailable` | Shows a retry path; never fabricates weather |
| Weather dates do not align with the saved schedule | 503 `stale_weather_data` | Asks for a retry |
| Last watering outside the observed window | 503 `last_watering_out_of_range` | Explains the date requirement |
| Forecast shorter than the decision horizon | 503 `insufficient_forecast` | Explains the missing coverage |

There is no silent sample-data fallback in the live flow. Weather is fetched per request; nothing is cached and presented as live.

## Estimated vs. measured

See [docs/ESTIMATED_VS_MEASURED.md](docs/ESTIMATED_VS_MEASURED.md). In short: weather is provider-modeled (not a station in the yard), constants are cited defaults, water volumes are estimates from the user's reported precipitation rate, and confirmations are self-reported. No flow meter, water bill, or soil sensor is used.

## Known limitations

- The profile stores a **last watering date**, not a time; the engine credits the observed rain of that date.
- The dashboard weather tiles show only the live inputs stored with the latest recommendation; no sample weather screen remains in the navigation.
- Each visit to `#recommendation` creates a new recommendation row by design; unconfirmed rows stay pending until confirmed.
- A repeated confirmation for the same recommendation is rejected by application logic (`already_confirmed`); `recommendation_id` is also uniquely indexed in the database.
- No authentication, multi-zone support, hardware control, ML/LLM explanation, or measured water use.
- Irrigation efficiency and root depth use one cited default for every supported grass class until a user measurement exists.
- Open-Meteo's free API is intended for **non-commercial** use with attribution. Check <https://open-meteo.com/en/terms> before any production or commercial deployment. GreenFlow displays "Weather data © Open-Meteo" and distinguishes provider data from on-site measurement.

## Tests and verification

```bash
# backend
cd backend
.venv\Scripts\python -m pytest -q

# frontend typecheck + production build
cd frontend
npm run build
```

Last verified 2026-11-04:

- Backend: **93 passed**, 1 third-party Starlette/httpx deprecation warning.
- Coverage: water balance 24, constants 17, savings 10, Open-Meteo 8, profiles 17, recommendations 10, feedback/savings routes 6, health 1.
- Frontend: `tsc --noEmit` clean; Vite build succeeded (2,478 modules; 755.76 kB JS, 98.08 kB CSS; only the chunk-size advisory).
- Browser: profile → live recommendation → confirmation → savings verified against the SQLite rows (4 confirmed, 3,780 L estimated avoided for the QA profile; additional responsive-QA visits left unconfirmed rows pending).

Example QA event (profile `be036506-…`, REDUCE 45 min vs 60 min baseline at 30 mm/h over 120 m², 22.3 mm recommended depth):

```
recommended volume = 45/60 × 30 × 120 = 2,700 L
baseline volume    = 60/60 × 30 × 120 = 3,600 L
avoided            = 15/60 × 30 × 120 =   900 L  (estimate, not measured)
```

## Documentation

- [docs/ESTIMATED_VS_MEASURED.md](docs/ESTIMATED_VS_MEASURED.md) — what is measured, modeled, assumed, and self-reported
- [docs/JUDGE_QA.md](docs/JUDGE_QA.md) — concise answers to the ten judge questions
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — 90-second demo timeline, failure branch, and fallback
- [docs/GREENFLOW_PRD_AND_IMPLEMENTATION_PLAN.md](docs/GREENFLOW_PRD_AND_IMPLEMENTATION_PLAN.md) — product requirements, gate plan, risk register
- [context/calculation-spec.md](context/calculation-spec.md) — engine specification and assumptions

## Status

All four implementation gates are complete for the demo path: cited constants, saved profile, live decision pipeline, feedback and savings. Remaining work is product hardening, not demo-blocking: frontend automated tests and an Open-Meteo licensing review before any commercial use. Confirmation is already idempotent in app logic and protected by a unique index on `recommendation_feedback.recommendation_id`.
