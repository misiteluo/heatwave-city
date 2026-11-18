# heatwave-city

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/misiteluo/heatwave-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/misiteluo/heatwave-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**HEATWAVE CITY** is an open-world crime game set in Caldera Bay, a sun-soaked
coastal city of nine-by-nine blocks, palm-lined streets and one long beach.
You are **Jett Marlowe**, a wheelman with empty pockets. Fixer **Mara Voss**
has five jobs for you — steal a gold coupe, run a package under police
pressure, collect a debt from the Solano brothers at the beach, rob the Bank
of Caldera and escape the heat, then hold the bank doors for the big score.

Everything in the fantasy is here: a city you roam **on foot and by car**,
living **traffic** that cruises, brakes and honks, **pedestrians** who stroll
the sidewalks and scatter at gunfire, **cars to steal** (yank the driver out),
a five-star **wanted system** with pursuing cruisers and roadblocks, **combat**
(fists and a pistol with pickups), a five-mission **story with dialogue**, a
full **HUD with a live minimap** (police blips, mission marker), busted/wasted
respawns, and **saves** in localStorage so you can continue later. All sound —
engine, sirens, gunshots, ambient pads — is synthesized live with WebAudio;
there are no audio or image assets. The city, characters, vehicles, names and
story are original; the game is built with three.js (vendored) and vanilla ES
modules, split by job under `game/src/` (`city`, `vehicles`, `traffic`,
`pedestrians`, `police`, `player`, `combat`, `missions`, `hud`, `audio`, …).

## How to play

- **WASD / arrows** — move on foot, drive in a car
- **Shift** — sprint · **E** — enter / steal / exit car · **Space** — handbrake
- **Mouse drag** — orbit camera · **Click / F** — punch, or shoot once Mara arms you
- **P** — pause · **M** — mute

Follow the gold marker and the mission banner. Crimes raise your stars;
break the police line of sight to let the heat cool down. Get caught standing
next to a cruiser and you are **BUSTED**; run out of health and you are
**WASTED** — either way you respawn with a fine and keep your story progress.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=c7gyn8cx&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
