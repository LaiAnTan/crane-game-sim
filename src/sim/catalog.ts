// Generic prize boxes in the size range of real Japanese prize-figure packaging,
// from small boxes (~9 cm wide) up to large premium figures (~16 cm wide, 27 cm tall).
// Each box is tall enough to bridge a rod gap that fits its footprint diagonal (see rodGap).
// Box art is generated from `colors` — no product images.

export interface Prize {
  id: string;
  title: string;
  /** Short size label shown on the box and in the HUD. */
  size: string;
  // Upright box dimensions in metres (W = front width, D = depth, H = height).
  w: number;
  d: number;
  h: number;
  mass: number;
  // Centre of mass offset along the box's height axis, as a fraction of H
  // (negative = toward the base, where the figure's pedestal sits).
  comAlongH: number;
  colors: { bg: string; bg2: string; accent: string; ink: string };
  /**
   * Shape correction on top of weight scaling for normal arms, calibrated with
   * `npm run sim:calibrate` so every box responds alike at the same setting.
   */
  armTrim?: number;
  /** Same, for strong (payout) arms. Falls back to armTrim. */
  strongTrim?: number;
}

/** Reference box weight the arm-power settings are written for. */
export const REF_MASS = 0.34;

/** Multiplier on all arm powers for a prize: proportional to its weight, times its shape trim. */
export function armScale(p: Prize, strong = false): number {
  const trim = strong ? p.strongTrim ?? p.armTrim ?? 1 : p.armTrim ?? 1;
  return (p.mass / REF_MASS) * trim;
}

export const CATALOG: Prize[] = [
  {
    id: 'standard-pink', title: 'Standard Figure', size: 'M',
    w: 0.11, d: 0.08, h: 0.2, mass: 0.3, comAlongH: -0.16, armTrim: 0.05, strongTrim: 0.21,
    colors: { bg: '#ffd9e8', bg2: '#ff8fb8', accent: '#e8478a', ink: '#5a2440' },
  },
  {
    id: 'mini-mint', title: 'Mini Figure', size: 'S',
    w: 0.09, d: 0.07, h: 0.2, mass: 0.18, comAlongH: -0.12, armTrim: 0.05, strongTrim: 0.8,
    colors: { bg: '#d8fbef', bg2: '#7fe0c0', accent: '#1fa77d', ink: '#14453a' },
  },
  {
    id: 'wide-violet', title: 'Wide Figure', size: 'L wide',
    w: 0.15, d: 0.09, h: 0.24, mass: 0.42, comAlongH: -0.18, armTrim: 0.07, strongTrim: 0.24,
    colors: { bg: '#e8defd', bg2: '#a98cf0', accent: '#6c3fe0', ink: '#2c1a5c' },
  },
  {
    id: 'tall-sky', title: 'Tall Figure', size: 'L tall',
    w: 0.12, d: 0.09, h: 0.26, mass: 0.5, comAlongH: -0.24, armTrim: 0.37, strongTrim: 2.56,
    colors: { bg: '#dff1ff', bg2: '#82c4f5', accent: '#1f7ae0', ink: '#123257' },
  },
  {
    id: 'slim-lemon', title: 'Slim Figure', size: 'S slim',
    w: 0.08, d: 0.06, h: 0.2, mass: 0.22, comAlongH: -0.2, armTrim: 0.3, strongTrim: 3.06,
    colors: { bg: '#fff7cc', bg2: '#ffe066', accent: '#f0a500', ink: '#4a3500' },
  },
  {
    id: 'premium-coral', title: 'Premium Figure', size: 'XL',
    w: 0.16, d: 0.11, h: 0.27, mass: 0.7, comAlongH: -0.22, armTrim: 0.26, strongTrim: 0.3,
    colors: { bg: '#ffe2d6', bg2: '#ff9d7a', accent: '#e8542a', ink: '#5a2414' },
  },
];
