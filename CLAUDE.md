# CLAUDE.md

Mental math practice app: the original Python terminal game plus a mobile PWA port for Android (Pixel 9 Pro), hosted on GitHub Pages.

## Layout
- `mental_math_game.py`, `config.json`, `pct_stage.json`, `README.md`, `30_day_bootcamp.md`: original app and reference docs. DO NOT modify, move, or delete.
- `progress.csv`: personal legacy data. Gitignored. Never commit, never edit.
- `docs/`: the phone app, served by GitHub Pages. `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`.
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

- Division: dividend = divisor × quotient, displayed as `dividend ÷ divisor`. Always clean.
- No repeated question text within a round.

## Rounds
- 300 seconds, visible countdown, ends at 0 even mid-question.
- Skip: logged with `skipped=true`; excluded from asked, correct, and latency. Does not end the round.
- Empty submit does nothing.

## Levels
- All four modes start at intermediate. Beginner shows as complete but stays playable.
- Advanced is locked per mode until that mode's intermediate gate returns Advance.
- Advanced unlock is sticky: once a mode's intermediate gate returns Advance, advanced stays unlocked even if later rounds drop the gate.

## Data (localStorage)
- Round log: `timestamp, mode, difficulty, round_seconds, asked, correct, accuracy, avg_time_ms, round_id, drill, legacy, stage`
- Question log: `timestamp, round_id, mode, difficulty, question, correct_answer, user_answer, correct, skipped, latency_ms, tags, drill`

## Tags (computed at generation)
- add: `carry:0` | `carry:1` | `carry:2+`
- sub: `borrow:0` | `borrow:1` | `borrow:2+`
- mul: `x<d>` when one operand is single-digit (e.g. `x7`), plus `carry:0` | `carry:1` | `carry:2+` counted across partial products
- div: `div<divisor>` (e.g. `div7`)

## Gates (per mode + difficulty)
Window: last 3 rounds with `drill=false`, `legacy=false`, and >= 10 answered.

Evaluate in this order; first match wins:
1. **Calibrating**: fewer than 3 qualifying rounds. Display "Calibrating (n/3)".
2. **Drill**: any round < 85% accuracy, OR any tag with >= 3 attempts in the window having miss rate >= 15% or avg latency >= 1.5× speed target.
3. **Advance**: all 3 rounds >= 95% accuracy AND combined avg latency <= speed target. Unlocks the next difficulty.
4. **Hold**: everything else.

Speed targets (ms):

| Mode | beginner | intermediate | advanced |
|---|---|---|---|
| add | 3000 | 4500 | 7000 |
| sub | 3000 | 4500 | 7000 |
| mul | 3000 | 5000 | 15000 |
| div | 3000 | 5000 | 7000 |

Weakest tags: rank by miss rate, tiebreak by avg latency, minimum 3 attempts.

## Features
- **Home dashboard**: one card per mode showing level, gate status, last-3 accuracy and avg time, top 2 weakest tags.
- **Today's plan**: queues up to 3 rounds. Order: Drill, then Calibrating, then Hold.
- **Weak-spot round** (modes in Drill): 60% of questions regenerated until they match the mode's 2 weakest tags (max 50 attempts per question, then fall back to normal), 40% normal. Logged `drill=true`.
- **End-of-round summary**: asked, correct, accuracy, avg time, gate status before and after, every miss, 3 slowest correct answers.
- Dark mode via `prefers-color-scheme`.

## Import / export
- **Import CSV** (legacy `progress.csv`):
  - `mult-beginner` with difficulty `n/a` maps to `mul` / `beginner`
  - Accept 8, 9, or 10 columns; 10th column is the pct stage name, store in `stage`
  - Skip rows with `asked < 5`
  - Dedupe on `timestamp + mode + difficulty`
  - Set `legacy=true`: visible in history, never counts toward gates
- **Export**: downloads `rounds.csv` and `questions.csv`.

## Known Python bugs (reference only; do not fix the .py)
- Empty input ends the round.
- Timer only checked between questions.
- `save_meta_event()` is called but undefined.
