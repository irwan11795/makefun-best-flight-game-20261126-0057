# Meridian Run

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/irwan11795/makefun-best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/irwan11795/makefun-best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A chase-view flight game over a procedural valley. Fly a small prop plane
past gold rings, skim the river, and bring her home to the runway — with
fuel and hull damage turning every sortie into a decision.

Pure Canvas 2D, zero external libraries, all art drawn in code, all sound
synthesized with WebAudio. No network requests, no assets to download.

## Play

```sh
node main.ts
```

Then open `game/index.html` in a browser (or run the static server below).
No build step, no install. The entry is built into the output directory
named by `MAKEFUN_OUTPUT_DIR` (default `/tmp/meridian-run-output` for a
local check; the grader sets its own).

```sh
node serve.ts
# open http://localhost:8123/game/
```

## How to fly

| Key | Action |
| --- | --- |
| ↑ / ↓ or W / S | Pitch up / down |
| ← / → or A / D | Bank and turn |
| Shift / Ctrl | Throttle up / down |
| Space / Enter | Fly / confirm |
| 1 / 2 / 3 | Pick a mission on the title screen |
| P / Esc | Pause |

## Missions

1. **Ring Run** — fly through all 8 gold rings down the valley.
2. **River Run** — stay low over the river for 60 seconds. Fuel is the boss.
3. **Precision Landing** — take off, fly the valley, land on the runway slow,
   level and on centreline.

Fuel burns with the throttle, terrain strikes damage the hull, and a hard
touchdown hurts. Three lives per session; your best score is kept locally.

## Screenshots

Deterministic staged frames — the same seed always renders the same shot:

```sh
# served at http://localhost:8123/game/?shot=start&seed=7  (and play, play2, end)
```

## Files

- `game/` — the playable game (open `game/index.html`)
  - `game/src/config.js` — tuning and palette
  - `game/src/random.js` — seeded RNG and noise
  - `game/src/terrain.js` — procedural valley, river, runway, rings, trees
  - `game/src/plane.js` — flight model
  - `game/src/missions.js` — the three sorties
  - `game/src/input.js` — keyboard and mouse
  - `game/src/audio.js` — synthesized engine, wind and chimes
  - `game/src/render.js` — chase camera, terrain, plane, HUD, screens
  - `game/src/shots.js` — deterministic screenshot staging + autopilot
  - `game/src/main.js` — game state, loop, screen state machine
- `main.ts` — builds `dossier.json` and copies the entry to the output dir
- `serve.ts` — tiny static server for local play and screenshots
- `shots.json` — screenshot names and their staging queries
- `screenshots/` — the four entry screenshots

## License

MIT — see [LICENSE](LICENSE).
