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
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const width = Number(process.argv[2] ?? 1280);
const height = Number(process.argv[3] ?? 1200);
const out = process.argv[4] ?? ".qa/backtest-panel-desktop.png";

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 700,
});
await send("Page.navigate", { url: "http://127.0.0.1:5173/#water-savings" });
await wait(2500);

const stored = await evaluate(
  `localStorage.getItem('greenflow.lawn-profile.v2') || 'none'`,
);
console.log(JSON.stringify({ phase: "storage", hasProfile: stored !== "none" }));

let panel = null;
for (let attempt = 0; attempt < 20; attempt += 1) {
  panel = await evaluate(`(() => {
    const card = document.querySelector('.gf-bt');
    if (!card) return null;
    const figure = card.querySelector('.gf-bt-figure strong');
    if (!figure) return { status: card.innerText.slice(0, 160).replace(/\\s+/g, ' ') };
    return {
      status: 'ready',
      tag: card.querySelector('.gf-bt-tag')?.innerText.replace(/\\s+/g, ' ') ?? null,
      headline: figure.innerText,
      headlineCaption: card.querySelector('.gf-bt-figure span')?.innerText.replace(/\\s+/g, ' ') ?? null,
      stats: [...card.querySelectorAll('.gf-bt-stats div')].map((n) =>
        n.innerText.replace(/\\s+/g, ' ').trim(),
      ),
      days: card.querySelectorAll('.gf-bt-day').length,
      legend: [...card.querySelectorAll('.gf-bt-legend li')].map((n) => n.innerText.trim()),
      footnote: card.querySelector('.gf-bt-footnote')?.innerText.replace(/\\s+/g, ' ') ?? null,
      confirmedHeadline: document
        .querySelector('.gf-sav-hero__value strong')
        ?.innerText ?? null,
      confirmedKicker: document
        .querySelector('.gf-sav-hero__kicker')
        ?.innerText.replace(/\\s+/g, ' ') ?? null,
    };
  })()`);
  if (panel && panel.status === "ready") break;
  await wait(1500);
}

console.log(JSON.stringify({ phase: "panel", width, panel }, null, 1));

const scroll = await evaluate(`(() => {
  const card = document.querySelector('.gf-bt');
  if (!card) return 'no card';
  card.scrollIntoView({ block: 'start' });
  return 'scrolled';
})()`);
await wait(600);

const shot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs");
fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(JSON.stringify({ phase: "screenshot", scroll, out }));

const overflow = await evaluate(
  `document.documentElement.scrollWidth > window.innerWidth ? document.documentElement.scrollWidth : 'no horizontal overflow'`,
);
console.log(JSON.stringify({ phase: "overflow", overflow }));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
