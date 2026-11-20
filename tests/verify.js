const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const htmlSource = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");

function loadApp() {
  const html = htmlSource;
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Could not find inline script in docs/index.html");
  const code = match[1];

  const store = {};
  const fakeLocalStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };

  const sandbox = {
    console,
    localStorage: fakeLocalStorage,
    document: {
      addEventListener: () => {},
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
      body: { appendChild() {}, removeChild() {} }
    },
    navigator: {},
    window: {},
    Date,
    Math,
    JSON
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

const app = loadApp();

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok - " + name);
  } catch (e) {
    failed++;
    console.log("  FAIL - " + name);
    console.log("    " + e.message);
  }
}

function repeatCheck(fn, n) {
  for (let i = 0; i < n; i++) fn();
}

console.log("Generators: range checks");

test("add beginner stays in 0-20", () => {
  repeatCheck(() => {
    const q = app.genAdd("beginner");
    const [a, b] = q.question.split(" + ").map(Number);
    assert.ok(a >= 0 && a <= 20, "a in range");
    assert.ok(b >= 0 && b <= 20, "b in range");
    assert.strictEqual(q.answer, a + b);
  }, 500);
});

test("add intermediate stays in 0-100 with filler removed", () => {
  repeatCheck(() => {
    const q = app.genAdd("intermediate");
    const [a, b] = q.question.split(" + ").map(Number);
    assert.ok(a >= 10 && a <= 100, "a >= 10: " + q.question);
    assert.ok(b >= 10 && b <= 100, "b >= 10: " + q.question);
    assert.ok(!(a % 10 === 0 && b % 10 === 0), "both multiples of 10: " + q.question);
  }, 2000);
});

test("add advanced stays in 100-999", () => {
  repeatCheck(() => {
    const q = app.genAdd("advanced");
    const [a, b] = q.question.split(" + ").map(Number);
    assert.ok(a >= 100 && a <= 999);
    assert.ok(b >= 100 && b <= 999);
  }, 500);
});

test("sub beginner: a>=b, both 0-20", () => {
  repeatCheck(() => {
    const q = app.genSub("beginner");
    const [a, b] = q.question.split(" - ").map(Number);
    assert.ok(a >= 0 && a <= 20 && b >= 0 && b <= 20);
    assert.ok(a >= b);
    assert.strictEqual(q.answer, a - b);
  }, 500);
});

test("sub intermediate: a>=b, both 0-100, filler removed", () => {
  repeatCheck(() => {
    const q = app.genSub("intermediate");
    const [a, b] = q.question.split(" - ").map(Number);
    assert.ok(a <= 100 && b >= 10, q.question);
    assert.ok(a >= b);
    assert.ok(b !== 0);
    assert.ok(!(a % 10 === 0 && b % 10 === 0), "both multiples of 10: " + q.question);
  }, 2000);
});

test("beginner and advanced add/sub are not filler-filtered", () => {
  assert.strictEqual(app.isFiller("add", "beginner", 3, 0), false);
  assert.strictEqual(app.isFiller("sub", "advanced", 300, 200), false);
  assert.strictEqual(app.isFiller("add", "intermediate", 30, 40), true);
  assert.strictEqual(app.isFiller("sub", "intermediate", 45, 7), true);
});

test("sub advanced: a>=b, both 100-999", () => {
  repeatCheck(() => {
    const q = app.genSub("advanced");
    const [a, b] = q.question.split(" - ").map(Number);
    assert.ok(a >= 100 && a <= 999 && b >= 100 && b <= 999);
    assert.ok(a >= b);
  }, 500);
});

test("mul beginner: a,b in 1-12", () => {
  repeatCheck(() => {
    const q = app.genMul("beginner");
    const [a, b] = q.question.split(" × ").map(Number);
    assert.ok(a >= 1 && a <= 12 && b >= 1 && b <= 12);
    assert.strictEqual(q.answer, a * b);
  }, 500);
});

