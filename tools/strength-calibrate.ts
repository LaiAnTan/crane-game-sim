// Measures how each prize responds to the claw at the same arm-power setting, so
// difficulty can be compared across box sizes and weights.
//
// For each prize it runs a fixed set of single plays from the starting placement
// (grip near the front end, the middle and the back end) and reports:
//   lift — how far the claw lifted the box while holding it (cm, highest corner), averaged
//   move — how far the box moved/turned (cm of centre travel + 1 cm per 10° of tilt)
//
// Usage:
//   npx tsx tools/strength-calibrate.ts [normal|strong]   report with the current armTrim values
//   npx tsx tools/strength-calibrate.ts calibrate         find each prize's armTrim (parallel)
import R from '@dimforge/rapier3d-compat';
import { Machine } from '../src/sim/machine';
import { Game } from '../src/sim/game';
import { Payout, DEFAULT_SETTINGS } from '../src/sim/payout';
import { PHYSICS_DT } from '../src/sim/config';
import { CATALOG } from '../src/sim/catalog';

await R.init();
const SEEDS = [3, 7, 11];

function play(g: Game, tx: number, tz: number) {
  const m = g.machine, dt = PHYSICS_DT;
  g.insertCoin(100);
  if (g.phase !== 'ready') return 0; // prize already dropped / staff busy — nothing to measure
  g.press(1, true);
  while ((g.phase as string) === 'moveX' && m.claw.x < tx) g.tick(dt);
  g.press(1, false);
  for (let guard = 0; (g.phase as string) !== 'waitY' && guard < 240 * 60; guard++) g.tick(dt);
  g.press(2, true);
  while ((g.phase as string) === 'moveY' && m.claw.z > tz) g.tick(dt);
  g.press(2, false);
  const c0 = m.prizeCornerYs();
  let lift = 0;
  for (let guard = 0; !['ready', 'idle', 'win'].includes(g.phase as string) && guard < 240 * 60; guard++) {
    g.tick(dt);
    // Only count lift while the claw actually holds the box (touching it, arms not yet
    // slipped) — not the swing of the far end once it tips after a slip.
    const holding = !g.slipped && m.clawContacts().points.length > 0;
    if (((g.phase as string) === 'lift' || (g.phase as string) === 'top') && holding)
      lift = Math.max(lift, ...m.prizeCornerYs().map((y, i) => y - c0[i]));
  }
  return lift;
}

type Profile = 'normal' | 'strong';

/** Average lift (cm) and movement score for one prize at a given trim for that profile. */
function measure(base: (typeof CATALOG)[number], profile: Profile, trim: number) {
  // Plays run in skill mode with `normal` set to the chosen profile's powers, so the
  // trim under test goes in armTrim either way.
  const p = { ...base, armTrim: trim, strongTrim: undefined };
  let liftSum = 0, moveSum = 0, n = 0;
  for (const seed of SEEDS) {
    for (const f of [-0.6, 0, 0.6]) {
      let s = seed;
      Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const m = new Machine(R);
      const settings = structuredClone(DEFAULT_SETTINGS);
      settings.mode = 'skill';
      settings.jitter = 0;
      settings.normal = settings[profile];
      const g = new Game(m, new Payout(settings));
      m.setPrize(p, settings.gapExtra);
      for (let i = 0; i < 480; i++) g.tick(PHYSICS_DT);
      const b = m.prizeBody!;
      const t0 = { ...b.translation() }, q0 = { ...b.rotation() };
      liftSum += play(g, t0.x, t0.z + (f * p.h) / 2);
      const t = b.translation(), q = b.rotation();
      const dot = Math.min(1, Math.abs(q0.x * q.x + q0.y * q.y + q0.z * q.z + q0.w * q.w));
      const turnDeg = (2 * Math.acos(dot) * 180) / Math.PI;
      moveSum += Math.hypot(t.x - t0.x, t.y - t0.y, t.z - t0.z) * 100 + turnDeg / 10;
      n++;
    }
  }
  return { lift: (liftSum / n) * 100, move: moveSum / n };
}

const trimFor = (p: (typeof CATALOG)[number], profile: Profile) =>
  profile === 'strong' ? p.strongTrim ?? p.armTrim ?? 1 : p.armTrim ?? 1;

// Targets: average gripped-end lift (cm). Normal arms nudge; strong arms reliably bring
// the end up to just under the 5 cm lift cap (any stronger only makes the box swing more).
const TARGET: Record<Profile, number> = { normal: 3.2, strong: 4.8 };
const STRONG_MARGIN = 1.5;

if (process.argv[2] === 'calibrate') {
  const id = process.argv[3];
  const targets = id ? CATALOG.filter((p) => p.id === id) : CATALOG;
  if (!id) {
    // Fan out: one child process per prize (the physics is CPU-bound).
    const { spawn } = await import('node:child_process');
    const results = await Promise.all(
      targets.map(
        (p) =>
          new Promise<string>((res) => {
            const c = spawn(process.execPath, [...process.execArgv, process.argv[1], 'calibrate', p.id]);
            let out = '';
            c.stdout.on('data', (d) => (out += d));
            c.on('close', () => res(out.trim()));
          }),
      ),
    );
    console.log(`targets: normal lift ${TARGET.normal} cm, strong lift ${TARGET.strong} cm — copy armTrim / strongTrim into src/sim/catalog.ts\n` + results.join('\n'));
  } else {
    const p = targets[0];
    // Bisection on log(trim): lift rises with arm power.
    const solve = (profile: Profile) => {
      let lo = 0.05, hi = 6;
      for (let i = 0; i < 9; i++) {
        const mid = Math.sqrt(lo * hi);
        if (measure(p, profile, mid).lift < TARGET[profile]) lo = mid;
        else hi = mid;
      }
      return Math.sqrt(lo * hi);
    };
    const tn = solve('normal');
    // Strong: the weakest trim that brings the end up to the cap, times a safety margin
    // so play-to-play jitter doesn't drop strong plays below it. Boxes whose shape makes
    // the claw lift them flat (the "never lift clear" rule slips first) can't reach the
    // target at any power; they keep their normal trim for strong plays.
    const threshold = solve('strong');
    const reachable = measure(p, 'strong', threshold * STRONG_MARGIN).lift >= TARGET.strong - 0.3;
    const ts = reachable ? threshold * STRONG_MARGIN : tn;
    const n = measure(p, 'normal', tn), st = measure(p, 'strong', ts);
    console.log(`${p.id.padEnd(15)} armTrim: ${tn.toFixed(2)}, strongTrim: ${ts.toFixed(2)}${reachable ? '' : ' (cap unreachable — shape-limited)'}   normal lift ${n.lift.toFixed(2)} cm   strong lift ${st.lift.toFixed(2)} cm`);
  }
} else {
  const profile = (process.argv[2] ?? 'normal') as Profile;
  console.log(`${profile} arms (current trims)`);
  for (const p of CATALOG) {
    const t = trimFor(p, profile);
    const r = measure(p, profile, t);
    console.log(`${p.id.padEnd(15)} ${String(Math.round(p.mass * 1000)).padStart(4)} g  ${(p.w * 100).toFixed(0)}×${(p.d * 100).toFixed(0)}×${(p.h * 100).toFixed(0)}  trim ${t.toFixed(2)}  lift ${r.lift.toFixed(2).padStart(5)} cm  move ${r.move.toFixed(2).padStart(5)}`);
  }
}
