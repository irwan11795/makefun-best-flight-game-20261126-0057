// main.ts — Meridian Run entry point for the make.fun grader.
// Copies game/ and screenshots/ into the output directory, then writes
// dossier.json with the vendored buildDossier (vendor/makefun-game.ts).
// Plain Node 22+, standard library only, no network, no build step.
//
//   MAKEFUN_OUTPUT_DIR=/tmp/flight-game-verify node main.ts
//
// The grader runs exactly this, with its own output directory.

import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Start from a clean output directory so stale files can never leak in.
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`Meridian Run entry built in ${outDir} (${dossier.length} byte dossier).`);
