const CDP = "http://127.0.0.1:9222";
const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws failed")); });
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
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1100, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:5173/#water-savings" });
await wait(12000);
const order = await evaluate(`(() => {
  const content = document.querySelector('.gf-sav-content');
  const kids = [...content.children].map((n) => n.className || n.tagName);
  const hero = document.querySelector('.gf-sav-hero');
  const panel = document.querySelector('.gf-bt');
  return {
    kids,
    heroBeforePanel: !!(hero && panel) && hero.compareDocumentPosition(panel) === Node.DOCUMENT_POSITION_FOLLOWING,
    heroValue: document.querySelector('.gf-sav-hero__value strong')?.textContent ?? null,
    panelValue: document.querySelector('.gf-bt-figure strong')?.textContent ?? null,
    gaugeVisible: !!document.querySelector('.gf-sav-gauge, [class*=gauge]'),
  };
})()`);
console.log(JSON.stringify(order, null, 1));
await evaluate("window.scrollTo(0, 0); true");
await wait(400);
const shot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs");
fs.writeFileSync(".qa/backtest-panel-top.png", Buffer.from(shot.data, "base64"));
ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
