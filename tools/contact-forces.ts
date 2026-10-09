import R from '@dimforge/rapier3d-compat';
import { Machine } from '../src/sim/machine';
import { Game } from '../src/sim/game';
import { Payout, DEFAULT_SETTINGS } from '../src/sim/payout';
import { PHYSICS_DT } from '../src/sim/config';
await R.init();
let seed = 7; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const m = new Machine(R);
const g = new Game(m, new Payout({ ...DEFAULT_SETTINGS, mode: 'skill', jitter: 0 }));
for (let i = 0; i < 480; i++) g.tick(PHYSICS_DT);
const t = m.prizeBody!.translation();
const dz = +(process.argv[2] ?? 0.05);
g.insertCoin(100); g.press(1, true);
while (g.phase === 'moveX' && m.claw.x < t.x) g.tick(PHYSICS_DT);
g.press(1, false); while ((g.phase as string) !== 'waitY') g.tick(PHYSICS_DT);
g.press(2, true); while (g.phase === 'moveY' && m.claw.z > t.z + dz) g.tick(PHYSICS_DT);
g.press(2, false);
const pc = m.prizeBody!.collider(0);
const names = ['head', 'upperL', 'shaftL', 'footL', 'upperR', 'shaftR', 'footR'];
const acc: Record<string, Record<string, number[]>> = {};
let last = '';
let lg = 0;
while ((g.phase as string) !== 'top') {
  if (g.phase === 'grab' && lg++ % 30 === 0) console.log('grab t', g.t.toFixed(2), 'headY', m.claw.headY().toFixed(4), 'cableEnd', (0.66 - m.claw.cable).toFixed(4), 'vy', m.claw.head.linvel().y.toFixed(3), 'ang', m.claw.armAngle(0).toFixed(2), 'boxY', m.prizeBody!.translation().y.toFixed(4));
  g.tick(PHYSICS_DT);
  if (!['drop', 'grab', 'lift'].includes((g.phase as string))) continue;
  m.claw.colliders.forEach((cc, k) => {
    let down = 0, tot = 0;
    m.world.contactPair(cc, pc, (man, flipped) => {
      const n = man.normal();
      for (let i = 0; i < man.numContacts(); i++) { const f = man.contactImpulse(i) / PHYSICS_DT; tot += f; down += f * Math.abs(n.y); }
    });
    const nm = names[k] ?? 'c' + k;
    (acc[(g.phase as string)] ??= {})[nm] ??= [0, 0, 0];
    const a = acc[(g.phase as string)][nm]; a[0] += down; a[1] += tot; a[2]++;
  });
}
for (const [ph, o] of Object.entries(acc)) console.log(ph, Object.entries(o).filter(([, a]) => a[1] > 0).map(([k, a]) => `${k}: vert ${(a[0] / a[2]).toFixed(2)}N tot ${(a[1] / a[2]).toFixed(2)}N`).join(' | '));
console.log('colliders order check:', m.claw.colliders.length);
