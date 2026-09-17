# Mental Math Game — MVP v0.1

A lightweight terminal app for rapid mental math practice. Supports Addition, Subtraction, Multiplication, Division, Percentages, and Mixed mode. 
Tracks accuracy, speed, and streaks; logs progress to `progress.csv`.

## Requirements
- Python 3.8+
- Runs in a terminal/command prompt (Windows, macOS, Linux).

## Quick Start
1. Open a terminal and navigate to this folder.
2. Run:
   ```bash
   python mental_math_game.py
   ```
3. Choose a mode, difficulty, and round length. Start playing!

## Features
- **Modes**: add, sub, mul, div, pct, mixed
- **Difficulties**: beginner, intermediate, advanced (controls number ranges)
- **Timed rounds**: default 60 seconds (configurable)
- **Smart generation**: avoids negative answers for beginner subtraction; clean divisions when possible
- **Percentages**: realistic scenarios (discounts/tips) + base % building
- **Progress**: results appended to `progress.csv`
- **Config**: adjust defaults via `config.json`

## Config
Edit `config.json` to tweak defaults:
```json
{
  "round_seconds": 60,
  "beginner_max": 20,
  "intermediate_max": 100,
  "advanced_max": 999,
  "percent_bases": [1, 5, 10, 15, 20, 25, 33.3333, 50, 66.6667, 75]
}
```

## Tips
- Answer fast; if stuck, hit Enter to skip and keep your flow.
- Aim for >90% accuracy before increasing difficulty.
- Use Mixed mode once each single-operation mode feels easy.

## Roadmap
- GUI version
- Adaptive spaced repetition for mistakes
- Leaderboards and daily goals
- Custom drills & real‑life scenarios (shopping, unit rates, time/distance)
