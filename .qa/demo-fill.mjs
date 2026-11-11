// Drives the real GreenFlow flow against the demo lawn so the demo has
// genuine, engine-computed rows created today. Every action here is the same
// HTTP call the app itself makes; nothing is written to the database directly.
const BASE = process.env.API_BASE ?? "http://127.0.0.1:8000";
const PROFILE_ID =
  process.env.DEMO_PROFILE_ID ?? "d7e2447f-0362-4daf-92b1-85ec24ed4307";

async function call(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!response.ok) {
    console.log(`${method} ${path} -> HTTP ${response.status}`);
    console.log(JSON.stringify(json, null, 2));
    process.exitCode = 1;
    return null;
  }
  return json;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "profile": {
    const p = await call("GET", `/profiles/${PROFILE_ID}`);
    if (p) console.log(JSON.stringify(p, null, 2));
    break;
  }
  case "rec": {
    const r = await call("GET", `/profiles/${PROFILE_ID}/recommendation`);
    if (r) {
      console.log(
        JSON.stringify(
          {
            recommendation_id: r.id,
            state: r.state,
            recommended_minutes: r.recommended_minutes,
            baseline_minutes: r.baseline_minutes,
            recommended_depth_mm: r.recommended_depth_mm,
            initial_depletion_mm: r.initial_depletion_mm,
            horizon_days: r.horizon_days,
            reason: r.reason,
          },
          null,
          2,
        ),
      );
    }
    break;
  }
  case "confirm": {
    const f = await call("POST", `/recommendations/${args[0]}/feedback`, {
      followed: args[1] === "true",
    });
    if (f) {
      console.log(
        JSON.stringify(
          {
            recommendation_id: f.recommendation_id,
            state: f.state,
            followed: f.followed,
            baseline_minutes: f.baseline_minutes,
            recommended_minutes: f.recommended_minutes,
            avoided_minutes: f.avoided_minutes,
            estimated_water_avoided_litres: f.estimated_water_avoided_litres,
            confirmed_at: f.confirmed_at,
            already_confirmed: f.already_confirmed,
          },
          null,
          2,
        ),
      );
    }
    break;
  }
  case "log": {
    const p = await call("PATCH", `/profiles/${PROFILE_ID}`, {
      last_watered_date: today(),
      last_watered_minutes: Number(args[0]),
    });
    if (p) console.log(`logged watering: ${today()} ${args[0]} min`);
    break;
  }
  case "restore": {
    const p = await call("PATCH", `/profiles/${PROFILE_ID}`, {
      last_watered_date: args[0],
      last_watered_minutes: Number(args[1]),
    });
    if (p) console.log(`restored: ${args[0]} ${args[1]} min`);
    break;
  }
  case "savings": {
    const s = await call(
      "GET",
      `/profiles/${PROFILE_ID}/savings?window_days=30`,
    );
    if (s) {
      console.log(
        JSON.stringify(
          {
            confirmed: s.confirmed_count,
            followed: s.followed_count,
            not_followed: s.not_followed_count,
            pending: s.pending_count,
            baseline_l: s.estimated_baseline_litres,
            recommended_l: s.estimated_recommended_litres,
            avoided_l: s.estimated_water_avoided_litres,
            avoided_pct: s.estimated_avoided_percent,
            events: s.events.map((e) => ({
              state: e.state,
              followed: e.followed,
              min: `${e.baseline_minutes}->${e.recommended_minutes}`,
              avoided_l: e.estimated_water_avoided_litres,
              at: e.confirmed_at,
            })),
          },
          null,
          2,
        ),
      );
    }
    break;
  }
  default:
    console.log("usage: demo-fill.mjs profile|rec|confirm <id> <bool>|log <min>|restore <date> <min>|savings");
    process.exitCode = 2;
}
