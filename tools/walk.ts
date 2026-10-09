import R from '@dimforge/rapier3d-compat';
import { Machine } from '../src/sim/machine';
import { Game } from '../src/sim/game';
import { Payout, DEFAULT_SETTINGS } from '../src/sim/payout';
import { PHYSICS_DT } from '../src/sim/config';
import { CATALOG } from '../src/sim/catalog';
await R.init();
const [grip, lift, dzAim, prizeIdx] = process.argv.slice(2).map(Number);
let seed = 7; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function playOnce(g: Game, tx: number, tz: number) {
  const m = g.machine, dt = PHYSICS_DT;
  g.insertCoin(100); g.press(1, true);
  while (g.phase === 'moveX' && m.claw.x < tx) g.tick(dt);
  g.press(1, false); while ((g.phase as string) !== 'waitY') g.tick(dt);
  g.press(2, true); while (g.phase === 'moveY' && m.claw.z > tz) g.tick(dt);
  g.press(2, false);
  while ((g.phase as string) !== 'ready' && (g.phase as string) !== 'idle' && (g.phase as string) !== 'win') g.tick(dt);
}
const m = new Machine(R);
const g = new Game(m, new Payout({ ...DEFAULT_SETTINGS, mode: 'skill', jitter: 0, normal: { grip, lift, carry: lift * 0.5 }, staffAfter: 999 }));
m.setPrize(CATALOG[prizeIdx ?? 0]);
for (let i = 0; i < 480; i++) g.tick(PHYSICS_DT);
const log: string[] = [];
for (let n = 1; n <= 15 && !g.wins; n++) {
  const t = m.prizeBody!.translation();
  playOnce(g, t.x, t.z + dzAim);
  const t2 = m.prizeBody!.translation(), q = m.prizeBody!.rotation();
  log.push(`${n}:z${(t2.z * 100).toFixed(1)} p${(2 * Math.atan2(q.x, q.w) * 57.3).toFixed(0)} ${m.prizeState()[0]}`);
  if (m.prizeState() === 'stuck') break;
}
console.log(`g${grip} l${lift} aim dz ${dzAim}: wins=${g.wins} | ${log.join(' ')}`);
