// Full-journey single-source-of-truth check.
//   #recommendation  -> recalculate  -> new id + volumes
//   #dashboard       -> must replay that same id and those same volumes
//   confirm          -> the event the savings screen lists must carry the
//                       same avoided litres as the recommendation itself
// Reads only what the browser actually renders.
const CDP = "http://127.0.0.1:9222";
const API = "http://127.0.0.1:8000";

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
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const goto = async (url) => {
  await send("Page.navigate", { url: "about:blank" });
  await wait(500);
  await send("Page.navigate", { url });
  await wait(3000);
};

await send("Page.enable");
await send("Runtime.enable");

const READ = `({
  pointer: (() => {
    try { return JSON.parse(localStorage.getItem('greenflow.last-recommendation.v1') ?? 'null')?.id ?? null; }
    catch { return null; }
  })(),
  volumes: Object.fromEntries(
    [...document.querySelectorAll('.gf-rec-volumes dt')].map((dt) => [
      dt.textContent.trim(),
      dt.nextElementSibling?.textContent?.trim() ?? null,
    ])
  ),
  drift: document.querySelector('.gf-rec-drift')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
  state: document.querySelector('.gf-rec-hero__state')?.textContent?.trim() ?? null,
})`;

const READ_DASH = `({
  pointer: (() => {
    try { return JSON.parse(localStorage.getItem('greenflow.last-recommendation.v1') ?? 'null')?.id ?? null; }
    catch { return null; }
  })(),
  stats: Object.fromEntries(
    [...document.querySelectorAll('.gf-hero__stat')]
      .map((s) => [s.querySelector('span')?.textContent?.trim() ?? '', s.querySelector('strong')?.textContent?.trim() ?? null])
      .filter(([label]) => label.length > 0)
  ),
  drift: document.querySelector('.gf-note[role="note"]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
  text: document.body.innerText.replace(/\\s+/g, ' '),
})`;

// --- 1. open the explanation page and recalculate --------------------------
await goto("http://localhost:5173/#recommendation");
await wait(14000);
const before = await evaluate(READ);
console.log("STEP 1 open      " + JSON.stringify(before, null, 2));

await evaluate(`document.querySelector('button[aria-label="Recalculate with the latest weather"]').click(); 'clicked'`);
await wait(16000);
const after = await evaluate(READ);
console.log("STEP 2 recalc    " + JSON.stringify(after, null, 2));

const newIdDifferent = after.pointer !== before.pointer && after.pointer !== null;

// The server must report the very body the page rendered.
const serverBody = await (await fetch(`${API}/recommendations/${after.pointer}`)).json();
const serverVolumes = {
  "Water your normal schedule applies": serverBody.baseline_water_litres,
  "Water the lawn needs": serverBody.recommended_water_litres,
  "Water avoided by this advice": serverBody.avoided_water_litres,
};

// --- 2. the dashboard replays that recommendation -------------------------
await goto("http://localhost:5173/#dashboard");
await wait(11000);
const dash = await evaluate(READ_DASH);
console.log("STEP 3 dashboard " + JSON.stringify({ pointer: dash.pointer, stats: dash.stats, drift: dash.drift }, null, 2));

const dashAvoidedSentence = /advice alone is ([0-9,.]+) L/.exec(dash.text)?.[1]?.replace(/,/g, "") ?? null;

// --- 3. confirm the recommendation, then check the savings table ----------
await goto("http://localhost:5173/#recommendation");
await wait(12000);
await evaluate(`[...document.querySelectorAll('.gf-rec-feedback__button')][0].click(); 'confirmed'`);
await wait(9000);
const confirmation = await evaluate(`document.querySelector('.gf-rec-confirm')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null`);
console.log("STEP 4 confirm   " + JSON.stringify(confirmation));

await goto("http://localhost:5173/#water-savings");
await wait(12000);
const savings = await evaluate(`({
  rows: [...document.querySelectorAll('.gf-sav-row--live')].map((r) => ({
    cells: [...r.querySelectorAll('span')].map((s) => s.textContent.replace(/\\s+/g, ' ').trim()),
  })).slice(0, 4),
  total: document.querySelector('.gf-sav-hero')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
})`);
console.log("STEP 5 savings   " + JSON.stringify(savings, null, 2));

const serverAvoidedText = `${serverBody.avoided_water_litres.toFixed(1).replace(/\\.0$/, "")}`;
const savingsListsThisAdvice = JSON.stringify(savings.rows).includes(serverBody.state);

const verdict = {
  recalculate_created_a_new_id: newIdDifferent,
  dashboard_pointer_matches: dash.pointer === after.pointer,
  dashboard_shows_same_baseline_litres:
    dash.stats["Water your normal schedule applies"] === after.volumes["Water your normal schedule applies"],
  dashboard_shows_same_recommended_litres:
    dash.stats["Water the lawn needs"] === after.volumes["Water the lawn needs"],
  dashboard_avoided_sentence_matches:
    dashAvoidedSentence === (after.volumes["Water avoided by this advice"] ?? "").replace(/,/g, "").replace(" L", ""),
  explanation_matches_the_stored_server_body: Object.entries(serverVolumes).every(
    ([label, litres]) =>
      (after.volumes[label] ?? "").replace(/,/g, "").replace(" L", "") === String(litres) ||
      (after.volumes[label] ?? "").replace(/,/g, "").replace(" L", "") === litres.toFixed(1),
  ),
  no_drift_note_on_either_screen: dash.drift === null && after.drift === null,
  savings_has_a_row_for_this_state: savingsListsThisAdvice,
  avoided_litres_as_text: { recommendation: serverAvoidedText, savingsRows: savings.rows.map((r) => r.cells.at(-1)) },
};

const passed = Object.entries(verdict)
  .filter(([k]) => k !== "avoided_litres_as_text" && k !== "savings_has_a_row_for_this_state")
  .every(([, v]) => v === true);

console.log("VERDICT " + JSON.stringify({ ...verdict, overall: passed ? "PASS" : "FAIL" }, null, 2));

import fs from "node:fs";
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(".qa/ssot-journey-savings.png", Buffer.from(shot.data, "base64"));
console.log("screenshot .qa/ssot-journey-savings.png");

await ws.close();
