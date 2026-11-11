# Devpost Story Draft

**DRAFT — not final. Intended final location: `docs/devpost-story.md`.**

> **Do not publish this as-is.** It describes an incomplete build. The
> production recommendation route currently returns HTTP 503
> `constants_unavailable`, and the Today page is hard-coded sample data. The
> submission must either (a) publish this honest status, or (b) wait until the
> verified constants and real frontend fetch exist, then update the status
> section before publishing.

## Title

**Lawn Irrigation Advisor — watering advice that shows its work**

*Working title. No final product name has been chosen.*

## Subtitle

An advisory MVP for homeowners with traditional sprinkler timers: SKIP, REDUCE,
or WATER, with the reasoning and a stated-baseline estimate.

## Inspiration

The project starts from a problem stated in the project brief, not from a
completed user study:

> Homeowners with traditional sprinkler timers water on a fixed weekly
> schedule. That schedule does not react to rain that has already fallen, rain
> that is forecast, or the actual water demand of the lawn that week.

Weather-based watering advice already exists. This project does not assert that
any existing product is deficient, and competitor features and pricing have not
been independently re-verified. The differentiation hypothesis is narrow:

1. **Transparency.** Every recommendation shows the numbers behind it: rainfall
   received, rainfall expected, estimated demand, soil-water capacity, the
   decision horizon, and the uncertainty in plain words.
2. **Stated-baseline accountability.** Estimated water avoided is always
   computed against the user's own fixed schedule, with the baseline and
   assumptions visible next to the figure.

That hypothesis still needs user validation. No interviews or user research have
been completed, so the story does not claim that homeowners want this or that it
changes behavior.

## What it does

The intended flow is:

1. A short onboarding form collects a location, lawn area, grass and soil type,
   sprinkler type and precipitation rate, the last watering date and duration,
   and the usual watering schedule.
2. The backend fetches observed and forecast daily weather from Open-Meteo.
3. A pure calculation engine maintains a soil-water balance, projects depletion
   over the days until the next scheduled watering, and returns:
   - **SKIP** when rain received or forecast is enough;
   - **REDUCE** when some water is needed but less than a normal event;
   - **WATER** when at least a normal event is needed.
4. The result includes a plain-language reason, the Why numbers, an uncertainty
   note, and the assumptions used.
5. A separate estimate compares the baseline schedule with the recommended
   applied depths over a window. The result is **estimated water avoided**,
   labeled **Estimated**, with its baseline and assumptions visible.

The product is advisory only. It never controls sprinklers or any hardware. The
homeowner decides and acts.

### Current build status

This is the honest part.

| Piece | Status |
| ----- | ------ |
| Pure engine (water balance, SKIP/REDUCE/WATER, horizon) | Built and tested |
| Estimated-savings function | Built and tested as a pure function |
| Open-Meteo client | Built; tests mock the HTTP layer |
| Profile storage and API | Built and tested with SQLite |
| Recommendation orchestration and storage | Built and tested |
| `GET /profiles/{id}/recommendation` | Built; returns 503 `constants_unavailable` in production |
| Frontend Today page | Built as a mobile-first **sample**; every card says "Sample data" |
| Onboarding, real recommendation fetch, history, savings dashboard | Not built |

The production route cannot return SKIP, REDUCE, or WATER yet because the
verified scientific constants table has not been supplied. Rather than invent
crop coefficients, soil water capacities, or irrigation efficiencies, the system
returns a deliberate **cannot recommend** state. The recommendation route tests
inject explicit test-only constants to prove the engine and route wiring; those
values are not product constants.

The sample screen shows a SKIP recommendation, a Why panel, and a 1,240 L
**estimated** water-avoided figure. Those are sample values, not results.

## How we built it

**Backend:** Python 3.11, FastAPI, Pydantic 2, SQLAlchemy 2, SQLite, pytest, and
ruff.

- `backend/app/engine/` is pure: no network, database, or framework imports. It
  takes an explicit `EngineConfig` and returns a result. There are no hidden
  scientific defaults.
- The daily water balance is
  `D = clamp(D_prev + Kc * ET0 - P_eff - I, 0, TAW)`, with
  `P_eff = min(P, max(0, D_prev))`.
- The decision horizon is derived from the user's schedule:
  `H = min(H_cap, max(1, ceil(7 / n_base)))`.
- The projected maximum depletion is taken over forecast days 1..H and
  deliberately excludes today's depletion, so a dry lawn with heavy rain
  forecast can still return SKIP.
- Initial depletion comes from the last watering:
  `D_start = clamp(RAW - I_last, 0, TAW)`, followed by a walk over observed
  days.
- Every stored recommendation keeps the full config, observed and forecast
  weather inputs, a profile snapshot, and the assumption texts, so the UI can
  explain it later.

