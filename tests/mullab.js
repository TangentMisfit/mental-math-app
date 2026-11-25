// Mul Lab (facts drill): generator rules, logging, gate and plan exclusion.
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
  sandbox.__els = els;
  return sandbox;
}

const app = loadApp();

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { failed++; console.log("  FAIL - " + name); console.log("    " + e.message); }
}

console.log("Mul Lab generator (200 questions)");

test("200 mullab questions follow the generator rules", () => {
  let tens = 0;
  const factTags = {};
  for (let i = 0; i < 200; i++) {
    const q = app.generate("mullab", "facts");
    const m = /^(\d+) × (\d+)$/.exec(q.question);
    assert.ok(m, q.question);
    const x = Number(m[1]), y = Number(m[2]);
    assert.strictEqual(q.answer, x * y, q.question);
    const tags = Array.from(q.tags);
    const fact = tags.filter((t) => /^fact_x[6-9]$/.test(t));
    assert.strictEqual(fact.length, 1, q.question + " " + tags.join(","));
    factTags[fact[0]] = true;
    if (tags.indexOf("tensfact") !== -1) {
      tens++;
      assert.strictEqual(tags.length, 2);
      // (a*10) × b, a 2-9, b 6-9; tag by b
      assert.ok(x % 10 === 0 && x >= 20 && x <= 90, q.question);
      assert.ok(y >= 6 && y <= 9, q.question);
      assert.strictEqual(fact[0], "fact_x" + y);
    } else {
      assert.strictEqual(tags.length, 1);
      // a 6-9 and b 2-9, either order; tag by the 6-9 factor (larger when both are)
      const hiOk = (x >= 6 && x <= 9 && y >= 2 && y <= 9) || (y >= 6 && y <= 9 && x >= 2 && x <= 9);
      assert.ok(hiOk, q.question);
      const big = [x, y].filter((n) => n >= 6);
      assert.strictEqual(fact[0], "fact_x" + Math.max.apply(null, big), q.question);
    }
  }
  assert.ok(tens > 60 && tens < 140, "tens split " + tens + "/200");
  ["fact_x6", "fact_x7", "fact_x8", "fact_x9"].forEach((t) => assert.ok(factTags[t], t + " seen"));
});

test("single-digit facts appear in both factor orders", () => {
  let lowFirst = 0, highFirst = 0;
  for (let i = 0; i < 400; i++) {
    const q = app.generate("mullab", "facts");
    if (q.tags.indexOf("tensfact") !== -1) continue;
    const [x, y] = q.question.split(" × ").map(Number);
    if (x < 6) lowFirst++;
    if (y < 6) highFirst++;
  }
  assert.ok(lowFirst > 0 && highFirst > 0);
});

console.log("Mul Lab rounds: logging and exclusion");

let seq = 0;
function seedNormal(a) {
  const rounds = [];
  ["add", "sub", "mul", "div"].forEach((mode) => {
    [90, 96, 88].forEach((acc) => {
      rounds.push({ timestamp: new Date(Date.UTC(2026, 0, 1) + (seq++) * 60000).toISOString(), mode, difficulty: "intermediate",
        round_seconds: 300, asked: 100, correct: acc, accuracy: acc, avg_time_ms: 3000, round_id: mode + seq, drill: false, legacy: false });
    });
  });
  a.saveRounds(rounds);
}

function snapshot(a) {
  const rounds = a.getRounds(), qs = a.getQuestions();
  const unlocked = a.refreshUnlocks(rounds, qs);
  const gates = ["add", "sub", "mul", "div"].map((m) => {
    const lvl = a.currentLevel(m, unlocked);
    const g = a.computeGate(m, lvl, rounds, qs);
    return [m, lvl, g.label, g.pooledAccuracy, g.window.map((r) => r.round_id).join("/"), a.isStalled(rounds, m, lvl, g)].join(":");
  }).join(" | ");
  const plan = a.buildPlan(rounds, qs);
  return gates + " || " + JSON.stringify(plan.items);
}

