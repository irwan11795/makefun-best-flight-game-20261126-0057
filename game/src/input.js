// input.js — keyboard (and optional mouse) input for Meridian Run.
// The game reads a single `Input` object each frame: continuous stick
// axes plus edge-triggered "just pressed" keys for menus and pause.
// Nothing here knows about the game state; main.js decides what a press means.

import { KEYS } from './config.js';

/** Fresh input state, wired to the window's keyboard and mouse. */
export function createInput() {
  const input = {
    keys: new Set(),
    pressed: new Set(), // codes pressed since the last frame was consumed
    mouseX: 0,
    mouseY: 0,
    clicked: false, // a mouse click since the last consume
    touchActive: false,
  };

  window.addEventListener('keydown', (e) => {
    const watched = Object.values(KEYS).flat();
    if (watched.includes(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
  });
  window.addEventListener('mousemove', (e) => {
    const rect = document.getElementById('game')?.getBoundingClientRect();
    if (rect) {
      input.mouseX = ((e.clientX - rect.left) / rect.width) * 1280;
      input.mouseY = ((e.clientY - rect.top) / rect.height) * 720;
    }
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.clicked = true;
  });

  return input;
}

function anyDown(input, codes) {
  return codes.some((c) => input.keys.has(c));
}

/** Continuous stick for this frame: pitch/bank in [-1, 1], throttle delta. */
export function readStick(input) {
  const pitch =
    (anyDown(input, KEYS.PITCH_UP) ? 1 : 0) -
    (anyDown(input, KEYS.PITCH_DOWN) ? 1 : 0);
  const bank =
    (anyDown(input, KEYS.BANK_RIGHT) ? 1 : 0) -
    (anyDown(input, KEYS.BANK_LEFT) ? 1 : 0);
  const throttle =
    (anyDown(input, KEYS.THROTTLE_UP) ? 1 : 0) -
    (anyDown(input, KEYS.THROTTLE_DOWN) ? 1 : 0);
  return { pitch, bank, throttle };
}

/** Was any of these codes pressed since the last consume? */
export function justPressed(input, codes) {
  return codes.some((c) => input.pressed.has(c));
}

/** Clear the edge-triggered sets after a frame has consumed them. */
export function consumeEdges(input) {
  input.pressed.clear();
  input.clicked = false;
}

/** Which mission key (1/2/3) was pressed, or null. */
export function missionKeyPressed(input) {
  if (justPressed(input, KEYS.MISSION_1)) return 'rings';
  if (justPressed(input, KEYS.MISSION_2)) return 'river';
  if (justPressed(input, KEYS.MISSION_3)) return 'landing';
  return null;
}

/** True when the pointer is inside a rectangle in game coordinates. */
export function pointerIn(input, x, y, w, h) {
  return (
    input.mouseX >= x &&
    input.mouseX <= x + w &&
    input.mouseY >= y &&
    input.mouseY <= y + h
  );
}