test("mul intermediate: a in 10-99, b in 2-9", () => {
  repeatCheck(() => {
    const q = app.genMul("intermediate");
    const [a, b] = q.question.split(" × ").map(Number);
    assert.ok(a >= 10 && a <= 99);
    assert.ok(b >= 2 && b <= 9);
  }, 500);
});

test("mul advanced: a,b in 10-99", () => {
  repeatCheck(() => {
    const q = app.genMul("advanced");
    const [a, b] = q.question.split(" × ").map(Number);
    assert.ok(a >= 10 && a <= 99 && b >= 10 && b <= 99);
  }, 500);
});

test("div beginner: divisor 2-12, quotient 2-12, clean division", () => {
  repeatCheck(() => {
    const q = app.genDiv("beginner");
    const [dividend, divisor] = q.question.split(" ÷ ").map(Number);
    assert.ok(divisor >= 2 && divisor <= 12);
    assert.ok(q.answer >= 2 && q.answer <= 12);
    assert.strictEqual(dividend, divisor * q.answer);
  }, 500);
});

test("div intermediate: divisor 3-12, quotient 13-40 (changed from Python)", () => {
  repeatCheck(() => {
    const q = app.genDiv("intermediate");
    const [dividend, divisor] = q.question.split(" ÷ ").map(Number);
    assert.ok(divisor >= 3 && divisor <= 12);
    assert.ok(q.answer >= 13 && q.answer <= 40);
    assert.strictEqual(dividend, divisor * q.answer);
  }, 500);
});

test("div advanced: divisor 2-19, quotient 5-99", () => {
  repeatCheck(() => {
    const q = app.genDiv("advanced");
    const [dividend, divisor] = q.question.split(" ÷ ").map(Number);
    assert.ok(divisor >= 2 && divisor <= 19);
    assert.ok(q.answer >= 5 && q.answer <= 99);
    assert.strictEqual(dividend, divisor * q.answer);
  }, 500);
});

console.log("Tags: known examples");

function tagOf(arr) { return JSON.stringify(arr); }

test("add positional carry: spec examples", () => {
  assert.strictEqual(tagOf(app.tagsForAdd(174, 463)), tagOf(["carry:tens"]));
  assert.strictEqual(tagOf(app.tagsForAdd(938, 698)), tagOf(["carry:ones+tens+hundreds"]));
  assert.strictEqual(tagOf(app.tagsForAdd(757, 151)), tagOf(["carry:tens"]));
});
test("add positional carry: none, chained carry counted where it happens", () => {
  assert.strictEqual(tagOf(app.tagsForAdd(12, 3)), tagOf(["carry:none"]));
  // 95 + 5: ones 10 -> carry; tens 9+0+1 = 10 -> chained carry in tens
  assert.strictEqual(tagOf(app.tagsForAdd(95, 5)), tagOf(["carry:ones+tens"]));
  // 450 + 560: tens 5+6 carry, hundreds 4+5+1 carry
  assert.strictEqual(tagOf(app.tagsForAdd(450, 560)), tagOf(["carry:tens+hundreds"]));
  assert.strictEqual(tagOf(app.tagsForAdd(15, 8)), tagOf(["carry:ones"]));
});
test("sub positional borrow", () => {
  assert.strictEqual(tagOf(app.tagsForSub(8, 3)), tagOf(["borrow:none"]));
  assert.strictEqual(tagOf(app.tagsForSub(32, 15)), tagOf(["borrow:ones"]));
  assert.strictEqual(tagOf(app.tagsForSub(300, 199)), tagOf(["borrow:ones+tens"]));
  assert.strictEqual(tagOf(app.tagsForSub(512, 371)), tagOf(["borrow:tens"]));
  // 403 - 197: ones 3<7 borrow; tens 0-1 < 9 borrow; hundreds 4-1 >= 1
  assert.strictEqual(tagOf(app.tagsForSub(403, 197)), tagOf(["borrow:ones+tens"]));
});
test("tagsForRow recomputes add/sub/mul tags from question text, ignoring stored tags", () => {
  assert.strictEqual(tagOf(app.tagsForRow({ mode: "add", question: "174 + 463 = ?", tags: ["carry:1"] })), tagOf(["carry:tens"]));
  assert.strictEqual(tagOf(app.tagsForRow({ mode: "sub", question: "32 - 15 = ?", tags: ["borrow:1"] })), tagOf(["borrow:ones"]));
  assert.strictEqual(tagOf(app.tagsForRow({ mode: "mul", question: "87 × 6 = ?", tags: ["x6", "carry:2+"] })), tagOf(["x6", "carry:ones+tens"]));
  assert.strictEqual(tagOf(app.tagsForRow({ mode: "div", question: "84 ÷ 7 = ?", tags: ["div7"] })), tagOf(["div7"]));
});
test("gate tag stats use recomputed tags, stored rows untouched", () => {
  const q = { round_id: "rA", mode: "add", question: "174 + 463 = ?", correct: true, skipped: false, latency_ms: 1000, tags: ["carry:1"] };
  const stats = app.computeTagStats([q]);
  assert.deepStrictEqual(Array.from(stats.map((t) => t.tag)), ["carry:tens"]);
  assert.deepStrictEqual(Array.from(q.tags), ["carry:1"]);
});

