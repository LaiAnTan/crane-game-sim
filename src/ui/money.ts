import anime from 'animejs';
import type { Game } from '../sim/game';
import { CATALOG } from '../sim/catalog';
import { prizeThumb } from '../render/boxTexture';
import type { FireBorder } from './fire';

export interface HistoryEntry { prizeId: string; title: string; yen: number; plays: number; at: number }

const KEY = 'crane-history-v1';

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}
function save(h: HistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(h.slice(0, 200)));
  } catch {
    /* storage unavailable — history just won't persist */
  }
}

const yen = (v: number) => `¥${Math.round(v).toLocaleString('ja-JP')}`;

/** Money-used counter, pity gauge (drives the fire border) and win history. */
export class MoneyPanel {
  private yenEl = document.getElementById('money-yen')!;
  private playsEl = document.getElementById('money-plays')!;
  private fill = document.getElementById('pity-fill')!;
  private pityTxt = document.getElementById('pity-txt')!;
  private chanceEl = document.getElementById('pity-chance')!;
  private histEl = document.getElementById('history')!;
  private history = load();
  private shownYen = -1;

  constructor(private game: Game, private fire: FireBorder) {
    document.getElementById('hist-btn')!.onclick = () => this.toggleHistory();
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && !e.repeat) this.toggleHistory();
    });
    this.renderHistory();
  }

  toggleHistory(on = this.histEl.hidden) {
    this.histEl.hidden = !on;
    if (on) this.renderHistory();
  }

  addWin(e: { prizeId: string; yen: number; plays: number }) {
    const p = CATALOG.find((c) => c.id === e.prizeId);
    this.history.unshift({ prizeId: e.prizeId, title: p ? `${p.title} (${p.size})` : e.prizeId, yen: e.yen, plays: e.plays, at: Date.now() });
    save(this.history);
    this.renderHistory();
    this.fire.extinguish();
    anime({ targets: '#money', scale: [1.08, 1], duration: 600, easing: 'easeOutElastic(1, .6)' });
  }

  private renderHistory() {
    const h = this.history;
    const total = h.reduce((t, e) => t + e.yen, 0);
    const avg = h.length ? total / h.length : 0;
    const best = h.length ? Math.min(...h.map((e) => e.yen)) : 0;
    const rows = h
      .map((e) => {
        const p = CATALOG.find((c) => c.id === e.prizeId);
        const img = p ? `<img src="${prizeThumb(p)}" alt="">` : '';
        const d = new Date(e.at);
        const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return `<li>${img}<div><b>${e.title}</b><span>${when} · ${e.plays} plays</span></div><strong>${yen(e.yen)}</strong></li>`;
      })
      .join('');
    this.histEl.innerHTML = `
      <div class="hist-head"><h3>履歴 · History</h3><button id="hist-close" class="glass btn small">✕</button></div>
      <div class="hist-stats">
        <div><span>GETs</span><b>${h.length}</b></div>
        <div><span>Average</span><b>${h.length ? yen(avg) : '—'}</b></div>
        <div><span>Best</span><b>${h.length ? yen(best) : '—'}</b></div>
        <div><span>Total</span><b>${yen(total)}</b></div>
      </div>
      ${h.length ? `<ul>${rows}</ul>` : '<p class="empty">No prizes yet — keep going!</p>'}
      ${h.length ? '<button id="hist-clear" class="glass btn small">Clear history</button>' : ''}`;
    document.getElementById('hist-close')!.onclick = () => this.toggleHistory(false);
    const clr = document.getElementById('hist-clear');
    if (clr) clr.onclick = () => {
      this.history = [];
      save(this.history);
      this.renderHistory();
    };
  }

  update() {
    const g = this.game, s = g.payout.settings;
    // Pity = how close the play counter is to the guaranteed-strong ceiling.
    const pity = Math.min(1, g.payout.spend / s.ceiling);
    const chance = g.payout.nextChance();
    this.fire.setIntensity(s.mode === 'progressive' ? Math.pow(pity, 1.15) : 0);

    const y = Math.round(g.yenSinceWin);
    if (y !== this.shownYen) {
      if (y > this.shownYen && this.shownYen >= 0) anime({ targets: this.yenEl, scale: [1.25, 1], duration: 450, easing: 'easeOutBack' });
      this.shownYen = y;
      this.yenEl.textContent = yen(y);
      this.playsEl.textContent = `${g.playsSinceWin} plays · total ${yen(g.totalYen)}`;
    }
    this.fill.style.width = `${(pity * 100).toFixed(1)}%`;
    this.pityTxt.textContent = `天井 ${Math.round(pity * 100)}%`;
    this.chanceEl.textContent = s.mode === 'progressive' ? `strong claw chance ${(chance * 100).toFixed(chance < 0.1 ? 1 : 0)}%` : 'skill mode';
    document.getElementById('money')!.style.setProperty('--heat', pity.toFixed(3));
  }
}
