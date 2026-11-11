// Creates the demo lawn profile on the 127.0.0.1 origin through the dashboard button.
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

await send("Page.enable");
await send("Page.navigate", { url: "http://127.0.0.1:5173/#dashboard" });
await wait(4500);

const clicked = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Try a demo lawn'),
  );
  if (!button) return 'no demo button';
  button.click();
  return 'clicked';
})()`);
console.log(JSON.stringify({ phase: "demo", clicked }));

await wait(9000);

const state = await evaluate(`({
  hash: location.hash,
  backendId: JSON.parse(localStorage.getItem('greenflow.lawn-profile.v2') || 'null')?.backendId ?? null,
  headline: document.querySelector('h1')?.textContent ?? null,
})`);
console.log(JSON.stringify({ phase: "after", ...state }));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