test("mul tags single-digit operand tag (x7)", () => {
  const tags = app.tagsForMul(23, 7);
  assert.ok(tags.indexOf("x7") !== -1, "expected x7 tag, got " + tags.join(","));
});
test("mul tags no single-digit tag when both multi-digit", () => {
  const tags = app.tagsForMul(23, 45);
  assert.ok(!tags.some((t) => /^x\d+$/.test(t)), "unexpected single-digit tag: " + tags.join(","));
});
test("mul positional carries across partial products", () => {
  // 23x5 = 115 carries in ones and tens; 23x4 shifted carries in tens; 115 + 920 carries in hundreds
  assert.strictEqual(JSON.stringify(app.tagsForMul(23, 45)), JSON.stringify(["carry:ones+tens+hundreds"]));
  assert.strictEqual(JSON.stringify(app.tagsForMul(87, 6)), JSON.stringify(["x6", "carry:ones+tens"]));
  assert.strictEqual(JSON.stringify(app.tagsForMul(6, 87)), JSON.stringify(["x6", "carry:ones+tens"]));
  assert.strictEqual(JSON.stringify(app.tagsForMul(21, 3)), JSON.stringify(["x3", "carry:none"]));
});

test("div tag matches divisor", () => {
  assert.strictEqual(JSON.stringify(app.tagsForDiv(7)), JSON.stringify(["div7"]));
});

console.log("No repeated question text within a round");

test("generateUnique avoids repeats", () => {
  const seen = {};
  const seenSet = { has: (q) => !!seen[q] };
  const questions = [];
  for (let i = 0; i < 30; i++) {
    const q = app.generateUnique("div", "beginner", seenSet, null);
    seen[q.question] = true;
    questions.push(q.question);
  }
  const unique = new Set(questions);
  // div beginner has 11*11=121 possible combos, so 30 draws should stay unique
  assert.strictEqual(unique.size, questions.length);
});

console.log("Gate logic: sample round data");

function makeRound(overrides) {
  return Object.assign({
    timestamp: new Date().toISOString(),
    mode: "add",
    difficulty: "intermediate",
    round_seconds: 300,
    asked: 20,
    correct: 20,
    accuracy: 100,
    avg_time_ms: 2000,
    round_id: "r" + Math.random(),
    drill: false,
    legacy: false
  }, overrides);
}

test("Calibrating when fewer than 3 qualifying rounds", () => {
  const rounds = [makeRound({}), makeRound({})];
  const gate = app.computeGate("add", "intermediate", rounds, []);
  assert.strictEqual(gate.status, "Calibrating");
  assert.strictEqual(gate.label, "Calibrating (2/3)");
});

test("rounds below minAnswered do not qualify", () => {
  const rounds = [makeRound({ asked: 5 }), makeRound({ asked: 9 }), makeRound({ asked: 3 })];
  const gate = app.computeGate("add", "intermediate", rounds, []);
  assert.strictEqual(gate.status, "Calibrating");
});