test("a mullab round at 50% accuracy changes no gate status or plan round", () => {
  const a = loadApp();
  seedNormal(a);
  const before = snapshot(a);
  a.startRound("mullab", "facts", false);
  assert.strictEqual(a.round.gateBefore, null);
  for (let i = 0; i < 20; i++) {
    const cur = a.round.current;
    a.round.answerBuffer = String(i % 2 ? cur.answer : cur.answer + 10);
    a.submitAnswer();
    a.nextQuestion();
  }
  a.endRound();
  assert.strictEqual(snapshot(a), before);

  const r = a.getRounds().filter((x) => x.mode === "mullab");
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].difficulty, "facts");
  assert.strictEqual(r[0].accuracy, 50);
  assert.strictEqual(r[0].sublab, false, "sublab column keeps its meaning");
  assert.strictEqual(r[0].drill, false);
  assert.strictEqual(a.getQualifyingRounds(a.getRounds(), "mullab", "facts").length, 0);
  assert.strictEqual(a.practiceRounds(a.getRounds(), "mullab", "facts").length, 0);
  const qs = a.getQuestions().filter((q) => q.round_id === r[0].round_id);
  assert.strictEqual(qs.length, 20);
  qs.forEach((q) => { assert.strictEqual(q.mode, "mullab"); assert.strictEqual(q.sublab, false); });
  // Results screen: lab block, no gate status, speed refs per fact type
  assert.strictEqual(a.__els["sum-gate-block"].style.display, "none");
  assert.strictEqual(a.__els["sum-sublab-block"].style.display, "block");
  assert.ok(/single-digit avg .* vs ref 2000ms · tensfact avg .* vs ref 3000ms/.test(a.__els["sum-speed-ref"].textContent),
    a.__els["sum-speed-ref"].textContent);
  assert.strictEqual(a.__els["sum-error-type"].textContent, "Most misses: slip_tens (10 of 10)");
  assert.strictEqual(a.__els["btn-summary-home"].textContent, "Back to Mul Lab");
});

test("even a lab-mode row with qualifying fields never enters a gate window or drill weights", () => {
  const row = { timestamp: new Date().toISOString(), mode: "mullab", difficulty: "facts", asked: 50, correct: 10, accuracy: 20,
    avg_time_ms: 9000, round_id: "m1", drill: false, legacy: false };
  assert.strictEqual(app.getQualifyingRounds([row, row, row], "mullab", "facts").length, 0);
  const qs = [];
  // lab rows never feed a v1 mode's drill weights, even with a matching difficulty
  for (let i = 0; i < 5; i++) qs.push({ mode: "mullab", difficulty: "intermediate", question: "60 × 7 = ?", correct: false, skipped: false, latency_ms: 9000, tags: ["x7"] });
  const w = app.drillTagWeights("mul", "intermediate", qs, ["x7"]);
  assert.strictEqual(w[0].attempts, 0);
});

test("Mul Lab is offered as an optional plan item when mul window accuracy < 90%", () => {
  const a = loadApp();
  const rounds = [70, 75, 81].map((acc, i) => ({ timestamp: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(), mode: "mul",
    difficulty: "intermediate", asked: 100, correct: acc, accuracy: acc, avg_time_ms: 4000, round_id: "mm" + i, drill: false, legacy: false }));
  const plan = a.buildPlan(rounds, []);
  assert.deepStrictEqual(Array.from(plan.labs, (l) => l.lab), ["mullab"]);
  assert.ok(plan.items.every((i) => i.mode !== "mullab"));
});

test("lab screen renders Mul Lab without the flash card, Sub Lab with it", () => {
  const a = loadApp();
  a.renderLab("mullab");
  assert.strictEqual(a.__els["lab-title"].textContent, "Mul Lab");
  assert.strictEqual(a.__els["lab-flash-card"].style.display, "none");
  a.renderLab("sublab");
  assert.strictEqual(a.__els["lab-title"].textContent, "Sub Lab");
  assert.strictEqual(a.__els["lab-flash-card"].style.display, "block");
});

test("CSV export columns unchanged by Mul Lab", () => {
  const rh = app.roundsToCSV([]).split("\n")[0];
  assert.strictEqual(rh, "timestamp,mode,difficulty,round_seconds,asked,correct,accuracy,avg_time_ms,round_id,drill,legacy,stage,sublab");
  const qh = app.questionsToCSV([]).split("\n")[0];
  assert.ok(qh.endsWith(",sublab,step1_answer,step1_expected,step2_answer,stepped,error_type"));
});

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
