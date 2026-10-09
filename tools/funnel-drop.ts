// For every prize: (1) the starting placement rests on the rods without falling,
// (2) the box stood on end fits through the rod gap and the funnel opening at any yaw.
import R from '@dimforge/rapier3d-compat';
import { Machine } from '../src/sim/machine';
import { CATALOG } from '../src/sim/catalog';

await R.init();
const quat = (pitch: number, yaw: number) => {
  // yaw about y, then pitch about x (so the box stands on end with pitch = π/2)
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
};

let ok = true;
for (const p of CATALOG) {
  const m = new Machine(R);
  m.setPrize(p);
  for (let k = 0; k < 240 * 3; k++) m.step();
  const rests = m.prizeState() === 'bridge';
  const results: string[] = [`rests on rods: ${rests ? 'yes' : 'NO'}`];
  ok &&= rests;
  for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
    const m2 = new Machine(R);
    m2.setPrize(p);
    const b = m2.prizeBody!;
    const gapZ = (m2.bridge.barZs[0] + m2.bridge.barZs[1]) / 2;
    b.setTranslation({ x: 0, y: m2.bridge.barY + p.h / 2 + 0.01, z: gapZ }, true);
    b.setRotation(quat(Math.PI / 2, yaw), true);
    b.setLinvel({ x: 0, y: -0.2, z: 0 }, true);
    let won = -1;
    for (let k = 0; k < 240 * 3; k++) {
      m2.step();
      if (won < 0 && m2.prizeState() === 'won') won = k / 240;
    }
    results.push(`on end, yaw ${Math.round((yaw * 180) / Math.PI)}°: ${won >= 0 ? `drops (${won.toFixed(2)}s)` : 'STUCK'}`);
    if (won < 0) ok = false;
  }
  console.log(`${p.id.padEnd(15)} gap ${(m.bridge.gap * 100).toFixed(1)} cm  ${results.join('  ')}`);
}
console.log(ok ? 'ALL OK' : 'SOME FAILED');