test("Advance: pooled >=95%, every round >=90%, combined latency <= target", () => {
  // pooled = (20 + 19 + 18) / 60 = 95%, one round at 90%
  const rounds = [
    makeRound({ asked: 20, correct: 20, accuracy: 100, avg_time_ms: 3000 }),
    makeRound({ asked: 20, correct: 19, accuracy: 95, avg_time_ms: 4000 }),
    makeRound({ asked: 20, correct: 18, accuracy: 90, avg_time_ms: 4200 })
  ];
  // add intermediate target = 4500ms
  const gate = app.computeGate("add", "intermediate", rounds, []);
  assert.strictEqual(gate.status, "Advance");
  assert.ok(Math.abs(gate.pooledAccuracy - 95) < 1e-9);
});

test("Hold when pooled accuracy < 95% even though each round >= 90%", () => {
  // pooled = (19 + 19 + 18) / 60 = 93.3%
  const rounds = [
    makeRound({ asked: 20, correct: 19, accuracy: 95 }),
    makeRound({ asked: 20, correct: 19, accuracy: 95 }),
    makeRound({ asked: 20, correct: 18, accuracy: 90 })
  ];
  const gate = app.computeGate("add", "intermediate", rounds, []);
  assert.strictEqual(gate.status, "Hold");
});

test("Hold when pooled >= 95% but one round < 90%", () => {
  // pooled = (40 + 40 + 17) / 100 = 97%; last round 85% (not Drill, but below 90%)
  const rounds = [
    makeRound({ asked: 40, correct: 40, accuracy: 100 }),
    makeRound({ asked: 40, correct: 40, accuracy: 100 }),
    makeRound({ asked: 20, correct: 17, accuracy: 85 })
  ];
  const gate = app.computeGate("add", "intermediate", rounds, []);
  assert.ok(gate.pooledAccuracy >= 95);
  assert.strictEqual(gate.status, "Hold");
});

test("Drill still checked before Advance", () => {
  const rounds = [
    makeRound({ asked: 100, correct: 100, accuracy: 100 }),
    makeRound({ asked: 100, correct: 100, accuracy: 100 }),
    makeRound({ asked: 10, correct: 8, accuracy: 80 })
  ];
  const gate = app.computeGate("add", "intermediate", rounds, []);
  assert.strictEqual(gate.status, "Drill");
});

test("Drill when any round below 85% accuracy", () => {
  const rounds = [
    makeRound({ accuracy: 80 }),
    makeRound({ accuracy: 96 }),
    makeRound({ accuracy: 97 })
  ];
  const gate = app.computeGate("add", "intermediate", rounds, []);
  assert.strictEqual(gate.status, "Drill");
});

test("Drill when a tag has >=3 attempts and miss rate >=15%", () => {
  const rounds = [
    makeRound({ round_id: "rA", accuracy: 90 }),
    makeRound({ round_id: "rB", accuracy: 90 }),
    makeRound({ round_id: "rC", accuracy: 90 })
  ];
  const questions = [];
  ["rA", "rB", "rC"].forEach((rid) => {
    for (let i = 0; i < 3; i++) {
      questions.push({
        round_id: rid, mode: "add", difficulty: "intermediate",
        correct: i !== 0, skipped: false, latency_ms: 1000, tags: ["carry:1"]
      });
    }
  });
  const gate = app.computeGate("add", "intermediate", rounds, questions);
  assert.strictEqual(gate.status, "Drill");
});

test("Drill when a tag's avg latency >= 1.5x speed target", () => {
  const rounds = [
    makeRound({ round_id: "rA", accuracy: 96 }),
    makeRound({ round_id: "rB", accuracy: 96 }),
    makeRound({ round_id: "rC", accuracy: 96 })
  ];
  const questions = [];
  ["rA", "rB", "rC"].forEach((rid) => {
    for (let i = 0; i < 3; i++) {
      questions.push({
        round_id: rid, mode: "add", difficulty: "intermediate",
        correct: true, skipped: false, latency_ms: 7000, tags: ["carry:1"]
      });
    }
  });
  // add intermediate target 4500ms, 1.5x = 6750ms; 7000 exceeds it
  const gate = app.computeGate("add", "intermediate", rounds, questions);
  assert.strictEqual(gate.status, "Drill");
});

