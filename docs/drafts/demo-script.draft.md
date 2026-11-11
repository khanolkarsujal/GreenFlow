# 3-Minute Demo Script

**DRAFT — not final. Intended final location: `docs/demo-script.md`.**

> **Read this first.** The current build cannot produce a real recommendation in
> production. The route returns HTTP 503 `constants_unavailable`, and the Today
> page is hard-coded sample data. The script therefore has two paths:
>
> - **Path A — current build (can be recorded today).** A transparent walkthrough
>   of the sample UI and the blocked backend. It must say "sample" and
>   "estimated" out loud, on camera.
> - **Path B — target demo (do not record until Unit 6 and the real frontend
>   fetch exist).** Shows a real recommendation end to end. Do not imply Path B
>   works today.
>
> Use Path A only as a progress walkthrough, not as evidence that the product
> recommends watering. A submission demo built on sample data must say so
> throughout.

## Before recording

- Run the backend from `backend/`:
  `uvicorn app.main:app --reload --port 8000`
- Run the frontend from `frontend/`: `npm run dev`
- Open `http://localhost:5173` in a browser at phone width (390 × 844 is the
  tested size).
- Confirm every card shows the **Sample data** tag and the water-avoided card
  also shows **Estimated**.
- Have a terminal ready in `backend/` for the API segment.
- Close unrelated tabs and notifications.
- Do not speed up, edit, or narrate numbers as real results.

## Path A — current build

### 0:00–0:15 — Opening

**On screen:** Today page at phone width.

**Say:**

> This is Lawn Irrigation Advisor, a working prototype for homeowners with a
> traditional sprinkler timer. It is meant to answer one question: should I
> skip watering, water less, or water normally? I am going to be explicit about
> what is built and what is still sample data.

### 0:15–0:40 — The problem and the hypothesis

**On screen:** Stay on the Today page; gesture to the recommendation card.

**Say:**

> Fixed timers run on a schedule. They do not react to rain that already fell,
> rain that is forecast, or how much water the lawn actually needs this week.
> Our hypothesis is that a simple daily recommendation, with the numbers shown,
> would help. That hypothesis is not yet validated with users, so I will not
> claim it is proven.

### 0:40–1:10 — The sample recommendation

**On screen:** Point to the **Sample data** tag, then the **SKIP** state and the
reason.

**Say:**

> This screen is a design sample. The tag says "Sample data," and it stays
> visible on every card. The state here is SKIP, with a plain-language reason.
> The layout is mobile-first, and the recommendation is the most prominent
> element.

### 1:10–1:40 — Show the reasoning

**Action:** Tap **Why?**

**On screen:** The expanded rows: Rainfall received 2.4 mm, Rainfall expected
8.0 mm, Estimated demand 2.1 mm, and the uncertainty text.

**Say:**

> The product is built around transparency. The Why panel shows the rainfall
> received, the rainfall expected, an estimated demand, and the uncertainty in
> words. The demand figure carries an "Estimated" tag because it is calculated
> from weather data, not measured in the soil.

### 1:40–2:10 — The savings estimate and its baseline

**Action:** Scroll to **Estimated water avoided**, then tap
**How is this estimated?**

**On screen:** Baseline and assumptions text expands. The figure 1,240 L and
the **Estimated** tag are visible.

**Say:**

> This is the other half of the idea: accountability against a stated baseline.
> The figure is 1,240 litres of estimated water avoided. It is sample text, and
> it is labeled "Estimated." Opening the details shows the baseline: the same
> week watered on the normal schedule. It also shows the assumptions, including
> sample lawn size, sprinkler flow, and run time. This is not measured water
> savings.

### 2:10–2:40 — What the backend actually does today

**Action:** Switch to the terminal.

**Run:**

```bash
curl http://localhost:8000/health
```

**Say:**

> The backend is real: FastAPI, SQLite, and a tested calculation engine. Health
> returns OK. Profiles can be created through the API.

**Run:** Create a profile (use a date within the last 7 days), then:

```bash
curl -i http://localhost:8000/profiles/<PROFILE_ID>/recommendation
```

**On screen:** HTTP 503 with `state: CANNOT_RECOMMEND`,
`code: constants_unavailable`.

**Say:**

> The recommendation endpoint returns a deliberate "cannot recommend" state.
> The scientific constants, things like crop coefficient, soil water capacity,
> and irrigation efficiency, have not been verified yet. Rather than invent
> numbers, the system refuses to recommend. That is the honesty rule in the
> architecture, and it is covered by tests.

### 2:40–3:00 — Close

**On screen:** Back to the Today page.

**Say:**

> So today: a tested engine, a tested API, and a sample UI that shows how the
> explanation and the baseline will work. Next is the verified constants table,
> then onboarding, real recommendations, history, and the savings dashboard. No
> measured savings are claimed, and no competitor is being called deficient.

## Path B — target demo after Unit 6 and real frontend wiring

Do not record this path until all of the following are true:

- The verified constants table is implemented and connected through
  `resolve_irrigation_constants`.
- The Today page fetches `GET /profiles/{id}/recommendation` instead of using
  `sampleToday`.
- The loading, error, and cannot-recommend states are rendered.
- Onboarding creates a real profile.
- The savings figure comes from `estimate_savings`, not sample text.
- The sample-only labels have been removed from anything that is now real.

### Suggested 3-minute flow

| Time | Beat | What to show |
| ---- | ---- | ------------ |
| 0:00–0:20 | Problem | Fixed schedule ignores received rain, forecast rain, and demand. State that the problem is a hypothesis. |
| 0:20–0:50 | Onboarding | Enter location, lawn area, grass/soil/sprinkler, precipitation rate, last watering, and baseline schedule. |
| 0:50–1:25 | Today | A real SKIP, REDUCE, or WATER result with its reason. |
| 1:25–1:55 | Why | Real stored input values: observed rain, forecast rain, estimated demand, TAW/RAW, horizon, uncertainty. |
| 1:55–2:20 | Estimate | Estimated water avoided against the user's stated baseline, with baseline and assumptions open. Say "estimate," never "measured." |
| 2:20–2:40 | Cannot recommend | Show the state with its reason (for example, weather unavailable). Emphasize that the app does not guess. |
| 2:40–3:00 | Close | What is built, what is still planned, and that no user research or competitor comparison is claimed. |

### Path B narration guardrails

- Say **"estimated water avoided against the stated baseline."**
- Never say **"we saved," "measured savings," "proven to save,"** or
  **"users want this."**
- Never say a competitor is worse, missing a feature, or overpriced. Competitor
  features and pricing have not been independently re-verified.
- If a number on screen is still sample data, say so. Do not remove or hide the
  **Sample data** tag for the recording.
- If the constants are still missing, record Path A instead.

## Words to avoid

| Do not say | Say instead |
| ---------- | ----------- |
| "This saves 1,240 litres." | "This estimates 1,240 litres of water avoided against the stated baseline." |
| "Measured water savings." | "Estimated water avoided." |
| "Users told us..." | "The primary user is an assumption in the project brief; user validation is still open." |
| "Competitors fail at..." | "Weather-based advice already exists; we are not asserting a competitor deficiency." |
| "The app recommends..." (while showing the sample screen) | "This sample screen shows the intended recommendation layout." |
| "It works end to end." | "The engine and API are tested; production recommendations are blocked on verified constants." |

## Pre-record technical check

```bash
# Backend
cd backend
pytest
ruff check .

# Frontend
cd ../frontend
npm run build
```

Expected at draft time: 68 backend tests pass, ruff passes, and the frontend
build passes. If any check fails, do not record until it is fixed.
