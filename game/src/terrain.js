// terrain.js — the valley of Meridian Run, built procedurally from a seed.
// Rolling hills, a meandering river carved into the floor, a flat runway
// strip at the start, gold rings along the course and scattered trees.
// Everything is a pure function of (x, z, seed): the same seed rebuilds
// the same world, which is what makes the screenshots deterministic.

import { CFG } from './config.js';
import { fbm2, hash2, mulberry32, randRange, clamp } from './random.js';

/** The river's centreline: a slow meander plus a faster wiggle. */
export function riverXAt(z) {
  return 120 * Math.sin(z * 0.004) + 55 * Math.sin(z * 0.0013 + 1.7);
}

/** Raw hill height before the river carve and the runway flattening. */
function hillHeight(x, z, seed) {
  const rolling = fbm2(x * 0.004, z * 0.004, seed) * 26;
  const ridges = fbm2(x * 0.0016 + 40, z * 0.0016, seed + 7) * 34;
  const detail = fbm2(x * 0.02, z * 0.02, seed + 13) * 3.5;
  // Valley walls rise steeply away from the course centreline.
  const wall = Math.pow(Math.max(0, Math.abs(x) - 260) / 260, 2) * 90;
  return 14 + rolling + ridges + detail + wall;
}

/** Build the whole world for one seed. */
export function makeTerrain(seed) {
  const rng = mulberry32(seed);

  // Eight gold rings down the valley, alternating sides of the river so
  // the pilot has to work the stick instead of flying straight.
  const rings = [];
  for (let i = 0; i < 8; i++) {
    const z = 700 + i * 520;
    const side = i % 2 === 0 ? 1 : -1;
    const x = riverXAt(z) + side * (55 + rng() * 55);
    const y = 52 + rng() * 46;
    rings.push({ x, y, z, r: 26, passed: false, index: i });
  }

  // Trees: dense on the grass, never on the runway, the river or a ring line.
  const trees = [];
  for (let i = 0; i < 420; i++) {
    const z = randRange(rng, 60, CFG.COURSE_LENGTH + 400);
    const x = randRange(rng, -420, 420);
    if (Math.abs(x - CFG.RUNWAY_X) < 26 && z < CFG.RUNWAY_Z1 + 60) continue;
    if (Math.abs(x - riverXAt(z)) < 26) continue;
    const h = heightAtRaw(x, z, seed);
    if (h < CFG.WATER_LEVEL + 1.5) continue;
    trees.push({ x, z, s: randRange(rng, 0.8, 1.6), shade: rng() });
  }

  // A few drifting clouds, placed once per world.
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    clouds.push({
      x: randRange(rng, -700, 700),
      y: randRange(rng, 150, 260),
      z: randRange(rng, 200, 4200),
      s: randRange(rng, 40, 110),
    });
  }

  return { seed, rings, trees, clouds };
}

/** Terrain height used while scattering (before runway flattening matters). */
function heightAtRaw(x, z, seed) {
  let h = hillHeight(x, z, seed);
  const dRiver = Math.abs(x - riverXAt(z));
  if (dRiver < 70) {
    const t = dRiver / 70;
    h = h * (0.25 + 0.75 * t * t) + CFG.WATER_LEVEL * (1 - t * t) * 0.4;
    if (dRiver < 20) h = Math.min(h, CFG.WATER_LEVEL + 0.4);
  }
  // The valley floor stays dry: only the river channel may sit at the
  // waterline, so the river reads as a river instead of a lake.
  if (dRiver > 34) h = Math.max(h, 10.5);
  return h;
}

/**
 * Ground height at (x, z): hills, river carve, and a flat graded strip
 * for the runway so takeoffs and landings have a real surface.
 */
export function terrainHeightAt(terrain, x, z) {
  const seed = terrain.seed;
  let h = heightAtRaw(x, z, seed);
  const inRunway =
    Math.abs(x - CFG.RUNWAY_X) < CFG.RUNWAY_HALF_W + 6 &&
    z > CFG.RUNWAY_Z0 - 40 &&
    z < CFG.RUNWAY_Z1 + 40;
  if (inRunway) {
    const edge = Math.min(
      1,
      (CFG.RUNWAY_HALF_W + 6 - Math.abs(x - CFG.RUNWAY_X)) / 6,
    );
    const flat = 12.0;
    h = h * (1 - edge) + flat * edge;
  }
  return h;
}

/** Colour of the ground at (x, z): grass by height, sand by the river, water low. */
export function groundColour(terrain, x, z) {
  const h = terrainHeightAt(terrain, x, z);
  const dRiver = Math.abs(x - riverXAt(z));
  if (h < CFG.WATER_LEVEL + 1.5) return '#2f7fb8';
  if (dRiver < 30) return '#a8b878';
  if (h > 78) return '#eef2f5';
  if (h > 58) return '#8a7a68';
  const n = hash2(Math.floor(x / 24), Math.floor(z / 24), terrain.seed + 31);
  if (n > 0.55) return '#7fae54';
  if (n > 0.1) return '#6f9e46';
  return '#5d8a3c';
}

/** Is (x, z) on the runway pavement (for landing checks and colouring)? */
export function onRunway(x, z) {
  return (
    Math.abs(x - CFG.RUNWAY_X) <= CFG.RUNWAY_HALF_W &&
    z >= CFG.RUNWAY_Z0 &&
    z <= CFG.RUNWAY_Z1
  );
}
