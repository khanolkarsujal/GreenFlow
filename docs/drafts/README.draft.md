# Lawn Irrigation Advisor

**Working title. No final product name has been chosen.**

> **DRAFT — not final. Intended final location: `README.md` at the repository root.**

> **Current build status:** This is an incomplete MVP. The recommendation route
> exists and is tested, but in production it returns HTTP 503
> `constants_unavailable` because the verified scientific constants table has
> not been supplied. The frontend renders hard-coded sample data, visibly
> labeled **Sample data** on every card. It does not fetch a real
> recommendation. Do not present the sample screen or the 503 response as a
> working watering recommendation.

## What it is

Lawn Irrigation Advisor is an advisory web app for a homeowner with a
traditional sprinkler timer. It is intended to answer one question before a
watering day:

> Should I skip watering, water less, or water normally?

The backend combines the user's location and schedule with Open-Meteo weather
data, runs a soil water-balance calculation, and returns one of three states:

| State    | Meaning                                                        |
| -------- | -------------------------------------------------------------- |
| `SKIP`   | Rain received or forecast is enough; do not water now          |
| `REDUCE` | Some water is needed, but less than a normal watering          |
| `WATER`  | Apply at least a normal watering                               |

Each result is meant to include a plain-language reason, the numbers behind it
(rainfall received, rainfall expected, estimated demand, capacity values), an
uncertainty note, and the assumptions used.

The app also defines a separate estimate of **estimated water avoided** against
the user's own fixed schedule. Every such figure is an estimate, is labeled
**Estimated**, and must be shown with its baseline and assumptions. The project
does not claim measured water savings.

The app never controls sprinklers or any hardware. It only advises; the
homeowner decides and acts.

## Who it is for

The primary user is defined in the project brief as:

- a homeowner with a traditional (non-smart) sprinkler timer;
- one lawn, watered from the mains supply;
- someone who checks their phone in the morning before a scheduled watering
  day;
- comfortable entering a few property details during a short onboarding flow.

Not targeted: owners of smart controllers, commercial landscapes, agriculture,
gardens or drip systems, and multi-property managers. The product is lawn-only.

The primary user and the problem are **assumptions**, not validated findings.
No user interviews or user research have been completed. No claim is made that
this user group behaves in a particular way.

## What is actually built

| Area | Status | Notes |
| ---- | ------ | ----- |
| `GET /health` | Implemented | Returns `{"status": "ok"}` |
| Profile storage and routes | Implemented | `POST /profiles`, `GET /profiles/{id}`, `PATCH /profiles/{id}`; SQLite via SQLAlchemy |
| Open-Meteo client | Implemented | One daily request for 7 past and 7 forecast days; mocked HTTP tests only |
| Pure recommendation engine | Implemented | TAW, RAW, ETc, effective rainfall, depletion, horizon, SKIP/REDUCE/WATER; no network, database, or framework imports |
| Engine constants | **Blocked** | Every scientific constant is TBD in `context/calculation-spec.md`; no values are invented in code |
| Recommendation orchestration and persistence | Implemented | Fetches weather, derives initial depletion, calls the engine, stores inputs, constants, and assumptions |
| `GET /profiles/{id}/recommendation` | Implemented but blocked in production | Returns 503 `constants_unavailable` until the verified constants table is supplied |
| Estimated-savings function | Implemented | Pure `estimate_savings`; no API route and no UI |
| Today page | **Sample data only** | Every card is labeled **Sample data**; the figure "1,240 L" is sample text, not a result |
| Real recommendation fetch in the frontend | Not built | The only backend call defined in the frontend is the health check used by an unused status page; the active Today page makes no backend calls |
| Onboarding | Not built | Profiles can be created only through the API |
| History and "followed / not followed" logging | Not built | History/My lawn links and the "Log that I followed this" button are presentational only |
| "Cannot recommend" UI | Not built | The backend state exists; the frontend does not render it |
| Savings dashboard | Not built | The engine function exists; no route or screen consumes it |
| User accounts, notifications, hardware control, AI/LLM, native app | Not in scope | Approved non-goals |

