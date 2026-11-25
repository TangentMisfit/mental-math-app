// Sub Lab drills, borrow-count tag, and gate exclusion.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const htmlSource = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");

// Minimal DOM stub so the round engine (startRound/submitAnswer/endRound) can run.
function makeEl() {
  return {
    style: {}, textContent: "", innerHTML: "", className: "",
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
  sandbox.__store = store;
  sandbox.__els = els;
  return sandbox;
}

const app = loadApp();

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { failed++; console.log("  FAIL - " + name); console.log("    " + e.message); }
}
const N = 200;
const ops = (q) => q.question.split(" - ").map(Number);

console.log("Borrow-count tag");

test("hand-checked borrow counts", () => {
  assert.strictEqual(app.borrowCountTag(742, 386), "borrow2");
  assert.strictEqual(app.borrowCountTag(865, 123), "borrow0");
  assert.strictEqual(app.borrowCountTag(702, 358), "borrow2");
  assert.strictEqual(app.borrowCountTag(540, 217), "borrow1");
  assert.strictEqual(app.borrowCountTag(10000, 1), "borrow3+");
});

test("every sub generator question carries exactly one borrow-count tag matching its operands", () => {
  ["beginner", "intermediate", "advanced"].forEach((d) => {
    for (let i = 0; i < N; i++) {
      const q = app.genSub(d);
      const [a, b] = ops(q);
      const counts = q.tags.filter((t) => /^borrow(\d|3\+)$/.test(t));
      assert.strictEqual(counts.length, 1, q.question + " " + q.tags.join(","));
      assert.strictEqual(counts[0], app.borrowCountTag(a, b));
    }
  });
});

test("borrow-count tag uses the existing >=3 attempt minimum in the Drill gate", () => {
  const mk = (id) => ({ timestamp: new Date().toISOString(), mode: "sub", difficulty: "advanced", asked: 20, correct: 20,
    accuracy: 100, avg_time_ms: 1000, round_id: id, drill: false, legacy: false });
  const rounds = [mk("rA"), mk("rB"), mk("rC")];
  const q = (rid, question, correct) => ({ round_id: rid, mode: "sub", difficulty: "advanced", question, correct, skipped: false, latency_ms: 1000 });
  // 2 misses on borrow1 (one borrow:ones, one borrow:tens): below the 3-attempt minimum -> not Drill
  const two = [q("rA", "532 - 115 = ?", false), q("rB", "512 - 371 = ?", false)];
  assert.notStrictEqual(app.computeGate("sub", "advanced", rounds, two).status, "Drill");
  // 3rd borrow1 attempt (correct): borrow1 now has 3 attempts, 67% miss -> Drill,
  // even though no positional tag reaches 3 attempts.
  const three = two.concat([q("rC", "642 - 115 = ?", true)]);
  const g = app.computeGate("sub", "advanced", rounds, three);
  assert.strictEqual(g.status, "Drill");
  assert.ok(g.tagStats.some((t) => t.tag === "borrow1" && t.attempts === 3));
});

console.log("Sub Lab generators (" + N + " questions each)");

test("complement: 100-n (11..99) or 1000-n (101..999), no multiples of 10, ~50/50", () => {
  let big = 0;
  for (let i = 0; i < N; i++) {
    const q = app.genSubLab("complement");
    const [base, n] = ops(q);
    assert.ok(n % 10 !== 0, q.question);
    assert.strictEqual(q.answer, base - n);
    if (base === 100) { assert.ok(n >= 11 && n <= 99, q.question); assert.deepStrictEqual(Array.from(q.tags), ["comp100"]); }
    else { assert.strictEqual(base, 1000); big++; assert.ok(n >= 101 && n <= 999, q.question); assert.deepStrictEqual(Array.from(q.tags), ["comp1000"]); }
  }
  assert.ok(big > N * 0.35 && big < N * 0.65, "split " + big + "/" + N);
});

