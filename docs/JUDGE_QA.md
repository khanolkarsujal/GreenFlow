# Judge Q&A

Concise, defensible answers. Every answer below matches what the code actually does. Do not add numbers or comparisons that are not in this file.

---

### 1. How do you know GreenFlow saves water?

We don't claim measured savings. We compute an **estimate** from confirmed actions only:

```
avoided = (baseline minutes − recommended minutes) ÷ 60 × precipitation rate × lawn area
```

Only recommendations the homeowner confirms as **followed** are counted; unconfirmed ones stay pending. With the QA profile (30 mm/h, 120 m², REDUCE 45 min vs a 60 min baseline), one confirmed event estimates **900 L avoided**, shown in the app as "estimate, not measured." There is no flow meter, water bill, or soil sensor in the loop, so we never call this measured or guaranteed.

---

### 2. Why is this not just another weather application?

A weather app shows a forecast. GreenFlow keeps a **saved lawn profile**, runs a daily **soil-water balance** using cited crop and soil constants, projects depletion over the days until the next scheduled watering, converts the result into **minutes on the user's existing timer**, explains every input, records the homeowner's decision, and updates estimated savings. The weather is an input, not the product.

---

### 3. Why is this better than a smart irrigation controller?

We don't claim it is better, and we make no competitor comparisons. It is a different product for a different household:

- It works with a **conventional timer** — no wiring, valve, or controller installation.
- It is **advisory**: the homeowner sets the timer manually.
- Every recommendation is **explainable and cited**, with applied vs. context factors and the arithmetic shown.
- It closes the loop with **confirmation and estimated savings** without pretending to measure water.

A smart controller automates execution. GreenFlow informs a manual decision. We have not run a side-by-side water-savings study, so we don't claim one.

---

### 4. How accurate is your ET₀ calculation?

GreenFlow does not calculate ET₀ itself. It requests Open-Meteo's daily **`et0_fao_evapotranspiration`**, the provider's FAO-56 reference evapotranspiration for the saved latitude/longitude, and multiplies it by a cited turfgrass coefficient (Kc 0.95 cool season / 0.85 warm season). That is a gridded model value, not a station in the yard, and forecasts change. The engine is deliberately simple bookkeeping — one Kc, no dual-coefficient ET, no local calibration — so we state assumptions and do not publish an accuracy percentage.

---

### 5. Where do your scientific constants come from?

- **Kc:** FAO-56 Table 12, p. 112, footnote 15 — cool-season 0.95, warm-season 0.85.
- **Depletion fraction p:** FAO-56 Table 22, p. 165 — 0.40 cool season, 0.50 warm season.
- **Field capacity / wilting point:** FAO-56 Table 19, p. 144 — midpoints of the published ranges (sand 0.12/0.045, loam 0.25/0.12, silt loam 0.29/0.15, clay 0.36/0.22 m³/m³).
- **Root depth:** Penn State Extension, *The Cool-Season Turfgrasses* — 2–6 inches; 0.15 m (6 in) is used.
- **Irrigation efficiency:** Colorado State University Extension, *Drip Irrigation for Home Gardens* — 50–70%; 60% midpoint used because no catch-cup measurement exists.

The app displays these citations with links, and clearly separates **product policies** (50%-of-RAW skip threshold, 7-day horizon cap) from science.

---

### 6. What happens when weather data is unavailable?

The request fails honestly; there is no fabricated fallback and no cache presented as live. Open-Meteo is called per request with a 10-second timeout. Failures return a specific 503 code:

- `weather_unavailable` — timeout, network error, non-200 response, or missing/malformed variables
- `stale_weather_data` — returned dates do not align with the expected observation/forecast window
- `last_watering_out_of_range` — the saved watering date is outside the observed window
- `insufficient_forecast` — fewer forecast days than the decision horizon
- `constants_unavailable` — no cited constants exist for the chosen soil or grass

The UI explains the cause and offers a retry (or profile correction) instead of showing a number.

---

### 7. How do you calculate irrigation duration?

The engine produces a depth in millimetres, then converts it using the user's reported precipitation rate:

```
minutes = depth_mm ÷ precipitation_rate_mm_per_hour × 60
```

Example from the live demo: `22.3 mm ÷ 30.0 mm/h × 60 = 44.6 → 45 min` (rounded to a whole minute). The same calculation is shown in the "Show the math" panel with the stored engine values. Duration never depends on lawn area; area is used only for volume estimates.

---

### 8. Are water savings measured or estimated?

**Estimated.** Three reasons:

1. Volumes come from the user's reported precipitation rate and lawn area, not a flow meter.
2. Confirmation is self-reported — tapping "Yes" is not proof the cycle ran.
3. Weather and ET₀ are provider-modeled, not measured on the property.

The Water Savings screen separates "On this screen (estimated)" from "Measured water use (Not available; no flow meter, water bill, or soil sensor)." Only confirmed, followed events are counted. We never call the result measured or guaranteed.

---

### 9. What are the limitations?

- No soil-moisture sensor, flow meter, or timer connection; depletion is bookkeeping.
- One cited Kc, p, root depth, and efficiency per grass class; no site calibration.
- Last watering is stored as a **date**, not a time.
- Open-Meteo is a grid cell, not the yard; forecasts change after the recommendation is created.
- Each visit to the recommendation screen creates a new recommendation row; unconfirmed rows remain pending.
- No authentication, multi-zone support, or hardware control.
- Open-Meteo's free API is for non-commercial use with attribution; a commercial deployment needs a licensing review.

---

### 10. What happens if the user ignores the recommendation?

Nothing is counted. An unconfirmed recommendation stays **pending** and contributes zero litres to savings. The homeowner can later confirm "Yes, I followed it" or "No, I kept my normal schedule"; only "followed" adds to estimated avoided water. A "No" is recorded as not followed and also contributes zero. There is no penalty, no reminder automation, and no claim about what the timer actually did.

---

## Open-Meteo terms — say this honestly

GreenFlow uses the free Open-Meteo API for weather and reference ET₀. The free tier is intended for **non-commercial** use and requires attribution. The app displays "Weather data © Open-Meteo" and states that provider data is not an on-site measurement. Before any commercial or production launch, review the current terms at <https://open-meteo.com/en/terms> and obtain a suitable plan if required. Do not describe GreenFlow as production-ready or commercially cleared without that review.

## Lines to avoid

- "GreenFlow guarantees water savings."
- "GreenFlow measured X litres saved."
- "Our ET₀ is X% accurate."
- "Better than [brand] smart controller."
- "GreenFlow turns your sprinklers on/off."
- Any competitor number or customer result that is not in the repository.
