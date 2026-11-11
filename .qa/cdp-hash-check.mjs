const CDP = "http://127.0.0.1:9222";

async function openTarget() {
  const response = await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" });
  if (!response.ok) throw new Error(`new target failed: ${response.status}`);
  return response.json();
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("websocket failed"));
  });

  let nextId = 0;
  const pending = new Map();

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  };

  function send(method, params = {}) {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }, 20000);
      pending.set(id, { resolve, reject, timer });
    });
  }

  return { ws, send };
}

const hashes = [
  "#dashboard",
  "#lawn-profile",
  "#water-savings",
  "#recommendation",
  "#weather-intelligence",
  "#settings",
  "#lawn-setup",
  "#history",
];

for (const hash of hashes) {
  const target = await openTarget();
  const { ws, send } = await connect(target.webSocketDebuggerUrl);
  try {
    await send("Page.enable");
    await send("Page.navigate", { url: `http://127.0.0.1:5173/${hash}` });
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const { result } = await send("Runtime.evaluate", {
      expression: `({
        requested: ${JSON.stringify(hash)},
        finalHash: location.hash,
        h1: document.querySelector("h1")?.textContent ?? null,
        nav: [...document.querySelectorAll("nav a")].map((a) => a.textContent.trim()),
      })`,
      returnByValue: true,
    });
    console.log(JSON.stringify(result.value));
  } catch (error) {
    console.log(JSON.stringify({ requested: hash, error: String(error) }));
  } finally {
    ws.close();
    await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
  }
}