test("scaffold: ranges and rounding rule", () => {
  const kinds = {};
  for (let i = 0; i < N; i++) {
    const q = app.genSubLab("scaffold");
    const s = q.scaffold;
    const [a, b] = ops(q);
    assert.ok(a >= 400 && a <= 999, q.question);
    assert.ok(b >= 101 && b <= a - 50 && b % 10 !== 0, q.question);
    const hundred = Math.floor(b / 100) * 100 + 100;
    const ten = Math.floor(b / 10) * 10 + 10;
    const expectR = hundred - b <= 30 ? hundred : ten;
    assert.strictEqual(s.r, expectR, q.question);
    assert.strictEqual(s.adj, s.r - b);
    assert.strictEqual(s.step1, a - s.r);
    assert.strictEqual(q.answer, a - b);
    assert.strictEqual(s.step1 + s.adj, q.answer);
    assert.strictEqual(q.tags[0], s.r === hundred ? "round_hundred" : "round_ten");
    assert.strictEqual(q.tags[1], app.borrowCountTag(a, s.r));
    kinds[q.tags[0]] = true;
  }
  assert.ok(kinds.round_hundred && kinds.round_ten, "both rounding kinds seen");
});

test("scaffold rounding examples", () => {
  assert.strictEqual(app.scaffoldRounding(378).r, 400);  // 22 <= 30
  assert.strictEqual(app.scaffoldRounding(370 + 1).r, 400); // 29
  assert.strictEqual(app.scaffoldRounding(369).r, 370);  // 31 > 30 -> next ten
  assert.strictEqual(app.scaffoldRounding(343).r, 350);
});

test("nearround: a 300..999, distance to next hundred 1..30, a-b >= 10", () => {
  for (let i = 0; i < N; i++) {
    const q = app.genSubLab("nearround");
    const [a, b] = ops(q);
    const d = Math.floor(b / 100) * 100 + 100 - b;
    assert.ok(a >= 300 && a <= 999, q.question);
    assert.ok(b >= 100 && b <= 999, q.question);
    assert.ok(d >= 1 && d <= 30, q.question + " dist " + d);
    assert.ok(a - b >= 10, q.question);
    assert.deepStrictEqual(Array.from(q.tags), [app.borrowCountTag(a, b), "near_hundred"]);
  }
  assert.strictEqual(app.distToNextHundred(497), 3);
  assert.strictEqual(app.distToNextHundred(772), 28);
  assert.strictEqual(app.distToNextHundred(815), 85);
});

test("flash: sub/advanced ranges, borrow tag + flash", () => {
  for (let i = 0; i < N; i++) {
    const q = app.genSubLab("flash");
    const [a, b] = ops(q);
    assert.ok(a >= 100 && a <= 999 && b >= 100 && b <= 999 && a >= b, q.question);
    assert.deepStrictEqual(Array.from(q.tags), [app.borrowCountTag(a, b), "flash"]);
  }
});

test("flash duration setting persists under an mma_ key, default 2000", () => {
  const fresh = loadApp();
  assert.strictEqual(fresh.getFlashMs(), 2000);
  fresh.setFlashMs(3000);
  assert.strictEqual(fresh.getFlashMs(), 3000);
  assert.strictEqual(fresh.SETTINGS.storageKeys.flashMs.indexOf("mma_"), 0);
  assert.strictEqual(fresh.__store["mma_flash_ms"], "3000");
  fresh.setFlashMs(1234); // invalid -> default
  assert.strictEqual(fresh.getFlashMs(), 2000);
});

console.log("Sub Lab rounds: logging and gate exclusion");

function answerAll(a, n, wrongEvery) {
  for (let i = 0; i < n; i++) {
    const cur = a.round.current;
    const wrong = wrongEvery && i % wrongEvery === 0;
    // Scaffold defaults to a single final-answer input.
    a.round.answerBuffer = String(wrong ? cur.answer + 1 : cur.answer);
    a.submitAnswer();
    a.nextQuestion(); // feedback delay is stubbed out
  }
}

