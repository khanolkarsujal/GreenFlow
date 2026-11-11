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
  const events = [];

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    if (message.method) events.push(message);
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

  return { ws, send, events };
}

async function audit({ label, hash, width, height, scrollTo, screenshot, secondaryScreenshot }) {
  const target = await openTarget();
  const { ws, send, events } = await connect(target.webSocketDebuggerUrl);

  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `http://127.0.0.1:5173/${hash}` });
    await new Promise((resolve) => setTimeout(resolve, 6000));

    if (scrollTo) {
      await send("Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(scrollTo)})?.scrollIntoView({ block: "start" })`,
        returnByValue: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    const { result } = await send("Runtime.evaluate", {
      expression: `(() => {
        const links = [...document.querySelectorAll("a")].map((a) => ({
          text: a.textContent.trim(),
          href: a.getAttribute("href"),
          ariaDisabled: a.getAttribute("aria-disabled"),
        }));
        const buttons = [...document.querySelectorAll("button")].map((b) => ({
          text: b.textContent.trim().slice(0, 40),
          disabled: b.disabled,
          type: b.type,
        }));
        const images = [...document.querySelectorAll("img")].map((img) => ({
          alt: img.alt,
          ok: img.complete && img.naturalWidth > 0,
        }));
        return {
          hash: location.hash,
          h1: document.querySelector("h1")?.textContent ?? null,
          nav: [...document.querySelectorAll("nav a")].map((a) => a.textContent.trim()),
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          chartSurfaces: document.querySelectorAll(".recharts-surface").length,
          links,
          buttons,
          images,
          tables: [...document.querySelectorAll("table")].map((t) => ({
            scrollWidth: t.scrollWidth,
            clientWidth: t.parentElement?.clientWidth ?? 0,
          })),
          placeholderText: /TODO|Lorem|Sample data|Sample values|Coming soon/i.test(document.body.innerText),
          bodySample: document.body.innerText.slice(0, 220).replace(/\\n+/g, " | "),
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

    if (secondaryScreenshot) {
      await send("Runtime.evaluate", {
        expression: `document.querySelector(".gf-math-chart")?.scrollIntoView({ block: "start" })`,
        returnByValue: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 700));
      const shot = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      fs.writeFileSync(secondaryScreenshot, Buffer.from(shot.data, "base64"));
    }

    const consoleErrors = events
      .filter(
        (event) =>
          (event.method === "Runtime.consoleAPICalled" &&
            ["error", "assert"].includes(event.params.type)) ||
          event.method === "Runtime.exceptionThrown" ||
          (event.method === "Log.entryAdded" && event.params.entry.level === "error"),
      )
      .map((event) => {
        if (event.method === "Runtime.exceptionThrown") {
          return event.params.exceptionDetails?.text ?? "exception";
        }
        if (event.method === "Log.entryAdded") return event.params.entry.text;
        return event.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
      });

    const httpErrors = events
      .filter(
        (event) =>
          event.method === "Network.responseReceived" &&
          event.params.response.status >= 400,
      )
      .map((event) => ({
        status: event.params.response.status,
        url: event.params.response.url,
      }));

    const failedRequests = events
      .filter((event) => event.method === "Network.loadingFailed")
      .map((event) => event.params.errorText);

    console.log(
      JSON.stringify({
        label,
        ...result.value,
        consoleErrors,
        httpErrors,
        failedRequests,
      }),
    );
  } catch (error) {
    console.log(JSON.stringify({ label, error: String(error) }));
  } finally {
    ws.close();
    await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
  }
}

const cases = [
  {
    label: "desktop-dashboard",
    hash: "#dashboard",
    width: 1440,
    height: 900,
    screenshot: ".qa/final-desktop-dashboard.png",
  },
  {
    label: "desktop-recommendation",
    hash: "#recommendation",
    width: 1440,
    height: 900,
    screenshot: ".qa/final-desktop-recommendation.png",
    secondaryScreenshot: ".qa/final-desktop-recommendation-chart.png",
  },
  {
    label: "desktop-savings",
    hash: "#water-savings",
    width: 1440,
    height: 900,
    screenshot: ".qa/final-desktop-savings.png",
  },
  {
    label: "desktop-profile",
    hash: "#lawn-profile",
    width: 1440,
    height: 900,
    screenshot: ".qa/final-desktop-profile.png",
  },
];

for (const testCase of cases) {
  await audit(testCase);
}
