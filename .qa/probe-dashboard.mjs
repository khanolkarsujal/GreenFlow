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
await send("Page.navigate", { url: process.argv[2] });
await wait(3000);
const info = await evaluate(`({
  url: location.href,
  hash: location.hash,
  h1: document.querySelector('h1')?.textContent ?? null,
  buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 20),
  keys: Object.keys(localStorage),
  hero: document.querySelector('.gf-hero')?.className ?? null,
})`);
console.log(JSON.stringify(info, null, 1));
ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
