// Answered lock: rapid repeat submits during the feedback pause log exactly one question.
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

// Loads the app with manually flushed timers so the feedback pause is real.
function loadApp() {
  const code = htmlSource.match(/<script>([\s\S]*?)<\/script>/)[1];
  const store = {};
  const els = {};
  const timers = [];
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
    navigator: {}, window: {},
    setInterval: () => 0, clearInterval: () => {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    Date, Math, JSON
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  sandbox.__els = els;
  sandbox.__flushTimers = () => { const fns = timers.splice(0); fns.forEach((f) => f()); };
  return sandbox;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { failed++; console.log("  FAIL - " + name); console.log("    " + e.message); }
}

// The app has no Enter-key handler (keypad only); the Submit button calls
// submitAnswer directly, so any submit path is a submitAnswer call.
function pressSubmit(a) { a.__els["btn-submit"].disabled || a.submitAnswer(); }  // button: respects disabled
function pressEnter(a) { a.submitAnswer(); }                                      // bypasses the button entirely
function type(a, v) { String(v).split("").forEach((k) => a.onKeypadPress(k)); }

console.log("Answered lock");

[["normal", "sub", "advanced", false], ["drill", "add", "intermediate", true]].forEach(([label, mode, diff, drill]) => {
  test(label + " round: rapid double submit (button and Enter) logs one question", () => {
    const a = loadApp();
    a.startRound(mode, diff, drill);
    const first = a.round.current;
    type(a, first.answer);
    pressSubmit(a);
    assert.strictEqual(a.__els["btn-submit"].disabled, true, "submit disabled during pause");
    pressSubmit(a);
    pressEnter(a);
    type(a, "5");           // keypad ignored during pause
    pressEnter(a);
    a.skipQuestion();       // skip ignored during pause
    assert.strictEqual(a.round.log.length, 1);
    a.__flushTimers();      // pause ends, next question shown
    assert.notStrictEqual(a.round.current, first);
    assert.strictEqual(a.__els["btn-submit"].disabled, false, "submit re-enabled on next question");
    assert.strictEqual(a.round.answerBuffer, "");
    type(a, a.round.current.answer);
    pressEnter(a);
    pressEnter(a);
    assert.strictEqual(a.round.log.length, 2);
  });
});

["complement", "nearround", "flash"].forEach((drillId) => {
  test("sublab " + drillId + ": rapid double submit logs one question", () => {
    const a = loadApp();
    a.startRound("sublab", drillId, false);
    type(a, a.round.current.answer);
    pressSubmit(a); pressEnter(a); pressSubmit(a);
    assert.strictEqual(a.round.log.length, 1);
  });
});

test("scaffold single input: rapid double submit logs one question; Submit and Steps disabled in pause", () => {
  const a = loadApp();
  a.startRound("sublab", "scaffold", false);
  const first = a.round.current;
  type(a, first.answer + 1); // miss -> longer pause
  pressSubmit(a);
  assert.strictEqual(a.__els["btn-submit"].disabled, true);
  assert.strictEqual(a.__els["btn-steps"].disabled, true);
  pressSubmit(a); pressEnter(a);
  a.useScaffoldSteps(); // ignored during the pause
  assert.strictEqual(a.round.stepped, false);
  a.skipQuestion();
  assert.strictEqual(a.round.log.length, 1);
  assert.strictEqual(a.round.log[0].stepped, false);
  a.__flushTimers();
  assert.notStrictEqual(a.round.current, first);
  assert.strictEqual(a.__els["btn-submit"].disabled, false);
  assert.strictEqual(a.__els["btn-steps"].disabled, false);
});

test("scaffold step 1: rapid double submit advances once and logs nothing", () => {
  const a = loadApp();
  a.startRound("sublab", "scaffold", false);
  const s = a.round.current.scaffold;
  a.useScaffoldSteps();
  type(a, s.step1);
  pressSubmit(a);
  pressSubmit(a);
  pressEnter(a);
  assert.strictEqual(a.round.step, 2);
  assert.strictEqual(a.round.step1Answer, String(s.step1));
  assert.strictEqual(a.round.log.length, 0, "step 1 never logs");
  assert.strictEqual(a.__els["btn-submit"].disabled, false, "step 2 still accepts input");
  type(a, a.round.current.answer);
  pressSubmit(a);
  assert.strictEqual(a.round.log.length, 1);
  assert.strictEqual(a.round.log[0].correct, true);
  assert.strictEqual(a.round.log[0].step1_answer, String(s.step1));
});

test("scaffold step 2: rapid double submit logs one question", () => {
  const a = loadApp();
  a.startRound("sublab", "scaffold", false);
  a.useScaffoldSteps();
  type(a, a.round.current.scaffold.step1);
  pressSubmit(a);
  type(a, a.round.current.answer);
  pressSubmit(a);
  pressSubmit(a);
  pressEnter(a);
  pressEnter(a);
  assert.strictEqual(a.round.log.length, 1);
  assert.strictEqual(a.__els["btn-submit"].disabled, true);
});

test("timer expiry during the pause: one question logged and stored", () => {
  const a = loadApp();
  a.startRound("sub", "advanced", false);
  type(a, a.round.current.answer);
  pressSubmit(a);
  a.round.endsAt = Date.now() - 1;
  a.tickTimer();          // round ends mid-pause
  pressEnter(a);
  pressSubmit(a);
  a.skipQuestion();
  a.__flushTimers();      // stale feedback timer fires after the end
  a.tickTimer();
  a.endRound();
  const rounds = a.getRounds();
  assert.strictEqual(rounds.length, 1, "round saved once");
  assert.strictEqual(rounds[0].asked, 1);
  assert.strictEqual(a.getQuestions().length, 1);
});

test("timer expiry with a typed but unsubmitted answer logs nothing extra", () => {
  const a = loadApp();
  a.startRound("sub", "advanced", false);
  type(a, a.round.current.answer);
  a.round.endsAt = Date.now() - 1;
  a.tickTimer();
  pressEnter(a);
  assert.strictEqual(a.getQuestions().length, 0);
});

test("stale feedback timer from an ended round does not advance a new round", () => {
  const a = loadApp();
  a.startRound("sub", "advanced", false);
  type(a, a.round.current.answer);
  pressSubmit(a);
  a.endRound();
  a.startRound("add", "intermediate", false);
  const q = a.round.current;
  a.__flushTimers();
  assert.strictEqual(a.round.current, q);
});

console.log("Duplicate finder (read-only)");

test("findLikelyDuplicates: same round/question/answer within 2 s only", () => {
  const app = loadApp();
  const row = (o) => Object.assign({ round_id: "r1", mode: "sub", difficulty: "advanced", question: "742 - 386 = ?", user_answer: "356",
    timestamp: "2026-01-01T00:00:00.000Z" }, o);
  const qs = [
    row({}),
    row({ timestamp: "2026-01-01T00:00:01.500Z" }),                  // dup
    row({ timestamp: "2026-01-01T00:00:10.000Z" }),                  // > 2 s later: not dup
    row({ timestamp: "2026-01-01T00:00:00.500Z", user_answer: "357" }), // different answer
    row({ timestamp: "2026-01-01T00:00:00.700Z", round_id: "r2" }),  // different round
    row({ mode: "add", difficulty: "intermediate", question: "52 + 61 = ?", user_answer: "113" }),
    row({ mode: "add", difficulty: "intermediate", question: "52 + 61 = ?", user_answer: "113", timestamp: "2026-01-01T00:00:02.000Z" }) // exactly 2 s: dup
  ];
  const snapshot = JSON.stringify(qs);
  const res = app.findLikelyDuplicates(qs);
  assert.strictEqual(res.total, 2);
  assert.strictEqual(res.byModeDifficulty["sub/advanced"], 1);
  assert.strictEqual(res.byModeDifficulty["add/intermediate"], 1);
  assert.strictEqual(JSON.stringify(qs), snapshot, "input untouched");
});

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
