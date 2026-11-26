// config.js — every tunable number for Meridian Run in one place.
// Nothing here touches the network, storage, or the DOM: pure constants.

export const CFG = {
  // Canvas the game is designed for (screenshots are 1280x720).
  VIEW_W: 1280,
  VIEW_H: 720,

  // Flight model.
  MAX_SPEED: 96, // metres per second at full throttle
  MIN_SPEED: 18, // below this the wing stops flying and the nose drops
  CRUISE_SPEED: 62,
  ACCEL: 26, // m/s^2 gained at full throttle
  DRAG: 0.12, // per-second speed bleed
  CLIMB_RATE: 34, // m/s of vertical speed at full pitch up and cruise speed
  SINK_RATE: 26, // m/s of sink at full pitch down
  TURN_RATE: 0.85, // radians per second at full bank
  BANK_MAX: 1.05, // radians of visual bank
  BANK_SPEED: 3.2, // how fast the bank angle chases the stick
  PITCH_SPEED: 2.4,
  THROTTLE_SPEED: 0.9, // per second while a throttle key is held
  STALL_SPEED: 24,

  // World.
  GROUND_CLEARANCE: 2.2, // metres above the terrain before a strike counts
  WATER_LEVEL: 6.0,
  RUNWAY_X: 0,
  RUNWAY_Z0: 0,
  RUNWAY_Z1: 320,
  RUNWAY_HALF_W: 13,
  COURSE_LENGTH: 5200, // metres of flyable course per sortie

  // Resources.
  FUEL_MAX: 100,
  FUEL_BURN: 1.35, // per second at full throttle (scaled by throttle)
  FUEL_BURN_IDLE: 0.25,
  DAMAGE_TERRAIN: 34,
  DAMAGE_HARD_LANDING: 26,
  DAMAGE_MAX: 100,
  LIVES_START: 3,

  // Scoring.
  SCORE_RING: 250,
  SCORE_RIVER_TICK: 2, // per second flown low over the river
  SCORE_LANDING: 1000,
  SCORE_LANDING_BONUS: 400, // perfect touchdown bonus
  SCORE_SECOND: 5, // per second airborne, keeps the clock honest
};

// Palette: one coherent late-afternoon look across sky, terrain and plane.
export const PALETTE = {
  skyTop: '#2e5f8f',
  skyMid: '#7fb2d9',
  skyHorizon: '#f6d9a0',
  sun: '#fff3c4',
  sunCore: '#fffbe8',
  mountainFar: '#6d84a8',
  mountainNear: '#4d6b52',
  grassLow: '#5d8a3c',
  grassMid: '#6f9e46',
  grassHigh: '#7fae54',
  rock: '#8a7a68',
  snow: '#eef2f5',
  sand: '#cbb98a',
  water: '#2f7fb8',
  waterDeep: '#1f5f92',
  riverBank: '#a8b878',
  runway: '#3d3f45',
  runwayLine: '#f2f2e8',
  ring: '#ffb62e',
  ringPassed: '#7fd07f',
  treeTrunk: '#6b4a2e',
  treeTop: '#2f6b2f',
  treeTopLight: '#3f8a3f',
  planeBody: '#f3ead8',
  planeRed: '#c23b2e',
  planeDark: '#2b2f36',
  hudPanel: 'rgba(10, 18, 28, 0.72)',
  hudPanelEdge: 'rgba(140, 200, 255, 0.35)',
  hudText: '#eaf6ff',
  hudDim: '#9db8cc',
  hudAmber: '#ffb62e',
  hudGreen: '#7fe07f',
  hudRed: '#ff5a4e',
};

export const MISSION_NAMES = {
  rings: 'Ring Run',
  river: 'River Run',
  landing: 'Precision Landing',
};

// Briefings shown on the title screen and in the HUD objective line.
export const MISSION_BRIEFS = {
  rings: 'Fly all 8 gold rings along the valley. Smooth turns beat fast ones.',
  river: 'Stay low over the river for as long as you can. Fuel is the boss.',
  landing: 'Come home: touch down on the runway slow, level, and on centreline.',
};

// Keys the game listens to. Kept here so input.js stays a thin reader.
export const KEYS = {
  PITCH_UP: ['ArrowUp', 'KeyW'],
  PITCH_DOWN: ['ArrowDown', 'KeyS'],
  BANK_LEFT: ['ArrowLeft', 'KeyA'],
  BANK_RIGHT: ['ArrowRight', 'KeyD'],
  THROTTLE_UP: ['ShiftLeft', 'ShiftRight'],
  THROTTLE_DOWN: ['ControlLeft', 'ControlRight', 'KeyF'],
  CONFIRM: ['Space', 'Enter'],
  PAUSE: ['KeyP', 'Escape'],
  MISSION_1: ['Digit1'],
  MISSION_2: ['Digit2'],
  MISSION_3: ['Digit3'],
  RESTART: ['KeyR'],
};

