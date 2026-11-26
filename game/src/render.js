// render.js — everything Meridian Run draws, in one place.
// A chase camera behind the plane looks down a procedural valley: sky
// gradient, sun, far mountain ridges, a perspective terrain mesh, the
// river, the runway, trees, gold rings, the plane itself, then the HUD
// and the menu screens. All art is drawn from code; no image files.

import { CFG, PALETTE } from './config.js';
import { clamp, lerp } from './random.js';
import {
  terrainHeightAt,
  groundColour,
  riverXAt,
  onRunway,
} from './terrain.js';
import {
  speedKnots,
  headingDegrees,
  altitudeAglFt,
  altitudeMslFt,
} from './plane.js';

const W = CFG.VIEW_W;
const H = CFG.VIEW_H;
const FOCAL = 640;
const HORIZON_Y = H * 0.46;

/**
 * A chase camera: sits behind and above the plane, looks along its nose
 * with half its pitch, and rolls a third of its bank so the world tilts
 * without fighting the pilot.
 */
export function makeCamera(plane) {
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  return {
    x: plane.x - fx * 17,
    y: plane.y + 4.6,
    z: plane.z - fz * 17,
    fx,
    fz,
    rx: Math.cos(plane.heading),
    rz: -Math.sin(plane.heading),
    pitchLook: plane.pitch * 0.55,
    roll: plane.bank * 0.32,
  };
}

/** Project a world point to screen space; null when behind the camera. */
export function project(cam, px, py, pz) {
  const dx = px - cam.x;
  const dy = py - cam.y;
  const dz = pz - cam.z;
  let cf = dx * cam.fx + dz * cam.fz;
  const cr = dx * cam.rx + dz * cam.rz;
  let cu = dy;
  const p = cam.pitchLook;
  const cos = Math.cos(p);
  const sin = Math.sin(p);
  const cf2 = cf * cos + cu * sin;
  const cu2 = -cf * sin + cu * cos;
  cf = cf2;
  cu = cu2;
  if (cf < 2) return null;
  const s = FOCAL / cf;
  let sx = W / 2 + cr * s;
  let sy = HORIZON_Y - cu * s;
  // Roll the whole frame gently around the horizon centre.
  const rr = cam.roll;
  if (rr !== 0) {
    const ox = sx - W / 2;
    const oy = sy - HORIZON_Y;
    const c = Math.cos(rr);
    const sn = Math.sin(rr);
    sx = W / 2 + ox * c - oy * sn;
    sy = HORIZON_Y + ox * sn + oy * c;
  }
  return { x: sx, y: sy, d: cf, s };
}

