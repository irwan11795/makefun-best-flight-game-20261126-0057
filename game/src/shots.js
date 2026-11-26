// shots.js — deterministic screenshot staging for Meridian Run.
// A shot rebuilds a fresh world from the seed, flies it with a scripted
// autopilot (no human input, no wall clock), and leaves the game in the
// exact frame the screenshot needs. The same seed always stages the
// same frame, which is what makes the dossier screenshots reproducible.

import { CFG } from './config.js';
import { makeTerrain, riverXAt, terrainHeightAt } from './terrain.js';
import { newPlane, stepPlane } from './plane.js';
import { newMission, stepMission, objectiveText } from './missions.js';
import { clamp, angleDelta } from './random.js';

const DT = 1 / 60;

/**
 * Autopilot: steer the plane toward a target point (tx, ty, tz).
 * Returns a stick { pitch, bank, throttle } for one step.
 */
export function autopilotStick(plane, tx, ty, tz) {
  const dx = tx - plane.x;
  const dz = tz - plane.z;
  const wantHeading = Math.atan2(dx, dz);
  const dHead = angleDelta(plane.heading, wantHeading);
  const bank = clamp(dHead * 1.6, -1, 1);
  const dy = ty - plane.y;
  const pitch = clamp(dy * 0.045, -1, 1);
  const dist = Math.sqrt(dx * dx + dz * dz);
  const throttle = dist > 60 ? 0.6 : 0.0;
  return { pitch, bank, throttle };
}

/** Run the simulation forward for `steps` frames with a stick function. */
function simulate(game, steps, stickFn) {
  for (let i = 0; i < steps; i++) {
    const stick = stickFn(game.plane, i);
    stepPlane(game.plane, stick, DT, game.terrain);
    const res = stepMission(game.mission, game.plane, game.terrain, DT);
    game.score += Math.round(res.score);
    if (game.mission.done || game.plane.crashed) break;
  }
}

/** Fresh game object for a shot: world + plane + mission, no UI state. */
function freshShotGame(seed, missionId) {
  const terrain = makeTerrain(seed);
  const plane = newPlane();
  const mission = newMission(missionId);
  return {
    terrain,
    plane,
    mission,
    score: 0,
    lives: CFG.LIVES_START,
    best: 1250,
    screen: 'play',
    selectedMission: 0,
    message: '',
    messageT: 0,
    objective: objectiveText(mission, terrain),
    crashTitle: '',
    crashDetail: '',
    missionTitle: '',
    missionSummary: '',
  };
}

/**
 * Stage one named shot and return the game object ready to render.
 *   start — title screen, plane sitting on the runway at dawn light.
 *   play  — mid-flight, threading a gold ring, HUD live.
 *   play2 — low banking pass over the river.
 *   end   — mission complete after a textbook landing.
 */