test("Hold when accuracy/speed don't clear Advance but nothing triggers Drill", () => {
  const rounds = [
    makeRound({ accuracy: 90, avg_time_ms: 5000 }),
    makeRound({ accuracy: 90, avg_time_ms: 5000 }),
    makeRound({ accuracy: 90, avg_time_ms: 5000 })
  ];
  const gate = app.computeGate("add", "intermediate", rounds, []);
  assert.strictEqual(gate.status, "Hold");
});

test("skipped questions excluded from tag stats", () => {
  const rounds = [
    makeRound({ round_id: "rA", accuracy: 96 }),
    makeRound({ round_id: "rB", accuracy: 96 }),
    makeRound({ round_id: "rC", accuracy: 96 })
  ];
  const questions = [];
  ["rA", "rB", "rC"].forEach((rid) => {
    questions.push({ round_id: rid, correct: false, skipped: true, latency_ms: null, tags: ["carry:1"] });
    questions.push({ round_id: rid, correct: true, skipped: false, latency_ms: 1000, tags: ["carry:1"] });
  });
  const gate = app.computeGate("add", "intermediate", rounds, questions);
  const tagStat = gate.tagStats.find((t) => t.tag === "carry:1");
  assert.strictEqual(tagStat.attempts, 3, "skipped questions should not count as attempts");
});

test("weakestTags ranks by miss rate then latency, respects min attempts", () => {
  const tagStats = [
    { tag: "a", attempts: 2, misses: 2, missRate: 1, avgLatency: 100 }, // excluded, <3 attempts
    { tag: "b", attempts: 5, misses: 1, missRate: 0.2, avgLatency: 3000 },
    { tag: "c", attempts: 5, misses: 2, missRate: 0.4, avgLatency: 1000 }
  ];
  const weak = app.weakestTags(tagStats, 2);
  assert.deepStrictEqual(weak.map((t) => t.tag), ["c", "b"]);
});

test("Drill status unlocks nothing; Advance sets sticky unlock flag", () => {
  const rounds = [
    makeRound({ mode: "div", difficulty: "intermediate", accuracy: 100, avg_time_ms: 2000 }),
    makeRound({ mode: "div", difficulty: "intermediate", accuracy: 96, avg_time_ms: 2000 }),
    makeRound({ mode: "div", difficulty: "intermediate", accuracy: 95, avg_time_ms: 2000 })
  ];
  const unlocked = app.refreshUnlocks(rounds, []);
  assert.strictEqual(unlocked.div, true);
  assert.strictEqual(app.currentLevel("div", unlocked), "advanced");
});

console.log("Drill weighting");

function hq(question, correct, latency, extra) {
  return Object.assign({ mode: "add", difficulty: "intermediate", question: question + " = ?", correct, skipped: false, latency_ms: latency }, extra || {});
}

test("drill weight = max(missRate/0.05, median latency/target); <3 attempts -> 1", () => {
  const qs = [];
  // carry:tens (52 + 61): 4 attempts, 1 miss -> 0.25/0.05 = 5
  for (let i = 0; i < 4; i++) qs.push(hq("52 + 61", i !== 0, 1000));
  // carry:ones (15 + 18): 3 correct, median 9000ms -> 9000/4500 = 2
  qs.push(hq("15 + 18", true, 9000), hq("15 + 18", true, 9000), hq("15 + 18", true, 1000));
  // carry:none (12 + 13): 2 attempts only -> default 1
  qs.push(hq("12 + 13", false, 1000), hq("12 + 13", false, 1000));
  const w = {};
  app.drillTagWeights("add", "intermediate", qs, ["carry:none", "carry:ones", "carry:tens", "carry:ones+tens"])
    .forEach((x) => { w[x.tag] = x.weight; });
  assert.strictEqual(w["carry:tens"], 5);
  assert.strictEqual(w["carry:ones"], 2);
  assert.strictEqual(w["carry:none"], 1);
  assert.strictEqual(w["carry:ones+tens"], 1);
});

