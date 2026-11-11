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
  height: 1200,
  deviceScaleFactor: 1,
  mobile: false,
});

async function go(hash, ms = 7000) {
  await send("Page.navigate", { url: `http://127.0.0.1:5173/${hash}` });
  await wait(ms);
}

// 1. savings: is the by-day chart actually drawn, and where does a zero appear?
await go("#water-savings");
const savings = await evaluate(`(() => {
  const text = (n) => (n ? n.innerText.replace(/\\s+/g, ' ').trim() : null);
  const chart = document.querySelector('.gf-sav-chart--live');
  const barNodes = chart
    ? [...chart.querySelectorAll('.recharts-bar-rectangle, .recharts-bar path, path')]
    : [];
  const zeros = [...document.querySelectorAll('.gf-sav-content *')].filter(
    (n) =>
      n.children.length === 0 &&
      /\\b0\\s*(L|%|%)|\\b0%\\b/.test(n.innerText || ''),
  );
  return {
    chartPresent: Boolean(chart),
    chartFigureText: text(chart ? chart.closest('section') : null),
    barCount: barNodes.length,
    barBox: barNodes.slice(0, 4).map((n) => {
      const b = n.getBBox ? n.getBBox() : null;
      return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null;
    }),
    zeroNodes: zeros.map((n) => ({
      cls: n.className,
      value: text(n),
      row: text(n.closest('.gf-sav-row--live')),
    })),
    pendingText: [...document.querySelectorAll('.gf-sav-pending__item')].map((n) => text(n)),
  };
})()`);
console.log(JSON.stringify({ screen: 'savings', savings }, null, 1));
fs.writeFileSync('.qa/demo-savings-chart.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

// 2. recommendation page: everything except the feedback prompt populated?
await go('#recommendation');
const rec = await evaluate(`(() => {
  const text = (n) => (n ? n.innerText.replace(/\\s+/g, ' ').trim() : null);
  const cards = [...document.querySelectorAll('.gf-content section')].map((s) => ({
    title: text(s.querySelector('h1, h2')),
    chars: (s.innerText || '').length,
    sample: text(s).slice(0, 190),
  }));
  const empties = [...document.querySelectorAll('.gf-content *')].filter(
    (n) => n.children.length === 0 && /\\bnone\\b|no data|not available|unavailable|0%|\\b0\\s*L\\b/i.test(n.innerText || ''),
  );
  return { cards, empties: empties.map((n) => ({ cls: String(n.className), value: text(n) })) };
})()`);
console.log(JSON.stringify({ screen: 'recommendation', rec }, null, 1));
fs.writeFileSync('.qa/demo-recommendation-full.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