### Verified checks at draft time

- Backend: **68 tests pass**; `ruff check .` passes; `ruff format --check .` passes.
- Frontend: `npm run build` passes (TypeScript strict check plus Vite build).
- Recommendation route smoke check: a profile was created (201), and the
  production route returned 503 `constants_unavailable` as designed.

The recommendation route tests inject test-only constants explicitly labeled as
test values. They prove the engine and route wiring, not that the product has
scientifically valid constants.

## Setup

Tested with Python 3.11.9 and Node 24.18.0 on Windows. The commands below assume
the repository root is the working directory.

### Backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

```bash
# Windows (cmd or PowerShell)
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

Install dependencies and run the API:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API base URL: `http://localhost:8000`
- Interactive docs: `http://localhost:8000/docs`
- Health check: `curl http://localhost:8000/health` returns `{"status":"ok"}`
- Database URL: read from `DATABASE_URL`; default
  `sqlite:///./lawn_advisor.db`.
- Tables are created on application startup. There is no migration tool.
- The database file is created relative to the directory you run `uvicorn`
  from (normally `backend/lawn_advisor.db`).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

- Dev server: `http://localhost:5173`
- The frontend reads the API URL from `VITE_API_BASE_URL`; default
  `http://localhost:8000`. Create `frontend/.env` only if the backend runs
  elsewhere:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

- The backend CORS allowlist contains only `http://localhost:5173` and
  `http://127.0.0.1:5173`. A deployed frontend origin will need to be added
  before it can call the API.

### Run the checks

```bash
cd backend
pytest
ruff check .
ruff format --check .

cd ../frontend
npm run build
```

## Try the API

The full flow is: create a profile, then request a recommendation for that
profile ID.

### 1. Create a profile

Use a `last_watered_date` inside the last 7 days; the service currently returns
`last_watering_out_of_range` otherwise. The example below assumes a current
date of 2026-11-04.

```bash
curl -X POST http://localhost:8000/profiles \
  -H "Content-Type: application/json" \
  -d '{
    "location_label": "Demo lawn",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "lawn_area_m2": 120,
    "grass_type": "tall fescue",
    "soil_type": "loam",
    "sprinkler_type": "rotor",
    "precipitation_rate_mm_per_hour": 10,
    "baseline_minutes_per_event": 90,
    "events_per_week": 1,
    "last_watered_date": "2026-11-02",
    "last_watered_minutes": 60
  }'
```

Expected: HTTP 201 with a server-generated UUID `id`.

The profile fields are stored as free-text names. The supported grass, soil, and
sprinkler presets are not finalized because they depend on the missing
constants table.

### 2. Request a recommendation

```bash
curl -i http://localhost:8000/profiles/<PROFILE_ID>/recommendation
```

Current expected response: HTTP 503 with a cannot-recommend body:

```json
{
  "state": "CANNOT_RECOMMEND",
  "code": "constants_unavailable",
  "reason": "Irrigation constants are not configured, so a recommendation cannot be calculated.",
  "message": "Irrigation constants are not configured, so a recommendation cannot be calculated."
}
```