**Frontend:** React 19, TypeScript, Vite, Recharts, and lucide-react. The Today
page is mobile-first and rearranges into a desktop grid. It is a design sample:
the data lives in `frontend/src/sample/sampleToday.ts`, all cards show a
**Sample data** tag, and the estimate shows an **Estimated** tag with a baseline
and assumptions expander.

**Weather:** Open-Meteo's forecast endpoint, one daily request for 7 past and 7
forecast days, with `precipitation_sum`, `temperature_2m_max`,
`temperature_2m_min`, `wind_speed_10m_max`, and
`et0_fao_evapotranspiration`. Weather calls happen only in the backend.

## Challenges

- **Missing scientific constants.** The constants table was never supplied. The
  project rule is that no scientific value may be invented. We built a typed
  constants seam and a cannot-recommend state instead. This blocks production
  recommendations, but it is the honest failure mode.
- **Explaining a recommendation, not just producing one.** Storing only the
  final state would make the Why panel impossible to reproduce. Each row stores
  the inputs, config, and assumptions that produced it.
- **The dry-lawn + rain-tomorrow bug.** Including today's depletion in the
  projected maximum made the engine return WATER even when heavy rain was
  forecast. Restricting the maximum to forecast days 1..H fixed SKIP for the
  case the forecast is meant to handle.
- **Starting soil moisture.** With no watering history, the engine assumes the
  root zone was at the refill point before the last watering. That assumption is
  documented in the calculation spec and surfaced to the user, rather than
  hidden.
- **Keeping sample data honest.** The UI is visually complete, which makes it
  easy to mistake for a working product. Every card carries a Sample data tag,
  the estimate carries an Estimated tag, and this story says plainly that the
  screen is not a real recommendation.

## Accomplishments

- A pure, unit-tested engine with hand-checked fixtures for capacity, effective
  rainfall, depletion clamps, the decision horizon, SKIP/REDUCE/WATER, and the
  dry-lawn-plus-rain regression.
- A tested estimated-savings function that exposes its baseline, window, area,
  efficiency, both volumes, and assumptions, and clamps at zero.
- A recommendation pipeline that stores everything needed to explain a result.
- A deliberate cannot-recommend path for missing weather, missing constants,
  insufficient forecast days, and a last watering outside the observed window.
- 68 passing backend tests, clean ruff checks, and a passing TypeScript/Vite
  build.
- A mobile-first sample UI that demonstrates the intended explanation and
  baseline experience without presenting sample numbers as real.

## What we learned

- **"Cannot recommend" is a feature.** For a product built on scientific
  calculations, refusing to answer without verified inputs is safer than
  producing a plausible-looking number.
- **Estimates need grammar.** "Estimated water avoided against the stated
  baseline" is longer than "saved," but it is the only phrasing that matches
  what the code actually computes.
- **Transparency has to be designed, not appended.** The Why panel and the
  baseline expander shaped the data model: the app stores inputs and assumptions
  because the UI needs to show them.
- **A sample UI can mislead.** Visible, repeated labels are necessary when the
  interface looks finished but the data is not real.

## What's next

1. Implement the verified constants module (Unit 6) with cited sources, then
   connect it to the recommendation service.
2. Confirm production SKIP, REDUCE, and WATER responses for real profiles.
3. Build onboarding and replace the sample Today page with real API data,
   including loading, error, and cannot-recommend states.
4. Add follow-up logging and the History view.
5. Connect `estimate_savings` to the UI, with a chosen window, baseline, and
   assumptions.
6. Run the planned user validation exercise before making any claim about
   demand, behavior change, or competitor gaps.
7. Decide the target region, product name, license, and hosting.

## Built with

Python, FastAPI, Pydantic, SQLAlchemy, SQLite, Open-Meteo, React, TypeScript,
Vite, Recharts, lucide-react, pytest, ruff.

## Try it out

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
# Frontend (second terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

`GET /health` returns `{"status":"ok"}`. Profiles can be created through the
API. `GET /profiles/{id}/recommendation` currently returns HTTP 503
`constants_unavailable` by design. The Today page is sample data.

## What this project does not claim

- **No measured water savings.** Every savings figure is an estimate against a
  stated baseline and is labeled **Estimated**. The sample figure is not a
  result.
- **No user research.** The primary user and the problem statement are
  assumptions from the project brief. No interviews or validation have been
  completed.
- **No competitor deficiency.** Weather-based advice already exists. The project
  does not assert that any competitor is worse, missing a feature, or
  overpriced. Competitor features and pricing have not been independently
  re-verified.
- **No working production recommendation yet.** The verified constants are
  missing, so the route returns cannot-recommend.
- **No hardware control.** The product only advises.

## Data and license note

Weather data comes from Open-Meteo
(`https://api.open-meteo.com/v1/forecast`). Open-Meteo's free API is for
non-commercial use; that is acceptable for this hackathon, but any commercial
deployment needs a different data arrangement. The exact Open-Meteo attribution
and license terms are not captured in the project context and must be verified
before publishing. No project license has been chosen yet.
