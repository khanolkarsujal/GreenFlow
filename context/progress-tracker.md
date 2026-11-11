# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Unit 8 (recommendation route, orchestration, and
  persistence) is implemented and verified. Unit 6 (verified
  constants module) remains blocked because its table has not
  been supplied. Because of that, the production route returns
  the "cannot recommend" state with code
  `constants_unavailable`; it does not invent scientific
  values.

## Current Goal

- Obtain the verified constants table and build Unit 6, then
  connect the resolver in
  `backend/app/services/recommendation.py` so production
  requests can return SKIP, REDUCE, or WATER.

## Completed

- Project brief written (Green Shift Hacks 2026, residential
  lawn irrigation research and solution design)
- `ai-workflow-rules.md` written
- `architecture.md` written
- `code-standards.md` written
- `progress-tracker.md` written
- Unit 1 — backend scaffold: FastAPI app with `GET /health`
  returning `{"status": "ok"}`, a Pydantic `HealthResponse`
  schema, the `app/api`, `app/engine`, `app/services`, and
  `app/db` packages, `requirements.txt`, ruff and pytest
  configuration, and a passing pytest test for `/health`
- Unit 1 — frontend scaffold: Vite + React + TypeScript in
  strict mode, `src/api`, `src/components`, `src/pages`, and
  `src/types` folders, a global stylesheet with every color,
  font, and radius token from the UI spec, and a status page
  that calls `/health` through `src/api/` and shows loading,
  error, and success states in a mobile-first, 640px column
- Unit 1 verified: `pytest` (1 passed), `ruff check`,
  `ruff format --check`, and `npm run build` all pass; the
  page was checked in a browser against a live backend, a
  stopped backend, and a slow response
- Unit 2 — Open-Meteo client in
  `backend/app/services/open_meteo.py`: one daily forecast
  request for 7 past and 7 forecast days (`past_days=7`,
  `forecast_days=7`), `timezone=auto`, `wind_speed_unit=ms`,
  requesting `precipitation_sum`, `temperature_2m_max`,
  `temperature_2m_min`, `wind_speed_10m_max`, and
  `et0_fao_evapotranspiration`, normalized into SI-unit
  `WeatherDay` models with `is_forecast` flags
- Unit 2 — boundary validation and failure handling:
  strict Pydantic parsing of the provider payload, a
  `WeatherUnavailableError` for missing, null, malformed,
  non-200, timeout, and network failures, an explicit
  10-second timeout, and a swappable base URL constant
- Unit 2 verified: 8 mocked-HTTP tests (no live API calls)
  cover normalization, past/forecast flags, and every
  failure case; `pytest` (9 passed), `ruff check`, and
  `ruff format --check` pass
- Unit 3 — UI foundation: full color, font, radius, and
  shadow token set in `frontend/src/global.css`; Button,
  Card, Tabs, Tag, StatCard, ProgressBar, and
  RecommendationCard components, each with its own CSS file
- Unit 3 — Today page with a top bar (Today, History, My
  lawn), the mobile single-column layout, and the desktop
  grid from `ui-context.md` (recommendation full width;
  three stacked stat cards beside the chart; Why and Recent
  decisions side by side)
- Unit 3 — hard-coded sample data kept in
  `frontend/src/sample/sampleToday.ts`; all 7 cards carry a
  visible "Sample data" tag, and the water-avoided figure
  also carries an "Estimated" tag with an inline baseline
  and assumptions expander
- Unit 3 — Lucide icons (CloudRain, Droplet, Droplets, Info,
  ArrowRight) and one Recharts bar chart for rainfall and
  demand with a dashed baseline, 7D/14D pill tabs, and
  tick labels that thin out when space is tight
- Unit 3 verified: `npm run build` passes (tsc strict + Vite;
  643.80 kB JS chunk, 191.23 kB gzip); CDP browser checks at
  390×844 and 1280×900 show no horizontal overflow
  (`scrollWidth` equals the viewport), 7 of 7 cards labeled
  "Sample data", working Why and savings expanders, and the
  chart switching from 7 to 14 days (rendered bar rectangles
  11 to 21)
- Documentation — `context/project-overview.md` replaced
  with the approved project overview (problem, primary user,
  proposed gap, MVP scope, non-goals, success criteria);
  undecided items are marked as decisions needed from Morax
