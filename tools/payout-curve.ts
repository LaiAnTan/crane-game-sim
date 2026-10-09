import { DEFAULT_SETTINGS, strongChance } from '../src/sim/payout';
const s = DEFAULT_SETTINGS;
let pNone = 1, exp = 0;
for (let spend = 100; spend <= s.ceiling; spend += 100) {
  const c = strongChance(s, spend);
  exp += pNone * c * spend; pNone *= 1 - c;
}
const rows = [1000, 2000, 3000, 4000, 5000, 5900, 6000].map(v => `¥${v}: ${(strongChance(s, v) * 100).toFixed(1)}%`);
console.log(rows.join('  '), `\nexpected spend to first strong play: ¥${Math.round(exp)}`);
