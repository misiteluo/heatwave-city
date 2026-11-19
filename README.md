# HEATWAVE CITY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/misiteluo/heatwave-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/misiteluo/heatwave-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original 3D open-world crime game that runs entirely in the browser — no build step, no network requests, just static files and a vendored copy of three.js.

You are **Dex Marlowe**, a getaway driver with a torched past and one phone number that still answers: **Sable Quinn**, a fixer who pays cash for fast driving and faster decisions. Across **sixteen story jobs in four days** — Arrival, The Crew, High Water, Empire — you steal a yellow Zephyr GT for Rosa Vega's chop shop, run hot freight under a two-star pursuit, tail Crane's lieutenant Jonah Pierce to the pier count room, clear his crew in a shootout, win the Neon Grand Prix, hold the Meridian Bank plaza while a vault crew works, fly a helicopter to Gull Island for the second ledger, wreck a three-truck convoy, run a package across the bay by boat to Pelican Cay, blind the city substation by substation — and then outrun Detective Brandt and every star in the sky to the lighthouse safehouse before signing your own name over Crane's casino, hotel and club.

## What's in the city

- A **12×12-block peninsula** with real districts — downtown towers, the Neon Mile nightlife strip, portside warehouse sheds and container yards, marina hotels and piers, the wealthy heights, a beachfront boardwalk — plus an east bay, a **causeway out to Gull Island** (lighthouse, safehouse, helipad, dock) and **Pelican Cay**, a smugglers' rock reachable only by boat or air. Every facade is painted on a canvas at boot; windows glow as the **full day–night cycle** turns, streetlights and headlights come on, and the lighthouse beam sweeps the dark.
- **Seven kinds of wheels**: sedans, sports coupes, pickups, box trucks, taxis, motorcycles and police interceptors, each with its own speed, acceleration, grip and damage model — plus a **flyable helicopter** on the marina pad (and a police helicopter with a spotlight that hunts you from three stars) and **driveable boats** moored at the south docks, the east pier and Gull Island. Damage smokes, then burns, then chains into neighbouring cars. Traffic holds lanes, stops at **working traffic lights**, brakes, honks and turns at intersections. Parked cars can simply be taken — or carjacked, driver and all, if you're willing to be seen.
- On-foot third-person play with sprint, an orbit camera, and a **five-slot weapon wheel**: fists, pistol, full-auto SMG, a seven-pellet shotgun and a carbine, each with its own ammo pool, pickups, tracers, muzzle flash and sound. Enemies strafe, seek cover when hurt and fire in bursts under floating health bars; explosions chain.
- A **five-star wanted system**: witnessed crimes raise the heat, cruisers pursue with target prediction, **roadblocks** land at four stars, the police helicopter's spotlight stops stars decaying while it watches — get pinned and you're **BUSTED**, drop and you're **WASTED** at Heatwave General. Both cost cash.
- **Sixteen sequential story jobs** with dialogue, day banners, world marker pillars, timers, a tailing job with a spook meter, checkpoint races on land and water, holdout waves, a convoy ambush and a five-star finale — with fail states, retries, cash rewards, weapon unlocks and progress saved in `localStorage`.
- **Repeatable side work** once the story lets you breathe: three street races with par bonuses, taxi fares (sit in any cab), package runs out of Rosa's shop, three gang hideout clearouts, and **twenty cash briefcases** hidden across both islands and the cay.
- A full HUD: canvas minimap (peninsula, causeway, both islands, police in blue, enemies in red, side work in cyan, the job in gold), wanted stars, cash, health and armor bars, weapon readout, speedometer, dialogue box, objective banner, day banners, bust meter, damage vignette — and a **procedural car radio** with four synthesized stations.
- Synthesized audio only — engine, boat and rotor loops, two-tone sirens, per-weapon gunfire, horns, crashes, explosions and an ambient pad, all WebAudio. No audio files.
- Built for speed: merged-geometry buildings in a handful of draw calls, instanced palms, lamps and traffic-light heads, pooled particles and tracers, capped entity counts — it stays smooth on modest hardware.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive, fly, sail |
| Shift | Sprint (in the helicopter: descend) |
| Space | Handbrake (in the helicopter: climb) |
| Mouse drag | Orbit the camera |
| E | Enter / exit a car, board the helicopter, take a boat (carjack if it's occupied) |
| F or click | Fire the selected weapon (hold for full-auto) |
| Q / mouse wheel / 1–5 | Weapon wheel |
| R | Car radio — cycle four stations (in a car) |
| Enter | Take Sable's next job / retry a failed job |
| P / Esc | Pause |
| M | Mute |

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

No install, no build. `game/` is the whole game; `main.ts` is the hand-in program that assembles the scored bundle and dossier.

## Layout

- `game/index.html` — page, HUD and screens
- `game/src/` — the game in plain ES modules: `main.js` (glue, input, camera, loop), `city.js` (the world), `vehicles.js` (cars, helicopter, boats), `traffic.js`, `pedestrians.js`, `police.js`, `combat.js` (weapons, enemies, pickups), `missions.js` (the sixteen jobs + side work), `player.js`, `hud.js`, `audio.js`, `save.js`, `config.js`, `textures.js`, `shots.js` (screenshot staging)
- `game/vendor/three.min.js` — three.js r128, vendored
- `screenshots/` — four staged scenes (`game/src/shots.js` composes them from the real game state via `?shot=` URLs)
- `main.ts`, `serve.ts`, `vendor/makefun-game.ts` — hand-in program, dev server, dossier library

<sub>Entered on [make.fun](https://make.fun/?ref=c7gyn8cx&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
