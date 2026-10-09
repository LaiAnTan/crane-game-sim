// Operator settings + payout logic.
//
// Japanese machines expose separate arm-power settings for the grab, the lift and
// the carry back home. Normal plays get weak arms that can only nudge the box.
// In progressive mode the chance that a play gets strong arms rises with the money
// taken since the last win: nothing below `floor`, then a curve up to a guaranteed
// strong play at the ceiling (天井). The counter resets when a prize drops.

export interface ArmPowers { grip: number; lift: number; carry: number }
export interface ArmProfile extends ArmPowers { strong: boolean; chance: number }

export type PayoutMode = 'skill' | 'progressive';

export interface OperatorSettings {
  mode: PayoutMode;
  normal: ArmPowers;
  strong: ArmPowers;
  /** Spend since last win below which strong arms never happen. */
  floor: number;
  /** Spend since last win at which a strong play is guaranteed (天井). */
  ceiling: number;
  /** Shape of the chance curve between floor and ceiling (1 = linear, >1 = back-loaded). */
  curve: number;
  /** ± fraction of random variation in arm power from play to play. */
  jitter: number;
  /** Failed plays before staff offer to reposition the prize. */
  staffAfter: number;
  /** Bar gap beyond the box's thickness (m). */
  gapExtra: number;
  pricePerPlay: number;
}

export const DEFAULT_SETTINGS: OperatorSettings = {
  mode: 'progressive',
  normal: { grip: 0.07, lift: 0.032, carry: 0.02 },
  strong: { grip: 0.4, lift: 0.3, carry: 0.05 },
  floor: 1000,
  ceiling: 6000,
  curve: 1.6,
  jitter: 0.12,
  staffAfter: 12,
  gapExtra: 0.016,
  pricePerPlay: 100,
};

/** Probability that a play at this spend-since-last-win gets strong arms. */
export function strongChance(s: OperatorSettings, spend: number): number {
  if (s.mode !== 'progressive') return 0;
  if (spend >= s.ceiling) return 1;
  if (spend <= s.floor) return 0;
  return Math.pow((spend - s.floor) / (s.ceiling - s.floor), s.curve);
}

export class Payout {
  spend = 0;
  plays = 0;

  constructor(public settings: OperatorSettings, private rng: () => number = Math.random) {}

  /** Chance the *next* play gets strong arms. */
  nextChance() {
    return strongChance(this.settings, this.spend + this.settings.pricePerPlay);
  }

  /** Called when a play starts; returns the arm powers for that play. */
  nextPlay(): ArmProfile {
    const s = this.settings;
    this.plays++;
    this.spend += s.pricePerPlay;
    const chance = strongChance(s, this.spend);
    const strong = this.rng() < chance;
    const base = strong ? s.strong : s.normal;
    const j = () => 1 + (this.rng() * 2 - 1) * s.jitter;
    return { grip: base.grip * j(), lift: base.lift * j(), carry: base.carry * j(), strong, chance };
  }

  onWin() {
    this.spend = 0;
  }
}
