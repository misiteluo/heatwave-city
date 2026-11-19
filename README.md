# HEATWAVE CITY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/misiteluo/heatwave-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/misiteluo/heatwave-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original 3D open-world crime game that runs entirely in the browser — no build step, no network requests, just static files and a vendored copy of three.js.

You are **Nico Serrano**, a driver with a burnt licence and one phone number: **Valentina "Val" Rojas**, a fixer who pays cash for fast driving and faster decisions. Across **nine story jobs** you steal a gold Comet GT for Priya Nair's chop shop, run hot freight under a two-star pursuit, tail Delgado's lieutenant Silas Kane to the pier count room, clear his crew in a shootout, race the Neon Grand Prix, hold the Meridian Bank plaza while a vault crew works, fly a helicopter to Gull Island for Delgado's ledger, wreck his convoy — and then run from every star in the sky to the lighthouse safehouse.

## What's in the city

- A **12×12-block peninsula** with real districts — downtown towers, the Neon Mile's billboards, portside warehouse sheds with shipping containers, marina hotels, north heights, a beachfront boardwalk — plus an east bay with piers and bobbing boats, and a **causeway out to Gull Island** with its lighthouse, safehouse and helipad. Every facade is painted on a Canvas at boot; windows glow as the **full day-night cycle** turns, streetlights come on, and the lighthouse beam sweeps the dark.
- **Six kinds of wheels**: sedans, sports coupes, pickups, box trucks, taxis and motorcycles, each with its own speed, acceleration, weight of damage and feel — plus a **flyable helicopter** on the marina pad (and a police helicopter that hunts you from three stars). Traffic holds lanes, stops at **working traffic lights**, brakes, honks and turns at intersections. Parked cars everywhere can simply be taken — or carjacked, driver and all, if you're willing to be seen.
- On-foot third-person play with sprint, an orbit camera, and a **four-slot weapon wheel**: fists, pistol, full-auto SMG and a seven-pellet shotgun, each with its own ammo pool, pickups, tracers and sound. Enemies strafe and fire in bursts; explosions chain into cars.
- A **five-star wanted system**: witnessed crimes raise the heat, cruisers pursue with target prediction, **roadblocks** land at four stars, the police helicopter's spotlight stops stars decaying — get pinned and you're **BUSTED**, drop and you're **WASTED** at Heatwave General. Both cost cash.
- **Nine sequential story jobs** with voiced-style dialogue, world marker pillars, a gold minimap dot, timers, a tailing job with a spook meter, a checkpoint Grand Prix, holdout waves, a helicopter ledger run and a five-star finale — with fail states, retries, cash rewards, weapon unlocks and progress saved in `localStorage`.
- A full HUD: canvas minimap (peninsula, causeway, island, police in blue, enemies in red, the job in gold), wanted stars, cash, health and armor bars, weapon readout, speedometer, dialogue box, objective banner, bust meter, damage vignette — and a **procedural car radio** with three synthesized stations.
- Synthesized audio only — a two-oscillator engine, helicopter rotor wash, two-tone sirens, per-weapon gunfire, horns, crashes, explosions and an ambient pad, all WebAudio. No audio files.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive, fly |
| Shift | Sprint (in the helicopter: descend) |
| Space | Handbrake (in the helicopter: climb) |
| Mouse drag | Orbit the camera |
| E | Enter / exit a car, board the helicopter (carjack if it's occupied) |
| F or click | Fire the selected weapon (hold for the SMG) |
| Q / mouse wheel / 1–4 | Weapon wheel |
| R | Car radio — cycle three stations (in a car) |
| Enter | Take Val's next job / retry a failed job |
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
