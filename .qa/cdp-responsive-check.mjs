import fs from "node:fs";

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

async function checkPage({ url, width, height, screenshot, scrollTo }) {
  const target = await openTarget();
  const { ws, send } = await connect(target.webSocketDebuggerUrl);

  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await send("Page.navigate", { url });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    if (scrollTo) {
      await send("Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(scrollTo)})?.scrollIntoView({ block: "start" })`,
        returnByValue: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    const { result } = await send("Runtime.evaluate", {
      expression: `(() => {
        const nav = document.querySelector(".gf-nav-wrap");
        return {
          url: location.href,
          h1: document.querySelector("h1")?.textContent ?? null,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          nav: [...document.querySelectorAll("nav a")].map((a) => a.textContent.trim()),
          navBox: nav ? { scrollWidth: nav.scrollWidth, clientWidth: nav.clientWidth } : null,
          chartSurfaces: document.querySelectorAll(".recharts-surface").length,
          chartTicks: [...document.querySelectorAll(".recharts-cartesian-axis-tick-value")]
            .map((node) => node.textContent).filter(Boolean).slice(0, 16),
          alerts: [...document.querySelectorAll("[role=alert]")].map((node) => node.textContent.trim()),
          sampleData: /Sample data|Sample values|not live/i.test(document.body.innerText),
          bodyText: document.body.innerText.slice(0, 180).replace(/\\n+/g, " | ")
        };
      })()`,
      returnByValue: true,
    });

    if (screenshot) {
      const shot = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      fs.writeFileSync(screenshot, Buffer.from(shot.data, "base64"));
    }

    return result.value;
  } finally {
    ws.close();
    await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
  }
}

const cases = [
  {
    label: "mobile-dashboard",
    url: "http://127.0.0.1:5173/#dashboard",
    width: 390,
    height: 844,
    screenshot: ".qa/mobile-dashboard.png",
  },
  {
    label: "mobile-recommendation-chart",
    url: "http://127.0.0.1:5173/#recommendation",
    width: 390,
    height: 844,
    screenshot: ".qa/mobile-recommendation-chart.png",
    scrollTo: ".gf-math-chart",
  },
  {
    label: "mobile-water-savings",
    url: "http://127.0.0.1:5173/#water-savings",
    width: 390,
    height: 844,
    screenshot: ".qa/mobile-water-savings.png",
  },
  {
    label: "mobile-lawn-profile",
    url: "http://127.0.0.1:5173/#lawn-profile",
    width: 390,
    height: 844,
    screenshot: ".qa/mobile-lawn-profile.png",
  },
  {
    label: "desktop-recommendation-chart",
    url: "http://127.0.0.1:5173/#recommendation",
    width: 1280,
    height: 900,
    screenshot: ".qa/desktop-recommendation-chart.png",
    scrollTo: ".gf-math-chart",
  },
];

for (const testCase of cases) {
  const { label, ...options } = testCase;
  try {
    const value = await checkPage(options);
    console.log(JSON.stringify({ label, ...value }));
  } catch (error) {
    console.log(JSON.stringify({ label, error: String(error) }));
  }
}
