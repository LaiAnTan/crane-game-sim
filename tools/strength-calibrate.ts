// Measures how each prize responds to the claw at the same arm-power setting, so
// difficulty can be compared across box sizes and weights.
//
// For each prize it runs a fixed set of single plays from the starting placement
// (grip near the front end, the middle and the back end) and reports:
//   lift — how far the gripped end came up (cm, highest corner), averaged
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
    if ((g.phase as string) === 'lift' || (g.phase as string) === 'top') lift = Math.max(lift, ...m.prizeCornerYs().map((y, i) => y - c0[i]));
  }
  return lift;
}

type Profile = 'normal' | 'strong';

/** Average lift (cm) and movement score for one prize at a given trim. */
function measure(base: (typeof CATALOG)[number], profile: Profile, trim: number) {
  const p = { ...base, armTrim: trim };
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

const TARGET_LIFT = 3.8; // cm — average gripped-end lift with normal arms

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
    console.log(`target normal-arm lift ${TARGET_LIFT} cm — copy armTrim values into src/sim/catalog.ts\n` + results.join('\n'));
  } else {
    const p = targets[0];
    // Bisection on log(trim): lift rises with arm power.
    let lo = 0.3, hi = 6;
    for (let i = 0; i < 8; i++) {
      const mid = Math.sqrt(lo * hi);
      if (measure(p, 'normal', mid).lift < TARGET_LIFT) lo = mid;
      else hi = mid;
    }
    const trim = Math.sqrt(lo * hi);
    const n = measure(p, 'normal', trim), st = measure(p, 'strong', trim);
    console.log(`${p.id.padEnd(15)} armTrim: ${trim.toFixed(2)}   normal lift ${n.lift.toFixed(2)} cm move ${n.move.toFixed(2)}   strong lift ${st.lift.toFixed(2)} cm move ${st.move.toFixed(2)}`);
  }
} else {
  const profile = (process.argv[2] ?? 'normal') as Profile;
  console.log(`${profile} arms (current armTrim)`);
  for (const p of CATALOG) {
    const r = measure(p, profile, p.armTrim ?? 1);
    console.log(`${p.id.padEnd(15)} ${String(Math.round(p.mass * 1000)).padStart(4)} g  ${(p.w * 100).toFixed(0)}×${(p.d * 100).toFixed(0)}×${(p.h * 100).toFixed(0)}  trim ${(p.armTrim ?? 1).toFixed(2)}  lift ${r.lift.toFixed(2).padStart(5)} cm  move ${r.move.toFixed(2).padStart(5)}`);
  }
}
