// Service worker update flow: sw.js lifecycle/fetch strategy and the page's update banner.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const swSource = fs.readFileSync(path.join(__dirname, "..", "docs", "sw.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");

let passed = 0, failed = 0;
const pending = [];
function test(name, fn) {
  pending.push(Promise.resolve().then(fn).then(
    () => { passed++; console.log("  ok - " + name); },
    (e) => { failed++; console.log("  FAIL - " + name); console.log("    " + e.message); }
  ));
}

/* ---------- sw.js in a fake worker scope ---------- */
function loadSW(opts) {
  opts = opts || {};
  const handlers = {};
  const calls = { skipWaiting: 0, claim: 0, deleted: [], put: [] };
  const store = Object.assign({}, opts.caches || {}); // name -> { url: body }
  const cacheObj = (name) => ({
    addAll: (urls) => { store[name] = store[name] || {}; urls.forEach((u) => { store[name][u] = "pre:" + u; }); return Promise.resolve(); },
    put: (req, res) => { calls.put.push(req.url); return Promise.resolve(); }
  });
  const sandbox = {
    URL,
    self: {
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: () => { calls.skipWaiting++; return Promise.resolve(); },
      clients: { claim: () => { calls.claim++; return Promise.resolve(); } }
    },
    caches: {
      open: (name) => Promise.resolve(cacheObj(name)),
      keys: () => Promise.resolve(Object.keys(store)),
      delete: (name) => { calls.deleted.push(name); delete store[name]; return Promise.resolve(true); },
      match: (req) => {
        const url = typeof req === "string" ? req : req.url;
        for (const name of Object.keys(store)) if (store[name][url]) return Promise.resolve({ body: store[name][url], cached: true });
        return Promise.resolve(undefined);
      }
    },
    fetch: opts.fetch || (() => Promise.resolve({ ok: true, body: "net", clone() { return this; } }))
  };
  vm.createContext(sandbox);
  vm.runInContext(swSource, sandbox);
  return { handlers, calls, store, sandbox };
}

function fire(sw, type, extra) {
  let waited = Promise.resolve(), responded = null;
  const event = Object.assign({
    waitUntil: (p) => { waited = p; },
    respondWith: (p) => { responded = p; }
  }, extra);
  sw.handlers[type](event);
  return { waited, get responded() { return responded; } };
}

const req = (url, mode) => ({ url: "https://example.test/app/" + url, method: "GET", mode: mode || "no-cors" });

console.log("sw.js");

test("install precaches and does not skipWaiting", async () => {
  const sw = loadSW();
  await fire(sw, "install").waited;
  assert.strictEqual(sw.calls.skipWaiting, 0);
  const name = Object.keys(sw.store)[0];
  assert.ok(/^mental-math-v\d+$/.test(name), name);
  assert.ok(sw.store[name]["./index.html"]);
});

test("SKIP_WAITING message calls skipWaiting; other messages do not", () => {
  const sw = loadSW();
  sw.handlers.message({ data: { type: "OTHER" } });
  assert.strictEqual(sw.calls.skipWaiting, 0);
  sw.handlers.message({ data: { type: "SKIP_WAITING" } });
  assert.strictEqual(sw.calls.skipWaiting, 1);
});

test("activate deletes every other cache, keeps the current one, then claims", async () => {
  const current = "mental-math-" + /CACHE_VERSION = "([^"]+)"/.exec(swSource)[1];
  const caches = { "mental-math-v1": {}, "mental-math-v15": {}, "something-else": {} };
  caches[current] = {};
  const sw = loadSW({ caches });
  await fire(sw, "activate").waited;
  assert.deepStrictEqual(Object.keys(sw.store), [current]);
  assert.strictEqual(sw.calls.deleted.length, 3);
  assert.strictEqual(sw.calls.claim, 1);
});

test("navigation is network-first and refreshes the cache", async () => {
  let fetched = 0;
  const sw = loadSW({
    caches: { "mental-math-old": { "https://example.test/app/": "stale" } },
    fetch: () => { fetched++; return Promise.resolve({ ok: true, body: "fresh", clone() { return this; } }); }
  });
  const e = fire(sw, "fetch", { request: req("", "navigate") });
  const res = await e.responded;
  assert.strictEqual(res.body, "fresh");
  assert.strictEqual(fetched, 1);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepStrictEqual(sw.calls.put, ["https://example.test/app/"]);
});

test("index.html is network-first too", async () => {
  const sw = loadSW({ caches: { c: { "https://example.test/app/index.html": "stale" } },
    fetch: () => Promise.resolve({ ok: true, body: "fresh", clone() { return this; } }) });
  assert.strictEqual((await fire(sw, "fetch", { request: req("index.html") }).responded).body, "fresh");
});

test("navigation falls back to the cached page offline", async () => {
  const sw = loadSW({ caches: { c: { "./index.html": "cached-page" } }, fetch: () => Promise.reject(new Error("offline")) });
  const res = await fire(sw, "fetch", { request: req("?x=1", "navigate") }).responded;
  assert.strictEqual(res.body, "cached-page");
});

