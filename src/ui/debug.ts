import type { Game } from '../sim/game';
import type { PayoutMode } from '../sim/payout';

/** Hidden operator panel (toggle with the ` key). */
export class DebugPanel {
  private el = document.getElementById('debug')!;
  private stat!: HTMLElement;

  constructor(private game: Game) {
    this.build();
    addEventListener('keydown', (e) => {
      if (e.key === '`') this.el.hidden = !this.el.hidden;
    });
  }

  private build() {
    const s = this.game.payout.settings;
    this.el.innerHTML = '<h3>Operator settings · 設定</h3><div class="stat">Press I for the physics debug overlay</div>';
    const mode = document.createElement('label');
    mode.innerHTML = `Mode <select>
      <option value="progressive">Progressive</option><option value="skill">Skill only</option></select>`;
    const sel = mode.querySelector('select')!;
    sel.value = s.mode;
    sel.onchange = () => (s.mode = sel.value as PayoutMode);
    this.el.appendChild(mode);

    const slider = (label: string, get: () => number, set: (v: number) => void, min: number, max: number, step: number) => {
      const l = document.createElement('label');
      const out = document.createElement('span');
      const r = document.createElement('input');
      r.type = 'range';
      r.min = String(min);
      r.max = String(max);
      r.step = String(step);
      r.value = String(get());
      out.textContent = r.value;
      r.oninput = () => {
        set(+r.value);
        out.textContent = r.value;
      };
      l.append(label, out, r);
      this.el.appendChild(l);
    };
    for (const k of ['grip', 'lift', 'carry'] as const) {
      slider(`Normal ${k} (N·m)`, () => s.normal[k], (v) => (s.normal[k] = v), 0.02, 0.8, 0.01);
    }
    for (const k of ['grip', 'lift', 'carry'] as const) {
      slider(`Strong ${k} (N·m)`, () => s.strong[k], (v) => (s.strong[k] = v), 0.02, 0.8, 0.01);
    }
    slider('Floor — no chance below (¥)', () => s.floor, (v) => (s.floor = v), 0, 10000, 100);
    slider('Ceiling 天井 (¥)', () => s.ceiling, (v) => (s.ceiling = v), 1000, 20000, 500);
    slider('Chance curve (1 = linear)', () => s.curve, (v) => (s.curve = v), 0.5, 4, 0.1);
    slider('Arm jitter ±', () => s.jitter, (v) => (s.jitter = v), 0, 0.5, 0.01);
    slider('Staff after N misses', () => s.staffAfter, (v) => (s.staffAfter = v), 1, 40, 1);
    slider('Bar gap extra (m)', () => s.gapExtra, (v) => {
      s.gapExtra = v;
      this.game.machine.setPrize(this.game.machine.prize, v);
    }, 0.004, 0.04, 0.001);
    this.stat = document.createElement('div');
    this.stat.className = 'stat';
    this.el.appendChild(this.stat);
  }

  update() {
    if (this.el.hidden) return;
    const g = this.game, p = g.payout;
    this.stat.innerHTML = [
      `phase: ${g.phase}`,
      `spend since win: ¥${p.spend} · next play strong chance ${(p.nextChance() * 100).toFixed(1)}%`,
      `plays: ${p.plays} · wins: ${g.wins} · misses: ${g.fails}`,
      `this play: ${g.profile ? (g.profile.strong ? '<b>STRONG</b>' : 'normal') + ` g${g.profile.grip.toFixed(2)} l${g.profile.lift.toFixed(2)} c${g.profile.carry.toFixed(2)}` : '—'}`,
      `prize state: ${g.machine.prizeState()}`,
    ].join('<br>');
  }
}
