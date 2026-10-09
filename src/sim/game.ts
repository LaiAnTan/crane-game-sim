import { CLAW, GANTRY, MAX_CLEAR, MAX_LIFT } from './config';
import { CATALOG } from './catalog';
import type { Machine } from './machine';
import { Payout, type ArmProfile } from './payout';

export type Phase =
  | 'idle' // no credit
  | 'ready' // credit in, waiting for ①
  | 'moveX'
  | 'waitY'
  | 'moveY'
  | 'open'
  | 'drop'
  | 'grab'
  | 'lift'
  | 'top'
  | 'return'
  | 'release'
  | 'settle'
  | 'win'
  | 'staff';

export type GameEvent =
  | { type: 'coin'; yen: number; credits: number }
  | { type: 'play'; strong: boolean }
  | { type: 'phase'; phase: Phase }
  | { type: 'motor'; on: boolean }
  | { type: 'win'; yen: number; plays: number; prizeId: string }
  | { type: 'miss' }
  | { type: 'staffAvailable' }
  | { type: 'staffStart' }
  | { type: 'staffDone' }
  | { type: 'prizeLoaded' };

const READY_TIMEOUT = 30;
const WAIT_Y_TIMEOUT = 15;

export class Game {
  phase: Phase = 'idle';
  t = 0; // seconds in current phase
  credits = 0;
  /** Coins inserted since the last win, and in total. */
  yenSinceWin = 0;
  playsSinceWin = 0;
  totalYen = 0;
  fails = 0;
  wins = 0;
  staffAvailable = false;
  profile: ArmProfile | null = null;
  /** Whether the most recent play rolled strong arms (kept after the round ends). */
  lastProfileStrong = false;
  prizeIndex = 0;
  private held = { 1: false, 2: false };
  private wonThisRound = false;
  private slackTime = 0;
  private liftRef: number[] = [];
  /** True once the arms have given out on this play. */
  slipped = false;
  private listeners: ((e: GameEvent) => void)[] = [];

  constructor(public machine: Machine, public payout: Payout) {
    machine.setPrize(CATALOG[0], payout.settings.gapExtra);
  }

  on(fn: (e: GameEvent) => void) {
    this.listeners.push(fn);
  }
  private emit(e: GameEvent) {
    for (const l of this.listeners) l(e);
  }

  private go(p: Phase) {
    const wasMoving = this.phase === 'moveX' || this.phase === 'moveY' || this.phase === 'return';
    const moving = p === 'moveX' || p === 'moveY' || p === 'return';
    this.phase = p;
    this.t = 0;
    if (wasMoving !== moving) this.emit({ type: 'motor', on: moving });
    this.emit({ type: 'phase', phase: p });
  }

  /** Seconds left on the current input countdown, or null. */
  countdown(): number | null {
    if (this.phase === 'ready') return Math.max(0, READY_TIMEOUT - this.t);
    if (this.phase === 'waitY') return Math.max(0, WAIT_Y_TIMEOUT - this.t);
    return null;
  }

  insertCoin(yen: 100 | 500) {
    if (this.phase === 'win' || this.phase === 'staff') return;
    // ¥500 coin = 6 plays, the standard Japanese bonus.
    this.credits += yen === 500 ? 6 : 1;
    this.yenSinceWin += yen;
    this.totalYen += yen;
    this.emit({ type: 'coin', yen, credits: this.credits });
    if (this.phase === 'idle') this.go('ready');
  }

  press(btn: 1 | 2, down: boolean) {
    this.held[btn] = down;
    if (!down) return;
    if (btn === 1 && this.phase === 'ready') this.startPlay();
    else if (btn === 2 && this.phase === 'waitY') this.go('moveY');
  }

  private startPlay() {
    this.credits--;
    this.playsSinceWin++;
    // Operators re-tune arm power for each prize; normalise to a ~340 g box.
    const k = this.machine.prize.mass / 0.34;
    const p = this.payout.nextPlay();
    this.profile = { ...p, grip: p.grip * k, lift: p.lift * k, carry: p.carry * k };
    this.lastProfileStrong = p.strong;
    this.emit({ type: 'play', strong: p.strong });
    this.wonThisRound = false;
    this.machine.claw.power = 0.3;
    this.go('moveX');
  }

  /** すみません！— ask staff to reset the prize to an easier spot. Allowed between plays. */
  callStaff() {
    if (this.phase !== 'idle' && this.phase !== 'ready') return;
    this.staffAvailable = false;
    this.emit({ type: 'staffStart' });
    this.go('staff');
  }

