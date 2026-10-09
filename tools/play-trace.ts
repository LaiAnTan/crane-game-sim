import R from '@dimforge/rapier3d-compat';
import { Machine } from '../src/sim/machine';
import { Game } from '../src/sim/game';
import { Payout, DEFAULT_SETTINGS } from '../src/sim/payout';
import { PHYSICS_DT } from '../src/sim/config';
import { CATALOG } from '../src/sim/catalog';
await R.init();
const [grip, lift, prizeIdx, seed0, dzAim, carryArg] = process.argv.slice(2).map(Number);
let seed = seed0; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const m = new Machine(R);
const g = new Game(m, new Payout({ ...DEFAULT_SETTINGS, mode: 'skill', jitter: 0, normal: { grip, lift, carry: carryArg ?? lift / 2 }, staffAfter: 999 }));
m.setPrize(CATALOG[prizeIdx], 0.016);
for (let i = 0; i < 480; i++) g.tick(PHYSICS_DT);
for (let n = 1; n <= 3 && !g.wins; n++) {
  const t = m.prizeBody!.translation();
  g.insertCoin(100); g.press(1, true);
  while (g.phase === 'moveX' && m.claw.x < t.x) g.tick(PHYSICS_DT);
  g.press(1, false); while ((g.phase as string) !== 'waitY') g.tick(PHYSICS_DT);
  g.press(2, true); while (g.phase === 'moveY' && m.claw.z > t.z + dzAim) g.tick(PHYSICS_DT);
  g.press(2, false);
  let maxLift = 0; const y0 = m.prizeBody!.translation().y; let wonIn = ''; const c0 = m.prizeCornerYs(); let maxCorner = 0, minCorner = 0;
  while ((g.phase as string) !== 'ready' && (g.phase as string) !== 'idle' && (g.phase as string) !== 'win') {
    g.tick(PHYSICS_DT);
    maxLift = Math.max(maxLift, m.prizeBody!.translation().y - y0);
    if (g.phase === 'lift' || g.phase === 'top') { const cs = m.prizeCornerYs(); maxCorner = Math.max(maxCorner, ...cs.map((v, i) => v - c0[i])); minCorner = Math.max(minCorner, Math.min(...cs.map((v, i) => v - c0[i]))); }
    if (!wonIn && m.prizeState() === 'won') wonIn = (g.phase as string);
  }
  const q = m.prizeBody!.rotation(), t2 = m.prizeBody!.translation();
  console.log(`play ${n}: highest corner +${(maxCorner * 100).toFixed(1)}cm, whole box up ${(minCorner * 100).toFixed(1)}cm, centre ${(maxLift * 100).toFixed(1)}cm, z ${(t2.z * 100).toFixed(1)} pitch ${(2 * Math.atan2(q.x, q.w) * 57.3).toFixed(0)} ${m.prizeState()}${wonIn ? ' (dropped during ' + wonIn + ')' : ''}`);
}
