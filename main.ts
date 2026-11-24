// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// The game is "Solmar Bay: A Tide of Trouble", an original 3D third-person open-world crime game built on
// vendored three.js (every model and texture made in code) with synthesized WebAudio sound: a seeded coastal city with traffic,
// pedestrians, stealable cars with drift physics, a 5-star police response, an eight-mission story
// about ex-con Jax Merrin, a minimap HUD and a full-screen city map (M), a helicopter-and-roadblock police response, saves and a ?shot= staging mode for screenshots.
//
// v4 adds four more story missions, the city map and re-staged screenshots on top of the v3 3D rebuild: game/src/main.js wires the modules, game/vendor/ holds three.js.
// The HUD shows a police dispatch panel, weapon slots, district label and radio line, all driven by game state.
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Folder and file names, written once so the copy steps and the dossier cannot drift apart.
const GAME_DIR = 'game'; // the playable static game
const SHOTS_DIR = 'screenshots'; // up to 4 real renders of ?shot= scenes
const DOSSIER_FILE = 'dossier.json'; // the summary the judge reads
const TEXT_MAX_BYTES = 163840; // the scorer's cap on the dossier's text fields (160 KiB)

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (!existsSync(join(here, GAME_DIR, 'index.html'))) {
  console.error(`main.ts: cannot find ${join(here, GAME_DIR, 'index.html')} - main.ts must sit next to the ${GAME_DIR}/ folder of the entry checkout (run: MAKEFUN_OUTPUT_DIR=out node main.ts).`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, GAME_DIR), join(out, GAME_DIR), { recursive: true });
mkdirSync(join(out, SHOTS_DIR), { recursive: true });
if (existsSync(join(here, SHOTS_DIR))) cpSync(join(here, SHOTS_DIR), join(out, SHOTS_DIR), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, DOSSIER_FILE),
  buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