  update(dt: number) {
    const m = this.machine;
    const c = m.claw;
    const prof = this.profile;
    this.t += dt;

    // A prize can drop at any moment — mid-grab, while carried, or while settling.
    if (!this.wonThisRound && this.phase !== 'staff' && this.phase !== 'win' && m.prizeState() === 'won') {
      this.wonThisRound = true;
      this.wins++;
      this.fails = 0;
      this.staffAvailable = false;
      this.payout.onWin();
      this.emit({ type: 'win', yen: this.yenSinceWin, plays: this.playsSinceWin, prizeId: m.prize.id });
      this.yenSinceWin = 0;
      this.playsSinceWin = 0;
    }

    // Hard cap: one end may come up ~5 cm, never the whole box. Past that the arms slip.
    if ((this.phase === 'lift' || this.phase === 'top' || this.phase === 'return') && this.liftRef.length) {
      const ys = m.prizeCornerYs();
      let maxUp = -Infinity, minUp = Infinity;
      ys.forEach((y, i) => {
        const d = y - this.liftRef[i];
        maxUp = Math.max(maxUp, d);
        minUp = Math.min(minUp, d);
      });
      if (this.slipped || maxUp > MAX_LIFT || minUp > MAX_CLEAR) {
        this.slipped = true;
        c.power = 0;
        c.openPower = 0.15;
        c.armRate = 6;
        c.armGoal = Math.min(c.armGoal + 0.4 * dt * 10, CLAW.idleAngle + 0.25);
      }
    }

    switch (this.phase) {
      case 'idle':
        break;
      case 'ready':
        if (this.t > READY_TIMEOUT) this.startPlay();
        break;
      case 'moveX': {
        // After a timeout the button is treated as already released.
        const holding = this.held[1] && this.t > 0;
        if (holding && c.x < GANTRY.xMax) c.x = Math.min(GANTRY.xMax, c.x + GANTRY.moveSpeed * dt);
        else if (!holding || c.x >= GANTRY.xMax) this.go('waitY');
        break;
      }
      case 'waitY':
        if (this.t > WAIT_Y_TIMEOUT) this.go('open');
        break;
      case 'moveY':
        if (this.held[2] && c.z > GANTRY.zMin) c.z = Math.max(GANTRY.zMin, c.z - GANTRY.moveSpeed * dt);
        else this.go('open');
        break;
      case 'open':
        c.openPower = 0.5;
        c.armRate = 3.3;
        c.armGoal = CLAW.openAngle;
        if (this.t > 0.5) {
          this.slackTime = 0;
          this.go('drop');
        }
        break;
      case 'drop':
        if (c.isSlack()) this.slackTime += dt;
        else {
          this.slackTime = 0;
          c.cable = Math.min(CLAW.cableMax, c.cable + CLAW.dropSpeed * dt);
        }
        if (this.slackTime > 0.05 || (c.cable >= CLAW.cableMax && this.t > 0.2)) {
          // Like the real machine, stop on contact and back off a few mm so the
          // cable carries the head instead of its weight pressing on the prize.
          c.cable = Math.min(c.cable, GANTRY.y - c.headY() - 0.003);
          this.go('grab');
        }
        break;
      case 'grab':
        c.power = prof!.grip;
        c.armRate = (CLAW.openAngle - CLAW.closedAngle) / CLAW.closeTime;
        c.armGoal = CLAW.closedAngle;
        if (this.t > CLAW.closeTime + 0.25) {
          this.liftRef = m.prizeCornerYs();
          this.slipped = false;
          this.go('lift');
        }
        break;
      case 'lift':
        if (!this.slipped) c.power = prof!.lift;
        c.cable = Math.max(CLAW.cableMin, c.cable - CLAW.liftSpeed * dt);
        if (c.cable <= CLAW.cableMin) this.go('top');
        break;
      case 'top':
        if (this.t > 0.3) {
          if (!this.slipped) c.power = prof!.carry;
          this.go('return');
        }
        break;
      case 'return': {
        const dx = GANTRY.homeX - c.x;
        const dz = GANTRY.homeZ - c.z;
        const dist = Math.hypot(dx, dz);
        const step = GANTRY.returnSpeed * dt;
        if (dist <= step) {
          c.x = GANTRY.homeX;
          c.z = GANTRY.homeZ;
          this.go('release');
        } else {
          c.x += (dx / dist) * step;
          c.z += (dz / dist) * step;
        }
        break;
      }
      case 'release':
        this.liftRef = [];
        c.armRate = 4.5;
        c.armGoal = CLAW.openAngle;
        if (this.t > 0.7) this.go('settle');
        break;
      case 'settle':
        c.armRate = 2.25;
        c.armGoal = CLAW.idleAngle;
        c.power = 0.3;
        c.cable = Math.min(CLAW.cableIdle, c.cable + 0.075 * dt);
        if (this.t > 0.95) this.finishRound();
        break;
      case 'win':
        if (this.t > 2.8) {
          this.prizeIndex = (this.prizeIndex + 1) % CATALOG.length;
          m.setPrize(CATALOG[this.prizeIndex], this.payout.settings.gapExtra);
          this.emit({ type: 'prizeLoaded' });
          this.go(this.credits > 0 ? 'ready' : 'idle');
        }
        break;
      case 'staff':
        if (this.t > 1.6) {
          m.placePrize('assist');
          this.fails = 0;
          this.emit({ type: 'staffDone' });
          this.go(this.credits > 0 ? 'ready' : 'idle');
        }
        break;
    }
  }

  private finishRound() {
    this.profile = null;
    if (this.wonThisRound) {
      this.go('win');
      return;
    }
    this.fails++;
    this.emit({ type: 'miss' });
    const stuck = this.machine.prizeState() === 'stuck';
    if (!this.staffAvailable && (stuck || this.fails >= this.payout.settings.staffAfter)) {
      this.staffAvailable = true;
      this.emit({ type: 'staffAvailable' });
    }
    this.go(this.credits > 0 ? 'ready' : 'idle');
  }

  /** Physics + logic tick (fixed dt). */
  tick(dt: number) {
    this.update(dt);
    this.machine.step();
  }
}
