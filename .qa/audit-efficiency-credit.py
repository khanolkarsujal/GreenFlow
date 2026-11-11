"""Read-only audit experiment: replay the 30-day window with the current
water-balance credit and with the efficiency-corrected credit.

Nothing here is imported by the application. It exists to quantify the
difference between the shipped calculation and the proposed correction.
"""

import json
import sys
from datetime import date, timedelta

sys.path.insert(0, "../backend")

from app.engine.backtest import HistoryDay, baseline_schedule_dates  # noqa: E402
from app.engine.models import EngineConfig, IrrigationConstants  # noqa: E402
from app.engine.water_balance import compute_raw, compute_taw  # noqa: E402

AREA = 93.0
KC = 0.85  # zoysia -> warm-season turfgrass, FAO-56 Table 12
FC, WP = 0.12, 0.045  # sand, FAO-56 Table 19 midpoints
ROOT = 0.15
P = 0.50  # warm-season depletion fraction, FAO-56 Table 22
EFF = 0.60
SKIP_FRACTION = 0.50
BASELINE_MM = 5.0  # 10 min x 30 mm/h
EVENTS_PER_WEEK = 7
ANCHOR = date(2026, 11, 4)

om = json.load(open("om-forecast-93.json"))["daily"]
history = [
    HistoryDay(date=date.fromisoformat(om["time"][i]), et0_mm=om["et0_fao_evapotranspiration"][i],
               precipitation_mm=om["precipitation_sum"][i])
    for i in range(30)
]
window_start, window_end = history[0].date, history[-1].date

taw = (FC - WP) * ROOT * 1000.0
raw = P * taw
skip = SKIP_FRACTION * raw
i_max = BASELINE_MM
initial = raw

dates = baseline_schedule_dates(
    anchor=ANCHOR, events_per_week=EVENTS_PER_WEEK, window_start=window_start, window_end=window_end
)


def replay(label, credit_gross):
    d = initial
    v_base = v_rec = 0.0
    rows = []
    counts = {"SKIP": 0, "REDUCE": 0, "WATER": 0}
    for day in history:
        scheduled = day.date in dates
        applied = 0.0
        state = None
        d0 = d
        if scheduled:
            if d <= skip:
                state = "SKIP"
            else:
                need = min(d / EFF, i_max)
                if need >= BASELINE_MM:
                    state, applied = "WATER", BASELINE_MM
                else:
                    state, applied = "REDUCE", need
            counts[state] += 1
            v_base += BASELINE_MM * AREA
            v_rec += applied * AREA
        refill = applied if credit_gross else applied * EFF
        etc = KC * day.et0_mm
        peff = min(day.precipitation_mm, max(0.0, d))
        d = min(max(d + etc - peff - refill, 0.0), taw)
        rows.append((day.date.isoformat(), state, round(d0, 3), applied, round(d, 3)))
    print(f"\n=== {label} (irrigation credit {'gross' if credit_gross else 'x efficiency'}) ===")
    print("date        state  dep0    applied  dep1")
    for r in rows:
        print(f"{r[0]}  {(r[1] or '-').ljust(6)} {r[2]:6.3f}  {r[3]:7.3f}  {r[4]:6.3f}")
    print("events:", counts, "scheduled:", sum(counts.values()))
    print(f"baseline    = {v_base:10.2f} L")
    print(f"recommended = {v_rec:10.2f} L")
    print(f"avoided     = {v_base - v_rec:10.2f} L  ({(v_base - v_rec) / v_base * 100:.2f}%)")
    return v_base, v_rec


print(f"TAW {taw} mm, RAW {raw} mm, skip threshold {skip} mm, I_max {i_max} mm, start depletion {initial} mm")
print(f"30-day ET0 {sum(h.et0_mm for h in history):.2f} mm -> ETc {sum(h.et0_mm for h in history) * KC:.2f} mm")
print(f"30-day rain {sum(h.precipitation_mm for h in history):.2f} mm")
replay("CURRENT (shipped)", True)
replay("CORRECTED", False)
