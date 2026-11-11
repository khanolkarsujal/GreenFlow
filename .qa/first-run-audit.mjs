const CDP = "http://127.0.0.1:9222";

async function openTarget() {
  const response = await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" });
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
      const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 20000);
      pending.set(id, { resolve, reject, timer });
    });
  }
  return { ws, send };
}

for (const hash of ["#dashboard", "#recommendation", "#water-savings"]) {
  const target = await openTarget();
  const { ws, send } = await connect(target.webSocketDebuggerUrl);
  try {
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: `http://localhost:5173/${hash}` });
    await new Promise((resolve) => setTimeout(resolve, 4500));
    const { result } = await send("Runtime.evaluate", {
      expression: `({
        hash: location.hash,
        h1: document.querySelector("h1")?.textContent ?? null,
        storage: Object.keys(localStorage),
        text: document.body.innerText.slice(0, 900).replace(/\\n+/g, " | "),
        links: [...document.querySelectorAll("a")].map((a) => a.textContent.trim()),
        alerts: [...document.querySelectorAll("[role=alert]")].map((n) => n.textContent.trim()),
      })`,
      returnByValue: true,
    });
    console.log(JSON.stringify({ requested: hash, ...result.value }));
  } catch (error) {
    console.log(JSON.stringify({ requested: hash, error: String(error) }));
  } finally {
    ws.close();
    await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
  }
}