- Documentation — `context/calculation-spec.md` added:
  inputs, onboarding-derived initial depletion, daily water
  balance, forecast projection, decision horizon, SKIP /
  REDUCE / WATER rules, the separate estimated-savings
  method, the constants table (all unresolved values marked
  TBD or ASSUMPTION), and input validation
- Unit 4 — pure engine in `backend/app/engine/models.py`
  (`EngineConfig`, `EngineDay`, `RecommendationResult`,
  `RecommendationState`, named `EngineInputError`) and
  `backend/app/engine/water_balance.py` (`compute_taw`,
  `compute_raw`, `compute_horizon`, `effective_rainfall`,
  `update_depletion`, `project_forecast`, `recommend`).
  No network, database, or framework imports; every
  scientific value comes from `EngineConfig`
- Unit 4 — decision horizon `H = min(H_cap, max(1,
  ceil(7 / n_base)))`; `D_proj_max` is taken over forecast
  days 1..H only, excluding today's depletion; SKIP below
  `f_skip × RAW`; otherwise `I_rec = min(D_proj_max /
  eff_irrigation, I_max)`, WATER when `I_rec >=
  I_base_event`, REDUCE when below
- Unit 4 verified: 21 engine tests in
  `backend/tests/engine/test_water_balance.py`, each with its
  own hand-checked fixture and arithmetic comment, including
  TAW/RAW, horizon cap and floor, each daily-balance clamp,
  WATER and REDUCE, the dry-lawn-plus-heavy-rain SKIP
  regression, and the invalid-input cases; `pytest` passes 30
  tests, `ruff check` passes, `ruff format --check` passes
- Unit 5 — estimated water avoided in
  `backend/app/engine/savings.py`: `estimate_savings` takes the
  baseline event depth, events per week, window days, lawn
  area, one recommended applied depth per day, and irrigation
  efficiency; returns a `SavingsEstimate` with a nested
  `SavingsBaseline` (event depth, events per week, events in
  the window), window, area, efficiency, baseline volume,
  recommended volume, `estimated_water_avoided_l`, and
  assumption texts for the UI
- Unit 5 — `V_avoided` is clamped at 0; the recommended series
  must match the window length; names and strings use
  "estimated water avoided" and contain neither "saved" nor
  "measured". `calculation-spec.md` Section 6 updated to the
  per-day series method
- Unit 5 verified: 10 savings tests in
  `backend/tests/engine/test_savings.py` with hand-checked
  fixtures for one-week and two-week windows, recommended
  above baseline (clamped to 0), zero baseline, zero
  recommended water, exposed baseline/assumptions, and
  invalid input; `pytest` passes 40 tests, `ruff check`
  passes, `ruff format --check` passes
- Unit 7 — SQLAlchemy profile storage:
  `backend/app/db/database.py` (engine from `DATABASE_URL`,
  session factory, `get_db`, table creation on startup),
  `backend/app/db/models.py` (profiles table with a UUID4
  string primary key, location label plus coordinates, lawn
  area, grass/soil/sprinkler names, precipitation rate,
  baseline minutes and events per week, last-watered date and
  minutes), and `backend/app/db/profiles.py` (create, get by
  ID, partial update; server-generated ID; no cross-profile
  writes)
- Unit 7 — profile routes in `backend/app/api/profiles.py`:
  `POST /profiles`, `GET /profiles/{profile_id}`, and
  `PATCH /profiles/{profile_id}` with Pydantic validation,
  `extra="forbid"`, at least one non-null field on update,
  201/200 responses, and 400/404 errors
- Unit 7 — single error structure in
  `backend/app/api/errors.py`: every API failure returns
  `{"code", "message"}`; validation errors map to 400
  `invalid_request`, unknown profiles to 404
  `profile_not_found`, and unknown routes to 404
  `not_found`. CORS now allows GET, POST, and PATCH from the
  local Vite origins
- Unit 7 verified: 17 route tests in
  `backend/tests/api/test_profiles.py` against in-memory
  SQLite (StaticPool), covering creation, generated IDs,
  rejection of a client-supplied ID, get, partial update,
  unknown profiles, empty/null updates, out-of-range input,
  cross-profile isolation, ID reassignment rejection, and
  the error shape; `pytest` passes 57 tests, `ruff check`
  passes, `ruff format --check` passes