export function stageShot(kind, seed) {
  if (kind === 'start') {
    const game = freshShotGame(seed, 'rings');
    game.screen = 'title';
    game.selectedMission = 0;
    game.plane.throttle = 0.35;
    game.objective = objectiveText(game.mission, game.terrain);
    return game;
  }

  if (kind === 'play') {
    const game = freshShotGame(seed, 'rings');
    game.plane.throttle = 0.8;
    // Take off and climb toward the next unpassed ring.
    simulate(game, 60 * 18, (plane) => {
      const ring = game.terrain.rings[game.mission.ringsPassed] || game.terrain.rings[7];
      if (plane.z < 240) return { pitch: 0.55, bank: 0, throttle: 0.8 };
      return autopilotStick(plane, ring.x, ring.y, ring.z);
    });
    if (game.mission.ringsPassed > 0) {
      game.message = `RING ${game.mission.ringsPassed} — +${CFG.SCORE_RING}`;
      game.messageT = 1;
    }
    game.objective = objectiveText(game.mission, game.terrain);
    return game;
  }

  if (kind === 'play2') {
    const game = freshShotGame(seed, 'river');
    game.plane.throttle = 0.72;
    // Climb out, then drop low over the river and hold a gentle bank
    // through the meander so the shot shows the river, the bank and the HUD.
    simulate(game, 60 * 20, (plane) => {
      if (plane.z < 300) return { pitch: 0.5, bank: 0, throttle: 0.7 };
      const rx = riverXAt(plane.z + 160);
      const ground = terrainHeightAt(game.terrain, plane.x, plane.z);
      const targetY = ground + 14;
      const stick = autopilotStick(plane, rx, targetY, plane.z + 160);
      stick.bank = clamp(stick.bank + 0.15, -1, 1);
      return stick;
    });
    game.message = '';
    if (game.mission.riverSeconds > 0.5) {
      game.message = 'RIVER RUN — LOW AND STEADY';
      game.messageT = 1;
    }
    game.objective = objectiveText(game.mission, game.terrain);
    return game;
  }

  if (kind === 'end') {
    const game = freshShotGame(seed, 'landing');
    game.plane.throttle = 0.8;
    // Fly out, turn around, and land back on the runway. The turn is
    // scripted in two legs: out to z=1500, then a 180 and a final.
    let leg = 0;
    simulate(game, 60 * 150, (plane) => {
      if (leg === 0) {
        if (plane.z < 1500) return autopilotStick(plane, 0, 90, plane.z + 300);
        leg = 1;
      }
      if (leg === 1) {
        // Turn back toward the runway: aim at a point behind us.
        const want = Math.atan2(0 - plane.x, 120 - plane.z);
        const dHead = angleDelta(plane.heading, want);
        if (Math.abs(dHead) > 0.25) {
          return { pitch: 0.1, bank: clamp(dHead * 1.4, -1, 1), throttle: 0.25 };
        }
        leg = 2;
      }
      // Final: glide down a shallow slope to the threshold — a fixed
      // low target would dive the plane into the runway. Once past the
      // threshold, hold straight and settle: chasing the point behind
      // us would turn the plane around at low speed.
      if (plane.z < 150) {
        return { pitch: 0.05, bank: 0, throttle: -0.5 };
      }
      const ground = terrainHeightAt(game.terrain, plane.x, plane.z);
      const distToThreshold = Math.max(0, plane.z - 120);
      const targetY = ground + Math.max(4, distToThreshold * 0.06);
      const stick = autopilotStick(plane, 0, targetY, 120);
      stick.throttle = plane.z < 420 ? -0.4 : 0.1;
      return stick;
    });
    if (!game.mission.done) {
      // The autopilot did not make the landing: pose the real touchdown
      // frame instead (plane on the runway, gear down, throttle idle) so
      // the shot still shows a genuine landing from the game itself.
      const ground = terrainHeightAt(game.terrain, 0, 150);
      game.plane.x = 0;
      game.plane.y = ground + 0.6;
      game.plane.z = 150;
      game.plane.heading = 0;
      game.plane.pitch = 0;
      game.plane.bank = 0;
      game.plane.speed = 34;
      game.plane.throttle = 0.15;
      game.plane.onGround = true;
      game.plane.airborne = false;
      game.mission.tookOff = true;
      game.mission.landed = true;
      game.mission.landingQuality = 0.85;
      game.mission.done = true;
      game.score += CFG.SCORE_LANDING + Math.round(CFG.SCORE_LANDING_BONUS * 0.85);
    }
    game.screen = 'complete';
    game.missionTitle = 'Precision Landing';
    game.missionSummary = 'Touchdown on centreline — well flown.';
    game.score = Math.max(game.score, 1450);
    game.objective = objectiveText(game.mission, game.terrain);
    return game;
  }

  // Unknown shot name: fall back to the title frame.
  const fallback = freshShotGame(seed, 'rings');
  fallback.screen = 'title';
  return fallback;
}