function seedNormalRounds(a) {
  const rounds = [], questions = [];
  ["add", "sub", "mul", "div"].forEach((mode) => {
    for (let r = 0; r < 3; r++) {
      const id = mode + r;
      rounds.push({ timestamp: new Date(Date.now() - 100000 + r).toISOString(), mode, difficulty: "intermediate",
        round_seconds: 300, asked: 20, correct: 19 + (r % 2), accuracy: 95 + 5 * (r % 2), avg_time_ms: 3000,
        round_id: id, drill: false, legacy: false });
      for (let k = 0; k < 20; k++) {
        const q = app.generate(mode, "intermediate");
        questions.push({ timestamp: "", round_id: id, mode, difficulty: "intermediate", question: q.question + " = ?",
          correct_answer: q.answer, user_answer: String(q.answer), correct: true, skipped: false, latency_ms: 3000, tags: q.tags, drill: false });
      }
    }
  });
  a.saveRounds(rounds);
  a.saveQuestions(questions);
}

function allGates(a) {
  const rounds = a.getRounds(), qs = a.getQuestions();
  const unlocked = a.refreshUnlocks(rounds, qs);
  return ["add", "sub", "mul", "div"].map((m) => {
    const lvl = a.currentLevel(m, unlocked);
    const g = a.computeGate(m, lvl, rounds, qs);
    return m + ":" + lvl + ":" + g.label + ":" + g.pooledAccuracy + ":" + g.window.map((r) => r.round_id).join("/");
  }).join(" | ");
}

["complement", "scaffold", "nearround", "flash"].forEach((drillId) => {
  test("sublab " + drillId + " round is logged with full data and does not change any gate", () => {
    const a = loadApp();
    seedNormalRounds(a);
    const before = allGates(a);
    a.startRound("sublab", drillId, false);
    // 15 answers, every 3rd wrong (80% accuracy would trigger Drill if it counted)
    answerAll(a, 15, 3);
    a.endRound();
    const after = allGates(a);
    assert.strictEqual(after, before);

    const r = a.getRounds().filter((x) => x.mode === "sublab");
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].difficulty, drillId);
    assert.strictEqual(r[0].sublab, true);
    assert.strictEqual(r[0].drill, false);
    assert.strictEqual(r[0].asked, 15);
    assert.strictEqual(r[0].correct, 10);
    const qs = a.getQuestions().filter((q) => q.round_id === r[0].round_id);
    assert.strictEqual(qs.length, 15);
    qs.forEach((q) => {
      assert.strictEqual(q.sublab, true);
      assert.ok(q.latency_ms >= 0 && q.tags.length >= 1);
      if (drillId === "scaffold") {
        assert.strictEqual(q.stepped, false);
        assert.strictEqual(q.step1_answer, "");
        assert.strictEqual(q.step2_answer, "");
        assert.strictEqual(typeof q.step1_expected, "number");
      } else {
        assert.strictEqual(q.stepped, undefined);
      }
    });
    // A sublab round with the same mode/difficulty cannot qualify for a gate window either.
    assert.strictEqual(a.getQualifyingRounds(a.getRounds(), "sublab", drillId).length, 0);
    // Summary hides gate status for Sub Lab.
    assert.strictEqual(a.__els["sum-gate-block"].style.display, "none");
    assert.strictEqual(a.__els["sum-sublab-block"].style.display, "block");
  });
});

test("gate window ignores a round flagged sublab even if mode matched", () => {
  const mk = (o) => Object.assign({ timestamp: new Date().toISOString(), mode: "sub", difficulty: "advanced", asked: 20, correct: 20,
    accuracy: 100, avg_time_ms: 1000, round_id: "x" + Math.random(), drill: false, legacy: false }, o);
  const rounds = [mk({}), mk({}), mk({ sublab: true })];
  assert.strictEqual(app.getQualifyingRounds(rounds, "sub", "advanced").length, 2);
  assert.strictEqual(app.computeGate("sub", "advanced", rounds, []).status, "Calibrating");
});

