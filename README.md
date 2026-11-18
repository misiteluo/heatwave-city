# HEATWAVE CITY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/misiteluo/heatwave-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/misiteluo/heatwave-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**One city. Five jobs. No brakes.**

HEATWAVE CITY is a 3D open-world crime game that runs entirely in the browser.
You are Jett, a wheelman with empty pockets in a sun-soaked coastal city.
Fixer Mara Voss has work: steal a marked coupe, run a package across town,
collect a debt on Coral Beach, crack the Heatwave Bank vault, then hold the
bank and escape to the dock while the whole Heatwave PD tries to stop you.

Built with three.js (vendored, r128) and plain JavaScript modules — no build
step, no server-side code, no external assets. All art is procedural: canvas
textures, box-geometry buildings and cars, synthesized WebAudio sound.

## Run it

The make.fun entrypoint builds the submission dossier:

```sh
node main.ts            # writes dossier.json + game/ + screenshots/ to $MAKEFUN_OUTPUT_DIR (default ./out)
```

To play the game itself, serve the repo root and open the game page:

```sh
node serve.ts           # http://localhost:8080
# then open http://localhost:8080/game/
```

Any static file server pointed at the repo root works the same way.

## How to play

- **WASD / arrows** — move / drive · **Shift** — sprint
- **Mouse drag** — orbit camera · **E** — enter / exit car
- **F or mouse click** — punch / shoot · **1 / 2** — fists / pistol · **R** — reload
- **Space** — handbrake · **P** — pause · **M** — mute

Steal any car you find. Crimes raise your wanted level (0–5 stars): police
pursuit units navigate the road grid to run you down, roadblocks seal streets
at 4+ stars, and being pinned on foot for 3 seconds means **BUSTED** (you lose
10% of your cash, min $50, max $400). Drop to 0 HP and you're **WASTED** ($150
hospital bill). Finish a mission stage or stay unseen to let the heat decay.
Progress — cash, story progress, your pistol — is saved to localStorage, and
the garage pay'n'spray ($200) clears your wanted level.

## Features

- Procedural 9×9-block city (~600×800 m) with a beach, ocean, palms, docks,
  street lights, neon signs and named landmarks (safehouse, Mara's garage,
  Heatwave Bank, Coral Hotel, warehouse, marina dock)
- On-foot and driving modes with arcade car physics, damage and smoke
- Traffic AI driving the road grid, parked cars, pedestrians who stroll,
  idle and flee
- Car stealing with a witness system (seen crimes cost full heat, unseen 45%)
- 0–5 star wanted system: pursuit AI with road-grid navigation, approach
  braking, ramming, and roadblocks at high heat
- Fist and pistol combat with enemy crews that fight back
- A 5-mission story chain from fixer Mara Voss ($3,650 total payout)
- Minimap HUD with mission markers, police blips and a wanted-star display
- BUSTED / WASTED respawn flows, pause, synthesized engine/siren/gunshot audio

## Layout

- `game/index.html` — the game page and all HUD/menus (DOM UI over WebGL)
- `game/src/*.js` — ES modules: `config`, `textures`, `city`, `vehicles`,
  `traffic`, `pedestrians`, `police`, `player`, `combat`, `missions`, `hud`,
  `audio`, `save`, `shots`, `main`
- `game/vendor/three.min.js` — three.js r128 (MIT), vendored from cdnjs
- `screenshots/` — staged scenes rendered by the game itself via `?shot=` URLs
- `main.ts` / `serve.ts` — make.fun entrypoint (dossier builder) and dev server

## Measured facts (this build, verified locally)

- Full 5-mission chain played end-to-end in headless Chromium (Playwright,
  SwiftShader) with **zero page errors**: cash $0 → $3,650, story-complete
  flag set, save written to localStorage after every mission.
- BUSTED flow verified (police pin on foot → arrest → fine $340 applied at
  $3,650 cash) and WASTED flow verified (HP → 0 → hospital bill), both
  respawning at the safehouse; reload + Continue restored cash and progress.
- Dossier build: `dossier.json` 513,521 bytes (limit 1.5 MiB); bundled
  `game/` 701,617 bytes (limit 48 MiB); 4 screenshots, 57–96 KiB each
  (limit 256 KiB each).
- Deterministic world per seed (`?seed=` query), including the staged
  screenshot scenes (`?shot=cover|foot|mission|chase`).
