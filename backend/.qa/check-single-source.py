"""Live check: one recommendation, one set of numbers on every endpoint."""

import json
import urllib.request

BASE = "http://127.0.0.1:8000"
PROFILE = "be036506-29ca-4a91-8cd6-2957cfd72493"


def request(path, method="GET", payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        BASE + path,
        method=method,
        data=body,
        headers={"Content-Type": "application/json"} if body else {},
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.status, json.loads(response.read().decode())


def main():
    print("=" * 72)
    _, original = request(f"/profiles/{PROFILE}/recommendation")
    print(f"[1] generated      id={original['id']}")
    print(f"    state={original['state']}  depth={original['recommended_depth_mm']:.4f} mm"
          f"  minutes={original['recommended_minutes']}")
    print(f"    area={original['lawn_area_m2']} m2  rate={original['precipitation_rate_mm_per_hour']} mm/h")
    print(f"    baseline={original['baseline_water_litres']:.4f} L  "
          f"recommended={original['recommended_water_litres']:.4f} L  "
          f"avoided={original['avoided_water_litres']:.4f} L")

    reconciliation = (
        original["baseline_water_litres"]
        - original["recommended_water_litres"]
        - original["avoided_water_litres"]
    )
    print(f"    baseline - recommended - avoided = {reconciliation:.12f}")

    _, replayed = request(f"/recommendations/{original['id']}")
    print(f"[2] GET /recommendations/{{id}} identical to the generated body: "
          f"{json.dumps(replayed, sort_keys=True) == json.dumps(original, sort_keys=True)}")

    _, patched = request(f"/profiles/{PROFILE}", "PATCH", {"lawn_area_m2": 240.0})
    print(f"[3] profile edited: lawn_area_m2 {patched['lawn_area_m2']} m2")

    _, edited = request(f"/profiles/{PROFILE}/recommendation")
    print(f"    new recommendation id={edited['id']}  same as before: {edited['id'] == original['id']}")
    print(f"    area={edited['lawn_area_m2']} m2  baseline={edited['baseline_water_litres']:.4f} L  "
          f"recommended={edited['recommended_water_litres']:.4f} L")
    ratio = edited["baseline_water_litres"] / original["baseline_water_litres"]
    print(f"    baseline volume scaled by {ratio:.6f}x when the lawn doubled")

    _, old_again = request(f"/recommendations/{original['id']}")
    print(f"    the original id still replays its own figures: "
          f"{json.dumps(old_again, sort_keys=True) == json.dumps(original, sort_keys=True)}")

    if edited["avoided_water_litres"] > 0:
        _, feedback = request(f"/recommendations/{edited['id']}/feedback", "POST", {"followed": True})
        print(f"[4] confirmation   avoided={feedback['estimated_water_avoided_litres']:.4f} L  "
              f"matches the recommendation: "
              f"{abs(feedback['estimated_water_avoided_litres'] - edited['avoided_water_litres']) < 1e-9}")
    else:
        print("[4] this recommendation avoids no water, so the confirmation check is skipped")

    _, savings = request(f"/profiles/{PROFILE}/savings?window_days=30")
    matches = [
        event
        for event in savings["events"]
        if event["recommendation_id"] == edited["id"]
    ]
    if matches:
        event = matches[0]
        print(f"[5] savings event for the same id: baseline={event['estimated_baseline_litres']:.4f} L  "
              f"recommended={event['estimated_recommended_litres']:.4f} L  "
              f"avoided={event['estimated_water_avoided_litres']:.4f} L")
        print(f"    equals the recommendation figures: "
              f"{abs(event['estimated_water_avoided_litres'] - edited['avoided_water_litres']) < 1e-9}")
    else:
        print(f"[5] {savings['confirmed_count']} confirmed rows in the window, none for this new id")

    minutes_drift = (
        max(0, edited["baseline_minutes"] - edited["recommended_minutes"]) / 60
        * edited["precipitation_rate_mm_per_hour"]
        * edited["lawn_area_m2"]
        - edited["avoided_water_litres"]
    )
    print(f"    what the old minutes round trip would have shown: "
          f"{minutes_drift:+.4f} L off")

    request(f"/profiles/{PROFILE}", "PATCH", {"lawn_area_m2": 120.0})
    print("[6] profile restored to 120 m2")
    print("=" * 72)


if __name__ == "__main__":
    main()
