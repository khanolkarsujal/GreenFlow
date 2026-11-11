# Calculation Specification

Status: approved by Morax on 2026-11-04.

Sections 1 to 5 are implemented by the Unit 4 engine
(`backend/app/engine/water_balance.py`). Section 6 is
implemented by the Unit 5 `estimate_savings` function
(`backend/app/engine/savings.py`). Section 7 lists constants
that remain unresolved; until a value is cited there, the
engine has no scientific defaults and every value must be
supplied in an explicit `EngineConfig`.

## 1. Principles

- The engine is pure: no network, no database, and no
  framework imports. It takes validated inputs and returns a
  result.
- All depths are in millimetres (mm), areas in square metres
  (m²), volumes in litres (L), and temperatures in degrees
  Celsius. Conversion happens at the API or UI edge.
- Every constant has a name, a unit, and either a cited
  source or the label "ASSUMPTION - source pending".
- The engine never fills in a missing scientific value. If a
  value is missing or invalid, it raises a named error.
- The recommendation is advisory. The engine never controls
  hardware.

## 2. Inputs

### 2.1 Weather inputs

From Open-Meteo through `backend/app/services/` only:

| Symbol        | Meaning                                   | Unit   | Source variable                    |
| ------------- | ----------------------------------------- | ------ | ---------------------------------- |
| `ET0_t`       | Reference evapotranspiration, day `t`     | mm/day | `et0_fao_evapotranspiration`       |
| `P_t`         | Precipitation, day `t`                    | mm/day | `precipitation_sum`                |
| `ET0_fc_k`    | Forecast ET₀, forecast day `k`            | mm/day | `et0_fao_evapotranspiration`       |
| `P_fc_k`      | Forecast precipitation, forecast day `k`  | mm/day | `precipitation_sum`                |

Observed and forecast days are passed as separate sequences.
Observed days are days up to and including today. Forecast
days are days 1 to `k` after today.

### 2.2 Property and schedule inputs

| Symbol         | Meaning                                          | Unit      |
| -------------- | ------------------------------------------------ | --------- |
| `A`            | Lawn area                                        | m²        |
| `I_t`          | Irrigation applied on day `t` (logged by user)   | mm        |
| `n_base`       | Baseline watering events per week                | events/wk |
| `I_base_event` | Baseline water depth per event                   | mm        |
| `N_days`       | Window for the savings calculation (Section 6)   | days      |

### 2.3 Onboarding inputs and initial depletion

Onboarding collects:

- `last_watered_on`: date of the most recent watering
- `last_watered_minutes`: duration of that watering
- `sprinkler_type`: choose from the supported list
  (**Decision needed from Morax**)
- `precipitation_rate_mm_per_hour` (`PR`): prefilled with the
  per-type default from Section 7 and editable by the user
- `t_base_min`: usual minutes per watering event
- `n_base`: usual watering events per week

Derived values:

- `I_last = PR × last_watered_minutes / 60`
- `I_base_event = PR × t_base_min / 60` (or entered
  directly if the user knows the depth)

Initial depletion at the start of `last_watered_on`:

```
D_start = clamp(RAW - I_last, 0, TAW)
```

**ASSUMPTION:** at the start of `last_watered_on`, before
that watering, the root zone was at the refill point (RAW).
This is the least arbitrary starting point available without
a longer watering history.

Rules:

- Walk observed days starting at `last_watered_on`, inclusive.
- Do not add `I_last` again during the walk; it is already
  reflected in `D_start`. The day's own `ET0` and rain do
  apply.
- If `last_watered_on` is unknown or older than the available
  observed weather window, onboarding must ask the user to
  choose a date from the available window. There is no silent
  fallback. **Decision needed from Morax.**

**ASSUMPTION:** the reported duration corresponds to an
actual application at `PR`. If the user ran the zone for a
different time than usual, the derived depth is still an
estimate.

## 3. Soil Water Balance

### 3.1 Capacity

```
TAW = (theta_fc - theta_wp) × Zr × 1000
RAW = p × TAW
```

- `theta_fc`: volumetric water content at field capacity
  (m³/m³)
- `theta_wp`: volumetric water content at permanent wilting
  point (m³/m³)
- `Zr`: effective root depth (m)
- `1000`: mm per metre (unit conversion, not a scientific
  constant)
- `p`: depletion fraction at which stress begins

### 3.2 Daily update (observed days)

```
ETc_t   = Kc × ET0_t
P_eff_t = min(P_t, max(0, D_{t-1}))
D_t     = clamp(D_{t-1} + ETc_t - P_eff_t - I_t, 0, TAW)
```

- `Kc`: crop coefficient for the lawn
- Only rainfall up to the current depletion can refill the
  root zone; excess rainfall is assumed to drain.
- Irrigation `I_t` is the gross depth logged by the user.
- `D_t` is never below 0 (no negative depletion) and never
  above `TAW` (excess drains).

## 4. Forecast Projection and Decision Horizon

Let `H` be the number of forecast days considered:

```
H_raw = ceil(7 / n_base)
H     = min(H_cap, max(1, H_raw))
```

`H` is the number of days until the user's next scheduled
watering under the baseline schedule, capped for stability.

- `7`: days per week (structural)
- `H_cap`: **ASSUMPTION - source pending.** Proposed value 7,
  because the weather client supplies 7 forecast days. Must
  not exceed the available forecast days.
- `H_min = 1`: **ASSUMPTION**, so the horizon is never empty.

Forecast depletion, starting from today's depletion `D_t`:

```
D_fc_0 = D_t
D_fc_k = clamp(D_fc_{k-1} + Kc × ET0_fc_k - min(P_fc_k, max(0, D_fc_{k-1})), 0, TAW)
```

No irrigation is assumed on forecast days.

