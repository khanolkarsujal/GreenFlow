const CDP = "http://127.0.0.1:9222";
const t = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error("ws"));
});
let id = 0;
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
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res, rej) => pending.set(i, { res, rej }));
};
await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:5173/#water-savings" });
await new Promise((resolve) => setTimeout(resolve, 4500));
const r = await send("Runtime.evaluate", {
  expression: "document.body.innerText",
  returnByValue: true,
});
console.log(String(r.result.value).split("\n").filter(Boolean).join(" | ").slice(0, 2000));
ws.close();
await fetch(`${CDP}/json/close/${t.id}`).catch(() => {});
