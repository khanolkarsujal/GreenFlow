"""Read-only audit experiment 2: profile comparison, baseline scenarios,
area scaling, and the missing-observation path.

Not imported by the application. Produces the numbers quoted in the
validation audit report.
"""

import json
import sys
from datetime import date

sys.path.insert(0, "../backend")

from app.engine.backtest import HistoryDay, baseline_schedule_dates  # noqa: E402

SQFT_TO_M2 = 0.09290304
ANCHOR = date(2026, 11, 4)

om = json.load(open("om-forecast-93.json"))["daily"]
WEATHER = [
    (date.fromisoformat(om["time"][i]), om["precipitation_sum"][i], om["et0_fao_evapotranspiration"][i])
    for i in range(30)
]
HISTORY = [HistoryDay(date=d, et0_mm=e, precipitation_mm=p) for d, p, e in WEATHER]
TOTAL_ET0 = sum(w[2] for w in WEATHER)
TOTAL_RAIN = sum(w[1] for w in WEATHER)

SOIL = {"sandy": (0.12, 0.045), "loamy": (0.25, 0.12)}
GRASS = {"zoysia": (0.85, 0.50), "fescue": (0.95, 0.40)}
ROOT, EFF, SKIP_FRACTION = 0.15, 0.60, 0.50


def replay(*, area, grass, soil, rate, minutes, per_week, credit_gross, anchor=ANCHOR):
    kc, p = GRASS[grass]
    fc, wp = SOIL[soil]
    taw = (fc - wp) * ROOT * 1000.0
    raw = p * taw
    skip = SKIP_FRACTION * raw
    event_mm = rate * minutes / 60.0
    i_max = event_mm
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
                need = min(d / EFF, i_max)
                state, applied = ("WATER", event_mm) if need >= event_mm else ("REDUCE", need)
            counts[state] += 1
            v_base += event_mm * area
            v_rec += applied * area
        refill = applied if credit_gross else applied * EFF
        peff = min(day.precipitation_mm, max(0.0, d))
        d = min(max(d + kc * day.et0_mm - peff - refill, 0.0), taw)
    events = sum(counts.values())
    return {
        "area": area, "event_mm": event_mm, "taw": taw, "raw": raw, "skip": skip,
        "events": events, "counts": counts, "baseline_l": v_base, "recommended_l": v_rec,
        "avoided_l": v_base - v_rec,
        "percent": (v_base - v_rec) / v_base * 100.0 if v_base else 0.0,
    }


def show(tag, r):
    print(
        f"  {tag:<34} events {r['events']:>2}  "
        f"S{r['counts']['SKIP']:>2}/R{r['counts']['REDUCE']:>2}/W{r['counts']['WATER']:>2}  "
        f"base {r['baseline_l']:>9.1f} L  rec {r['recommended_l']:>9.1f} L  "
        f"avoided {r['avoided_l']:>8.1f} L ({r['percent']:>5.2f}%)"
    )


print(f"weather: 30 days {HISTORY[0].date} .. {HISTORY[-1].date}  "
      f"ET0 {TOTAL_ET0:.2f} mm  rain {TOTAL_RAIN:.2f} mm")

print("\n[1] existing vs corrected, the two live demo profiles")
for label, kwargs in [
    ("cf363adb 93 m2 zoysia 10min 7/wk", dict(area=93.0, grass="zoysia", soil="sandy",
                                              rate=30.0, minutes=10, per_week=7)),
    ("demo-austin-lawn 120 m2 fescue 30min 3/wk", dict(area=120.0, grass="fescue", soil="loamy",
                                                       rate=30.0, minutes=30, per_week=3)),
]:
    show("CURRENT " + label[:14], replay(**kwargs, credit_gross=True))
    show("CORRECTED " + label[:14], replay(**kwargs, credit_gross=False))

print("\n[2] three baseline scenarios, 1,000 sq ft (92.90 m2) zoysia/sandy, 30 mm/h")
ETC_WEEK = TOTAL_ET0 * GRASS["zoysia"][0] / 30.0 * 7.0
print(f"  weekly ETc = {TOTAL_ET0:.2f} mm x 0.85 / 30 d x 7 d = {ETC_WEEK:.2f} mm/week")
for name, minutes, per_week in [
    ("Efficient", 20, 2),
    ("Typical", 30, 3),
    ("Overwatering", 10, 7),
]:
    area = 1000 * SQFT_TO_M2
    event_mm = 30.0 * minutes / 60.0
    per_session = event_mm * area
    weekly = per_session * per_week
    monthly = per_session * (per_week * 30 / 7)
    eff_mm = event_mm * EFF * per_week
    r_cur = replay(area=area, grass="zoysia", soil="sandy", rate=30.0, minutes=minutes,
                   per_week=per_week, credit_gross=True)
    r_new = replay(area=area, grass="zoysia", soil="sandy", rate=30.0, minutes=minutes,
                   per_week=per_week, credit_gross=False)
    print(f"  {name:<13} {minutes:>2} min x {per_week}/wk  {event_mm:>5.2f} mm/session  "
          f"{per_session:>7.1f} L/session  {weekly:>8.1f} L/week  {monthly:>9.1f} L/30d  "
          f"effective {eff_mm:>5.2f} mm/wk vs ETc {ETC_WEEK:.2f} mm/wk  "
          f"| current avoided {r_cur['avoided_l']:>8.1f} L ({r_cur['percent']:>5.2f}%)  "
          f"corrected {r_new['avoided_l']:>8.1f} L ({r_new['percent']:>5.2f}%)")

print("\n[3] area scaling at a fixed schedule (20 min x 2/wk, zoysia/sandy)")
base_pct = None
for sqft in (500, 1000, 2500, 5000, 10000):
    area = sqft * SQFT_TO_M2
    r = replay(area=area, grass="zoysia", soil="sandy", rate=30.0, minutes=20,
               per_week=2, credit_gross=False)
    per_mm = area  # 1 mm over 1 m2 = 1 L
    if base_pct is None:
        base_pct = r["percent"]
    print(f"  {sqft:>6} sq ft = {area:>7.2f} m2   1 mm = {per_mm:>7.1f} L   "
          f"base {r['baseline_l']:>10.1f} L  rec {r['recommended_l']:>10.1f} L  "
          f"avoided {r['avoided_l']:>9.1f} L  {r['percent']:>6.3f}%  "
          f"S{r['counts']['SKIP']}/R{r['counts']['REDUCE']}/W{r['counts']['WATER']}")

print("\n[4] precipitation-rate scaling at a fixed depth target (1,000 sq ft, 2/wk)")
for rate in (15.0, 30.0, 60.0):
    minutes = 20.0 * 30.0 / rate
    r = replay(area=1000 * SQFT_TO_M2, grass="zoysia", soil="sandy", rate=rate,
               minutes=minutes, per_week=2, credit_gross=False)
    print(f"  {rate:>4.0f} mm/h x {minutes:>5.1f} min = {rate * minutes / 60:.2f} mm  "
          f"base {r['baseline_l']:>9.1f} L  avoided {r['avoided_l']:>8.1f} L ({r['percent']:.3f}%)")
