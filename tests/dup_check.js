// Read-only report of likely double-submit duplicates in logged questions.
// Usage: node tests/dup_check.js path/to/questions.csv
// (export it from the app with "Export questions.csv"). Never writes anything.
// With no argument it checks the browser storage of a fresh app (empty) and exits 0,
// so it is safe to run alongside the other tests.
// In the browser console the same check is: findLikelyDuplicates(getQuestions())
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
const sandbox = {
  console, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  document: { addEventListener: () => {} }, navigator: {}, window: {}, Date, Math, JSON
};
vm.createContext(sandbox);
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], sandbox);

function loadCSV(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const header = sandbox.parseCSVLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cols = sandbox.parseCSVLine(l);
    const o = {};
    header.forEach((h, i) => { o[h] = cols[i]; });
    return o;
  });
}

const file = process.argv[2];
const questions = file ? loadCSV(file) : sandbox.getQuestions();
const res = sandbox.findLikelyDuplicates(questions);
console.log("Likely duplicate question rows (same round_id, question, answer, within 2 s)");
console.log("Source: " + (file || "empty app storage (pass a questions.csv path)"));
console.log("Rows checked: " + questions.length + ", likely duplicates: " + res.total);
Object.keys(res.byModeDifficulty).sort().forEach((k) => console.log("  " + k + ": " + res.byModeDifficulty[k]));
