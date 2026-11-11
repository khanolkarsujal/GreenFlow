# Estimated vs. Measured

GreenFlow distinguishes four kinds of numbers: **measured**, **provider-modeled**, **calculated/estimated**, and **user-reported**. The app labels these on screen. This table is the authoritative summary.

## Summary table

| Quantity | Where it appears | How GreenFlow produces it | Classification | What the app says | What GreenFlow does **not** claim |
| --- | --- | --- | --- | --- | --- |
| Air temperature, wind, precipitation, ET₀ | Weather inputs, freshness panel | Open-Meteo daily values for the saved latitude/longitude | Provider data (gridded); ET₀ is a FAO-56 model output, rainfall is an observation/forecast grid cell | "Open-Meteo data is not a measurement from a station in your yard." | That the weather at the exact lawn matches the grid cell |
| Rain since last watering | "Rain since last watering" factor | Sum of Open-Meteo observed daily rainfall on/after the saved last-watering date | Provider data, recalculated sum | "Observed daily rainfall since the last watering date you recorded." | That this is rain gauge data from the property |
| Forecast rain and ET₀ | Day-by-day projection | Sum over the decision horizon | Provider forecast | "Forecast in horizon"; "Weather forecasts can change after this recommendation is created." | Forecast accuracy or a confidence percentage |
| Field capacity, wilting point, Kc, p, root depth, efficiency | Source strip, Show the math | Cited table values or documented midpoints | Cited constant / cited default | Each source with table and page number; "cited default" for efficiency | Site-specific soil or sprinkler measurements |
| TAW, RAW, skip threshold, projected depletion | Show the math | Pure calculation from constants + weather + profile | Calculated (model) | Formula and stored engine values shown | Measured soil moisture |
| Baseline event depth | Show the math | `precipitation_rate_mm_per_hour × baseline_minutes ÷ 60` | Calculated from user-reported values | Shown in mm and minutes | A verified application rate |
| Recommended depth | Hero, Show the math | `min(max_projection ÷ efficiency, baseline depth)` | Calculated (estimate) | Formula shown; "calculated" tag | A guaranteed optimal depth |
| Recommended runtime | Hero | `depth ÷ precipitation_rate × 60` | Calculated (estimate) | Formula shown in minutes | That the timer was changed |
| Was the advice followed? | Confirmation card | Homeowner taps "Yes" or "No" | User-reported | "A confirmation is not proof that the cycle ran, and no water flow is measured." | That the irrigation cycle actually ran |
| Baseline volume | Water Savings | `baseline_minutes ÷ 60 × rate × area` | Estimated | "Estimates, not measurements." | Metered baseline use |
| Recommended volume | Water Savings | `recommended_minutes ÷ 60 × rate × area` | Estimated | Shown per confirmed event | Metered use |
| Estimated water avoided | Water Savings, dashboard preview | `(baseline − recommended) ÷ 60 × rate × area`, confirmed + followed only | Estimated | "estimate, not measured"; "not guaranteed water savings" | Measured savings, bill reduction, or environmental outcome |
| Avoided percentage | Water Savings | Avoided volume ÷ baseline volume for confirmed events | Calculated from estimates | "share avoided" for the selected window | A measured reduction |
| Actual water use | Water Savings ("Estimated vs. measured" card) | Nothing — no flow meter, water bill, or soil sensor | Unavailable | "Not available" | Any measured-use number |

## Worked example

QA profile: 120 m², fescue (cool season), loam, 30 mm/h precipitation rate, 60 min baseline, 3 events/week, last watered 2026-11-03.

Live engine output for 2026-11-04 was REDUCE at 45 min (22.3 mm recommended depth).

```
recommended volume = 45 / 60 × 30 mm/h × 120 m² = 2,700 L
baseline volume    = 60 / 60 × 30 mm/h × 120 m² = 3,600 L
avoided            = 15 / 60 × 30 mm/h × 120 m² =   900 L
```

These are **estimates derived from the reported precipitation rate**, not measurements. API snapshot taken 2026-11-04 (the confirmed total also includes three earlier 44-min QA events; unconfirmed QA visits contribute zero and the pending count grows by one on every live recommendation fetch):

```
confirmed_count: 4
pending_count:   21 (QA residue; excluded from every total)
estimated_baseline_litres:    14,400
estimated_recommended_litres: 10,620
estimated_water_avoided_litres: 3,780
estimated_avoided_percent:      26.25
```

## Rules the code and UI follow

- Only **confirmed** recommendations count toward savings; unconfirmed ones are listed as pending.
- A confirmation is self-reported and is not evidence that water flowed.
- No litres are shown without a precipitation rate and lawn area; the runtime itself never depends on them.
- No confidence percentage is generated.
- Sources appear only when they actually fed the calculation; product policies are labelled separately.
- Nothing is cached weather presented as live; the freshness panel shows retrieval time, observation coverage, forecast coverage, and the horizon used.
- The exact product statement is shown on the dashboard, recommendation explanation, and relevant notes:
  **"GreenFlow provides irrigation advice. It does not control or modify your irrigation timer."**

## What would make these measurements

These are not implemented; they are listed so the distinction is explicit:

- A flow meter or dedicated irrigation water bill for actual volumes.
- Catch-cup tests for precipitation rate and distribution uniformity.
- A soil-moisture sensor for depletion.
- An on-site weather station or nearby official station for local ET₀ inputs.
- Timer telemetry for proof that a cycle ran.