- Unit 8 — pure engine support for onboarding-derived
  initial depletion: `depletion_after_watering` in
  `backend/app/engine/water_balance.py` implements
  `clamp(RAW - I_last, 0, TAW)` from calculation-spec.md
  Section 2.3, with three hand-checked tests
- Unit 8 — recommendation persistence in
  `backend/app/db/models.py` and
  `backend/app/db/recommendations.py`: a `recommendations`
  table storing the result, Why numbers, full
  `EngineConfig` snapshot, forecast and observed weather
  inputs, a profile snapshot, and the assumption texts
- Unit 8 — orchestration in
  `backend/app/services/recommendation.py`: resolve
  constants, fetch Open-Meteo weather, split observed and
  forecast days, derive the baseline event depth and initial
  depletion, walk observed days with `update_depletion`,
  build the final `EngineConfig`, call `recommend`, produce
  reason and uncertainty text, and store the result. Weather
  and constants failures return a `CannotRecommend` outcome
  instead of guessing
- Unit 8 — `GET /profiles/{profile_id}/recommendation` in
  `backend/app/api/recommendations.py`: the route loads the
  profile, calls the service, and returns the stored
  recommendation with state, reason, Why numbers,
  uncertainty, and assumptions. Unknown profiles return 404;
  cannot-recommend outcomes return HTTP 503 with
  `state: CANNOT_RECOMMEND`, a machine-readable code, and a
  reason. Weather and constants are injected as dependencies
  so tests never call the live API
- Unit 8 — constants seam: `resolve_irrigation_constants`
  returns `None` until Unit 6 supplies the verified table.
  In production this produces `constants_unavailable`
  (HTTP 503) rather than an invented recommendation. Tests
  inject test-only constants labeled as such
- Unit 8 verified: 8 route tests in
  `backend/tests/api/test_recommendations.py` covering SKIP,
  REDUCE, WATER, stored inputs/constants/assumptions,
  weather unavailable, missing constants (weather client not
  called), insufficient forecast days, last watering outside
  the weather window, and unknown profiles; `pytest` passes
  68 tests, `ruff check` passes, `ruff format --check` passes
- Unit 8 smoke check: startup created the `profiles` and
  `recommendations` tables in a temporary SQLite database,
  a profile was created (201), and the production
  recommendation route returned 503
  `constants_unavailable` as designed. The temporary
  database was deleted

## In Progress

- None. Unit 8 is complete; Unit 6 remains blocked.

## Next Up

- Unit 6 — verified constants module (`constants.py` plus
  spec Section 7 and the finite/range test). Blocked until
  the verified constants table is supplied
- Connect `resolve_irrigation_constants` in
  `backend/app/services/recommendation.py` to the Unit 6
  constants and presets, then confirm the production route
  returns SKIP, REDUCE, and WATER for real profiles
- Add user-reported actions (followed / not followed) and
  the history view. Split frontend and backend increments
- Real weather data plus the onboarding flow. Split into
  frontend and backend increments per the workflow rules
- Resolve the remaining context files (received one at a
  time from the project leader)
- Produce the product design document: verdict (build,
  modify, or abandon), problem statement, primary segment,
  gap analysis, MVP scope
- Run the short user validation exercise (interviews about
  actual past watering behavior)
- Fill the constants in `calculation-spec.md` with cited
  sources (or approved, documented assumptions)

## Open Questions

- Unit 6 is blocked: the verified constants table was sent as
  the literal placeholder "[PASTE VERIFIED TABLE HERE]". No
  grass, soil, sprinkler, or coefficient values will be added
  until the table is supplied
- Unit 8 wiring is complete, but the production route
  currently returns `constants_unavailable` (HTTP 503)
  because `resolve_irrigation_constants` has no verified
  values to return. Connect it to Unit 6 to make real
  recommendations possible
- The initial-depletion walk requires `last_watered_date` to
  fall inside the observed weather days. Outside that window
  the route returns `last_watering_out_of_range`; onboarding
  must enforce the same rule. Confirm this is the intended
  behavior
- Unit 8's reason and uncertainty texts are a first pass.
  Confirm the wording before the frontend displays them
- Unit 8 returns HTTP 503 for every cannot-recommend reason
  (`weather_unavailable`, `constants_unavailable`,
  `insufficient_forecast`, `last_watering_out_of_range`).
  Unit 8 only specified 503 for weather failure. Should a
  profile-data problem such as an old last-watered date use
  400 or 422 instead?