This is deliberate. The app must not guess a recommendation without verified
constants. See [Limitations](#limitations) and [Open decisions](#open-decisions).

## API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/health` | Health check |
| `POST` | `/profiles` | Create a profile; server generates the ID |
| `GET` | `/profiles/{profile_id}` | Read one profile |
| `PATCH` | `/profiles/{profile_id}` | Update at least one non-null field |
| `GET` | `/profiles/{profile_id}/recommendation` | Calculate and store a recommendation |

Error shape for ordinary API failures:

```json
{ "code": "profile_not_found", "message": "No profile exists for that ID." }
```

Cannot-recommend outcomes use HTTP 503 and the distinct `CANNOT_RECOMMEND`
shape above, with one of these codes:

- `constants_unavailable`
- `weather_unavailable`
- `insufficient_forecast`
- `last_watering_out_of_range`

There is no action/history route and no savings route yet.

## Tech stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | React 19 + TypeScript 5.8, built with Vite 6 |
| UI components | Local components, CSS custom-property tokens, `lucide-react` icons |
| Chart | Recharts |
| Backend | Python 3.11 + FastAPI |
| Validation | Pydantic 2 |
| Database | SQLite via SQLAlchemy 2 |
| Weather | Open-Meteo forecast API |
| Backend tests | pytest, ruff |
| Frontend checks | `tsc --noEmit`, `vite build` |

No authentication, background worker, cache service, or migration framework is
used.

## How the recommendation works

The full method is in `context/calculation-spec.md`. In short:

1. Read observed weather (7 past days) and forecast weather (7 days) from
   Open-Meteo.
2. Derive the initial soil-water depletion from the user's last watering:
   `D_start = clamp(RAW - I_last, 0, TAW)`.
3. Walk the observed days with a daily water balance:
   `D = clamp(D_prev + Kc * ET0 - P_eff - I, 0, TAW)`, where
   `P_eff = min(P, max(0, D_prev))`.
4. Project forecast depletion forward and take the maximum over the decision
   horizon `H = min(H_cap, max(1, ceil(7 / n_base)))`.
5. Apply:
   - `SKIP` when the projected maximum is at or below `f_skip * RAW`;
   - otherwise `WATER` when the recommended depth reaches a normal event;
   - otherwise `REDUCE`.
6. Store the result with the full config, weather inputs, profile snapshot, and
   assumption texts so the UI can explain it later.

All scientific values (`Kc`, `theta_fc`, `theta_wp`, `Zr`, `p`, `f_skip`,
`eff_irrigation`, `I_max`, sprinkler defaults) are still TBD. The engine
receives them through an explicit config object and has no hidden defaults.

### Estimated water avoided

The separate savings function compares:

- the baseline volume from the user's fixed schedule over a window, with
- the sum of applied depths the engine recommends over the same window.

The result is `max(0, V_base - V_rec)`, reported as
`estimated_water_avoided_l`. One millimetre over one square metre is one litre.
The result exposes the baseline event depth, events per week, window length,
lawn area, efficiency, both volumes, and the assumption texts.

This is an estimate against a stated baseline. It is not a measurement, and the
project does not describe it as water "saved" or "measured."

## Data sources and licenses

### Weather data

- Provider: Open-Meteo
- Endpoint: `https://api.open-meteo.com/v1/forecast`
- One request per recommendation, with `past_days=7`, `forecast_days=7`,
  `timezone=auto`, and `wind_speed_unit=ms`
- Daily variables requested: `precipitation_sum`, `temperature_2m_max`,
  `temperature_2m_min`, `wind_speed_10m_max`,
  `et0_fao_evapotranspiration`
- Documentation: https://open-meteo.com/en/docs

**Non-commercial limit:** Open-Meteo's free API is for non-commercial use. That
is acceptable for this hackathon. Any commercial deployment needs a different
data arrangement.

**License terms to verify:** the exact Open-Meteo attribution and license terms
are not captured in the project context. Verify them on the Open-Meteo site
before publishing or deploying. Do not assume a specific license from this
draft.

### Project and dependency licenses

- No project license has been chosen, and no `LICENSE` file exists.
- The licenses of the Python and npm dependencies have not been audited.
- Third-party licenses must be reviewed before distributing or publishing the
  project.

### User data

- The app stores an approximate location label and coordinates, lawn and
  schedule details, and derived recommendations.
- The frontend sends coordinates to the backend; the backend sends coordinates
  to Open-Meteo.
- There are no accounts, and no sensitive personal data is intentionally
  collected. Location is intended to be stored only at the precision needed for
  a weather lookup.

## Assumptions

Everything below is an assumption, an unresolved decision, or a documented
limitation. None of it is a validated result.

### Product assumptions

1. **Problem hypothesis:** fixed sprinkler schedules waste water because they do
   not react to past rain, forecast rain, or actual weekly demand. This has not
   been validated with users.
2. **Primary user:** a homeowner with a traditional timer, one lawn, and a phone
   check before the watering day. This is a starting assumption, not a validated
   segment.
3. **Differentiation hypothesis:** transparency (showing the numbers) plus a
   stated-baseline estimate is worth building. User validation is still open.
4. **No competitor claim:** weather-based watering advice already exists. The
   project does not assert that any competitor is deficient, and competitor
   features and pricing have not been independently re-verified.
5. **Language and units:** English UI and metric units in the primary view.
6. **Target region:** not decided. Open-Meteo coverage in the final demo region
   has not been confirmed.
7. **Single property:** one profile per browser, identified by a random ID. No
   accounts, sharing, or multi-property support.
8. **Lawn only:** no gardens, crops, drip irrigation, pools, or commercial
   landscapes.
9. **Advisory only:** no sprinkler control, hardware integration, or
   notifications.

### Calculation assumptions and unresolved constants

10. **All scientific constants are TBD:** `Kc`, `theta_fc`, `theta_wp`, `Zr`,
    `p`, `f_skip`, `eff_irrigation`, `I_max`, and per-sprinkler `PR_default`.
    No values are invented in code.
11. **`H_cap = 7`:** proposed because the weather client supplies 7 forecast
    days. Marked as an assumption, not a cited value.
12. **`H_min = 1`:** keeps the decision horizon from being empty.
13. **Initial depletion:** at the start of the last watering day, before that
    watering, the root zone is assumed to be at the refill point (`RAW`). This is
    the least arbitrary starting point available without a longer watering
    history.
14. **Last watering depth:** the reported duration is assumed to correspond to
    an application at the entered precipitation rate.
15. **Effective rainfall:** only rainfall up to the current depletion refills the
    root zone; excess rainfall is assumed to drain and is not stored for later.
16. **No forecast irrigation:** no irrigation is assumed on forecast days.
17. **No logged irrigation after the last watering:** the current observed-day
    walk does not receive user-logged irrigation. This must change when action
    logging exists.
18. **Last-watered window:** `last_watered_date` must fall inside the 7 observed
    weather days. Outside that window the route returns
    `last_watering_out_of_range`.
19. **Forecast-day boundary:** the service treats Open-Meteo's `is_forecast` flag
    as authoritative. Whether the first forecast day is today or tomorrow has
    not been confirmed against the provider, and an off-by-one day would shift
    the observed/forecast boundary.
20. **Weather timeout:** 10 seconds per Open-Meteo request, chosen so a slow
    provider fails fast.
21. **Insufficient forecast:** if fewer forecast days are available than the
    horizon, the API returns cannot-recommend rather than guessing.

### Savings assumptions

22. **Baseline:** the user's current fixed schedule (event depth, events per
    week) is the stated baseline.
