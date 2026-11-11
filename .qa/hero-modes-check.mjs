const CDP = "http://127.0.0.1:9222";
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

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 1250,
  deviceScaleFactor: 1,
  mobile: false,
});

const DUMP = `(() => {
  const text = (n) => (n ? n.innerText.replace(/\\s+/g, ' ').trim() : null);
  const hero = document.querySelector('.gf-sav-hero');
  const card = document.querySelector('.gf-sav-confirmed-only');
  const expander = document.querySelector('.gf-sav-expander');
  if (expander) expander.open = true;
  const computed = (sel, prop) => {
    const n = document.querySelector(sel);
    return n ? getComputedStyle(n)[prop] : null;
  };
  return {
    profileId: (JSON.parse(localStorage.getItem('greenflow.lawn-profile.v2') || '{}') || {}).backendId || null,
    heroPill: text(document.querySelector('.gf-sav-hero__top')),
    heroLabel: text(document.querySelector('.gf-sav-hero__kicker')),
    heroLabelTransform: computed('.gf-sav-hero__kicker', 'textTransform'),
    heroValue: text(document.querySelector('.gf-sav-hero__value')),
    heroBanner: text(document.querySelector('.gf-sav-hero__banner')),
    compare: [...document.querySelectorAll('.gf-sav-hero__compare div')].map(text),
    ringPresent: Boolean(document.querySelector('.gf-sav-gauge')),
    barPresent: Boolean(document.querySelector('.gf-sav-hero__bar')),
    legend: [...document.querySelectorAll('.gf-sav-hero__legend li')].map(text),
    asideStats: [...document.querySelectorAll('.gf-sav-hero__aside-stats div')].map(text),
    confirmedOnlyCard: card
      ? {
          value: text(card.querySelector('.gf-sav-confirmed-only__value')),
          caption: text(card.querySelector('.gf-sav-confirmed-only__caption')),
          chips: [...card.querySelectorAll('.gf-sav-confirmed-only__chips li')].map(text),
        }
      : null,
    expanderSummary: text(expander ? expander.querySelector('summary') : null),
    expanderBody: text(expander ? expander.querySelector('.gf-sav-expander__body') : null),
    backtestPanelHeadline: text(document.querySelector('.gf-bt-figure strong')),
    backtestBanner: text(document.querySelector('.gf-bt-tag')),
    dayChartEmpty: Boolean(document.querySelector('.gf-sav-chart .gf-sav-inline-empty')),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  };
})()`;

async function savingsDump(label, file) {
  await send("Page.navigate", { url: "http://127.0.0.1:5173/#water-savings" });
  for (let i = 0; i < 24; i += 1) {
    await wait(1500);
    const ready = await evaluate(
      `Boolean(document.querySelector('.gf-sav-hero__value strong') && document.querySelector('.gf-bt-figure strong'))`,
    );
    if (ready) break;
  }
  const dump = await evaluate(DUMP);
  console.log(JSON.stringify({ label, dump }, null, 1));
  await evaluate(`document.querySelector('.gf-sav-hero').scrollIntoView({block:'start'})`);
  await wait(700);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
  return dump;
}

const stored = await (async () => {
  await send("Page.navigate", { url: "http://127.0.0.1:5173/#dashboard" });
  await wait(4000);
  return evaluate(`localStorage.getItem('greenflow.lawn-profile.v2') || 'none'`);
})();
console.log(JSON.stringify({ phase: "storedProfileBefore", stored }));

await savingsDump("confirmed-hero", ".qa/hero-confirmed.png");

// Create a fresh demo lawn: no confirmations, so the hero must fall back to the replay.
await send("Page.navigate", { url: "http://127.0.0.1:5173/#dashboard" });
await wait(4500);
const clicked = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((n) =>
    /try a demo lawn/i.test(n.innerText),
  );
  if (!button) return 'no demo button';
  button.click();
  return 'clicked';
})()`);
console.log(JSON.stringify({ phase: "demoLawn", clicked }));
await wait(6000);
await savingsDump("zero-confirmed-hero", ".qa/hero-simulated.png");

if (stored && stored !== "none") {
  await evaluate(
    `localStorage.setItem('greenflow.lawn-profile.v2', ${JSON.stringify(stored)}); 'restored'`,
  );
  console.log(JSON.stringify({ phase: "storage", action: "restored previous demo profile" }));
}

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
