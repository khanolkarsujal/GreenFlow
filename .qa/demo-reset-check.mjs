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
  const m = JSON.parse(event.data);
  if (m.id && waiting.has(m.id)) {
    const { res } = waiting.get(m.id);
    waiting.delete(m.id);
    res(m.result);
  }
};
const send = (method, params = {}) => {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res) => waiting.set(id, { res }));
};
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
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

// The demo profile is still stored from the previous run.
await goto(`${APP}/#dashboard`);
for (let i = 0; i < 20; i += 1) {
  await wait(1000);
  if (await evaluate(`Boolean(document.querySelector('.gf-hero'))`)) break;
}
await wait(2500);
log({
  phase: "beforeReset",
  buttons: await evaluate(
    `[...document.querySelectorAll('button')].map((b) => b.innerText.replace(/\\s+/g,' ').trim()).filter(Boolean)`,
  ),
});

const clicked = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((n) => /reset demo/i.test(n.innerText));
  if (!b) return 'missing';
  b.click();
  return 'clicked';
})()`);
log({ phase: "resetDemo", clicked });
for (let i = 0; i < 25; i += 1) {
  await wait(1200);
  const state = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((n) => /(load demo account|reset demo|resetting)/i.test(n.innerText));
    return b ? b.innerText.replace(/\\s+/g,' ').trim() : null;
  })()`);
  if (state === "Load demo account") break;
}
log({
  phase: "afterResetDashboard",
  buttons: await evaluate(
    `[...document.querySelectorAll('button')].map((b) => b.innerText.replace(/\\s+/g,' ').trim()).filter(Boolean)`,
  ),
  demoError: await evaluate(
    `(document.querySelector('.gf-hero__demo-error') || {}).innerText || null`,
  ),
});

// Savings page after reset: demo profile has no confirmed rows, so the hero
// must fall back to the simulated replay and make no demo claim.
await goto(`${APP}/#water-savings`);
for (let i = 0; i < 30; i += 1) {
  await wait(1500);
  if (await evaluate(`Boolean(document.querySelector('.gf-sav-hero__value strong'))`)) break;
}
await wait(4000);
log({
  phase: "savingsAfterReset",
  dump: await evaluate(`(() => {
    const text = (n) => (n ? n.innerText.replace(/\\s+/g, ' ').trim() : null);
    return {
      heroPill: text(document.querySelector('.gf-sav-hero__top')),
      heroLabel: text(document.querySelector('.gf-sav-hero__kicker')),
      heroValue: text(document.querySelector('.gf-sav-hero__value')),
      heroDemoNote: text(document.querySelector('.gf-sav-hero__demo-note')),
      averagesCard: text(document.querySelector('.gf-sav-averages')),
      confirmedOnlyCard: text(document.querySelector('.gf-sav-confirmed-only')),
    };
  })()`),
});
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(".qa/demo-after-reset.png", Buffer.from(shot.data, "base64"));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
