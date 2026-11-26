// plane.js — the flight model for Meridian Run.
// A small prop plane with throttle, pitch, bank and turn. Speed comes from
// the throttle, pitch trades speed for altitude, bank turns the nose.
// The model is deliberately forgiving at cruise and punishing at the
// edges: slow flight sinks, terrain bites, and a hard touchdown hurts.

import { CFG } from './config.js';
import { clamp, lerp, angleDelta } from './random.js';
import { terrainHeightAt, onRunway } from './terrain.js';

/** Fresh plane state, sitting on the runway threshold ready to roll. */
export function newPlane() {
  return {
    x: 0,
    y: 12.6, // on the runway surface
    z: 20,
    heading: 0, // 0 = straight down the valley (+z)
    pitch: 0, // radians, + = nose up
    bank: 0, // radians, + = right wing down
    speed: 0,
    throttle: 0.55,
    verticalSpeed: 0,
    fuel: CFG.FUEL_MAX,
    damage: 0,
    onGround: true,
    airborne: false,
    crashed: false,
    propAngle: 0,
  };
}

/**
 * One physics step. `stick` is { pitch, bank, throttle } in [-1, 1] (throttle
 * is a delta: +1 raises it, -1 lowers it). Returns an event string or ''.
 * Events: 'terrain' (struck the ground), 'water' (ditched in the river),
 * 'landed' (a touchdown on the runway), 'hard-landing', 'fuel-empty'.
 */
export function stepPlane(plane, stick, dt, terrain) {
  // A crashed plane stays crashed: no more steps, no more strikes.
  if (plane.crashed) return '';
  const prevSpeed = plane.speed;

  // Throttle chases the stick, then speed chases the throttle.
  plane.throttle = clamp(
    plane.throttle + stick.throttle * CFG.THROTTLE_SPEED * dt,
    0,
    1,
  );
  const targetSpeed = CFG.MIN_SPEED + plane.throttle * (CFG.MAX_SPEED - CFG.MIN_SPEED);
  plane.speed += (targetSpeed - plane.speed) * (1 - Math.exp(-0.55 * dt));
  plane.speed -= plane.speed * CFG.DRAG * dt * 0.25;

  // Bank chases the stick; the nose follows the bank. Banking right
  // (positive bank) turns the nose right, toward +x: heading grows.
  const bankTarget = stick.bank * CFG.BANK_MAX;
  plane.bank += (bankTarget - plane.bank) * (1 - Math.exp(-CFG.BANK_SPEED * dt));
  plane.heading += plane.bank * CFG.TURN_RATE * dt * (plane.speed / CFG.CRUISE_SPEED);
  plane.heading = ((plane.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

  // Pitch chases the stick, softened when slow.
  const authority = clamp(plane.speed / CFG.STALL_SPEED, 0.35, 1);
  const pitchTarget = stick.pitch * 0.42 * authority;
  plane.pitch += (pitchTarget - plane.pitch) * (1 - Math.exp(-CFG.PITCH_SPEED * dt));

  // Vertical speed: pitch converts forward speed into climb or sink,
  // and a slow wing always sinks.
  let vs = Math.sin(plane.pitch) * plane.speed;
  if (plane.speed < CFG.STALL_SPEED) {
    vs -= (CFG.STALL_SPEED - plane.speed) * 0.55;
  }
  plane.verticalSpeed = lerp(plane.verticalSpeed, vs, 1 - Math.exp(-3 * dt));

  // Move along the heading.
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  plane.x += fx * plane.speed * dt;
  plane.z += fz * plane.speed * dt;
  plane.y += plane.verticalSpeed * dt;
  plane.propAngle += (6 + plane.throttle * 46) * dt;

  // Fuel burns with the throttle; an empty tank means gliding home.
  const burn = CFG.FUEL_BURN_IDLE + plane.throttle * CFG.FUEL_BURN;
  plane.fuel = Math.max(0, plane.fuel - burn * dt);
  if (plane.fuel <= 0 && plane.throttle > 0) plane.throttle = 0;

  // Takeoff: fast enough and pitched up (or simply rolling off a cliff edge).
  const ground = terrainHeightAt(terrain, plane.x, plane.z);
  if (plane.onGround) {
    if (plane.speed > 34 && plane.pitch > 0.06) {
      plane.onGround = false;
      plane.airborne = true;
      // Pop clear of the ground-contact margin in one step: without this
      // the first airborne frame still counts as a terrain strike.
      plane.y = ground + CFG.GROUND_CLEARANCE + 2.3;
    } else {
      // Rolling on rough ground at speed is a crash, not a taxi.
      if (!onRunway(plane.x, plane.z) && plane.speed > 20) {
        plane.damage += CFG.DAMAGE_TERRAIN;
        plane.speed = 0;
        plane.crashed = true;
        plane.onGround = true;
        plane.airborne = false;
        return 'terrain';
      }
      plane.y = ground + 0.6;
      plane.verticalSpeed = 0;
    }
  }

  // Ground contact.
  if (!plane.onGround && plane.y <= ground + CFG.GROUND_CLEARANCE) {
    const descendRate = -plane.verticalSpeed;
    const overRunway = onRunway(plane.x, plane.z);
    const gentle = descendRate < 7 && Math.abs(plane.bank) < 0.35 && plane.speed < 78;
    if (overRunway && gentle) {
      plane.y = ground + 0.6;
      plane.onGround = true;
      plane.airborne = false;
      plane.verticalSpeed = 0;
      plane.pitch = 0;
      plane.bank *= 0.4;
      if (prevSpeed > 55 || descendRate > 5.5) {
        plane.damage += CFG.DAMAGE_HARD_LANDING * 0.5;
        return 'hard-landing';
      }
      return 'landed';
    }
    // Anything else is a strike: the sortie ends here.
    plane.y = ground + 0.6;
    plane.damage += CFG.DAMAGE_TERRAIN;
    plane.speed = 0;
    plane.verticalSpeed = 0;
    plane.crashed = true;
    plane.onGround = true;
    plane.airborne = false;
    if (ground < CFG.WATER_LEVEL + 0.8) return 'water';
    return 'terrain';
  }

  // Ceiling and course bounds keep the sortie inside the valley.
  if (plane.y > 320) {
    plane.y = 320;
    plane.verticalSpeed = Math.min(plane.verticalSpeed, 0);
  }
  if (Math.abs(plane.x) > 520) {
    plane.x = Math.sign(plane.x) * 520;
    plane.heading += angleDelta(plane.heading, 0) * 0.02;
  }
  return '';
}

/** Knots for the HUD (1 m/s ≈ 1.944 kt), rounded for display. */
export function speedKnots(plane) {
  return Math.round(plane.speed * 1.944);
}

/** Heading in degrees, 0–359, with 0 = north down the valley. */
export function headingDegrees(plane) {
  return Math.round((((plane.heading * 180) / Math.PI) % 360) + 360) % 360;
}

/** Feet above the ground directly below the plane. */
export function altitudeAglFt(plane, terrain) {
  const ground = terrainHeightAt(terrain, plane.x, plane.z);
  return Math.max(0, Math.round((plane.y - ground) * 3.281));
}

/** Feet above mean sea level (the terrain's zero). */
export function altitudeMslFt(plane) {
  return Math.round(plane.y * 3.281);
}
