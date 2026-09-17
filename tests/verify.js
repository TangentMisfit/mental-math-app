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

test("add intermediate stays in 0-100", () => {
  repeatCheck(() => {
    const q = app.genAdd("intermediate");
    const [a, b] = q.question.split(" + ").map(Number);
    assert.ok(a >= 0 && a <= 100);
    assert.ok(b >= 0 && b <= 100);
  }, 500);
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

test("sub intermediate: a>=b, both 0-100", () => {
  repeatCheck(() => {
    const q = app.genSub("intermediate");
    const [a, b] = q.question.split(" - ").map(Number);
    assert.ok(a >= 0 && a <= 100 && b >= 0 && b <= 100);
    assert.ok(a >= b);
  }, 500);
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

test("add carry:0 for 12 + 3", () => {
  assert.strictEqual(JSON.stringify(app.tagsForAdd(12, 3)), JSON.stringify(["carry:0"]));
});
test("add carry:1 for 15 + 8", () => {
  assert.strictEqual(JSON.stringify(app.tagsForAdd(15, 8)), JSON.stringify(["carry:1"]));
});
test("add carry:2+ for 999 + 999", () => {
  assert.strictEqual(JSON.stringify(app.tagsForAdd(999, 999)), JSON.stringify(["carry:2+"]));
});

test("sub borrow:0 for 8 - 3", () => {
  assert.strictEqual(JSON.stringify(app.tagsForSub(8, 3)), JSON.stringify(["borrow:0"]));
});
test("sub borrow:1 for 32 - 15", () => {
  assert.strictEqual(JSON.stringify(app.tagsForSub(32, 15)), JSON.stringify(["borrow:1"]));
});
test("sub borrow:2+ for 300 - 199", () => {
  assert.strictEqual(JSON.stringify(app.tagsForSub(300, 199)), JSON.stringify(["borrow:2+"]));
});

test("mul tags single-digit operand tag (x7)", () => {
  const tags = app.tagsForMul(23, 7);
  assert.ok(tags.indexOf("x7") !== -1, "expected x7 tag, got " + tags.join(","));
});
test("mul tags no single-digit tag when both multi-digit", () => {
  const tags = app.tagsForMul(23, 45);
  assert.ok(!tags.some((t) => /^x\d+$/.test(t)), "unexpected single-digit tag: " + tags.join(","));
});
test("mul carries computed for 23 x 45", () => {
  // 23*45 = 1035, verify via a carry count sanity check (has at least one carry)
  const tags = app.tagsForMul(23, 45);
  assert.ok(tags.some((t) => t.indexOf("carry:") === 0));
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

test("Advance when all 3 rounds >=95% and combined latency <= target", () => {
  const rounds = [
    makeRound({ accuracy: 100, avg_time_ms: 3000 }),
    makeRound({ accuracy: 96, avg_time_ms: 4000 }),
    makeRound({ accuracy: 95, avg_time_ms: 4200 })
  ];
  // add intermediate target = 4500ms
  const gate = app.computeGate("add", "intermediate", rounds, []);
  assert.strictEqual(gate.status, "Advance");
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
