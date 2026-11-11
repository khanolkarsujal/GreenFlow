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

const fs = await import("node:fs");

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});

async function screen(hash, waitMs = 6000) {
  await send("Page.navigate", { url: `http://127.0.0.1:5173/${hash}` });
  await wait(waitMs);
  const report = await evaluate(`(() => {
    const text = (node) => (node ? node.innerText.replace(/\\s+/g, ' ').trim() : null);
    const body = document.body.innerText;
    return {
      url: location.hash,
      emptyStateNodes: [
        ...document.querySelectorAll('.gf-sav-inline-empty, .gf-empty, [class*="__empty"]'),
      ].map((n) => text(n).slice(0, 140)),
      avoidedHeadline: text(document.querySelector('.gf-sav-hero__value strong')),
      avoidedUnit: text(document.querySelector('.gf-sav-hero__value span')),
      compare: [...document.querySelectorAll('.gf-sav-hero__compare div')].map((n) => text(n)),
      gauge: text(document.querySelector('.gf-sav-gauge__center strong')),
      asideStats: [...document.querySelectorAll('.gf-sav-hero__aside-stats div')].map((n) => text(n)),
      confirmedRows: document.querySelectorAll('.gf-sav-row--live').length,
      pendingItems: document.querySelectorAll('.gf-sav-pending__item').length,
      chartBars: document.querySelectorAll('.gf-sav-chart--live rect.recharts-rectangle').length,
      backtestHeadline: text(document.querySelector('.gf-bt-figure strong')),
      recHeadline: text(document.querySelector('.gf-rec-hero strong, .gf-rec-state strong, h1')),
      mentionsZero: /\\b0\\s*(L|%)\\b/.test(body),
      mentionsNone: /\\bnone\\b|not loaded yet|unavailable/i.test(body),
    };
  })()`);
  return report;
}

const shots = [];
for (const [name, hash] of [
  ["savings", "#water-savings"],
  ["dashboard", "#dashboard"],
  ["recommendation", "#recommendation"],
]) {
  const report = await screen(hash);
  console.log(JSON.stringify({ name, report }, null, 1));
  await send("Page.captureScreenshot", { format: "png" }).then((shot) => {
    const file = `.qa/demo-filled-${name}.png`;
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    shots.push(file);
  });
}
console.log(JSON.stringify({ shots }));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