test("drill weights ignore legacy, skipped, other modes, and only use last 200", () => {
  const qs = [];
  for (let i = 0; i < 5; i++) qs.push(hq("52 + 61", false, 1000, { legacy: true }));
  for (let i = 0; i < 5; i++) qs.push(hq("52 + 61", false, 1000, { skipped: true }));
  for (let i = 0; i < 5; i++) qs.push(hq("52 + 61", false, 1000, { difficulty: "advanced" }));
  for (let i = 0; i < 5; i++) qs.push(hq("52 + 61", false, 1000)); // pushed out by the 200 below
  for (let i = 0; i < 200; i++) qs.push(hq("12 + 13", true, 900));
  const res = app.drillTagWeights("add", "intermediate", qs, ["carry:tens", "carry:none"]);
  const tens = res.find((x) => x.tag === "carry:tens");
  assert.strictEqual(tens.attempts, 0);
  assert.strictEqual(tens.weight, 1);
  assert.strictEqual(res.find((x) => x.tag === "carry:none").weight, 0.2);
});

test("tag universe for add intermediate has the 4 reachable carry tags", () => {
  assert.deepStrictEqual(Array.from(app.tagUniverse("add", "intermediate")),
    ["carry:none", "carry:ones", "carry:ones+tens", "carry:tens"]);
});

test("pickWeightedTag follows weights", () => {
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) counts[app.pickWeightedTag([{ tag: "a", weight: 3 }, { tag: "b", weight: 1 }])]++;
  const ratio = counts.a / 4000;
  assert.ok(ratio > 0.70 && ratio < 0.80, "ratio " + ratio);
});

test("generateUnique with target tag returns a matching question", () => {
  const seenSet = { has: () => false };
  for (let i = 0; i < 50; i++) {
    const q = app.generateUnique("add", "advanced", seenSet, "carry:ones+tens+hundreds");
    assert.ok(q.tags.indexOf("carry:ones+tens+hundreds") !== -1, q.question);
  }
});

console.log("len_mismatch typing-error flag");

test("lenMismatch: wrong with different digit count only", () => {
  assert.strictEqual(app.lenMismatch(false, "1135", "135"), true);
  assert.strictEqual(app.lenMismatch(false, "136", "135"), false);
  assert.strictEqual(app.lenMismatch(true, "135", "135"), false);
  assert.strictEqual(app.lenMismatch(false, "13", 135), true);
});

test("questions.csv has len_mismatch as the last column", () => {
  const csv = app.questionsToCSV([
    { question: "52 + 61 = ?", correct_answer: 113, user_answer: "1113", correct: false, skipped: false, tags: ["carry:tens"], len_mismatch: true },
    { question: "52 + 61 = ?", correct_answer: 113, user_answer: "", correct: false, skipped: true, tags: ["carry:tens"] }
  ]);
  const lines = csv.split("\n");
  const header = lines[0].split(",");
  assert.strictEqual(header[header.length - 1], "len_mismatch");
  assert.ok(lines[1].endsWith(",true"));
  assert.ok(lines[2].endsWith(",false"), "skipped rows are never len_mismatch");
});

console.log("CSV import mapping");

test("mult-beginner / n/a maps to mul / beginner", () => {
  const row = app.parseLegacyRow(["2025-01-01T00:00:00", "mult-beginner", "n/a", "60", "20", "19", "95.0", "3000"]);
  assert.strictEqual(row.mode, "mul");
  assert.strictEqual(row.difficulty, "beginner");
  assert.strictEqual(row.legacy, true);
});

