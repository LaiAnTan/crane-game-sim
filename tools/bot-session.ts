import R from '@dimforge/rapier3d-compat';
import { Machine } from '../src/sim/machine';
import { Game } from '../src/sim/game';
import { Payout, DEFAULT_SETTINGS } from '../src/sim/payout';
import { PHYSICS_DT } from '../src/sim/config';
import { CATALOG } from '../src/sim/catalog';
await R.init();
const [grip, lift, prizeIdx, seed0, mode] = process.argv.slice(2);
let seed = +seed0; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
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
const s = { ...DEFAULT_SETTINGS, staffAfter: 999, gapExtra: +(process.env.GAP ?? 0.013) } as typeof DEFAULT_SETTINGS;
if (mode !== 'progressive') { s.mode = 'skill'; s.normal = { grip: +grip, lift: +lift, carry: +lift * 0.5 }; }
const g = new Game(m, new Payout(s));
m.setPrize(CATALOG[+prizeIdx], s.gapExtra);
for (let i = 0; i < 480; i++) g.tick(PHYSICS_DT);
let n = 0, staff = 0, strong = 0;
const strongAt: number[] = [];
let lastPos = { x: 0, y: 0, z: 0 }, still = 0, sumimasen = 0;
while (n < 120 && g.wins === 0) {
  if (m.prizeState() === 'stuck') { staff++; m.placePrize('initial'); for (let i = 0; i < 240; i++) g.tick(PHYSICS_DT); }
  {
    const p = m.prizeBody!.translation();
    still = Math.hypot(p.x - lastPos.x, p.y - lastPos.y, p.z - lastPos.z) < 0.005 ? still + 1 : 0;
    lastPos = { ...p };
    if (still >= 8) { g.callStaff(); while (g.phase === 'staff') g.tick(PHYSICS_DT); sumimasen++; still = 0; }
  }
  const b = m.prizeBody!, t = b.translation(), q = b.rotation();
  const pitch = 2 * Math.atan2(q.x, q.w);
  let tz: number;
  if (Math.abs(pitch) > 0.3) {
    // Wedged: push the raised end. Local +z end world z ≈ t.z + cos(pitch)*h/2; raised end is the one with higher y.
    const h = m.prize.h / 2, endZ = Math.cos(pitch) * h;
    const plusUp = -Math.sin(pitch) * h > 0; // y of +z end relative to centre
    tz = t.z + (plusUp ? endZ : -endZ) * +(process.env.F ?? 0.8);
  } else tz = t.z + 0.04;
  const before = g.payout.plays;
  playOnce(g, t.x + (Math.random() - 0.5) * 0.01, tz + (Math.random() - 0.5) * 0.01);
  if ((g as any).lastProfileStrong) strongAt.push(n + 1);
  if (g.payout.plays && (g as any).lastStrong !== undefined) {}
  if (g.payout.plays && (g as any).profile === null) {}
  n++;
}
console.log(`${mode ?? 'skill'} strongAt=[${strongAt.join(',')}] g${grip} l${lift} prize${prizeIdx} seed${seed0}: ${g.wins ? 'WIN' : 'no win'} after ${n} plays (¥${n * 100}), staff resets ${staff}, sumimasen ${sumimasen}`);
