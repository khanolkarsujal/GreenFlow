"""Read-only audit experiment 3: exact reproduction of the two seeded
demo profiles, plus scenarios defined by applied depth relative to demand.
"""

import json
import sys
from datetime import date

sys.path.insert(0, "../backend")

from app.engine.backtest import HistoryDay, baseline_schedule_dates  # noqa: E402

SQFT_TO_M2 = 0.09290304
ROOT, EFF, SKIP_FRACTION = 0.15, 0.60, 0.50
SOIL = {"sandy": (0.12, 0.045), "loamy": (0.25, 0.12)}
GRASS = {"zoysia": (0.85, 0.50), "fescue": (0.95, 0.40)}

om = json.load(open("om-forecast-93.json"))["daily"]
HISTORY = [
    HistoryDay(
        date=date.fromisoformat(om["time"][i]),
        et0_mm=om["et0_fao_evapotranspiration"][i],
        precipitation_mm=om["precipitation_sum"][i],
    )
    for i in range(30)
]
TOTAL_ET0 = sum(h.et0_mm for h in HISTORY)
TOTAL_RAIN = sum(h.precipitation_mm for h in HISTORY)


def replay(*, area, grass, soil, rate, minutes, per_week, anchor, credit_gross):
    kc, p = GRASS[grass]
    fc, wp = SOIL[soil]
    taw = (fc - wp) * ROOT * 1000.0
    raw = p * taw
    skip = SKIP_FRACTION * raw
    event_mm = rate * minutes / 60.0
    dates = baseline_schedule_dates(
        anchor=anchor, events_per_week=per_week,
        window_start=HISTORY[0].date, window_end=HISTORY[-1].date,
    )
    d = raw
    v_base = v_rec = 0.0
    counts = {"SKIP": 0, "REDUCE": 0, "WATER": 0}
    for day in HISTORY:
        applied = 0.0
        if day.date in dates:
            if d <= skip:
                state = "SKIP"
            else:
                need = min(d / EFF, event_mm)
                state, applied = ("WATER", event_mm) if need >= event_mm else ("REDUCE", need)
            counts[state] += 1
            v_base += event_mm * area
            v_rec += applied * area
        refill = applied if credit_gross else applied * EFF
        peff = min(day.precipitation_mm, max(0.0, d))
        d = min(max(d + kc * day.et0_mm - peff - refill, 0.0), taw)
    return {
        "scheduled": sum(counts.values()), "counts": counts,
        "baseline_l": v_base, "recommended_l": v_rec, "avoided_l": v_base - v_rec,
        "percent": (v_base - v_rec) / v_base * 100.0 if v_base else 0.0,
        "taw": taw, "raw": raw, "skip": skip, "event_mm": event_mm,
    }


print("[A] exact reproduction against the running API")
for label, kwargs, api in [
    ("cf363adb 93 m2 zoysia sandy 10min 7/wk anchor 2026-11-04",
     dict(area=93.0, grass="zoysia", soil="sandy", rate=30.0, minutes=10, per_week=7,
          anchor=date(2026, 11, 4)),
     "13950.0 / 8354.5 / 5595.5 (40.11%)  S12/R2/W16"),
    ("demo-austin-lawn 120 m2 fescue loamy 30min 3/wk anchor 2026-11-05",
     dict(area=120.0, grass="fescue", soil="loamy", rate=30.0, minutes=30, per_week=3,
          anchor=date(2026, 11, 5)),
     "23400.0 / 12398.4 / 11001.6 (47.02%)  S4/R7/W2"),
]:
    cur = replay(**kwargs, credit_gross=True)
    cor = replay(**kwargs, credit_gross=False)
    print(f"\n  {label}")
    print(f"    API says        {api}")
    print(f"    script current  {cur['baseline_l']} / {round(cur['recommended_l'],4)} / "
          f"{round(cur['avoided_l'],4)} ({round(cur['percent'],4)}%)  "
          f"S{cur['counts']['SKIP']}/R{cur['counts']['REDUCE']}/W{cur['counts']['WATER']} "
          f"scheduled {cur['scheduled']}")
    print(f"    script corrected {cor['baseline_l']} / {round(cor['recommended_l'],4)} / "
          f"{round(cor['avoided_l'],4)} ({round(cor['percent'],4)}%)  "
          f"S{cor['counts']['SKIP']}/R{cor['counts']['REDUCE']}/W{cor['counts']['WATER']}")

print("\n[B] scenarios by applied depth relative to 30-day demand (Austin, Oct 6 - Nov 4)")
for grass, soil in (("zoysia", "sandy"), ("fescue", "loamy")):
    kc, p = GRASS[grass]
    demand = TOTAL_ET0 * kc
    print(f"\n  {grass} on {soil}: ETc = {TOTAL_ET0:.2f} x {kc} = {demand:.2f} mm over 30 d "
          f"({demand / 30:.2f} mm/day); rain {TOTAL_RAIN:.2f} mm")
    for name, ratio in (("Efficient", 0.85), ("Typical", 1.40), ("Overwatering", 2.20)):
        gross_mm = demand * ratio
        per_week = 2
        minutes = gross_mm / 30 * 7 / per_week / (30.0 / 60.0)
        event_mm = 30.0 * minutes / 60.0
        area = 1000 * SQFT_TO_M2
        r = replay(area=area, grass=grass, soil=soil, rate=30.0, minutes=round(minutes),
                   per_week=per_week, anchor=date(2026, 11, 4), credit_gross=False)
        minutes = round(minutes)
        event_mm = 30.0 * minutes / 60.0
        print(f"    {name:<14} {ratio:>4.2f}x demand  {minutes:>3} min x {per_week}/wk = "
              f"{event_mm:>5.2f} mm/session  gross {event_mm * per_week * 30 / 7:>6.2f} mm/30d  "
              f"baseline {r['baseline_l']:>9.1f} L  avoided {r['avoided_l']:>8.1f} L "
              f"({r['percent']:>5.2f}%)  S{r['counts']['SKIP']}/R{r['counts']['REDUCE']}"
              f"/W{r['counts']['WATER']}")

print("\n[C] can the engine ever advise MORE than the baseline?")
for minutes in (5, 10, 20):
    r = replay(area=92.90, grass="zoysia", soil="sandy", rate=30.0, minutes=minutes,
               per_week=2, anchor=date(2026, 11, 4), credit_gross=False)
    demand = TOTAL_ET0 * 0.85
    print(f"  {minutes:>3} min x 2/wk = {30 * minutes / 60:.2f} mm/session = "
          f"{30 * minutes / 60 * 2 * 30 / 7:.2f} mm gross/30d vs ETc {demand:.2f} mm  "
          f"-> avoided {r['avoided_l']:>8.1f} L ({r['percent']:>5.2f}%). "
          f"A deficit this large cannot be reported: I_max caps at the baseline event.")