- Unit 8 treats the weather client's `is_forecast` flag as
  authoritative. Confirm whether the first forecast day
  returned by Open-Meteo is today or tomorrow, because the
  calculation spec defines forecast days as 1..H after
  today. An off-by-one day would shift the observed/forecast
  boundary
- The observed-day walk currently assumes no logged
  irrigation after the last watering. When user-reported
  actions exist, pass any logged irrigation into
  `update_depletion` for the matching observed day
- Profile `grass_type`, `soil_type`, and `sprinkler_type` are
  stored as free-text names because the supported preset
  values are pending Unit 6. Add validation against the
  presets once they exist
- The Today page is sample-only, so the spec's loading,
  error, empty, and "Cannot recommend" states have not been
  built yet. Define them when real data fetching is added
- The "Log that I followed this" action, the History page,
  and the My lawn page are presentational only (no handlers
  or routes), per the Unit 3 scope
- The baseline and assumptions shown by the savings
  expander are still sample text. `calculation-spec.md`
  Section 6 defines the estimate method; replace the sample
  text when Unit 5 implements it
- Which product name should appear in the UI? The UI still
  uses the descriptive title "Lawn irrigation advisor"
  because no app name is defined in the context files
- Which origins may call the API once the frontend is
  deployed? CORS currently allows only the local Vite
  origins (`http://localhost:5173` and
  `http://127.0.0.1:5173`), and the frontend reads the API
  URL from `VITE_API_BASE_URL` (default
  `http://localhost:8000`)
- The weather client uses a 10-second timeout as an
  assumption. Is that appropriate once the backend is
  deployed on a free-tier host?
- Product verdict: build, modify, or abandon the current
  idea? Weather-based advice already exists (WaterMyYard,
  Sonoma-Marin, Marin Water, Water My Lawn?, smart
  controllers), so a real gap must be found or the direction
  changed
- Which single user segment is primary? Homeowners with
  traditional timers are the starting assumption, not a
  validated choice
- Which gap is worth solving: geographic coverage,
  simplicity, transparency, hardware compatibility, or
  savings accountability? None is validated yet
- Which target region should the MVP and demo use, and does
  Open-Meteo provide adequate data there?
- Which sources define `Kc`, `theta_fc`, `theta_wp`, `Zr`,
  and `p` for the target grass and soil? All are TBD in
  `calculation-spec.md`
- Is the adopted effective-rainfall rule
  (`P_eff = min(P, D_prev)`) acceptable, and which source
  supports it? It assumes rainfall above the current
  depletion drains and is not stored for later
- Which source defines `f_skip`?
- What should `H_cap` be? It is proposed as 7 to match the
  7 available forecast days. What should happen when the
  user has no baseline schedule (`n_base = 0`) or has
  already watered today? The engine currently requires
  `n_base > 0`
- Which source defines `eff_irrigation` and `I_max`?
- Which sprinkler types does onboarding support, and what
  are the per-type `PR_default` values and their sources?
- For `D_start`, is the "root zone at RAW before the last
  watering" assumption acceptable? What should onboarding
  do when the last watering is unknown or older than the
  observed weather window?
- Should onboarding collect more than one past watering to
  improve the starting depletion estimate?
- Which baseline defines "estimated savings" (the user's
  current fixed schedule is the working assumption)?
- Which `N_days` window should the dashboard show for
  estimated water avoided (for example 7 or 30 days)?
  `estimate_savings` takes the window as an input
- How should a follow-up ("followed / not followed") adjust
  the per-day recommended depths passed to
  `estimate_savings`? The function currently uses the series
  as entered
- Is it correct that `eff_irrigation` does not enter the
  savings formula directly? Recommended depths are already
  divided by efficiency, so applying it again would reduce
  the estimate twice. The value is currently exposed in the
  result and assumptions only
- Open-Meteo free tier is non-commercial only. Acceptable
  for the hackathon; what is the plan if the project
  continues past it?
- Hosting providers for the frontend and backend demo
- Original sources for the earlier Reddit and user-behavior
  research claims are missing; they remain unverified leads
- Current competitor features and pricing have not been
  independently re-verified

## Architecture Decisions

- No user accounts in the MVP; a property profile is
  identified by a random ID kept in the browser. Why: auth
  would consume build time without improving the core demo
