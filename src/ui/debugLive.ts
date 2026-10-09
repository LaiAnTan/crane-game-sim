import type { Game } from '../sim/game';
import { CLAW, GANTRY } from '../sim/config';
import { REF_MASS, armScale } from '../sim/catalog';
import type { DebugViz } from '../render/debugViz';

const MAX_POWER = 0.6; // N·m, full scale for the bars

/** Live physics read-out shown alongside the 3D debug overlay (toggle with I). */
export class DebugLive {
  private el = document.getElementById('dbg-live')!;
  private frame = 0;

  constructor(private game: Game, private viz: DebugViz) {
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyI' && !e.repeat) this.toggle();
    });
  }

  toggle(on = !this.viz.visible) {
    this.viz.visible = on;
    this.el.hidden = !on;
  }

  update() {
    if (!this.viz.visible || this.frame++ % 4) return; // ~15 Hz is plenty for text
    const g = this.game, m = g.machine, c = m.claw, p = g.payout, s = p.settings;
    const prof = g.profile;
    const b = m.prizeBody;

    const bar = (v: number, max = MAX_POWER) => {
      const w = Math.max(0, Math.min(1, Math.abs(v) / max)) * 100;
      return `<span class="bar"><i style="width:${w.toFixed(0)}%"></i></span>`;
    };
    const row = (k: string, v: string) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;
    const deg = (r: number) => `${((r * 180) / Math.PI).toFixed(0)}°`;

    let euler = '—', comOff = '—', vel = '—';
    if (b) {
      const q = b.rotation();
      const pitch = Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
      const yaw = Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.y - q.z * q.x))));
      const roll = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
      euler = `${deg(pitch)} / ${deg(yaw)} / ${deg(roll)}`;
      const lc = b.localCom();
      comOff = `${(lc.x * 100).toFixed(1)}, ${(lc.y * 100).toFixed(1)}, ${(lc.z * 100).toFixed(1)} cm`;
      const v = b.linvel();
      vel = `${(Math.hypot(v.x, v.y, v.z) * 100).toFixed(1)} cm/s`;
    }

    const phaseLabel = { grab: 'grip', lift: 'lift', top: 'lift', return: 'carry' } as Record<string, string>;
    const stage = phaseLabel[g.phase] ?? '—';

    this.el.innerHTML = [
      '<h3>Debug · I to hide</h3>',
      '<h4>Claw</h4>',
      row('phase', `${g.phase} ${g.t.toFixed(1)}s`),
      row('this play', prof ? (prof.strong ? '<em>STRONG</em>' : 'normal') : '—'),
      prof
        ? row('grip', `${prof.grip.toFixed(3)} ${bar(prof.grip)}`) +
          row('lift', `${prof.lift.toFixed(3)} ${bar(prof.lift)}`) +
          row('carry', `${prof.carry.toFixed(3)} ${bar(prof.carry)}`)
        : '',
      row(`active cap (${stage})`, `${c.power.toFixed(3)} N·m ${bar(c.power)}`),
      row('arm L / R angle', `${deg(c.armAngle(0))} / ${deg(c.armAngle(1))}`),
      row('arm L torque', `${c.lastTorque[0].toFixed(3)} ${bar(c.lastTorque[0])}`),
      row('arm R torque', `${c.lastTorque[1].toFixed(3)} ${bar(c.lastTorque[1])}`),
      row('head mass', `${CLAW.headMass.toFixed(2)} kg`),
      row('cable', `${(c.cable * 100).toFixed(1)} cm${c.isSlack() ? ' <em>slack</em>' : ''}`),
      row('gantry x / z', `${(c.x * 100).toFixed(1)} / ${((c.z - GANTRY.homeZ) * 100).toFixed(1)} cm`),
      row('claw→box force', `${this.viz.contactForce.toFixed(2)} N · ${this.viz.contactCount} pts ${bar(this.viz.contactForce, 8)}`),
      '<h4>Prize</h4>',
      row('box', `${m.prize.title}`),
      row('mass', `${(m.prize.mass * 1000).toFixed(0)} g · weight ${(m.prize.mass * 9.81).toFixed(2)} N`),
      row('arm scale', `normal ×${armScale(m.prize).toFixed(2)} · strong ×${armScale(m.prize, true).toFixed(2)}`),
      row('', `weight ×${(m.prize.mass / REF_MASS).toFixed(2)} · trim ×${(m.prize.armTrim ?? 1).toFixed(2)} / ×${(m.prize.strongTrim ?? m.prize.armTrim ?? 1).toFixed(2)}`),
      row('COM offset (local)', comOff),
      row('pitch / yaw / roll', euler),
      row('speed', vel),
      row('state', m.prizeState()),
      row('bar gap', `${(m.bridge.gap * 100).toFixed(1)} cm`),
      '<h4>Payout</h4>',
      row('mode', s.mode),
      row('spend since win', `¥${p.spend}`),
      row('strong chance (next)', `${(p.nextChance() * 100).toFixed(1)}% ${bar(p.nextChance(), 1)}`),
      prof ? row('this play rolled at', `${(prof.chance * 100).toFixed(1)}%`) : '',
      row('floor → ceiling', `¥${s.floor} → ¥${s.ceiling}`),
      row('ceiling 天井', `¥${s.ceiling} ${bar(p.spend, s.ceiling)}`),
      row('plays / wins / misses', `${p.plays} / ${g.wins} / ${g.fails}`),
      '<div class="legend"><i style="background:#ff3355"></i>COM <i style="background:#fff"></i>centre <i style="background:#ffd400"></i>contacts <i style="background:#35e0ff"></i>closing torque <i style="background:#ff9f35"></i>opening <i style="background:#7dff6a"></i>velocity / drop zone</div>',
    ].join('');
  }
}
