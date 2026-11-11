// Points the QA browser at a profile that has no confirmed savings, so the
// hero must fall back to the simulated replay, then restores the original
// stored profile.
const CDP = "http://127.0.0.1:9222";
const API = "http://127.0.0.1:8000";
const ALT_PROFILE = process.argv[2] ?? "7fe28a61-c9a9-498f-ae3f-19659dfe5126";

const target = await (
  await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error("ws failed"));
});
let nextId = 0;
const waiting = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && waiting.has(message.id)) {
    const { res } = waiting.get(message.id);
    waiting.delete(message.id);
    res(message.result);
  }
};
const send = (method, params = {}) => {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res) => waiting.set(id, { res }));
};
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import("node:fs");

const profile = await (await fetch(`${API}/profiles/${ALT_PROFILE}`)).json();
const storedProfile = {
  backendId: profile.id,
  lawnArea: { value: profile.lawn_area_m2, unit: "sqm", areaM2: profile.lawn_area_m2 },
  location: {
    label: profile.location_label,
    latitude: profile.latitude,
    longitude: profile.longitude,
    source: "manual",
  },
  grassType: "fescue",
  soilType: "loamy",
  sprinklerType: "rotor",
  precipitationRateMmPerHour: profile.precipitation_rate_mm_per_hour,
  wateringDurationMinutes: profile.baseline_minutes_per_event,
  wateringFrequency: "two-three-times",
  eventsPerWeek: profile.events_per_week,
  lastWateredDate: profile.last_watered_date,
  lastWateredMinutes: profile.last_watered_minutes,
  savedAt: new Date().toISOString(),
};

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 1250,
  deviceScaleFactor: 1,
  mobile: false,
});

await send("Page.navigate", { url: "http://127.0.0.1:5173/#water-savings" });
await wait(3000);
const before = await evaluate(`localStorage.getItem('greenflow.lawn-profile.v2') || 'none'`);
await evaluate(
  `localStorage.setItem('greenflow.lawn-profile.v2', ${JSON.stringify(
    JSON.stringify(storedProfile),
  )}); 'switched'`,
);

await send("Page.navigate", { url: "about:blank" });
await wait(400);
await send("Page.navigate", { url: "http://127.0.0.1:5173/#water-savings" });
for (let i = 0; i < 24; i += 1) {
  await wait(1500);
  const ready = await evaluate(
    `Boolean(document.querySelector('.gf-sav-hero__value strong') && document.querySelector('.gf-bt-figure strong'))`,
  );
  if (ready) break;
}

const dump = await evaluate(`(() => {
  const text = (n) => (n ? n.innerText.replace(/\\s+/g, ' ').trim() : null);
  const card = document.querySelector('.gf-sav-confirmed-only');
  const expander = document.querySelector('.gf-sav-expander');
  if (expander) expander.open = true;
  return {
    profileId: ${JSON.stringify(profile.id)},
    renderedProfileCode: text(document.querySelector('.gf-sav-content code')),
    storedProfileId: (JSON.parse(localStorage.getItem('greenflow.lawn-profile.v2') || '{}') || {}).backendId || null,
    heroPill: text(document.querySelector('.gf-sav-hero__top')),
    heroLabel: text(document.querySelector('.gf-sav-hero__kicker')),
    heroLabelTransform: document.querySelector('.gf-sav-hero__kicker')
      ? getComputedStyle(document.querySelector('.gf-sav-hero__kicker')).textTransform
      : null,
    contentStart: text(document.querySelector('.gf-sav-content') || document.body).slice(0, 420),
    heroValue: text(document.querySelector('.gf-sav-hero__value')),
    heroBanner: text(document.querySelector('.gf-sav-hero__banner')),
    heroCaption: text(document.querySelector('.gf-sav-hero__caption')),
    compare: [...document.querySelectorAll('.gf-sav-hero__compare div')].map(text),
    ringPresent: Boolean(document.querySelector('.gf-sav-gauge')),
    barPresent: Boolean(document.querySelector('.gf-sav-hero__bar')),
    legend: [...document.querySelectorAll('.gf-sav-hero__legend li')].map(text),
    asideStats: [...document.querySelectorAll('.gf-sav-hero__aside-stats div')].map(text),
    confirmedOnlyCard: card
      ? {
          header: text(card.querySelector('.gf-card__header')),
          value: text(card.querySelector('.gf-sav-confirmed-only__value')),
          caption: text(card.querySelector('.gf-sav-confirmed-only__caption')),
          chips: [...card.querySelectorAll('.gf-sav-confirmed-only__chips li')].map(text),
        }
      : null,
    expanderBody: text(expander ? expander.querySelector('.gf-sav-expander__body') : null),
    backtestHeadline: text(document.querySelector('.gf-bt-figure strong')),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  };
})()`);
console.log(JSON.stringify({ dump }, null, 1));

await evaluate(`document.querySelector('.gf-sav-hero')?.scrollIntoView({block:'start'}) ?? 'no hero'`);
await wait(700);
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(".qa/hero-simulated.png", Buffer.from(shot.data, "base64"));

await evaluate(
  before === "none"
    ? `localStorage.removeItem('greenflow.lawn-profile.v2'); 'removed'`
    : `localStorage.setItem('greenflow.lawn-profile.v2', ${JSON.stringify(before)}); 'restored'`,
);
console.log(JSON.stringify({ phase: "storage", restored: before !== "none" }));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