23. **Savings window:** `N_days` is not decided (for example 7 or 30 days).
24. **Recommended series:** the estimate currently uses the recommended depths
    as entered. How a "followed / not followed" response should adjust them is
    not decided.
25. **Efficiency:** recommended depths are already divided by irrigation
    efficiency, so efficiency is not applied a second time in the savings
    formula. The value is exposed with the assumptions.
26. **Clamping:** estimated water avoided is clamped at 0 and never reported as
    negative.
27. **Estimate only:** every figure is an estimate against the stated baseline,
    not measured water use, and must be labeled **Estimated**.

### UI and build assumptions

28. **Sample data:** the current Today page is a design sample. The "1,240 L"
    water-avoided figure, the 18/24 followed count, the 9 skipped events, the
    chart values, and the recent decisions are sample values. They are not
    results from the engine.
29. **Presentational actions:** the History and My lawn links, and the "Log that
    I followed this" button, have no behavior yet.
30. **Reason and uncertainty copy:** the backend's reason and uncertainty texts
    are a first pass and have not been approved for the final UI.
31. **Cannot-recommend status semantics:** the route returns HTTP 503 for every
    cannot-recommend reason. Whether profile-data problems such as an old
    last-watered date should use 400 or 422 is still open.
32. **Frontend bundle:** the production build is about 643.80 kB minified
    (191.23 kB gzip), mostly Recharts. Vite warns above 500 kB. Acceptable for
    the hackathon demo; code splitting is optional.
