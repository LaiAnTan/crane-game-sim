// All units are metres / kilograms / seconds. Deck surface is y = 0.
// Player stands at +z looking toward -z. Button ① moves +x, button ② moves -z.

export const PHYSICS_DT = 1 / 240;

export const INTERIOR = { x0: -0.36, x1: 0.36, z0: -0.32, z1: 0.32, height: 0.78 };

// Bridge (橋渡し) rod rack — chrome rods running left-to-right, parallel to the front
// glass, spaced (box thickness + gapExtra) apart over a funnel. The prize starts lying
// front-to-back across the pair of rods either side of `cz`.
export const BRIDGE = {
  cz: -0.005,
  x0: -0.3,
  x1: 0.3,
  barRadius: 0.011,
  barLift: 0.018, // gap between deck surface and underside of bars
  holeLip: 0.03, // opening extends this far beyond the outside of each bar
};

// Sample-prize shelf against the back wall.
export const SHELF = { z0: INTERIOR.z0, z1: INTERIOR.z0 + 0.13, height: 0.05 };

export const GANTRY = {
  y: 0.66, // rail height
  xMin: -0.17,
  xMax: 0.22,
  zMin: -0.17,
  zMax: 0.225,
  homeX: -0.17,
  homeZ: 0.225,
  moveSpeed: 0.15, // m/s while button held
  returnSpeed: 0.195,
};

export const CLAW = {
  headRadius: 0.05,
  headHalfHeight: 0.04,
  headMass: 0.4,
  hingeOffsetX: 0.052,
  armLength: 0.19, // hinge to tip, vertical
  elbowX: 0.04, // outward bow of the diamond arm
  elbowY: 0.085,
  tipX: 0.004,
  armMass: 0.09,
  footLength: 0.027,
  footSlope: 0.72, // rad; tip surface slopes so load pushes arms open
  openAngle: 0.7,
  closedAngle: -0.17,
  idleAngle: -0.05,
  cableMin: 0.09,
  cableIdle: 0.13,
  cableMax: 0.56, // fully extended: tips reach below the bars
  dropSpeed: 0.195,
  liftSpeed: 0.165,
  closeTime: 0.6,
  // PD gains of the arm controller; output is clamped to the current arm power.
  kp: 9,
  kd: 0.12,
};

// Funnel under the rod rack: four sloped panels down to a central opening.
export const FUNNEL = { yTop: -0.004, yBottom: -0.3, openingX: 0.3, openingZ: 0.3 };
// The claw can never lift a prize clear: once any corner rises this far above where it
// was when the lift started (or the whole box comes up), the arms slip.
export const MAX_LIFT = 0.05;
export const MAX_CLEAR = 0.008;
export const WIN_Y = FUNNEL.yBottom - 0.04; // a prize whose centre is below the opening has dropped

// Collision groups: membership in upper 16 bits, filter in lower 16.
const STATIC = 0x0001, CLAW_BIT = 0x0002, PRIZE = 0x0004;
export const GROUP_STATIC = (STATIC << 16) | 0xffff;
export const GROUP_PRIZE = (PRIZE << 16) | 0xffff;
/** Claw head and rubber tips: hit everything except the claw itself. */
export const GROUP_CLAW = (CLAW_BIT << 16) | (0xffff & ~CLAW_BIT);