function drawSky(ctx, plane) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.45, PALETTE.skyMid);
  g.addColorStop(0.62, PALETTE.skyHorizon);
  g.addColorStop(1, '#c9a86a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Sun, drifting with the heading so turning feels like turning.
  const sunX = W * 0.76 - plane.heading * 320;
  const sunY = H * 0.2 - plane.pitch * 160;
  const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 130);
  glow.addColorStop(0, PALETTE.sunCore);
  glow.addColorStop(0.25, PALETTE.sun);
  glow.addColorStop(1, 'rgba(255, 243, 196, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
  ctx.fillStyle = PALETTE.sunCore;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountains(ctx, plane, cam) {
  const horizon = HORIZON_Y - plane.pitch * 320;
  for (let layer = 0; layer < 2; layer++) {
    const amp = layer === 0 ? 46 : 78;
    const base = horizon + (layer === 0 ? -6 : 26);
    const colour = layer === 0 ? PALETTE.mountainFar : PALETTE.mountainNear;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const drift = plane.heading * (layer === 0 ? 260 : 420);
    for (let sx = 0; sx <= W; sx += 16) {
      const t = (sx + drift) * 0.006 + layer * 3.1;
      const y = base - Math.abs(Math.sin(t * 1.7) * 0.6 + Math.sin(t * 0.9) * 0.4) * amp;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
}

function drawClouds(ctx, cam, clouds, plane) {
  ctx.save();
  for (const c of clouds) {
    const dz = c.z - plane.z;
    if (dz < 0 || dz > 3600) continue;
    const p = project(cam, c.x, c.y, c.z);
    if (!p) continue;
    const s = p.s * c.s * 0.09;
    if (s < 4) continue;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s * 2.2, s * 0.62, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - s, p.y + s * 0.18, s * 1.3, s * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + s, p.y + s * 0.18, s * 1.3, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The terrain mesh: a grid of quads ahead of the plane, far to near. */
function drawTerrain(ctx, cam, terrain, plane) {
  const rows = 18;
  const cols = 20;
  const z0 = plane.z + 24;
  const zStep = 38;
  const xStep = 38;
  const x0 = plane.x - ((cols * xStep) / 2);
  // Heights first, so each vertex is computed once.
  const heights = [];
  for (let r = 0; r <= rows; r++) {
    const row = [];
    const z = z0 + r * zStep;
    for (let c = 0; c <= cols; c++) {
      row.push(terrainHeightAt(terrain, x0 + c * xStep, z));
    }
    heights.push(row);
  }
  for (let r = rows - 1; r >= 0; r--) {
    const zNear = z0 + r * zStep;
    const zFar = z0 + (r + 1) * zStep;
    for (let c = 0; c < cols; c++) {
      const xNear = x0 + c * xStep;
      const xFar = x0 + (c + 1) * xStep;
      const p00 = project(cam, xNear, heights[r][c], zNear);
      const p10 = project(cam, xFar, heights[r][c + 1], zNear);
      const p11 = project(cam, xFar, heights[r + 1][c + 1], zFar);
      const p01 = project(cam, xNear, heights[r + 1][c], zFar);
      if (!p00 || !p10 || !p11 || !p01) continue;
      const cx = xNear + xStep / 2;
      const cz = zNear + zStep / 2;
      ctx.fillStyle = groundColour(terrain, cx, cz);
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRunway(ctx, cam) {
  const y = 12.5;
  const z0 = CFG.RUNWAY_Z0;
  const z1 = CFG.RUNWAY_Z1;
  const hw = CFG.RUNWAY_HALF_W;
  // Drawn in short segments so the near end (behind the camera at the
  // threshold) never cancels the whole strip.
  ctx.fillStyle = PALETTE.runway;
  for (let z = z0; z < z1; z += 20) {
    const za = z;
    const zb = Math.min(z + 20, z1);
    const a = project(cam, -hw, y, za);
    const b = project(cam, hw, y, za);
    const c = project(cam, hw, y, zb);
    const d = project(cam, -hw, y, zb);
    if (!a || !b || !c || !d) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }
  // Centreline dashes, projected one at a time.
  ctx.fillStyle = PALETTE.runwayLine;
  for (let z = z0 + 12; z < z1 - 8; z += 34) {
    const p1 = project(cam, -1.1, y + 0.08, z);
    const p2 = project(cam, 1.1, y + 0.08, z);
    const p3 = project(cam, 1.1, y + 0.08, z + 16);
    const p4 = project(cam, -1.1, y + 0.08, z + 16);
    if (!p1 || !p2 || !p3 || !p4) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
  }
  // Threshold bars at both ends.
  ctx.fillStyle = PALETTE.runwayLine;
  for (const z of [z0 + 4, z1 - 10]) {
    const p1 = project(cam, -hw + 1.5, y + 0.08, z);
    const p2 = project(cam, hw - 1.5, y + 0.08, z);
    const p3 = project(cam, hw - 1.5, y + 0.08, z + 5);
    const p4 = project(cam, -hw + 1.5, y + 0.08, z + 5);
    if (!p1 || !p2 || !p3 || !p4) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTrees(ctx, cam, terrain, plane) {
  let drawn = 0;
  for (const t of terrain.trees) {
    const dz = t.z - plane.z;
    if (dz < -10 || dz > 700) continue;
    if (Math.abs(t.x - plane.x) > 420) continue;
    const ground = terrainHeightAt(terrain, t.x, t.z);
    const p = project(cam, t.x, ground, t.z);
    if (!p) continue;
    const h = p.s * 14 * t.s;
    if (h < 2.5 || h > 260) continue;
    if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
    const wdt = h * 0.62;
    ctx.fillStyle = PALETTE.treeTrunk;
    ctx.fillRect(p.x - wdt * 0.07, p.y - h * 0.22, wdt * 0.14, h * 0.22);
    ctx.fillStyle = t.shade > 0.5 ? PALETTE.treeTopLight : PALETTE.treeTop;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h);
    ctx.lineTo(p.x - wdt / 2, p.y - h * 0.18);
    ctx.lineTo(p.x + wdt / 2, p.y - h * 0.18);
    ctx.closePath();
    ctx.fill();
    if (++drawn > 150) break;
  }
}

function drawRings(ctx, cam, terrain, plane) {
  for (const ring of terrain.rings) {
    const dz = ring.z - plane.z;
    if (dz < -30 || dz > 1600) continue;
    const p = project(cam, ring.x, ring.y, ring.z);
    if (!p) continue;
    const r = ring.r * p.s;
    if (r < 3 || r > 900) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.lineWidth = Math.max(2.5, r * 0.09);
    ctx.strokeStyle = ring.passed ? PALETTE.ringPassed : PALETTE.ring;
    ctx.globalAlpha = ring.passed ? 0.55 : 0.95;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.96, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(1.5, r * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.12, r * 1.08, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (!ring.passed && dz > 0 && dz < 900) {
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(13, Math.min(22, r * 0.32))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${ring.index + 1}`, p.x, p.y - r - 10);
      ctx.restore();
    }
  }
}

/**
 * The plane, drawn from behind and slightly above: wide wings, a
 * foreshortened fuselage pointing away, tail fin at the near end, red
 * cheatlines, and a spinning prop blur at the nose. Bank rolls the
 * whole sprite; pitch nudges it up and down the frame.
 */
function drawPlane(ctx, plane, t) {
  const cx = W / 2;
  const cy = H * 0.58 - plane.pitch * 130;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.bank * 0.85);
  const bob = Math.sin(t * 2.1) * 1.5;
  ctx.translate(0, bob);
  const S = 1; // sprite scale (plane drawn ~250px wide)
  // Soft shadow of the wings on the airframe.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 26, 118, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  // Main wings, swept slightly back.
  ctx.fillStyle = PALETTE.planeBody;
  ctx.strokeStyle = PALETTE.planeDark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-128 * S, 6);
  ctx.lineTo(-96 * S, -16);
  ctx.lineTo(-14 * S, -10);
  ctx.lineTo(14 * S, -10);
  ctx.lineTo(96 * S, -16);
  ctx.lineTo(128 * S, 6);
  ctx.lineTo(96 * S, 16);
  ctx.lineTo(-96 * S, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Red wingtips.
  ctx.fillStyle = PALETTE.planeRed;
  ctx.beginPath();
  ctx.moveTo(-128 * S, 6);
  ctx.lineTo(-96 * S, -16);
  ctx.lineTo(-84 * S, -13);
  ctx.lineTo(-108 * S, 8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(128 * S, 6);
  ctx.lineTo(96 * S, -16);
  ctx.lineTo(84 * S, -13);
  ctx.lineTo(108 * S, 8);
  ctx.closePath();
  ctx.fill();
  // Fuselage: narrow at the nose (far), wide at the tail (near).
  const fg = ctx.createLinearGradient(0, -64, 0, 74);
  fg.addColorStop(0, '#fff8ea');
  fg.addColorStop(1, '#d9c9a8');
  ctx.fillStyle = fg;
  ctx.strokeStyle = PALETTE.planeDark;
  ctx.beginPath();
  ctx.moveTo(-13, -62);
  ctx.quadraticCurveTo(0, -74, 13, -62);
  ctx.lineTo(24, 52);
  ctx.quadraticCurveTo(24, 72, 0, 74);
  ctx.quadraticCurveTo(-24, 72, -24, 52);
  ctx.lineTo(-13, -62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Red cheatlines along the fuselage.
  ctx.fillStyle = PALETTE.planeRed;
  ctx.fillRect(-19, -18, 5, 76);
  ctx.fillRect(14, -18, 5, 76);
  // Canopy.
  ctx.fillStyle = '#274b63';
  ctx.beginPath();
  ctx.ellipse(0, -34, 11, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-3, -40, 4, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Prop blur at the nose.
  ctx.fillStyle = 'rgba(43,47,54,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, -66, 26 + Math.sin(plane.propAngle) * 2, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.planeDark;
  ctx.beginPath();
  ctx.arc(0, -66, 4.5, 0, Math.PI * 2);
  ctx.fill();
  // Tail fin (near end, at the bottom of the sprite).
  ctx.fillStyle = PALETTE.planeRed;
  ctx.strokeStyle = PALETTE.planeDark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-16, 66);
  ctx.lineTo(0, 96);
  ctx.lineTo(16, 66);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Horizontal stabilizer.
  ctx.fillStyle = PALETTE.planeBody;
  ctx.beginPath();
  ctx.moveTo(-52, 62);
  ctx.lineTo(-40, 50);
  ctx.lineTo(40, 50);
  ctx.lineTo(52, 62);
  ctx.lineTo(40, 70);
  ctx.lineTo(-40, 70);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ HUD */

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.strokeStyle = PALETTE.hudPanelEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

function hudText(ctx, text, x, y, size, colour, align = 'left', bold = true) {
  ctx.fillStyle = colour;
  ctx.font = `${bold ? 'bold' : ''} ${size}px sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function bar(ctx, x, y, w, h, frac, colour, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y + h * (1 - frac), w, h * frac);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  hudText(ctx, label, x + w / 2, y + h + 15, 12, PALETTE.hudText, 'center');
}

function drawCompass(ctx, headingDeg) {
  const cx = W / 2;
  const y = 26;
  panel(ctx, cx - 190, 10, 380, 44);
  const points = [
    [0, 'N'],
    [45, 'NE'],
    [90, 'E'],
    [135, 'SE'],
    [180, 'S'],
    [225, 'SW'],
    [270, 'W'],
    [315, 'NW'],
  ];
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 184, 12, 368, 40);
  ctx.clip();
  for (const [deg, label] of points) {
    let d = ((deg - headingDeg + 540) % 360) - 180;
    const x = cx + d * 2.1;
    if (x < cx - 168 || x > cx + 168) continue;
    const major = deg % 90 === 0;
    hudText(ctx, label, x, y + 14, major ? 17 : 13, major ? PALETTE.hudText : PALETTE.hudDim, 'center');
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillRect(x - 1, y + 18, 2, 8);
  }
  ctx.restore();
  hudText(ctx, `HDG ${String(headingDeg).padStart(3, '0')}°`, cx, 72, 14, PALETTE.hudAmber, 'center');
  // Centre caret.
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.beginPath();
  ctx.moveTo(cx - 7, 12);
  ctx.lineTo(cx + 7, 12);
  ctx.lineTo(cx, 22);
  ctx.closePath();
  ctx.fill();
}

function drawHorizon(ctx, plane, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#3a6ea8';
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-plane.bank);
  ctx.translate(0, plane.pitch * r * 1.6);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-r, 0, r * 2, r);
  ctx.fillStyle = '#e8f4ff';
  ctx.fillRect(-r, -2, r * 2, 4);
  ctx.restore();
  // Fixed wings marker.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.55, y);
  ctx.lineTo(x - r * 0.18, y);
  ctx.moveTo(x + r * 0.18, y);
  ctx.lineTo(x + r * 0.55, y);
  ctx.stroke();
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = PALETTE.hudPanelEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  hudText(ctx, 'ATTITUDE', x, y + r + 16, 11, PALETTE.hudDim, 'center', false);
}

export function drawHUD(ctx, game) {
  const { plane, mission, score, lives, best, message, messageT } = game;
  const spd = speedKnots(plane);
  const altMsl = altitudeMslFt(plane);
  const altAgl = altitudeAglFt(plane, game.terrain);
  const vsi = Math.round(plane.verticalSpeed * 196.85); // ft/min
  const hdg = headingDegrees(plane);

  // Top-left: flight instruments.
  panel(ctx, 14, 10, 218, 108);
  hudText(ctx, 'ALT', 30, 34, 13, PALETTE.hudDim, 'left', false);
  hudText(ctx, `${altMsl.toLocaleString()} ft`, 210, 34, 19, PALETTE.hudText, 'right');
  hudText(ctx, `AGL ${altAgl.toLocaleString()} ft`, 210, 56, 13, PALETTE.hudDim, 'right', false);
  hudText(ctx, 'SPD', 30, 80, 13, PALETTE.hudDim, 'left', false);
  hudText(
    ctx,
    `${spd} kt`,
    210,
    80,
    19,
    spd < 55 ? PALETTE.hudRed : PALETTE.hudText,
    'right',
  );
  hudText(ctx, 'VSI', 30, 104, 13, PALETTE.hudDim, 'left', false);
  hudText(ctx, `${vsi >= 0 ? '+' : ''}${vsi} fpm`, 210, 104, 13, vsi >= 0 ? PALETTE.hudGreen : PALETTE.hudAmber, 'right', false);

  drawCompass(ctx, hdg);

  // Top-right: score, lives, best.
  panel(ctx, W - 232, 10, 218, 108);
  hudText(ctx, 'SCORE', W - 216, 34, 13, PALETTE.hudDim, 'left', false);
  hudText(ctx, score.toLocaleString(), W - 30, 34, 19, PALETTE.hudText, 'right');
  hudText(ctx, 'LIVES', W - 216, 58, 13, PALETTE.hudDim, 'left', false);
  let livesText = '';
  for (let i = 0; i < 3; i++) livesText += i < lives ? '✈ ' : '· ';
  hudText(ctx, livesText.trim(), W - 30, 58, 16, PALETTE.hudText, 'right');
  hudText(ctx, 'BEST', W - 216, 82, 13, PALETTE.hudDim, 'left', false);
  hudText(ctx, best.toLocaleString(), W - 30, 82, 15, PALETTE.hudAmber, 'right');
  hudText(ctx, 'MERIDIAN RUN', W - 30, 104, 12, PALETTE.hudDim, 'right', false);

  // Bottom-left: attitude + throttle + fuel. Bars are 40px apart so the
  // labels never collide.
  drawHorizon(ctx, plane, 78, H - 78, 52);
  const thrColour = plane.throttle > 0.85 ? PALETTE.hudAmber : PALETTE.hudGreen;
  bar(ctx, 154, H - 128, 20, 100, plane.throttle, thrColour, 'THR');
  const fuelFrac = plane.fuel / CFG.FUEL_MAX;
  const fuelColour = fuelFrac < 0.25 ? PALETTE.hudRed : fuelFrac < 0.5 ? PALETTE.hudAmber : PALETTE.hudGreen;
  bar(ctx, 194, H - 128, 20, 100, fuelFrac, fuelColour, 'FUEL');
  hudText(ctx, `${Math.round(plane.fuel)}%`, 204, H - 132, 12, fuelColour, 'center', false);
  // Damage bar.
  const dmgFrac = plane.damage / CFG.DAMAGE_MAX;
  bar(ctx, 234, H - 128, 20, 100, 1 - dmgFrac, dmgFrac > 0.6 ? PALETTE.hudRed : PALETTE.hudGreen, 'HULL');

  // Bottom-centre: mission objective.
  const obj = game.objective;
  ctx.font = 'bold 16px sans-serif';
  const objW = Math.min(760, ctx.measureText(obj).width + 36);
  panel(ctx, W / 2 - objW / 2, H - 52, objW, 36);
  hudText(ctx, obj, W / 2, H - 28, 16, PALETTE.hudText, 'center');

  // Warnings, live play only — never over the complete/crash screens.
  if (game.screen === 'play') {
    if (plane.fuel < 25 && plane.fuel > 0) {
      hudText(ctx, '⚠ LOW FUEL', W / 2, 108, 20, PALETTE.hudRed, 'center');
    }
    if (plane.damage > 60) {
      hudText(ctx, '⚠ HULL DAMAGE', W / 2, 134, 20, PALETTE.hudRed, 'center');
    }
    if (plane.speed < CFG.STALL_SPEED && plane.airborne) {
      hudText(ctx, '⚠ STALL — NOSE DOWN, FULL THROTTLE', W / 2, 108, 20, PALETTE.hudRed, 'center');
    }
  }

  // Transient centre message (ring scored, takeoff, ...).
  if (message && messageT > 0) {
    ctx.globalAlpha = Math.min(1, messageT);
    hudText(ctx, message, W / 2, H * 0.3, 30, '#ffffff', 'center');
    ctx.globalAlpha = 1;
  }
}

/* --------------------------------------------------------------- screens */

function overlay(ctx, alpha = 0.55) {
  ctx.fillStyle = `rgba(6, 12, 20, ${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

function bigTitle(ctx, text, y, size, colour = '#ffffff') {
  ctx.save();
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = colour;
  ctx.fillText(text, W / 2, y);
  ctx.restore();
}

function menuLine(ctx, text, y, size, colour = PALETTE.hudText) {
  hudText(ctx, text, W / 2, y, size, colour, 'center', false);
}

export function drawTitle(ctx, game) {
  overlay(ctx, 0.42);
  bigTitle(ctx, 'MERIDIAN RUN', 128, 84, '#ffe9b0');
  menuLine(ctx, 'A small prop plane, a long valley, three sorties. Fly it like you mean it.', 168, 20);
  bigTitle(ctx, 'CHOOSE YOUR SORTIE', 236, 26, PALETTE.hudAmber);
  const missions = [
    ['1', 'RING RUN', 'Fly all 8 gold rings down the valley.'],
    ['2', 'RIVER RUN', 'Stay low over the river for 60 seconds. Fuel is the boss.'],
    ['3', 'PRECISION LANDING', 'Take off, fly the valley, land on the runway.'],
  ];
  missions.forEach(([key, name, brief], i) => {
    const y = 292 + i * 62;
    const sel = game.selectedMission === i;
    if (sel) {
      ctx.fillStyle = 'rgba(255, 182, 46, 0.16)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 330, y - 34, 660, 50, 10);
      ctx.fill();
      ctx.strokeStyle = PALETTE.hudAmber;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    hudText(ctx, `[${key}]  ${name}`, W / 2 - 310, y, 24, sel ? '#ffe9b0' : PALETTE.hudText, 'left');
    hudText(ctx, brief, W / 2 - 310, y + 24, 15, PALETTE.hudDim, 'left', false);
  });
  menuLine(ctx, '↑ ↓ pitch   ← → bank & turn   SHIFT / CTRL throttle   SPACE fly   P pause', 512, 17);
  menuLine(ctx, 'Best score: ' + game.best.toLocaleString(), 548, 17, PALETTE.hudAmber);
  menuLine(ctx, 'Press SPACE or click to fly the selected sortie.', 592, 18);
}

export function drawPaused(ctx) {
  overlay(ctx, 0.6);
  bigTitle(ctx, 'PAUSED', H / 2 - 20, 64);
  menuLine(ctx, 'Press P to keep flying.', H / 2 + 24, 20);
}

export function drawComplete(ctx, game) {
  overlay(ctx, 0.6);
  bigTitle(ctx, 'MISSION COMPLETE', 170, 56, PALETTE.hudGreen);
  menuLine(ctx, game.missionTitle, 220, 26, '#ffe9b0');
  menuLine(ctx, game.missionSummary, 258, 19);
  panel(ctx, W / 2 - 240, 300, 480, 150);
  hudText(ctx, 'SCORE', W / 2 - 210, 336, 15, PALETTE.hudDim, 'left', false);
  hudText(ctx, game.score.toLocaleString(), W / 2 + 210, 336, 28, PALETTE.hudText, 'right');
  hudText(ctx, 'BEST', W / 2 - 210, 380, 15, PALETTE.hudDim, 'left', false);
  hudText(ctx, game.best.toLocaleString(), W / 2 + 210, 380, 22, PALETTE.hudAmber, 'right');
  hudText(ctx, 'TIME', W / 2 - 210, 420, 15, PALETTE.hudDim, 'left', false);
  hudText(ctx, `${game.mission.elapsed.toFixed(1)}s`, W / 2 + 210, 420, 20, PALETTE.hudText, 'right');
  menuLine(ctx, 'Press SPACE for another sortie, or 1 / 2 / 3 to pick a mission.', 500, 18);
}

export function drawCrash(ctx, game) {
  overlay(ctx, 0.55);
  bigTitle(ctx, game.crashTitle || 'CRASHED', 200, 64, PALETTE.hudRed);
  menuLine(ctx, game.crashDetail || '', 250, 22);
  menuLine(ctx, `Lives left: ${game.lives}`, 300, 22, PALETTE.hudAmber);
  if (game.lives > 0) {
    menuLine(ctx, 'Press SPACE to fly again.', 360, 20);
  } else {
    menuLine(ctx, 'Out of lives — press SPACE for the title screen.', 360, 20);
  }
}

/** Full frame: world + plane + HUD + the active screen overlay. */
export function renderFrame(ctx, game, t) {
  const { plane, terrain } = game;
  const cam = makeCamera(plane);
  drawSky(ctx, plane);
  drawMountains(ctx, plane, cam);
  drawClouds(ctx, cam, terrain.clouds, plane);
  drawTerrain(ctx, cam, terrain, plane);
  drawRunway(ctx, cam);
  drawTrees(ctx, cam, terrain, plane);
  drawRings(ctx, cam, terrain, plane);
  drawPlane(ctx, plane, t);
  if (game.screen === 'play' || game.screen === 'paused') {
    drawHUD(ctx, game);
  }
  if (game.screen === 'title') drawTitle(ctx, game);
  if (game.screen === 'paused') drawPaused(ctx);
  if (game.screen === 'complete') {
    drawHUD(ctx, game);
    drawComplete(ctx, game);
  }
  if (game.screen === 'crash') {
    drawHUD(ctx, game);
    drawCrash(ctx, game);
  }
  if (game.screen === 'gameover') {
    overlay(ctx, 0.65);
    bigTitle(ctx, 'OUT OF LIVES', 260, 64, PALETTE.hudRed);
    menuLine(ctx, `Final score: ${game.score.toLocaleString()}   ·   Best: ${game.best.toLocaleString()}`, 320, 22);
    menuLine(ctx, 'Press SPACE for the title screen.', 380, 20);
  }
}