33. **Hosting:** frontend and backend hosting providers are not chosen. CORS and
    API URL configuration for a deployed environment are not done.

## Limitations

- **No production recommendation yet.** The verified constants table is missing,
  so the route returns 503 `constants_unavailable`. Real SKIP/REDUCE/WATER
  output is not available in production.
- **The UI is a sample.** It does not call the recommendation endpoint, and all
  figures are labeled sample data.
- **No onboarding.** Profiles exist only through the API.
- **No history or follow-up logging.** The relevant controls are visual only.
- **No savings dashboard.** Only the pure calculation function exists.
- **No "cannot recommend" screen.** The backend state is not rendered.
- **No auth.** Anyone with a profile ID can read or update that profile. This is
  an accepted MVP simplification, not a security claim.
- **No migrations.** Tables are created at startup; schema changes require
  manual handling.
- **SQLite.** Suitable for a single-instance demo, not a multi-user service.
- **Local CORS only.** A deployed frontend will be blocked until its origin is
  added.
- **Open-Meteo free tier is non-commercial.** Commercial use needs another
  arrangement.
- **Constants, target region, product name, and several calculation details are
  still open.** See below.

## Open decisions

These block a finished product:

- Supply the verified constants table, then implement Unit 6.
- Connect `resolve_irrigation_constants` so production can return
  SKIP/REDUCE/WATER.
- Choose the target/demo region.
- Choose the savings window `N_days`.
- Decide how follow-up responses adjust the savings series.
- Confirm the forecast-day boundary and the last-watered window behavior.
- Approve the reason and uncertainty wording.
- Decide cannot-recommend HTTP semantics for profile-data problems.
- Choose a product name, project license, and hosting providers.
- Build onboarding, real data fetching, history/action logging, the
  cannot-recommend UI, and the savings dashboard.
- Run user validation and re-verify competitor features if any comparison is
  ever made.

## Project structure

```text
backend/
  app/
    api/          HTTP routes and request/response schemas
    db/           SQLAlchemy models, sessions, queries
    engine/       Pure water-balance, recommendation, and savings logic
    services/     Open-Meteo client and recommendation orchestration
  tests/          pytest tests (weather is mocked; no live API calls)
frontend/
  src/
    api/          Backend calls (currently only the health check)
    components/   Local UI components
    pages/        Today page
    sample/       Hard-coded sample data used by the Today page
    types/        Shared TypeScript types
context/          Project brief, architecture, calculation spec, UI spec, rules
docs/drafts/      Draft documentation awaiting approval
```

## Documentation

- `context/project-overview.md` — approved MVP direction, scope, non-goals
- `context/architecture.md` — stack, boundaries, storage model, invariants
- `context/calculation-spec.md` — equations, inputs, savings method, constants
- `context/ui-context.md` — visual and interaction rules
- `context/code-standards.md` — engineering rules
- `context/ai-workflow-rules.md` — build workflow and honesty rules
- `context/progress-tracker.md` — completed units, blockers, open questions

## Honest summary

This repository contains a tested calculation engine, a tested API for profiles
and recommendations, and a polished sample UI. It does **not** yet produce a
real recommendation in production because the verified scientific constants are
missing. Every water-avoided figure is an estimate against a stated baseline,
and no measured savings, competitor deficiency, or user-research finding is
claimed.
