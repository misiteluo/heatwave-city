# HEATWAVE CITY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/misiteluo/heatwave-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/misiteluo/heatwave-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original 3D open-world crime game that runs entirely in the browser — no build step, no network requests, just static files and a vendored copy of three.js.

You are **Rico Vale**, a wheelman who just rolled into a sun-soaked coastal city with one phone number in his pocket: **Sable Quinn**, a fixer who pays cash for fast driving and faster decisions. Work through her five-job story — steal a marked coupe for the Coral Garage, run a hot parcel under a two-star pursuit, collect a beach debt from Dario Venn and his crew, survive a four-star run to the lighthouse safehouse, and hold the Meridian Bank plaza while a vault crew works, then vanish to the docks.

## What's in the city

- A 10×10 block city with procedurally textured towers and shopfronts (every facade is painted on a Canvas at boot), sidewalks, plazas, palm trees, streetlights, lane markings, a sandy beach and an animated sea along the south edge, all under warm directional sunlight with soft shadows and haze.
- On-foot third-person play: a blocky animated character, sprinting, a drag-orbit camera, punching and a hitscan pistol with tracers, muzzle flash, limited ammo and glowing ammo pickups.
- Arcade driving with parked and moving cars you can simply take — or carjack, driver and all, if you're willing to be seen doing it. Traffic follows lanes, brakes for obstacles and honks; cars smoke as they take damage and die when wrecked.
- Pedestrians who stroll the sidewalks and scatter from gunfire, reckless driving and flying fists.
- A five-star wanted system: crimes witnessed by police or bystanders raise the heat, cruisers spawn at the city edges and pursue, roadblocks appear at four stars, stars decay when you stay out of sight — and if a cruiser sits beside you on foot for three seconds, you're **BUSTED**. Drop to zero health and you're **WASTED**. Both cost you cash.
- Five sequential story jobs with light-pillar world markers, a gold minimap dot, HUD objectives and cash rewards, plus progress and cash saved in `localStorage`.
- A full HUD: canvas minimap (roads, beach, police in blue, enemies in red, mission in gold, player arrow, north marker), wanted stars, cash, health bar, ammo, speedometer, objective banner, contextual prompts, toasts and a damage vignette.
- Synthesized audio only — engine note that follows your speed, two-tone sirens, gunshots, punches, horns, reward chimes and a slow ambient pad, all from WebAudio oscillators. No audio files.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| Shift | Sprint |
| Mouse drag | Orbit the camera |
| E | Enter / exit a car (carjack if it's occupied) |
| F or left-click | Punch, or shoot when a target is ahead |
| Space | Handbrake |
| Enter | Take Sable's next job |
| P / Esc | Pause |
| M | Mute |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Node 22 or later, no dependencies to install — `serve.ts` is a tiny standard-library static server for the `game/` folder.

The hand-in program copies `game/` and `screenshots/` into an output directory and writes the judge's `dossier.json` there:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

- `game/index.html` — the page, HUD DOM and menus
- `game/src/` — one ES module per system: `config`, `textures`, `city`, `vehicles`, `traffic`, `pedestrians`, `police`, `player`, `combat`, `missions`, `hud`, `audio`, `save`, `shots`, `main`
- `game/vendor/three.min.js` — three.js r128, vendored
- `screenshots/` — four staged scenes (`game/src/shots.js` composes them from the real game state via `?shot=` URLs)
- `main.ts`, `serve.ts`, `vendor/makefun-game.ts` — hand-in program, dev server, dossier library

<sub>Entered on [make.fun](https://make.fun/?ref=c7gyn8cx&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
