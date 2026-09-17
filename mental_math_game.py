#!/usr/bin/env python3
# Mental Math Game — v0.7.1 (Simplified Advanced Arithmetic)
# -----------------------------------------------------------
# - Simplified advanced arithmetic to keep problem type aligned with module.
#   e.g., Addition mode only produces addition problems, no mixed ops.
# - All timed sessions remain 300 seconds.
# - No repeated problems per session.
# - Ratios & Proportions Primer placeholder retained.
# -----------------------------------------------------------

import json, os, time, random, csv, datetime, re, math, sys

APP_DIR = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.join(APP_DIR, "config.json")
LOG_PATH = os.path.join(APP_DIR, "progress.csv")

# ========================= CONFIG =========================
DEFAULT_CFG = {
    "round_seconds": 300,
    "beginner_max": 20,
    "intermediate_max": 100,
    "advanced_max": 999,
}

SEEN_THIS_ROUND = set()

def load_cfg():
    try:
        with open(CFG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_CFG.copy()

def save_result(row):
    header = ["timestamp","mode","difficulty","round_seconds","asked","correct","accuracy","avg_time_ms"]
    file_exists = os.path.isfile(LOG_PATH)
    with open(LOG_PATH, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if not file_exists:
            w.writerow(header)
        w.writerow([row.get(k, "") for k in header])

def pick_range(diff, cfg):
    if diff == "beginner": return 0, cfg["beginner_max"]
    if diff == "intermediate": return 0, cfg["intermediate_max"]
    return 0, cfg["advanced_max"]

# ========================= CORE GENERATORS =========================

def gen_add(diff, cfg):
    if diff == "advanced":
        a, b = [random.randint(100, 999) for _ in range(2)]
        return f"{a} + {b} = ?", a + b
    a, b = [random.randint(*pick_range(diff, cfg)) for _ in range(2)]
    return f"{a} + {b} = ?", a + b

def gen_sub(diff, cfg):
    if diff == "advanced":
        a, b = [random.randint(100, 999) for _ in range(2)]
        if b > a: a, b = b, a
        return f"{a} - {b} = ?", a - b
    a, b = [random.randint(*pick_range(diff, cfg)) for _ in range(2)]
    if b > a: a, b = b, a
    return f"{a} - {b} = ?", a - b

def gen_mul(diff, cfg):
    if diff == "advanced":
        a, b = [random.randint(10, 99) for _ in range(2)]
        return f"{a} × {b} = ?", a * b
    if diff == "beginner":
        a = random.randint(1, 12); b = random.randint(1, 12)
    else:
        a = random.randint(10, 99); b = random.randint(2, 9)
    return f"{a} × {b} = ?", a * b

def gen_div(diff, cfg):
    if diff == "advanced":
        divisor = random.randint(2, 19)
        quotient = random.randint(5, 99)
        dividend = divisor * quotient
        return f"{dividend} ÷ {divisor} = ?", quotient
    divisor = random.randint(2, 12)
    quotient = random.randint(2, 12)
    dividend = divisor * quotient
    return f"{dividend} ÷ {divisor} = ?", quotient

# ========================= UTILITIES =========================

def parse_number(s):
    if not s: return None
    s = s.strip().lower()
    if s in ("q","quit","exit"): return None
    s = re.sub(r"[,$ ]", "", s)
    try:
        if "." in s: return float(s)
        return int(s)
    except: return "bad"

def approx_equal(a,b,tol=0.01):
    try: return abs(float(a)-float(b))<=tol
    except: return False

def unique_question(gen_func,*args,**kwargs):
    for _ in range(200):
        q, ans = gen_func(*args, **kwargs)
        if q not in SEEN_THIS_ROUND:
            SEEN_THIS_ROUND.add(q)
            return q, ans
    SEEN_THIS_ROUND.clear()
    return gen_func(*args, **kwargs)

def gate_report(asked: int, correct: int, avg_ms: int, cfg: dict) -> None:
    """Optional mastery gates printed after the round (disabled by default)."""
    if not cfg.get("enable_gates", False):
        return
    acc = (correct / asked * 100) if asked else 0.0
    acc_gate = float(cfg.get("accuracy_gate_pct", 95.0))
    spd_gate = int(cfg.get("speed_gate_ms", 6000))
    acc_pass = (acc >= acc_gate) if asked else False
    spd_pass = (avg_ms > 0 and avg_ms <= spd_gate)

    print("Status:")
    print(f" {'✓' if acc_pass else '✗'} Accuracy gate (≥{acc_gate:.1f}%)")
    print(f" {'✓' if spd_pass else '✗'} Speed gate (≤{spd_gate} ms)")
    if not asked:
        print(" Recommendation: No data — run another round.")
    elif acc_pass and spd_pass:
        print(" Recommendation: Gate pass — continue or advance when repeated.")
    elif acc_pass and not spd_pass:
        print(" Recommendation: Accuracy ok — work speed (priming/drills) and repeat.")
    else:
        print(" Recommendation: Stabilize accuracy first — slow down slightly and repeat.")

def priming_drill(mode: str, diff: str, cfg: dict) -> None:
    """Optional short priming drill before the timed round (disabled by default)."""
    if not cfg.get("enable_priming", False):
        return
    seconds = int(cfg.get("priming_seconds", 120))
    if seconds <= 0:
        return

    # Keep priming deterministic and aligned to the selected mode.
    if mode in ("add", "sub"):
        drill_name = "Carry Chains" if diff == "advanced" else "Quick Adds/Subs"
    elif mode == "mul":
        drill_name = "Tens + Two-Digit Multipliers" if diff == "advanced" else "Times Tables"
    else:
        drill_name = "Clean Division" if diff == "advanced" else "Division Facts"

    print(f"\nPriming Drill ({seconds}s): {drill_name}\n")
    start = time.time(); asked = correct = 0

    while time.time() - start < seconds:
        if mode == "add":
            a = random.randint(200, 999) if diff == "advanced" else random.randint(10, 99)
            b = random.randint(200, 999) if diff == "advanced" else random.randint(10, 99)
            q, ans = f"{a} + {b} = ?", a + b
        elif mode == "sub":
            a = random.randint(200, 999) if diff == "advanced" else random.randint(10, 99)
            b = random.randint(100, 999) if diff == "advanced" else random.randint(10, 99)
            if b > a: a, b = b, a
            q, ans = f"{a} - {b} = ?", a - b
        elif mode == "mul":
            if diff == "advanced":
                a = random.randint(10, 99); b = random.randint(10, 99)
            else:
                a = random.randint(2, 12); b = random.randint(2, 12)
            q, ans = f"{a} × {b} = ?", a * b
        else:  # div
            divisor = random.randint(2, 19) if diff == "advanced" else random.randint(2, 12)
            quotient = random.randint(5, 30) if diff == "advanced" else random.randint(2, 12)
            dividend = divisor * quotient
            q, ans = f"{dividend} ÷ {divisor} = ?", quotient

        user = input(f"{q}  (enter to skip, q=quit) > ").strip()
        if user.lower() in ("q", "quit", "exit"):
            break
        if user == "":
            continue

        asked += 1
        val = parse_number(user)
        if val != "bad" and approx_equal(val, ans):
            correct += 1

    if asked:
        print(f"Priming summary: Asked {asked}, Correct {correct}, Accuracy {correct/asked*100:.1f}%\n")
    else:
        print("Priming summary: no questions answered.\n")

def _prompt_error_type() -> str:
    """Lightweight error tagging (kept fast by design)."""
    choices = {
        "c": "carry",
        "d": "digit",
        "p": "compensation",
        "o": "other",
        "": "other",
    }
    s = input("Error type? [c=carry, d=digit, p=comp, o=other] > ").strip().lower()
    return choices.get(s, s[:24] or "other")

# ========================= ROUND ENGINE =========================

def run_round(mode, diff, cfg):
    global SEEN_THIS_ROUND; SEEN_THIS_ROUND = set()
    seconds = int(cfg.get("round_seconds", 300) or 300)
    asked = correct = 0
    lat = []

    # Stable round identifier for optional meta logging.
    round_ts = datetime.datetime.now().isoformat(timespec="seconds")
    round_id = f"{round_ts}|{mode}|{diff}"

    gens = {
        "add": lambda: unique_question(gen_add, diff, cfg),
        "sub": lambda: unique_question(gen_sub, diff, cfg),
        "mul": lambda: unique_question(gen_mul, diff, cfg),
        "div": lambda: unique_question(gen_div, diff, cfg)
    }

    print(f"\nMode: {mode} | Difficulty: {diff} | Round: {seconds}s\n")
    priming_drill(mode, diff, cfg)

    start = time.time()
    while time.time() - start < seconds:
        q, ans = gens[mode]()
        t0 = time.time()
        user = input(f"{q}  (q=quit) > ")
        if not user or user.lower() in ("q","quit","exit"): break
        dt = int((time.time() - t0)*1000); asked += 1; lat.append(dt)
        val = parse_number(user)
        if val != "bad" and approx_equal(val, ans):
            correct += 1; print(f"✓  {ans}   [{dt} ms]")
        else:
            print(f"✗  Wrong — correct {ans}   [{dt} ms]")
            if cfg.get("enable_error_tagging", False):
                err = _prompt_error_type()
                save_meta_event({
                    "timestamp": round_ts,
                    "round_id": round_id,
                    "event": "incorrect",
                    "mode": mode,
                    "difficulty": diff,
                    "question": q,
                    "correct_answer": ans,
                    "user_answer": user.strip(),
                    "latency_ms": dt,
                    "error_type": err,
                })

    avg = int(sum(lat)/len(lat)) if lat else 0
    acc = (correct/asked*100) if asked else 0
    print(f"\n=== Round Over ===\nAsked: {asked} | Correct: {correct} | Accuracy: {acc:.1f}% | Avg time: {avg} ms\n")

    gate_report(asked, correct, avg, cfg)

    save_result({
        "timestamp": round_ts,
        "mode": mode,
        "difficulty": diff,
        "round_seconds": seconds,
        "asked": asked,
        "correct": correct,
        "accuracy": f"{acc:.1f}",
        "avg_time_ms": avg
    })

# ========================= RATIO PRIMER PLACEHOLDER =========================

def ratios_primer():
    print("\n[Placeholder] Ratios & Proportions Primer will train equivalent ratios (e.g. 3:4 = 6:x) and scaling. Coming next.\n")

# ========================= MENU =========================

def pick_mode():
    modes = ["add", "sub", "mul", "div", "ratios"]
    print("\nSelect mode:")
    for i, m in enumerate(modes, 1):
        print(f" {i}. {m}")
    while True:
        s = input("> ").strip()
        if s.isdigit() and 1 <= int(s) <= len(modes):
            return modes[int(s) - 1]
        if s in modes: return s
        print("Enter number or exact mode name.")

def pick_diff():
    diffs = ["beginner", "intermediate", "advanced"]
    print("\nSelect difficulty:")
    for i, d in enumerate(diffs, 1):
        print(f" {i}. {d}")
    while True:
        s = input("> ").strip().lower()
        if s.isdigit() and 1 <= int(s) <= len(diffs): return diffs[int(s) - 1]
        if s in diffs: return s
        print("Enter number or exact difficulty name.")

def main():
    cfg = load_cfg()
    print("Mental Math Game — v0.7.1\n")
    while True:
        try:
            m = pick_mode()
            if m == "ratios":
                ratios_primer()
                continue
            d = pick_diff()
            run_round(m, d, cfg)
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break

if __name__ == "__main__":
    main()
