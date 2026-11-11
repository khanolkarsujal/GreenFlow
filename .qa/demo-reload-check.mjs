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
const buttons = () =>
  evaluate(
    `[...document.querySelectorAll('button')].map((b) => b.innerText.replace(/\\s+/g,' ').trim()).filter(Boolean)`,
  );

// Demo rows were reset by the previous run, so the demo profile is stored but empty.
await goto(`${APP}/#dashboard`);
for (let i = 0; i < 25; i += 1) {
  await wait(1200);
  if ((await buttons()).length > 0) break;
}
await wait(4000);
log({ phase: "demoProfileWithNoRows", buttons: await buttons() });

const clicked = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((n) => /load demo account/i.test(n.innerText));
  if (!b) return 'missing';
  b.click();
  return 'clicked';
})()`);
log({ phase: "reload", clicked });
for (let i = 0; i < 40; i += 1) {
  await wait(1500);
  if (await evaluate(`Boolean(document.querySelector('.gf-sav-hero__value strong'))`)) break;
}
log({ phase: "landedOnSavings" });
await goto(`${APP}/#dashboard`);
for (let i = 0; i < 25; i += 1) {
  await wait(1200);
  if ((await buttons()).length > 0) break;
}
await wait(4000);
log({ phase: "afterReload", buttons: await buttons() });
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(".qa/demo-reload-button.png", Buffer.from(shot.data, "base64"));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