test("icons and manifest are cache-first", async () => {
  let fetched = 0;
  const sw = loadSW({
    caches: { c: { "https://example.test/app/icon-192.png": "icon", "https://example.test/app/manifest.json": "man" } },
    fetch: () => { fetched++; return Promise.resolve({ ok: true, body: "net", clone() { return this; } }); }
  });
  assert.strictEqual((await fire(sw, "fetch", { request: req("icon-192.png") }).responded).body, "icon");
  assert.strictEqual((await fire(sw, "fetch", { request: req("manifest.json") }).responded).body, "man");
  assert.strictEqual(fetched, 0);
});

/* ---------- page side ---------- */
function makeEl() {
  return {
    style: {}, textContent: "", innerHTML: "", className: "", disabled: false,
    classList: { add() {}, remove() {} },
    appendChild() {}, removeChild() {}, setAttribute() {}, getAttribute() { return null; }
  };
}

function loadPage(newHtml) {
  const code = htmlSource.match(/<script>([\s\S]*?)<\/script>/)[1];
  const els = {};
  const swListeners = {};
  const docListeners = {};
  const reg = { waiting: null, installing: null, updates: 0, listeners: {},
    update() { this.updates++; return Promise.resolve(); },
    addEventListener(t, fn) { this.listeners[t] = fn; } };
  const reloads = [];
  const sandbox = {
    console,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      visibilityState: "visible",
      addEventListener: (t, fn) => { docListeners[t] = fn; },
      querySelectorAll: () => [],
      getElementById: (id) => els[id] || (els[id] = makeEl()),
      createElement: () => makeEl(),
      body: { appendChild() {}, removeChild() {} }
    },
    navigator: {
      serviceWorker: {
        controller: {},
        registerArgs: null,
        register(url, o) { this.registerArgs = [url, o]; return Promise.resolve(reg); },
        addEventListener: (t, fn) => { swListeners[t] = fn; }
      }
    },
    window: { location: { reload: () => reloads.push(1) } },
    fetch: () => Promise.resolve({ text: () => Promise.resolve(newHtml || "") }),
    setInterval: () => 0, clearInterval: () => {},
    setTimeout: () => 0, clearTimeout: () => {},
    Date, Math, JSON
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { app: sandbox, els, reg, swListeners, docListeners, reloads };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const fakeWorker = () => ({ state: "installing", messages: [], listeners: {},
  postMessage(m) { this.messages.push(m); }, addEventListener(t, fn) { this.listeners[t] = fn; } });

console.log("Update banner");

test("registers with updateViaCache none and checks for updates on load and when visible", async () => {
  const p = loadPage();
  p.app.setupServiceWorker();
  await tick();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.app.navigator.serviceWorker.registerArgs)), ["sw.js", { updateViaCache: "none" }]);
  assert.strictEqual(p.reg.updates, 1);
  p.docListeners.visibilitychange();
  assert.strictEqual(p.reg.updates, 2);
  p.app.document.visibilityState = "hidden";
  p.docListeners.visibilitychange();
  assert.strictEqual(p.reg.updates, 2);
});

test("waiting worker shows the banner with the new version; tap sends SKIP_WAITING; reload once", async () => {
  const p = loadPage('var SETTINGS = { appVersion: "v9.9.9" };');
  const w = fakeWorker();
  p.reg.waiting = w;
  p.app.setupServiceWorker();
  await tick(); await tick(); await tick();
  const banner = p.els["update-banner"];
  assert.strictEqual(banner.style.display, "block");
  assert.strictEqual(banner.textContent, "Update ready (v9.9.9). Tap to reload.");
  banner.onclick();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(w.messages)), [{ type: "SKIP_WAITING" }]);
  p.swListeners.controllerchange();
  p.swListeners.controllerchange();
  assert.strictEqual(p.reloads.length, 1);
});

test("newly installed worker with an existing controller offers the update; generic text without a version", async () => {
  const p = loadPage("no version here");
  p.app.setupServiceWorker();
  await tick();
  const w = fakeWorker();
  p.reg.installing = w;
  p.reg.listeners.updatefound();
  w.state = "installed";
  w.listeners.statechange();
  await tick(); await tick();
  assert.strictEqual(p.els["update-banner"].textContent, "Update ready. Tap to reload.");
});

test("controllerchange without a tap (e.g. first install) never reloads", () => {
  const p = loadPage();
  p.app.setupServiceWorker();
  p.swListeners.controllerchange();
  assert.strictEqual(p.reloads.length, 0);
});

test("banner is queued during an active round and shown when it ends; tap ignored mid-round", async () => {
  const p = loadPage();
  p.app.startRound("add", "intermediate", false);
  const w = fakeWorker();
  p.app.offerUpdate(w);
  assert.notStrictEqual(p.els["update-banner"].style.display, "block");
  p.app.applyUpdate();
  assert.strictEqual(w.messages.length, 0);
  p.app.round.answerBuffer = String(p.app.round.current.answer);
  p.app.submitAnswer();
  p.app.endRound();
  assert.strictEqual(p.els["update-banner"].style.display, "block");
  p.app.applyUpdate();
  assert.strictEqual(w.messages.length, 1);
});

Promise.all(pending).then(() => {
  console.log("\n" + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exit(1);
});
