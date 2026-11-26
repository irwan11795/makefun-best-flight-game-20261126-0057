// main.js — Meridian Run entry point: game state, the main loop, and
// the screen state machine (title → play → paused / complete / crash).
// Wires together input, physics, missions, audio and rendering; the
// shot mode (?shot=...) bypasses the loop and renders staged frames.

import { CFG, MISSION_BRIEFS } from './config.js';
import { makeTerrain, terrainHeightAt } from './terrain.js';
import { newPlane, stepPlane } from './plane.js';
import { newMission, stepMission, objectiveText, missionSummary, missionTitle } from './missions.js';
import { createInput, readStick, justPressed, consumeEdges, missionKeyPressed } from './input.js';
import { AudioEngine } from './audio.js';
import { renderFrame } from './render.js';
import { stageShot } from './shots.js';
import { KEYS } from './config.js';

const BEST_KEY = 'meridian-run-best';

function loadBest() {
  try {
    const v = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

function saveBest(score) {
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Storage may be unavailable (private mode, hosting CSP); best score
    // is a nicety, never a reason to break the game.
  }
}

/** Fresh top-level game state for one seed and one mission. */
export function newGame(seed, missionId) {
  const terrain = makeTerrain(seed);
  return {
    seed,
    terrain,
    plane: newPlane(),
    mission: newMission(missionId),
    score: 0,
    lives: CFG.LIVES_START,
    best: loadBest(),
    screen: 'title',
    selectedMission: missionId === 'river' ? 1 : missionId === 'landing' ? 2 : 0,
    message: '',
    messageT: 0,
    objective: '',
    crashTitle: '',
    crashDetail: '',
    missionTitle: '',
    missionSummary: '',
    time: 0,
    warnedFuel: false,
    warnedDamage: false,
  };
}

function refreshObjective(game) {
  game.objective = objectiveText(game.mission, game.terrain);
}

function setMessage(game, text) {
  game.message = text;
  game.messageT = 2.2;
}

function startSortie(game, missionId) {
  const seed = game.seed;
  const keepBest = game.best;
  const fresh = newGame(seed, missionId);
  fresh.best = keepBest;
  Object.assign(game, fresh);
  game.screen = 'play';
  refreshObjective(game);
  setMessage(game, missionId === 'rings' ? 'RING RUN — FLY THE GOLD RINGS' : missionId === 'river' ? 'RIVER RUN — STAY LOW OVER THE WATER' : 'PRECISION LANDING — FLY THE VALLEY, COME HOME');
}

function crashSortie(game, title, detail) {
  game.lives -= 1;
  game.crashTitle = title;
  game.crashDetail = detail;
  game.screen = 'crash';
  if (game.score > game.best) {
    game.best = game.score;
    saveBest(game.best);
  }
}

function finishMission(game) {
  game.screen = 'complete';
  game.missionTitle = missionTitle(game.mission);
  game.missionSummary = missionSummary(game.mission);
  if (game.score > game.best) {
    game.best = game.score;
    saveBest(game.best);
  }
}

/** One fixed step of live play. */
function stepGame(game, input, audio, dt) {
  const plane = game.plane;
  const stick = readStick(input);
  const event = stepPlane(plane, stick, dt, game.terrain);
  const res = stepMission(game.mission, plane, game.terrain, dt);
  game.score += Math.round(res.score);
  game.score += Math.round(CFG.SCORE_SECOND * dt * (plane.airborne ? 1 : 0));

  for (const e of res.events) {
    if (e === 'ring') {
      setMessage(game, `RING ${game.mission.ringsPassed} — +${CFG.SCORE_RING}`);
      audio.ring();
    } else if (e === 'ring-missed') {
      setMessage(game, 'RING MISSED — KEEP FLYING');
    } else if (e === 'landed') {
      setMessage(game, 'TOUCHDOWN — WELL FLOWN');
      audio.chime();
    }
  }

  if (event === 'terrain' || event === 'water') {
    audio.thud();
    crashSortie(
      game,
      event === 'water' ? 'DITCHED IN THE RIVER' : 'TERRAIN STRIKE',
      event === 'water'
        ? 'The river is not a runway. Watch your altitude over water.'
        : 'You flew into the valley floor. Climb earlier, turn gentler.',
    );
    return;
  }
  if (event === 'hard-landing') {
    audio.thud();
    setMessage(game, 'HARD LANDING — HULL DAMAGE');
    if (plane.damage >= CFG.DAMAGE_MAX) {
      crashSortie(game, 'AIRFRAME BROKEN', 'Too many hard knocks — the plane is done.');
      return;
    }
  }
  if (event === 'landed') {
    setMessage(game, 'ON THE RUNWAY');
  }
  if (plane.damage >= CFG.DAMAGE_MAX) {
    crashSortie(game, 'AIRFRAME BROKEN', 'Damage reached 100% — the plane is done.');
    return;
  }
  if (plane.fuel <= 0 && plane.airborne) {
    crashSortie(game, 'OUT OF FUEL', 'The tank ran dry over the valley. Glide home sooner next time.');
    return;
  }
  if (game.mission.done) {
    finishMission(game);
    audio.chime();
    return;
  }

  // Warnings, once per sortie each.
  if (!game.warnedFuel && plane.fuel < 25) {
    game.warnedFuel = true;
    audio.warn();
  }
  if (!game.warnedDamage && plane.damage > 60) {
    game.warnedDamage = true;
    audio.warn();
  }

  if (game.messageT > 0) game.messageT -= dt;
  refreshObjective(game);
  audio.update(plane.throttle, plane.speed, plane.airborne);
}

/** Menu keys on the title screen: 1/2/3 pick a mission, arrows move. */
function titleKeys(game, input) {
  const picked = missionKeyPressed(input);
  if (picked) {
    const idx = picked === 'rings' ? 0 : picked === 'river' ? 1 : 2;
    game.selectedMission = idx;
    return;
  }
  if (justPressed(input, KEYS.PITCH_UP) || justPressed(input, KEYS.BANK_LEFT)) {
    game.selectedMission = (game.selectedMission + 2) % 3;
  }
  if (justPressed(input, KEYS.PITCH_DOWN) || justPressed(input, KEYS.BANK_RIGHT)) {
    game.selectedMission = (game.selectedMission + 1) % 3;
  }
}

/** The live game loop. */
function runLive() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(window.location.search);
  const seedParam = Number(params.get('seed'));
  const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : (Math.random() * 2147483647) | 0;
  const game = newGame(seed, 'rings');
  const input = createInput();
  const audio = new AudioEngine();
  refreshObjective(game);
  game.selectedMission = 0;

  // Read-only debug hook for automated playtests (never used by the game).
  window.__gameDebug = () => ({
    screen: game.screen,
    mission: game.mission.id,
    x: +game.plane.x.toFixed(1),
    y: +game.plane.y.toFixed(1),
    z: +game.plane.z.toFixed(1),
    speed: +game.plane.speed.toFixed(1),
    throttle: +game.plane.throttle.toFixed(2),
    fuel: +game.plane.fuel.toFixed(1),
    damage: +game.plane.damage.toFixed(1),
    score: game.score,
    lives: game.lives,
    rings: game.mission.ringsPassed,
    crashed: game.plane.crashed,
  });

  let last = performance.now();
  let titleT = 0;

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    game.time += dt;
    titleT += dt;

    if (game.screen === 'title') {
      titleKeys(game, input);
      // The title screen shows the valley alive: a slow orbit of the camera.
      game.plane.heading = Math.sin(titleT * 0.05) * 0.12;
      game.plane.y = 12.6 + Math.sin(titleT * 0.4) * 0.3;
      if (justPressed(input, KEYS.CONFIRM) || input.clicked) {
        audio.ensure();
        const id = ['rings', 'river', 'landing'][game.selectedMission];
        startSortie(game, id);
        audio.beep(660, 0.1, 0.14);
      }
    } else if (game.screen === 'play') {
      if (justPressed(input, KEYS.PAUSE)) {
        game.screen = 'paused';
      } else {
        stepGame(game, input, audio, dt);
      }
    } else if (game.screen === 'paused') {
      if (justPressed(input, KEYS.PAUSE) || justPressed(input, KEYS.CONFIRM)) {
        game.screen = 'play';
      }
    } else if (game.screen === 'crash') {
      if (justPressed(input, KEYS.CONFIRM) || justPressed(input, KEYS.RESTART)) {
        if (game.lives > 0) {
          audio.ensure();
          startSortie(game, game.mission.id);
        } else {
          game.screen = 'gameover';
        }
      }
    } else if (game.screen === 'complete') {
      const picked = missionKeyPressed(input);
      if (picked) {
        audio.ensure();
        startSortie(game, picked);
      } else if (justPressed(input, KEYS.CONFIRM) || justPressed(input, KEYS.RESTART)) {
        audio.ensure();
        startSortie(game, game.mission.id);
      }
    } else if (game.screen === 'gameover') {
      if (justPressed(input, KEYS.CONFIRM) || justPressed(input, KEYS.RESTART)) {
        const seed2 = (Math.random() * 2147483647) | 0;
        const fresh = newGame(seed2, 'rings');
        Object.assign(game, fresh);
        game.screen = 'title';
        refreshObjective(game);
      }
    }

    renderFrame(ctx, game, game.time);
    consumeEdges(input);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/**
 * Shot mode: ?shot=start|play|play2|end&seed=N stages a deterministic
 * frame, paints it twice (so fonts and layout settle), then signals
 * window.__shotReady for the screenshot harness.
 */
function runShot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('shot') || 'start';
  const seedParam = Number(params.get('seed'));
  const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : 1;
  const game = stageShot(kind, seed);
  game.time = kind === 'start' ? 0 : 42;
  renderFrame(ctx, game, game.time);
  renderFrame(ctx, game, game.time);
  window.__shotReady = true;
}

if (new URLSearchParams(window.location.search).has('shot')) {
  runShot();
} else {
  runLive();
}
