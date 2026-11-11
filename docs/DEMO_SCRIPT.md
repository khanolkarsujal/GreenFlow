# GreenFlow — 90-Second Demo Script

Verified against the live engine on 2026-11-04. Weather-dependent numbers must be re-checked on demo morning; never read an old number as live.

## Pre-demo checklist

1. Backend running: `cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 8000`
2. Frontend running: `cd frontend && npm run dev`; open `http://127.0.0.1:5173/#dashboard`
3. Profile loaded: **Browser test lawn** (`be036506-29ca-4a91-8cd6-2957cfd72493`), 120 m², fescue, loamy, rotor, 30 mm/h, 60 min baseline, 3 events/week, last watered 2026-11-03.
4. Open `#recommendation` once before going on stage so the first live fetch and Open-Meteo round trip are done.
5. Check the browser console: the only acceptable error is the deliberate failure branch. There should be no other red errors.
6. Keep a second tab on `#dashboard` showing the saved recommendation as a fallback.

## Expected output (verified 2026-11-04, weather will drift)

Open-Meteo refreshes its forecast, so read the numbers off the screen on demo morning. The decision and shape are stable; the exact depth moves by a few tenths of a millimetre.

- State: **REDUCE**
- Recommended: **45 min** vs **60 min** baseline (**−15 min**). The depth sits near 22.3–22.7 mm; `22.7 ÷ 30 × 60 = 45.4 → 45 min`, and 22.3 mm also rounds to 45.
- Projected depletion: roughly **6.3 → 9.4 → 13.4–13.6 mm** over 3 days
- Skip threshold: **3.9 mm** (dashed line); the peak stays well above it, which is why the answer is reduce, not skip
- Observed rain: **27.7 mm**; forecast rain **0.0 mm**; forecast ET₀ about **10.7–10.9 mm**
- Confirmed savings before demo: **3,780 L**, 4 confirmed. The pending count grows by one every time a live recommendation is fetched (including QA visits); those rows are excluded from every total, so its exact value does not matter on stage.
- After one new confirmed REDUCE event: **about 4,700 L**, 5 confirmed, baseline **18,000 L**, planned **about 13,300 L**, **about 26%** avoided. Read the exact figure from the screen: a 45-min event gives **4,680 L**; a 44-min event gives **4,740 L**.

## Timeline

| Time | Action | Say |
| --- | --- | --- |
| 0:00–0:10 | Dashboard | “Most homeowners follow a fixed sprinkler schedule without knowing whether the lawn actually needs that much water.” |
| 0:10–0:20 | Open **Lawn Profile** | “This is a real saved profile: 120 m² of fescue on loam, a 30 mm/h rotor system, 60 minutes three times a week, last watered on 3 November.” |
| 0:20–0:35 | Back to Dashboard → **See why** | “GreenFlow just fetched live Open-Meteo weather for these coordinates and ran the soil-water balance. It says reduce from 60 to about 45 minutes today.” |
| 0:35–0:50 | Scroll to the projection chart | “The green line is projected root-zone depletion for the next three days. The dashed line is the 3.9 mm skip threshold. The peak is about 13.5 mm, so it says reduce, not skip. These are engine values, not an AI guess.” || 0:50–0:57 | Point to sources | “The constants are cited: FAO-56 Tables 12, 19 and 22, Penn State root depth, and Colorado State efficiency.” |
| 0:57–1:05 | Scroll to the decision card, click **Yes, I followed it** | “GreenFlow is advisory. The homeowner sets the timer manually and records what they did. Nothing controls the timer.” |
| 1:05–1:18 | Open **Water Savings** | “The confirmation moved from pending to confirmed. Estimated avoided water is now about 4,700 litres, roughly 26% of the reported baseline. This is an estimate from the reported rate and area, not a meter reading.” |
| 1:18–1:30 | Back to dashboard or stay on savings | “GreenFlow helps homeowners make better irrigation decisions using their actual lawn conditions and weather. It advises; it does not control your timer.” |

## Genuine failure branch (30–45 seconds, use for Q&A)

1. **Lawn Profile** → change **Soil** to **Not sure** → **Save Lawn Profile**.
2. Open **Recommendation**.
3. Expected: **503 `constants_unavailable`**, message that no cited soil-water values are mapped to `not-sure`; no recommendation number is shown.
4. Say: “It refuses to guess. A recommendation without cited soil constants would be invented.”
5. Return to **Lawn Profile** → set **Soil** to **Loamy** → **Save Lawn Profile**.
6. Open **Recommendation** again or press **Retry**.
7. Expected: successful **REDUCE (about 44–45 min vs 60 min)** recovery.

Do not use a fabricated frontend error for this. The 503 comes from the backend constants resolver.

## Network-failure fallback

If Open-Meteo is unreachable, do **not** present old data as live:

- Open the dashboard tab that shows the last **Saved recommendation**, including its original timestamp and the “Saved recommendation” label.
- Explain that the live request is failing honestly and show the 503 `weather_unavailable` state if useful.
- If there is no saved recommendation, use the pre-recorded walkthrough or the screenshots in `.qa/final-desktop-*.png`.
- Preferred backup: record a 90-second screen capture before the event with Windows Game Bar (`Win + G`) or OBS, following this script. A recording is not stored in the repository.

## Lines to avoid

- “GreenFlow measured 4,680 litres saved.” Say **estimated**.
- “GreenFlow guarantees savings.”
- “GreenFlow turns your sprinklers on or off.”
- “Our ET₀ is X% accurate.”
- Any competitor comparison or fabricated customer result.
