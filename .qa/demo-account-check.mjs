const CDP = "http://127.0.0.1:9222";
const APP = "http://localhost:5173";
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
const log = (o) => console.log(JSON.stringify(o));

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 1400,
  deviceScaleFactor: 1,
  mobile: false,
});

async function goto(url) {
  await send("Page.navigate", { url: "about:blank" });
  await wait(300);
  await send("Page.navigate", { url });
}

const STORE_KEY = "greenflow.lawn-profile.v2";

// 1. Dashboard with no stored profile: the "Load demo account" action must exist.
await goto(`${APP}/#dashboard`);
for (let i = 0; i < 20; i += 1) {
  await wait(1000);
  if (await evaluate(`Boolean(document.querySelector('.gf-dashboard'))`)) break;
}
const before = await evaluate(`(() => {
  const text = (n) => (n ? n.innerText.replace(/\\s+/g, ' ').trim() : null);
  return {
    stored: localStorage.getItem('${STORE_KEY}') || 'none',
    buttons: [...document.querySelectorAll('button')].map((b) => text(b)).filter(Boolean),
    demoNote: text(document.querySelector('.gf-hero__demo-note')),
  };
})()`);
log({ phase: "dashboardBeforeLoad", buttons: before.buttons, hasStored: before.stored !== "none" });

await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((n) => /load demo account/i.test(n.innerText));
  if (b) b.dataset.qa = 'load-demo';
  return Boolean(b);
})()`);
const clicked = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((n) => /load demo account/i.test(n.innerText));
  if (!b) return 'missing';
  b.click();
  return 'clicked';
})()`);
log({ phase: "loadDemoAccount", clicked });

// 2. Wait for the loader to finish and land on the savings page.
let landed = null;
for (let i = 0; i < 40; i += 1) {
  await wait(1500);
  landed = await evaluate(`({
    hash: window.location.hash,
    hero: Boolean(document.querySelector('.gf-sav-hero__value strong')),
  })`);
  if (landed.hash === "#water-savings" && landed.hero) break;
}
log({ phase: "afterLoad", landed });

const stored = await evaluate(`localStorage.getItem('${STORE_KEY}')`);
log({
  phase: "storedProfile",
  parsed: JSON.parse(stored || "null")
    ? {
        backendId: JSON.parse(stored).backendId,
        locationSource: JSON.parse(stored).location?.source,
        lawnArea: JSON.parse(stored).lawnArea,
        grassType: JSON.parse(stored).grassType,
      }
    : null,
});

// 3. Savings page dump: tag, note, hero value, averages.
const DUMP = `(() => {
  const text = (n) => (n ? n.innerText.replace(/\\s+/g, ' ').trim() : null);
  const averages = document.querySelector('.gf-sav-averages');
  const hero = document.querySelector('.gf-sav-hero');
  return {
    heroPill: text(document.querySelector('.gf-sav-hero__top')),
    heroLabel: text(document.querySelector('.gf-sav-hero__kicker')),
    heroValue: text(document.querySelector('.gf-sav-hero__value')),
    heroBanner: text(document.querySelector('.gf-sav-hero__banner')),
    heroDemoNote: text(document.querySelector('.gf-sav-hero__demo-note')),
    confirmBarWidth: (document.querySelector('.gf-sav-hero__bar-fill--confirmed') || {}).style?.width,
    ringPresent: Boolean(document.querySelector('.gf-sav-gauge')),
    shareAvoided: text(document.querySelector('.gf-sav-hero__aside-stats')),
    averagesCard: averages ? text(averages) : null,
    confirmedOnlyCard: text(document.querySelector('.gf-sav-confirmed-only')),
    dayEvents: [...document.querySelectorAll('.gf-sav-table tbody tr')].length,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  };
})()`;
const savingsDump = await evaluate(DUMP);
log({ phase: "savingsPage", dump: savingsDump });
await evaluate(`document.querySelector('.gf-sav-hero').scrollIntoView({block:'start'})`);
await wait(600);
const shot1 = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(".qa/demo-hero.png", Buffer.from(shot1.data, "base64"));
if (savingsDump.averagesCard) {
  await evaluate(`document.querySelector('.gf-sav-averages').scrollIntoView({block:'center'})`);
  await wait(600);
  const shot2 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(".qa/demo-averages.png", Buffer.from(shot2.data, "base64"));
}

// 4. Window switch: 7 and 90 days must still be demo-tagged and averaged.
const windows = await evaluate(`(async () => {
  const out = [];
  for (const sel of document.querySelectorAll('.gf-sav-window button, .gf-window-switch button')) {
    out.push(sel.innerText.trim());
  }
  return out;
})()`);
log({ phase: "windowButtons", windows });

// 5. Back to the dashboard: the demo control must now read "Reset demo".
await goto(`${APP}/#dashboard`);
for (let i = 0; i < 20; i += 1) {
  await wait(1000);
  if (await evaluate(`Boolean(document.querySelector('button'))`)) break;
}
await wait(3000);
const dashAfter = await evaluate(`(() => {
  const text = (n) => (n ? n.innerText.replace(/\\s+/g, ' ').trim() : null);
  return {
    buttons: [...document.querySelectorAll('button')].map((b) => text(b)).filter(Boolean),
    demoNote: text(document.querySelector('.gf-hero__demo-note')),
    demoError: text(document.querySelector('.gf-hero__demo-error')),
    headline: text(document.querySelector('.gf-hero__value')),
  };
})()`);
log({ phase: "dashboardAfterLoad", dump: dashAfter });
const shot3 = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(".qa/demo-dashboard-controls.png", Buffer.from(shot3.data, "base64"));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