test("Today's plan never contains sublab", () => {
  const a = loadApp();
  a.saveRounds([{ timestamp: new Date().toISOString(), mode: "sublab", difficulty: "flash", asked: 20, correct: 1, accuracy: 5,
    avg_time_ms: 9000, round_id: "s1", drill: false, legacy: false, sublab: true }]);
  a.buildTodaysPlan();
  assert.ok(!/sublab|Sub Lab/.test(a.__els["plan-list"].innerHTML));
});

test("scaffold single input: correct final answer is graded correct in one submit", () => {
  const a = loadApp();
  a.startRound("sublab", "scaffold", false);
  const cur = a.round.current;
  assert.strictEqual(a.__els["question-text"].textContent, cur.question + " = ?");
  assert.strictEqual(a.__els["question-hint"].textContent, "Round " + cur.scaffold.b + " up to " + cur.scaffold.r);
  assert.strictEqual(a.__els["steps-row"].style.display, "block", "Steps button offered");
  assert.strictEqual(a.__els["question-step"].style.display, "none");
  a.round.answerBuffer = String(cur.answer); a.submitAnswer();
  const q = a.round.log[0];
  assert.strictEqual(a.round.log.length, 1);
  assert.strictEqual(q.correct, true);
  assert.strictEqual(q.stepped, false);
  assert.strictEqual(q.user_answer, String(cur.answer));
  assert.strictEqual(q.step1_answer, "");
  assert.strictEqual(q.step1_expected, cur.scaffold.step1);
  assert.strictEqual(q.step2_answer, "");
  assert.deepStrictEqual(Array.from(q.tags), Array.from(cur.tags));
});

test("scaffold single input: wrong answer shows the worked breakdown", () => {
  const a = loadApp();
  a.startRound("sublab", "scaffold", false);
  const cur = a.round.current, s = cur.scaffold;
  a.round.answerBuffer = String(cur.answer + 1); a.submitAnswer();
  const q = a.round.log[0];
  assert.strictEqual(q.correct, false);
  assert.strictEqual(q.stepped, false);
  const fb = a.__els["feedback"].textContent;
  assert.ok(fb.indexOf(s.a + " - " + s.r + " = " + s.step1 + ", + " + s.adj + " = " + cur.answer) !== -1, fb);
  assert.ok(fb.indexOf("you " + (cur.answer + 1)) !== -1 && fb.indexOf("answer " + cur.answer) !== -1, fb);
});

test("scaffold stepped: correct only when both steps are correct, both answers logged", () => {
  const a = loadApp();
  a.startRound("sublab", "scaffold", false);
  const s = a.round.current.scaffold;
  a.useScaffoldSteps();
  assert.strictEqual(a.__els["question-step"].style.display, "block");
  assert.strictEqual(a.__els["steps-row"].style.display, "none");
  a.round.answerBuffer = String(s.step1 + 1); a.submitAnswer();   // wrong step 1
  assert.strictEqual(a.round.log.length, 0, "step 1 never logs");
  a.round.answerBuffer = String(a.round.current.answer); a.submitAnswer(); // right final
  const q = a.round.log[0];
  assert.strictEqual(q.correct, false);
  assert.strictEqual(q.stepped, true);
  assert.strictEqual(q.step1_answer, String(s.step1 + 1));
  assert.strictEqual(q.step1_expected, s.step1);
  assert.strictEqual(q.step2_answer, String(a.round.current.answer));
});

