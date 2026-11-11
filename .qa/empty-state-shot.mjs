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
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  return result.result.value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fs = await import("node:fs");

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:5173/#dashboard" });
await wait(3000);
await evaluate("localStorage.clear(); location.reload(); true");
await wait(3500);

const state = await evaluate(`({
  hash: location.hash,
  storage: Object.keys(localStorage),
  headline: document.querySelector('.gf-hero__state')?.textContent?.trim() ?? null,
  buttons: [...document.querySelectorAll('.gf-hero__actions a, .gf-hero__actions button')].map((n) => n.textContent.trim()),
  note: document.querySelector('.gf-hero__demo-note')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
  overflow: document.documentElement.scrollWidth > window.innerWidth,
})`);
console.log(JSON.stringify(state));

const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(".qa/empty-state-demo-button.png", Buffer.from(shot.data, "base64"));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