The projected maximum depletion over the decision horizon is:

```
D_proj_max = max(D_fc_1, ..., D_fc_H)
```

**`D_t` is deliberately excluded.** Including today's
depletion would return WATER whenever the lawn is currently
dry, even if heavy rain is forecast tomorrow, so SKIP would
never fire for the case the forecast is meant to handle.

If fewer than `H` forecast days are available, the engine
raises an error and the API returns the "Cannot recommend"
state.

## 5. Recommendation

```
T_skip = f_skip × RAW
I_rec  = min(D_proj_max / eff_irrigation, I_max)
```

Decision order:

1. If `D_proj_max <= T_skip`: **SKIP**, `I_rec = 0`.
2. Otherwise, if `I_rec >= I_base_event`: **WATER**.
3. Otherwise: **REDUCE**.

- `eff_irrigation`: irrigation efficiency, the fraction of
  applied water that reaches the root zone
- `I_max`: maximum depth the product will recommend in one
  event, so advice stays realistic for a normal run
- `f_skip`: fraction of RAW below which no watering is
  recommended
- WATER means apply at least a normal event. REDUCE means
  apply `I_rec`, which is less than a normal event.

The result also returns `TAW`, `RAW`, `T_skip`, `H`, the
projected depletion series `D_fc_1 ... D_fc_H`, and
`D_proj_max`, so the recommendation can be explained.

## 6. Estimated Savings (Unit 5)

Implemented by `estimate_savings` in
`backend/app/engine/savings.py`. It is separate from the
Unit 4 recommendation engine.

Inputs:

| Symbol                  | Meaning                                              | Unit      |
| ----------------------- | ---------------------------------------------------- | --------- |
| `I_base_event`          | Baseline applied depth per event                     | mm        |
| `n_base`                | Baseline events per week                             | events/wk |
| `N_days`                | Window length                                        | days      |
| `A`                     | Lawn area                                            | m²        |
| `recommended_depth_d`   | Applied depth recommended for day `d` (0 if none)    | mm        |
| `eff_irrigation`        | Irrigation efficiency used by the engine             | -         |

```
N_base_events = n_base × N_days / 7
V_base        = I_base_event × N_base_events × A
V_rec         = Σ recommended_depth_d × A
V_avoided     = max(0, V_base - V_rec)
```

- `V_base`, `V_rec`, and `estimated_water_avoided_l` are in
  litres (1 mm over 1 m² is 1 L).
- The recommended series has exactly `N_days` entries, one
  per day in the window, in order. A day with no watering is
  `0`.
- Recommended depths are applied depths produced by the
  engine (`I_rec`, or 0). Because `I_rec` is already divided
  by `eff_irrigation`, efficiency is not applied a second
  time. The efficiency is stored with the estimate and shown
  with the assumptions.
- `V_avoided` is clamped at 0; it is never reported as
  negative.
- The result exposes the baseline event depth, events per
  week, events in the window, window length, lawn area,
  irrigation efficiency, both volumes, the estimate, and the
  assumption texts for the UI.

Every figure is labeled **Estimated**, with the baseline and
assumptions visible. Names and strings use "estimated water
avoided", never "saved" or "measured".

**Decision needed from Morax:** which `N_days` window the
dashboard shows (for example 7 or 30 days). **Decision needed
from Morax:** how a follow-up ("followed / not followed")
should adjust the per-day recommended depths; currently the
series is taken as entered.

## 7. Constants

| Symbol          | Meaning                                  | Unit        | Value / status                    |
| --------------- | ---------------------------------------- | ----------- | --------------------------------- |
| `Kc`            | Lawn crop coefficient                    | -           | TBD - source pending              |
| `theta_fc`      | Field capacity                           | m³/m³       | TBD - source pending              |
| `theta_wp`      | Wilting point                            | m³/m³       | TBD - source pending              |
| `Zr`            | Effective root depth                     | m           | TBD - source pending              |
| `p`             | Depletion fraction at stress onset       | -           | TBD - source pending              |
| `f_skip`        | Skip threshold as a fraction of RAW      | -           | TBD - source pending              |
| `H_cap`         | Cap on the decision horizon              | days        | ASSUMPTION - source pending (7)   |
| `H_min`         | Minimum decision horizon                 | days        | ASSUMPTION (1)                    |
| `eff_irrigation`| Irrigation efficiency                    | -           | TBD - source pending              |
| `I_max`         | Maximum recommended depth per event      | mm          | TBD - source pending              |
| `PR_default`    | Default precipitation rate per sprinkler type | mm/h  | TBD - ASSUMPTION - source pending |
| `N_days`        | Savings window                           | days        | TBD - Decision needed from Morax  |
| `1000`          | Millimetres per metre                    | mm/m        | Structural unit conversion        |
| `7`             | Days per week                            | days        | Structural unit conversion        |

No value in this table may be hard-coded into the engine as
a scientific default. The engine receives every value in
`EngineConfig`; the API or onboarding layer supplies it from
this spec once the value is cited.

## 8. Validation

The engine validates its input and raises `EngineInputError`
(a named exception) for:

- Non-finite or negative `ET0`, precipitation, or irrigation
- `0 <= theta_wp < theta_fc <= 1`
- `Zr > 0`
- `Kc > 0`
- `0 < p <= 1`
- `0 <= f_skip <= 1`
- `n_base > 0`
- `H_cap >= 1`
- `0 < eff_irrigation <= 1`
- `I_max > 0`
- `I_base_event > 0`
- `0 <= initial_depletion <= TAW`
- Fewer forecast days than `H`
- A forecast day not marked as a forecast, or today marked as
  a forecast

Expected external failures (missing weather, provider
unavailable, insufficient forecast days) produce the
"Cannot recommend" state at the API layer. The engine does
not guess a recommendation.
