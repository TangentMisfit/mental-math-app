// Today's plan: priority order, stall cap, optional lab items.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const htmlSource = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");

function makeEl() {
  return {
    style: {}, textContent: "", innerHTML: "", className: "", disabled: false,
    classList: { add() {}, remove() {} },
    appendChild() {}, removeChild() {}, setAttribute() {}, getAttribute() { return null; }
  };
}

function loadApp() {
  const code = htmlSource.match(/<script>([\s\S]*?)<\/script>/)[1];
  const store = {};
  const els = {};
  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    document: {
      addEventListener: () => {},
      querySelectorAll: () => [],
      getElementById: (id) => els[id] || (els[id] = makeEl()),
      createElement: () => makeEl(),
      body: { appendChild() {}, removeChild() {} }
    },
    navigator: {},
    window: {},
    setInterval: () => 0, clearInterval: () => {},
    setTimeout: () => 0, clearTimeout: () => {},
    Date, Math, JSON
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

const app = loadApp();

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { failed++; console.log("  FAIL - " + name); console.log("    " + e.message); }
}

let seq = 0;
const T0 = Date.UTC(2026, 0, 1);
// Rounds for mode/difficulty with the given accuracies, oldest first.
function rounds(mode, difficulty, accs, extra) {
  return accs.map((acc) => Object.assign({
    timestamp: new Date(T0 + (seq++) * 60000).toISOString(), mode, difficulty, round_seconds: 300,
    asked: 100, correct: acc, accuracy: acc, avg_time_ms: 2000,
    round_id: "r" + seq, drill: false, legacy: false
  }, extra || {}));
}

console.log("Today's plan");

test("div/intermediate with 0 rounds comes first, labeled Start", () => {
  const rs = [].concat(
    rounds("add", "intermediate", [90, 90, 90]),
    rounds("sub", "intermediate", [80, 90, 90]),
    rounds("mul", "intermediate", [92, 92])
  );
  const plan = loadApp().buildPlan(rs, []);
  assert.strictEqual(plan.items[0].mode, "div");
  assert.strictEqual(plan.items[0].level, "intermediate");
  assert.strictEqual(plan.items[0].label, "Start");
  assert.strictEqual(plan.items[1].mode, "mul");            // Calibrating (2/3)
  assert.strictEqual(plan.items[1].group, "calibrating");
  // rest sorted by window accuracy, lowest first; sub is in Drill -> drill round
  assert.deepStrictEqual(Array.from(plan.items.slice(2), (i) => i.mode), ["sub", "add"]);
  assert.strictEqual(plan.items[2].drill, true);
  assert.strictEqual(plan.items[3].drill, false);
});

test("legacy rounds do not count toward Start", () => {
  const rs = rounds("div", "intermediate", [90, 90, 90], { legacy: true });
  const plan = loadApp().buildPlan(rs, []);
  assert.strictEqual(plan.items.find((i) => i.mode === "div").label, "Start");
});

test("seeded stalled mode appears at most once, as Maintenance (stalled), not a drill round", () => {
  // add/intermediate: 12 rounds flat around 86-88 (last 5 not >= 2 pts above the 5 before), Hold/Drill
  const add = rounds("add", "intermediate", [88, 87, 88, 86, 88, 87, 88, 86, 87, 88, 86, 88]);
  const drills = rounds("add", "intermediate", [70, 72], { drill: true });
  const rs = [].concat(add, drills,
    rounds("sub", "intermediate", [96, 96, 96]),
    rounds("mul", "intermediate", [96, 96, 96]),
    rounds("div", "intermediate", [96, 96, 96]));
  const gate = app.computeGate("add", "intermediate", rs, []);
  assert.ok(app.isStalled(rs, "add", "intermediate", gate));
  const plan = loadApp().buildPlan(rs, []);
  const adds = plan.items.filter((i) => i.mode === "add");
  assert.strictEqual(adds.length, 1);
  assert.strictEqual(adds[0].label, "Maintenance (stalled)");
  assert.strictEqual(adds[0].drill, false);
  assert.ok(plan.items.length <= 4);
});

test("stall rule: >= 10 rounds, last 5 vs previous 5 by >= 2.0 pts, not Advance", () => {
  const g = { status: "Hold" };
  assert.ok(!app.isStalled(rounds("add", "advanced", [80, 80, 80, 80, 80, 80, 80, 80, 80]), "add", "advanced", g), "9 rounds: not enough");
  assert.ok(app.isStalled(rounds("add", "advanced", [80, 80, 80, 80, 80, 81, 82, 81, 82, 81]), "add", "advanced", g), "+1.4 pts: stalled");
  assert.ok(!app.isStalled(rounds("add", "advanced", [80, 80, 80, 80, 80, 82, 82, 82, 82, 82]), "add", "advanced", g), "+2.0 pts: improving");
  assert.ok(!app.isStalled(rounds("add", "advanced", [80, 80, 80, 80, 80, 80, 80, 80, 80, 80]), "add", "advanced", { status: "Advance" }), "Advance: never stalled");
  // only the last 10 count; drill rounds count; legacy and lab rounds do not
  const mixed = [].concat(
    rounds("add", "advanced", [50, 50, 50]),
    rounds("add", "advanced", [80, 80, 80, 80, 80]),
    rounds("add", "advanced", [90, 90], { drill: true }),
    rounds("add", "advanced", [90, 90, 90]),
    rounds("add", "advanced", [10, 10, 10], { legacy: true })
  );
  assert.ok(!app.isStalled(mixed, "add", "advanced", g), "last 5 avg 90 vs previous 5 avg 80");
});

test("plan never exceeds 4 rounds; labs are only optional extras", () => {
  const rs = [].concat(
    rounds("add", "intermediate", [70, 70, 70]),
    rounds("sub", "intermediate", [70, 70, 70]),
    rounds("mul", "intermediate", [70, 70, 70]),
    rounds("div", "intermediate", [70, 70, 70]));
  const plan = loadApp().buildPlan(rs, []);
  assert.strictEqual(plan.items.length, 4);
  assert.strictEqual(new Set(Array.from(plan.items, (i) => i.mode)).size, 4);
  assert.deepStrictEqual(Array.from(plan.labs, (l) => l.lab), ["sublab"]);
});

test("lab item only when the mode's window accuracy is below 90%", () => {
  const rs = [].concat(rounds("sub", "intermediate", [96, 96, 96]));
  assert.strictEqual(loadApp().buildPlan(rs, []).labs.length, 0);
  const low = [].concat(rounds("sub", "intermediate", [88, 88, 88]));
  assert.strictEqual(loadApp().buildPlan(low, []).labs.length, 1);
});

test("Sub Lab rounds never count as practice rounds for Start or stall", () => {
  const rs = rounds("sublab", "complement", [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50], { sublab: true });
  const plan = loadApp().buildPlan(rs, []);
  assert.strictEqual(plan.items.length, 4);
  plan.items.forEach((i) => assert.strictEqual(i.label, "Start"));
});

test("buildTodaysPlan renders without errors", () => {
  const a = loadApp();
  a.saveRounds(rounds("add", "intermediate", [70, 70, 70]));
  a.buildTodaysPlan();
});

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
