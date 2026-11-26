// missions.js — the three sorties of Meridian Run.
// Each mission owns its own objective text and its own win condition, and
// reports progress events the main loop turns into score and messages.
//   rings   — fly through all 8 gold rings down the valley.
//   river   — stay low over the river; the clock only runs below 90 ft AGL.
//   landing — take off, fly the valley, come back and land on the runway.

import { CFG, MISSION_NAMES } from './config.js';
import { riverXAt, onRunway } from './terrain.js';
import { altitudeAglFt } from './plane.js';

export const MISSION_IDS = ['rings', 'river', 'landing'];

/** Fresh per-sortie mission state. */
export function newMission(missionId) {
  return {
    id: missionId,
    ringsPassed: 0,
    riverSeconds: 0,
    riverBestStreak: 0,
    riverStreak: 0,
    tookOff: false,
    landed: false,
    landingQuality: 0, // 0..1, 1 = textbook touchdown
    done: false,
    elapsed: 0,
  };
}

/** One-line objective for the HUD, updated live with progress. */
export function objectiveText(mission, terrain) {
  if (mission.id === 'rings') {
    return `RING RUN — Rings ${mission.ringsPassed}/8 — fly through the gold rings`;
  }
  if (mission.id === 'river') {
    return `RIVER RUN — Low over the river: ${mission.riverSeconds.toFixed(0)}s — stay under 90 ft AGL`;
  }
  if (!mission.tookOff) return 'PRECISION LANDING — Take off, then come back and land on the runway';
  if (!mission.landed) return 'PRECISION LANDING — On final: slow, level, on centreline';
  return 'PRECISION LANDING — Down safe. Well flown.';
}

/**
 * Advance the mission one step. Returns { events: [...], score: n } where
 * events are 'ring', 'river-tick', 'takeoff', 'landed', 'mission-done'.
 */
export function stepMission(mission, plane, terrain, dt) {
  const events = [];
  let score = 0;
  mission.elapsed += dt;

  if (mission.id === 'rings') {
    const ring = terrain.rings[mission.ringsPassed];
    if (ring && plane.z >= ring.z) {
      const dx = plane.x - ring.x;
      const dy = plane.y - ring.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ring.r + 14) {
        ring.passed = true;
        mission.ringsPassed++;
        score += CFG.SCORE_RING;
        events.push('ring');
        if (mission.ringsPassed >= terrain.rings.length) {
          mission.done = true;
          events.push('mission-done');
        }
      } else {
        // Missed the ring: the sortie continues, the ring stays open.
        events.push('ring-missed');
        mission.ringsPassed++;
        if (mission.ringsPassed >= terrain.rings.length) {
          mission.done = true;
          events.push('mission-done');
        }
      }
    }
  }

  if (mission.id === 'river') {
    const agl = altitudeAglFt(plane, terrain);
    const overRiver = Math.abs(plane.x - riverXAt(plane.z)) < 30;
    if (plane.airborne && agl < 90 && overRiver) {
      mission.riverSeconds += dt;
      mission.riverStreak += dt;
      mission.riverBestStreak = Math.max(mission.riverBestStreak, mission.riverStreak);
      score += CFG.SCORE_RIVER_TICK * dt;
    } else {
      mission.riverStreak = 0;
    }
    if (mission.riverSeconds >= 60 && !mission.done) {
      mission.done = true;
      events.push('mission-done');
    }
  }

  if (mission.id === 'landing') {
    if (plane.airborne) mission.tookOff = true;
    if (mission.tookOff && plane.onGround && !plane.crashed && onRunway(plane.x, plane.z)) {
      mission.landed = true;
      const centre = 1 - Math.min(1, Math.abs(plane.x) / CFG.RUNWAY_HALF_W);
      const slow = 1 - Math.min(1, Math.max(0, plane.speed - 30) / 40);
      const level = 1 - Math.min(1, Math.abs(plane.bank) / 0.5);
      mission.landingQuality = Math.max(0, Math.min(1, (centre + slow + level) / 3));
      score += CFG.SCORE_LANDING + Math.round(CFG.SCORE_LANDING_BONUS * mission.landingQuality);
      mission.done = true;
      events.push('landed');
      events.push('mission-done');
    }
  }

  return { events, score };
}

/** Human-readable mission summary for the complete screen. */
export function missionSummary(mission) {
  if (mission.id === 'rings') {
    return `${mission.ringsPassed} of 8 rings flown`;
  }
  if (mission.id === 'river') {
    return `${mission.riverSeconds.toFixed(0)}s low over the river · best streak ${mission.riverBestStreak.toFixed(0)}s`;
  }
  const q = Math.round(mission.landingQuality * 100);
  return mission.landed ? `Touchdown quality ${q}%` : 'Never made it back to the runway';
}

/** Title shown above a mission's summary on the complete screen. */
export function missionTitle(mission) {
  return MISSION_NAMES[mission.id] || 'Sortie';
}