test("rows with asked < 5 are skipped on import", () => {
  const csv = "timestamp,mode,difficulty,round_seconds,asked,correct,accuracy,avg_time_ms\n" +
    "2025-01-01T00:00:00,add,beginner,60,3,3,100.0,2000\n" +
    "2025-01-02T00:00:00,add,beginner,60,10,9,90.0,2500\n";
  const result = app.importLegacyCSV(csv, []);
  assert.strictEqual(result.imported.length, 1);
  assert.strictEqual(result.skipped, 1);
});

test("duplicate timestamp+mode+difficulty is deduped", () => {
  const existing = [{ timestamp: "2025-01-02T00:00:00", mode: "add", difficulty: "beginner" }];
  const csv = "timestamp,mode,difficulty,round_seconds,asked,correct,accuracy,avg_time_ms\n" +
    "2025-01-02T00:00:00,add,beginner,60,10,9,90.0,2500\n";
  const result = app.importLegacyCSV(csv, existing);
  assert.strictEqual(result.imported.length, 0);
  assert.strictEqual(result.skipped, 1);
});

test("10-column row keeps pct stage name", () => {
  const row = app.parseLegacyRow(["2025-01-01T00:00:00", "add", "beginner", "60", "20", "19", "95.0", "3000", "x", "stage4"]);
  assert.strictEqual(row.stage, "stage4");
});

console.log("Storage key namespacing");

test("storage keys use an app-specific prefix, not a generic one", () => {
  assert.ok(app.SETTINGS.storageKeys.rounds.indexOf("mma_") === 0);
  assert.ok(app.SETTINGS.storageKeys.questions.indexOf("mma_") === 0);
  assert.ok(app.SETTINGS.storageKeys.unlocked.indexOf("mma_") === 0);
});

test("migrateLegacyStorageKeys moves old unprefixed data to the new keys", () => {
  const fresh = loadApp();
  fresh.localStorage.setItem("mm_rounds", JSON.stringify([{ mode: "add" }]));
  fresh.localStorage.setItem("mm_questions", JSON.stringify([{ mode: "add" }]));
  fresh.localStorage.setItem("mm_unlocked", JSON.stringify({ add: true }));

  fresh.migrateLegacyStorageKeys();

  assert.strictEqual(fresh.localStorage.getItem("mm_rounds"), null, "old rounds key should be removed");
  assert.strictEqual(fresh.getRounds().length, 1);
  assert.strictEqual(fresh.getQuestions().length, 1);
  assert.strictEqual(fresh.getUnlocked().add, true);
});

test("migration does not overwrite data already present under the new keys", () => {
  const fresh = loadApp();
  fresh.localStorage.setItem("mm_rounds", JSON.stringify([{ mode: "old" }]));
  fresh.saveRounds([{ mode: "new" }]);

  fresh.migrateLegacyStorageKeys();

  assert.strictEqual(fresh.getRounds().length, 1);
  assert.strictEqual(fresh.getRounds()[0].mode, "new");
});

console.log("Export uses two separate buttons (avoids Android Chrome multi-download block)");

test("two distinct export buttons exist, each bound to its own single download", () => {
  assert.ok(/id="btn-export-rounds"/.test(htmlSource), "expected a dedicated rounds export button");
  assert.ok(/id="btn-export-questions"/.test(htmlSource), "expected a dedicated questions export button");
  assert.strictEqual(typeof app.handleExportRounds, "function");
  assert.strictEqual(typeof app.handleExportQuestions, "function");
  assert.strictEqual(app.handleExport, undefined, "combined single-button export handler should be gone");
});

test("handleExportRounds triggers exactly one download, for rounds.csv only", () => {
  const fresh = loadApp();
  const calls = [];
  fresh.triggerDownload = (filename) => calls.push(filename);
  fresh.handleExportRounds();
  assert.deepStrictEqual(calls, ["rounds.csv"]);
});

test("handleExportQuestions triggers exactly one download, for questions.csv only", () => {
  const fresh = loadApp();
  const calls = [];
  fresh.triggerDownload = (filename) => calls.push(filename);
  fresh.handleExportQuestions();
  assert.deepStrictEqual(calls, ["questions.csv"]);
});

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
