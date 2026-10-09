import R from '@dimforge/rapier3d-compat';
import { Machine } from '../src/sim/machine';
import { CATALOG } from '../src/sim/catalog';
import { CLAW, PHYSICS_DT } from '../src/sim/config';
await R.init();
for (const idx of [0, 3]) {
  const m = new Machine(R); m.setPrize(CATALOG[idx]);
  const c = m.claw, b = m.prizeBody!;
  for (let i = 0; i < 480; i++) m.step();
  const t = b.translation();
  c.x = t.x; c.z = t.z + 0.03;
  for (let i = 0; i < 960; i++) m.step();
  c.armGoal = CLAW.openAngle; for (let i = 0; i < 240; i++) m.step();
  let slack = 0;
  while (c.cable < CLAW.cableMax && slack < 30) { if (c.isSlack()) slack++; else { slack = 0; c.cable += 0.13 * PHYSICS_DT; } m.step(); }
  const feetY = c.arms.map(a => { const p = a.body.translation(), q = a.body.rotation(); return p.y; });
  // tip world position
  const tips = c.arms.map((a, i) => { const p = a.body.translation(); const th = c.armAngle(i); return (p.y - CLAW.armLength * Math.cos(th) + CLAW.tipX * Math.sin(th)).toFixed(3); });
  const boxBottom = t.y - m.prize.d / 2;
  console.log(m.prize.id, 'boxTop', (t.y + m.prize.d / 2).toFixed(3), 'boxBottom', boxBottom.toFixed(3), 'head', c.headY().toFixed(3), 'tipY', tips.join(','), 'hingeY', feetY.map(v=>v.toFixed(3)).join(','));
}
