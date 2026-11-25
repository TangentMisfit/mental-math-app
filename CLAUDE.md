# CLAUDE.md

Mental math practice app: the original Python terminal game plus a mobile PWA port for Android (Pixel 9 Pro), hosted on GitHub Pages.

## Layout
- `mental_math_game.py`, `config.json`, `pct_stage.json`, `README.md`, `30_day_bootcamp.md`: original app and reference docs. DO NOT modify, move, or delete.
- `progress.csv`: personal legacy data. Gitignored. Never commit, never edit.
- `docs/`: the phone app, served by GitHub Pages. `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, `.nojekyll` (disables Jekyll processing on GitHub Pages).
- `tests/`: Node test scripts. Not deployed.

## Hard rules
- No frameworks, bundlers, or npm dependencies in `docs/`. Single `index.html` with inline CSS and JS.
- Relative paths only. The app runs under a GitHub Pages subpath.
- All tunable values live in one `SETTINGS` object at the top of the script.
- Bump `CACHE_VERSION` in `sw.js` on every change to `docs/`, or phones keep serving the old version.
- Input is the on-screen keypad only. Never open the system keyboard.
- Run every test in `tests/` with node before each commit. Fix failures first.
- One logical change per commit, clear message.
- Repo is public: no personal data, names, or real progress numbers in code, tests, fixtures, or commits.
- When a spec decision changes, update this file in the same commit as the code.
- All localStorage keys use the `mma_` prefix. Never write unprefixed keys.
- Displayed app version lives in `SETTINGS.appVersion`. Bump it (and `CACHE_VERSION`) on user-visible changes.

## Commands
- Local preview: `python -m http.server 8000 -d docs` then open http://localhost:8000
- Tests: `node tests/<file>.js` for each file in `tests/`
- Deploy: `git push origin main` (Pages serves `/docs` on `main`)

## Scope
- v1 modes: add, sub, mul, div.
- pct, scale, mixed, ratios: show "coming soon." No generators.
- Do not invent pct or scale generators. Their original definitions exist outside this repo.

## Generators
Match the Python file unless noted. Inclusive ranges, operands drawn independently.

| Mode | beginner | intermediate | advanced |
|---|---|---|---|
| add | a, b: 0-20 | a, b: 0-100 | a, b: 100-999 |
| sub | a, b: 0-20, swap so a >= b | a, b: 0-100, swap | a, b: 100-999, swap |
| mul | a, b: 1-12 | a: 10-99, b: 2-9 | a, b: 10-99 |
| div | divisor 2-12, quotient 2-12 | divisor 3-12, quotient 13-40 (**changed from Python**) | divisor 2-19, quotient 5-99 |

- Intermediate add/sub filler filter (keeps the 0-100 range, after the sub swap): reject when either operand < 10, the second operand is 0, or both operands are multiples of 10. Beginner and advanced are unfiltered.
- Division: dividend = divisor × quotient, displayed as `dividend ÷ divisor`. Always clean.
- No repeated question text within a round.

## Rounds
- 300 seconds, visible countdown, ends at 0 even mid-question.
- Skip: logged with `skipped=true`; excluded from asked, correct, and latency. Does not end the round.
- Empty submit does nothing.
- Answered lock: once a question's final answer is accepted, every further submit, skip, and keypad press is ignored until the next question is displayed; Submit, Skip, and the scaffold Steps button are disabled during the feedback pause. Applies to normal, drill, and all Sub Lab rounds, including scaffold single-input and stepped questions (stepped step 1 clears the input and moves to step 2; the lock applies at step 2). A round ending during the pause never logs the question again, and a pending feedback timer never advances a different round.
- Duplicate check (read-only): `findLikelyDuplicates(questions)` flags rows with the same round_id, question, and user answer within 2 s of an earlier match. `node tests/dup_check.js <questions.csv>` reports counts per mode/difficulty. Never modifies stored data.

## Levels
- All four modes start at intermediate. Beginner shows as complete but stays playable.
- Advanced is locked per mode until that mode's intermediate gate returns Advance.
- Advanced unlock is sticky: once a mode's intermediate gate returns Advance, advanced stays unlocked even if later rounds drop the gate.

## Data (localStorage)
- Round log: `timestamp, mode, difficulty, round_seconds, asked, correct, accuracy, avg_time_ms, round_id, drill, legacy, stage, sublab`
- Question log: `timestamp, round_id, mode, difficulty, question, correct_answer, user_answer, correct, skipped, latency_ms, tags, drill, len_mismatch, sublab, step1_answer, step1_expected, step2_answer, stepped`. Export adds a computed `error_type` column after `stepped`.
- `len_mismatch`: true when the answer is wrong AND the user's answer has a different digit count than the correct answer (likely typo). Always false for skipped rows. Scoring unchanged: still a wrong answer. Rows logged before this column existed have it computed on export.
- `sublab`: true for Sub Lab rounds/questions. Missing on older rows; exported as `false`.
- `step1_answer`, `step1_expected`, `step2_answer`: Sub Lab scaffold questions only; blank otherwise. Single-input scaffold questions fill only `step1_expected`.
- `stepped`: scaffold questions only; true when the Steps button was used for that question. Blank for non-scaffold rows and rows logged before this column existed.
- `error_type` (diagnostic, all modes and labs): computed from each logged row on read, never stored, so it covers all history with no migration. diff = `user_answer - correct_answer`; `slip_ones` if 1 <= |diff| <= 9; `slip_tens` if |diff| is a multiple of 10 in 10-90; `slip_hundreds` if |diff| is a multiple of 100 in 100-900; `other` otherwise (including non-numeric answers); blank for correct or skipped rows. It is NOT a tag: never used by gates, weakest tags, speed focus, or drill weighting.
  - Results screen (normal, drill, and lab rounds): with >= 2 misses, shows "Most misses: <type> (n of m)". Ties go to the first of slip_ones, slip_tens, slip_hundreds, other.
  - Mode card: "Miss types" breakdown over the gate window rounds plus non-legacy drill rounds of the same mode+difficulty logged at or after the oldest window round (hidden when the window is empty).
- New columns are always appended at the end of the CSV so older column positions never move.

## Tags (computed at generation)
Positional carry/borrow: list the columns that produce a carry (add) or need a borrow (sub), lowest first, joined with `+`, using `ones`, `tens`, `hundreds` (`thousands`, `tenthousands` for mul). None = `carry:none` / `borrow:none`. Work column by column including the incoming carry/borrow; a chained carry counts in the column where it happens.
- add: e.g. 174+463 → `carry:tens`; 938+698 → `carry:ones+tens+hundreds`; 757+151 → `carry:tens`; 95+5 → `carry:ones+tens`; 12+13 → `carry:none`
- sub: e.g. 32-15 → `borrow:ones`; 512-371 → `borrow:tens`; 300-199 → `borrow:ones+tens`; 8-3 → `borrow:none`
- sub borrow count: every sub question also gets `borrow0`, `borrow1`, `borrow2`, or `borrow3+` = number of column borrows in standard right-to-left subtraction (same columns as the positional tag). e.g. 742-386 → `borrow2`; 865-123 → `borrow0`; 702-358 → `borrow2`; 540-217 → `borrow1`. Participates in gates, weakest tags, and drill weights like any tag (same >= 3 attempt minimum). `borrow3+` is unreachable with current generators.
- mul: `x<d>` when one operand is single-digit (e.g. `x7`), plus a positional `carry:` tag over absolute answer columns where a carry happens in any partial product or in summing them (multi-digit operand is the multiplicand). e.g. 87×6 → `x6`, `carry:ones+tens`; 23×45 → `carry:ones+tens+hundreds`
- div: `div<divisor>` (e.g. `div7`)
- Reachable tags: add intermediate `carry:none|ones|tens|ones+tens`; add advanced all 8 combos of ones/tens/hundreds plus none; sub intermediate `borrow:none|ones|ones+tens` (the last only with 100 as minuend), and `borrow0|1|2` likewise; sub advanced `borrow0|1|2`.
- History: wherever tag stats are computed (gates, weakest tags, drill weights), add/sub/mul tags are recomputed from the question text, not read from the stored `tags`. Stored rows are never rewritten.

## Gates (per mode + difficulty)
Window: last 3 rounds with `drill=false`, `legacy=false`, and >= 10 answered.

Accuracy is the primary gate. Speed is a loose ceiling on Advance plus a non-blocking signal.

`SPEED_CEILING_MULT = 1.5` (in `SETTINGS`). Advance ceiling = speed target × `SPEED_CEILING_MULT`.

Evaluate in this order; first match wins:
1. **Calibrating**: fewer than 3 qualifying rounds. Display "Calibrating (n/3)".
2. **Drill** (accuracy-only): any window round < 85% accuracy, OR any tag with >= 3 attempts in the window having miss rate >= 15%. Latency never triggers Drill.
3. **Advance**: every one of the 3 window rounds >= 95% accuracy AND window avg latency (weighted by answered per round) <= speed target × `SPEED_CEILING_MULT`. Unlocks the next difficulty.
4. **Hold**: everything else. If accuracy passes Advance but latency is over the ceiling, the reason reads "Accuracy passing; speed above ceiling."

**Speed focus** (non-blocking signal): any tag with >= 3 attempts in the window and avg latency >= 1.5× speed target. Shown on the dashboard card and on a separate "Speed focus" line in Today's plan. Never changes gate status.

Speed targets are goals, not gates. Displayed as avg vs goal plus the advance ceiling, e.g. "4.9s / goal 4.5s · ceiling 6.8s". Pooled window accuracy is still displayed but no longer gates.

Speed targets (ms):

| Mode | beginner | intermediate | advanced |
|---|---|---|---|
| add | 3000 | 4500 | 7000 |
| sub | 3000 | 4500 | 7000 |
| mul | 3000 | 5000 | 15000 |
| div | 3000 | 5000 | 7000 |

Weakest tags: rank by miss rate, tiebreak by avg latency, minimum 3 attempts.

## Features
- **Home dashboard**: one card per mode showing level, gate status (with Drill/Hold reason), pooled window accuracy, avg time vs goal and ceiling, top 2 weakest tags, speed-focus tags.
- **Today's plan**: queues up to 3 rounds. Order: Drill, then Calibrating, then Hold. Speed-focus tags are listed on a separate "Speed focus" line, not as plan items.
- **Weak-spot round** (modes in Drill), logged `drill=true`:
  - 20% of questions: plain random from the normal generator.
  - 80%: pick a target tag by weighted sampling from a priority pool, then rejection-sample the normal generator until the question has that tag (cap 200 tries, then any unseen problem).
  - Candidate tags: every tag the current generator can produce for the mode+difficulty.
  - Weight per tag = `max(miss_rate / 0.05, median_latency / speed_target)`, from the last 200 answered (non-skipped), non-legacy questions for that mode+difficulty (drill rows included). Tags with < 3 attempts get weight 1.
  - Priority pool (same history): accuracy-weak tags (>= 3 attempts, miss rate >= 15%) first. Only if none, speed-focus tags (>= 3 attempts, avg latency >= 1.5× speed target). If neither, all candidate tags.
- **End-of-round summary**: asked, correct, accuracy, avg time, speed vs goal and ceiling, gate status before and after (with pooled accuracy and reason), every miss, 3 slowest correct answers.
- Dark mode via `prefers-color-scheme`.

## Sub Lab (v1.x)
Practice-only subtraction sub-skill drills, opened from the Sub Lab button on the Subtraction card. Purpose: reduce working-memory load in 3-digit subtraction by drilling rounding the subtrahend and adjusting.

- Logged to the normal round and question logs with mode `sublab`, difficulty = drill id, `sublab=true`, `drill=false`. Full per-question data, so it appears in CSV export.
- **Excluded from every gate window and Today's plan**, like legacy rows: `getQualifyingRounds` rejects `sublab` rows (and mode `sublab` is not in `SETTINGS.modes`, so no gate, unlock, dashboard card, or plan entry is ever computed for it). Drill weights also skip `sublab` questions.
- Same 300 s round, timer, skip, and empty-submit behavior as normal rounds. No repeated question text within a round.
- Sub Lab screen: one card per drill with last round's accuracy and avg latency, plus the flash duration setting.
- Results: asked, correct, accuracy, avg latency vs the display-only speed reference, worst tag by miss rate (min 3 attempts), misses, 3 slowest. No gate status.
- Speed references are display only, never used by a gate.

| id | Generator | Tags | Speed ref |
|---|---|---|---|
| `complement` | 50/50: `100 - n`, n 11-99; or `1000 - n`, n 101-999. Multiples of 10 excluded. | `comp100` / `comp1000` | 2500 ms comp100, 4000 ms comp1000 |
| `scaffold` | a 400-999, b 101..(a-50), b not a multiple of 10. Final answer first; optional Steps (see below). | `round_hundred` or `round_ten`, plus borrow-count tag of `a - r` | none |
| `nearround` | a 300-999, b 100-999, distance from b up to the next hundred above it is 1-30 (b mod 100 in 70-99), a - b >= 10. Single input. | borrow-count tag of `a - b`, `near_hundred` | 7000 ms |
| `flash` | sub/advanced generator. Problem visible for the flash duration, then shown as `? - ? = ?`; input stays live; latency from first display. Duration 1500/2000/3000 ms, default 2000, stored in `mma_flash_ms`. | borrow-count tag of `a - b`, `flash` | none |

Scaffold rounding rule: r = next hundred above b if (r - b) <= 30, else r = next ten above b. adj = r - b.
- Final-answer-first: each question shows `a - b = ?` and the hint `Round b up to r`, with one input for the final answer (a - b). Graded like a normal question. Latency = display to final submit. Logged `stepped=false`, `step1_expected` = a - r, `step1_answer` and `step2_answer` blank.
- Optional Steps: a small Steps button under the input switches that question only to the two-input flow: `a - b` at top, input 1 `a - r = ?`, input 2 `+ adj = ?` (adj shown). Correct only if both inputs are correct. Latency = display to second submit. Logged `stepped=true`, `user_answer` = `step2_answer` = second input, `step1_answer` = first input, `step1_expected` = a - r. The next question returns to single input.
- Miss feedback: the feedback area shows the user's answer vs the correct answer plus the worked breakdown `a - r = X, + adj = final` with real numbers. The feedback pause is 2500 ms for scaffold misses (`SETTINGS.subLab.scaffoldMissDelayMs`); all other feedback keeps the normal pause. No extra input.
- `question` = `a - b = ?`. A skip records `stepped` and whatever step 1 had.

## Import / export
- **Import CSV** (legacy `progress.csv`):
  - `mult-beginner` with difficulty `n/a` maps to `mul` / `beginner`
  - Accept 8, 9, or 10 columns; 10th column is the pct stage name, store in `stage`
  - Skip rows with `asked < 5`
  - Dedupe on `timestamp + mode + difficulty`
  - Set `legacy=true`: visible in history, never counts toward gates
- **Export**: two separate buttons, Export rounds.csv and Export questions.csv, each triggering exactly one download (Android Chrome blocks back-to-back downloads).
  - rounds.csv columns, in order: `timestamp, mode, difficulty, round_seconds, asked, correct, accuracy, avg_time_ms, round_id, drill, legacy, stage, sublab`.
  - questions.csv columns, in order: `timestamp, round_id, mode, difficulty, question, correct_answer, user_answer, correct, skipped, latency_ms, tags, drill, len_mismatch, sublab, step1_answer, step1_expected, step2_answer, stepped, error_type` (tags joined with `|`, as stored; `error_type` is the last column, computed on export).
  - Any new column is appended at the end.

## Known Python bugs (reference only; do not fix the .py)
- Empty input ends the round.
- Timer only checked between questions.
- `save_meta_event()` is called but undefined.