test("scaffold stepped: both steps right is correct; next question returns to single input", () => {
  const a = loadApp();
  a.startRound("sublab", "scaffold", false);
  const s = a.round.current.scaffold;
  a.useScaffoldSteps();
  a.round.answerBuffer = String(s.step1); a.submitAnswer();
  a.round.answerBuffer = String(a.round.current.answer); a.submitAnswer();
  assert.strictEqual(a.round.log[0].correct, true);
  assert.strictEqual(a.round.log[0].stepped, true);
  a.nextQuestion();
  assert.strictEqual(a.round.stepped, false);
  assert.strictEqual(a.__els["steps-row"].style.display, "block");
  a.round.answerBuffer = String(a.round.current.answer); a.submitAnswer();
  assert.strictEqual(a.round.log[1].correct, true);
  assert.strictEqual(a.round.log[1].stepped, false);
});

test("scaffold miss pause is 2500 ms; other misses keep the normal pause", () => {
  assert.strictEqual(app.SETTINGS.subLab.scaffoldMissDelayMs, 2500);
  const delays = [];
  const a = loadApp();
  a.setTimeout = (fn, ms) => { delays.push(ms); return 0; };
  a.startRound("sublab", "scaffold", false);
  a.round.answerBuffer = String(a.round.current.answer + 1); a.submitAnswer();
  a.nextQuestion();
  a.round.answerBuffer = String(a.round.current.answer); a.submitAnswer();
  a.endRound();
  a.startRound("sublab", "nearround", false);
  a.round.answerBuffer = String(a.round.current.answer + 1); a.submitAnswer();
  assert.deepStrictEqual(delays, [2500, a.SETTINGS.feedbackDelayMs, a.SETTINGS.feedbackDelayMs]);
});

console.log("CSV export: new columns appended at the end");

test("rounds.csv appends sublab", () => {
  const csv = app.roundsToCSV([{ mode: "sublab", difficulty: "flash", sublab: true }, { mode: "add", difficulty: "beginner" }]);
  const lines = csv.split("\n");
  assert.strictEqual(lines[0], "timestamp,mode,difficulty,round_seconds,asked,correct,accuracy,avg_time_ms,round_id,drill,legacy,stage,sublab");
  assert.ok(lines[1].endsWith(",true"));
  assert.ok(lines[2].endsWith(",false"), "old rows export sublab=false");
});

test("questions.csv keeps the original columns in order, with stepped appended last", () => {
  const csv = app.questionsToCSV([
    { question: "742 - 386 = ?", correct_answer: 356, user_answer: "356", correct: true, skipped: false, tags: ["round_hundred", "borrow1"],
      sublab: true, step1_answer: "342", step1_expected: 342, step2_answer: "356", stepped: true },
    { question: "742 - 386 = ?", correct_answer: 356, user_answer: "356", correct: true, skipped: false, tags: ["round_hundred", "borrow1"],
      sublab: true, step1_answer: "", step1_expected: 342, step2_answer: "", stepped: false },
    { question: "742 - 386 = ?", correct_answer: 356, user_answer: "356", correct: true, skipped: false, tags: ["round_hundred", "borrow1"],
      sublab: true, step1_answer: "342", step1_expected: 342, step2_answer: "356" },
    { question: "52 + 61 = ?", correct_answer: 113, user_answer: "113", correct: true, skipped: false, tags: ["carry:tens"] }
  ]);
  const lines = csv.split("\n");
  const header = lines[0].split(",");
  assert.strictEqual(lines[0], "timestamp,round_id,mode,difficulty,question,correct_answer,user_answer,correct,skipped,latency_ms,tags,drill,len_mismatch,sublab,step1_answer,step1_expected,step2_answer,stepped,error_type");
  assert.strictEqual(header[header.length - 2], "stepped");
  assert.ok(lines[1].endsWith(",true,342,342,356,true,"), lines[1]);
  assert.ok(lines[2].endsWith(",true,,342,,false,"), lines[2]);
  assert.ok(lines[3].endsWith(",true,342,342,356,,"), "older scaffold row: stepped blank");
  assert.ok(lines[4].endsWith(",false,,,,,"), "old non-scaffold rows: sublab=false, step and stepped columns blank");
  lines.forEach((l) => assert.strictEqual(l.split(",").length, header.length));
});

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