- SQLite for storage. Why: single-developer MVP with small,
  simple data and no deployment overhead
- Recommendation logic isolated in a pure Python engine
  module. Why: it can be unit-tested against hand-checked
  values and explained clearly, which supports the
  scientific credibility the project requires
- Weather data fetched only by the backend from Open-Meteo.
  Why: keeps the provider swappable and the frontend free
  of irrigation logic
- Internal calculations use SI units only, converted at the
  UI edge. Why: prevents unit-conversion errors
- All savings figures are labeled as estimates against a
  defined baseline. Why: the project must not claim measured
  savings it cannot verify
- The product is advisory only: no sprinkler control and no
  hardware. Why: project constraint
- The frontend reads the backend URL from
  `VITE_API_BASE_URL` (default `http://localhost:8000`), and
  the backend's CORS allowlist contains only the local Vite
  origins. Why: the scaffold runs locally without code
  changes; deployed origins are still undecided
- The engine uses frozen dataclasses with explicit
  `__post_init__` validation and a named `EngineInputError`,
  not Pydantic. Why: keeps `backend/app/engine/` free of
  framework imports while still validating every input
- The projected maximum depletion is taken over forecast
  days 1..H and excludes today's depletion. Why: including
  today made a dry lawn with heavy rain forecast return
  WATER, so SKIP never fired
- The decision horizon is derived from the baseline schedule
  (`H = min(H_cap, max(1, ceil(7 / n_base)))`) instead of a
  fixed window. Why: it represents the days until the user's
  next scheduled watering and is covered by engine tests
- Estimated water avoided compares the scheduled baseline
  volume with the sum of recommended applied depths over the
  window. Why: both volumes are applied water, so the
  estimate stays comparable; irrigation efficiency is already
  reflected in the recommended depths and is exposed with the
  assumptions rather than applied again
- Profile IDs are UUID4 strings generated by the server. The
  create request cannot supply an ID, and update cannot
  change it; the path parameter is the only identifier used.
  Why: enforces per-profile access with no accounts
- Profile updates are PATCH with at least one non-null field.
  Why: required columns are never cleared or set to null
- Every API failure returns the same `{"code", "message"}`
  shape, including request validation and unknown routes.
  Why: the frontend handles one error structure
- Tables are created at startup from the SQLAlchemy metadata
  and the database URL comes from `DATABASE_URL`. Why: no
  migration tool is justified for a single-table MVP
- Recommendation orchestration lives in
  `backend/app/services/recommendation.py`; the route only
  loads the profile, calls the service, and returns the
  result. Why: keeps HTTP handlers thin and puts weather,
  engine, and storage wiring in one testable place
- Every stored recommendation keeps the full `EngineConfig`,
  the forecast and observed weather values used, a profile
  snapshot, and the assumptions shown to the user. Why:
  satisfies the invariant that the UI can always explain
  why a recommendation was produced
- Scientific constants are supplied through a resolver, not
  hard-coded defaults. Why: Unit 6 owns the values and
  citations; until they exist, returning cannot-recommend is
  safer than inventing a recommendation
- Initial depletion is computed with the engine helper
  `depletion_after_watering` plus `update_depletion` over the
  observed days from `last_watered_date`. Why: keeps the
  Section 2.3 rule in the pure engine and leaves only
  orchestration in the service
- Cannot-recommend outcomes return HTTP 503 with
  `state: CANNOT_RECOMMEND`, a code, and a reason instead of
  the generic error shape. Why: the UI needs a distinct
  state, not a generic failure, and Unit 8 specified 503 for
  weather failure

## Session Notes

- Stack: React + TypeScript (Vite), Python FastAPI, SQLite
  via SQLAlchemy, Open-Meteo, Recharts. Solo student
  developer, about two weeks total
- Context files are written one at a time as the project
  leader uploads each template; each is filled in for this
  project
- The architecture covers the advisor core only. If the
  product direction changes materially (for example to
  multi-property management), revisit the Auth and Storage
  sections of `architecture.md`
- Rule for the work: do not invent research findings,
  quotes, statistics, competitor weaknesses, or water
  savings
- The frontend bundle is 643.80 kB minified (191.23 kB
  gzip), mostly Recharts; Vite warns above 500 kB.
  Acceptable for the hackathon demo; code splitting is
  optional polish