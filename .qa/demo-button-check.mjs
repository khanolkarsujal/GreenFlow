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

await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:5173/#dashboard" });
await wait(3000);
await evaluate("localStorage.clear(); location.reload(); true");
await wait(3500);

const empty = await evaluate(`({
  hash: location.hash,
  h1: document.querySelector('h1')?.textContent ?? null,
  buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean),
  demoNote: document.querySelector('.gf-hero__demo-note')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
})`);
console.log(JSON.stringify({ phase: "empty", ...empty }));

const clicked = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Try a demo lawn'));
  if (!button) return false;
  button.click();
  return true;
})()`);
console.log(JSON.stringify({ phase: "clicked", clicked }));

await wait(9000);

const after = await evaluate(`({
  hash: location.hash,
  h1: document.querySelector('h1')?.textContent ?? null,
  state: document.querySelector('.gf-hero__state, .gf-rec-state, [data-state]')?.textContent?.trim() ?? null,
  text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 700),
  storage: Object.keys(localStorage),
  profile: JSON.parse(localStorage.getItem('greenflow.lawn-profile.v2') || 'null'),
  errorAlerts: [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent.trim()),
})`);
console.log(JSON.stringify({ phase: "after", ...after }));

const screenshot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs");
fs.writeFileSync(".qa/demo-button-recommendation.png", Buffer.from(screenshot.data, "base64"));

await evaluate("localStorage.clear(); true");
ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
