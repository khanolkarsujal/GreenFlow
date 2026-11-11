const CDP = "http://127.0.0.1:9222";
const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error("ws failed"));
});

let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { res, rej } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? rej(new Error(JSON.stringify(message.error))) : res(message.result);
  }
};
const send = (method, params = {}) => {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
};
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const goto = async (url) => {
  await send("Page.navigate", { url: "about:blank" });
  await wait(400);
  await send("Page.navigate", { url });
  await wait(2500);
};

await send("Page.enable");
await send("Runtime.enable");

// 1. Explanation page: it either replays the stored recommendation or
// calculates a new one, then records it as the pointer.
await goto("http://localhost:5173/#recommendation");
await wait(12000);

const readWhy = await evaluate(`({
  hash: location.hash,
  h1: document.querySelector('h1')?.textContent?.trim() ?? null,
  volumes: [...document.querySelectorAll('.gf-rec-volumes dt')].map((dt, i) => ({
    label: dt.textContent.trim(),
    value: dt.nextElementSibling?.textContent?.trim() ?? null,
  })),
  durations: [...document.querySelectorAll('.gf-rec-durations:not(.gf-rec-volumes) div')].map((d) => ({
    label: d.querySelector('span')?.textContent?.trim() ?? null,
    value: d.querySelector('strong')?.textContent?.trim() ?? null,
  })),
  note: document.querySelector('.gf-rec-volumes__note')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
  drift: document.querySelector('.gf-rec-drift')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
  pointerId: (() => {
    try { return JSON.parse(localStorage.getItem('greenflow.last-recommendation.v1') ?? 'null')?.id ?? null; }
    catch { return null; }
  })(),
  backendId: (() => {
    try { return JSON.parse(localStorage.getItem('greenflow.lawn-profile.v2') ?? 'null')?.backendId ?? null; }
    catch { return null; }
  })(),
})`);
console.log("WHY PAGE   " + JSON.stringify(readWhy, null, 2));

// 2. Dashboard: it replays that same stored recommendation by id.
await goto("http://localhost:5173/#dashboard");
await wait(9000);

const readDashboard = await evaluate(`({
  hash: location.hash,
  stats: [...document.querySelectorAll('.gf-hero__stat')].map((s) => ({
    label: s.querySelector('span')?.textContent?.trim() ?? null,
    value: s.querySelector('strong')?.textContent?.trim() ?? null,
    detail: s.querySelector('p')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
  })),
  pointerId: (() => {
    try { return JSON.parse(localStorage.getItem('greenflow.last-recommendation.v1') ?? 'null')?.id ?? null; }
    catch { return null; }
  })(),
  drift: document.querySelector('.gf-note[role="note"]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
  profileCache: (() => {
    try {
      const p = JSON.parse(localStorage.getItem('greenflow.lawn-profile.v2') ?? 'null');
      return { areaM2: p?.lawnArea?.areaM2, rate: p?.precipitationRateMmPerHour, baseline: p?.wateringDurationMinutes };
    } catch { return null; }
  })(),
})`);
console.log("DASHBOARD  " + JSON.stringify(readDashboard, null, 2));

const byLabel = (rows) => Object.fromEntries(rows.map((r) => [r.label, r.value]));
const whyMap = byLabel(readWhy.volumes ?? []);
const dashMap = byLabel(
  (readDashboard.stats ?? []).filter((s) => s.label && s.label.includes("Water")),
);

console.log("COMPARISON " + JSON.stringify({ why: whyMap, dashboard: dashMap }));

const shared = Object.keys(whyMap).filter((label) => label in dashMap);
const mismatched = shared.filter((label) => whyMap[label] !== dashMap[label]);

// The dashboard states the advice's own avoided volume in the savings
// sentence; it must be the same figure the explanation page shows.
const avoidedLabel = "Water avoided by this advice";
const sentence = await evaluate("document.body.innerText");
const dashAvoided =
  /advice alone is ([0-9,.]+) L/.exec(sentence)?.[1]?.replace(/,/g, "") ?? null;
const whyAvoided = (whyMap[avoidedLabel] ?? "").replace(/,/g, "").replace(" L", "");

console.log(
  JSON.stringify(
    {
      samePointer: readWhy.pointerId === readDashboard.pointerId,
      pointerId: readWhy.pointerId,
      labelsCompared: shared,
      mismatched,
      dashboardAvoidedSentence: dashAvoided,
      explanationAvoidedVolume: whyAvoided,
      verdict:
        shared.length >= 2 &&
        mismatched.length === 0 &&
        readWhy.pointerId === readDashboard.pointerId &&
        dashAvoided === whyAvoided
          ? "PASS: both screens show the same volumes for the same recommendation"
          : "FAIL: the screens disagree",
    },
    null,
    2,
  ),
);

import fs from "node:fs";

const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(".qa/ssot-dashboard.png", Buffer.from(shot.data, "base64"));
console.log("screenshot .qa/ssot-dashboard.png");
