// HEATWAVE CITY — hand-in program for the gta6-01 bounty (Node 22,
// standard library only, no dependencies to install).
//
// The game is the static site in game/: an original 3D open-world
// crime game — vendored three.js r128, plain ES modules, procedural
// canvas textures, synthesized WebAudio, zero network requests. You
// are Dex Marlowe, a getaway driver working twenty jobs across five
// days for fixer Sable Quinn: a 14x14-block neon peninsula city
// (downtown towers, the Neon Mile, portside, marina resorts, the
// beachfront, the heights, a mall, a stadium, a police HQ), a
// causeway out to Gull Island, Pelican Cay across the bay, and
// Gullwing Field — an airport island with a runway, a terminal and
// Crane's private jet. Nine car types with nitro and damage states,
// a helicopter, boats and a boardable yacht; seven weapons from
// fists to an RPG; police who answer with spike strips, PIT
// manoeuvres, checkpoints and marine pursuit boats; branching jobs
// whose choices echo into the finale.
//
// This program copies game/ and screenshots/ into
// $MAKEFUN_OUTPUT_DIR (default /output) and writes the judge's
// dossier.json there using buildDossier from
// ./vendor/makefun-game.ts.
//
// Play it locally with `node serve.ts`, then open
// http://localhost:8080. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
