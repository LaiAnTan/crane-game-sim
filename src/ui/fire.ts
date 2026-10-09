// Fire that burns around one element (the money-used card) and builds up as
// money goes in without a win. Intensity 0 = nothing; 1 = the ceiling (天井).

interface Flame { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; spark: boolean }

const MAX_FLAMES = 360;
const PAD = 70; // px of canvas around the card for flames to rise into

export class FireBorder {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private flames: Flame[] = [];
  private sprite = makeSprite();
  private spawnAcc = 0;
  private level = 0; // smoothed intensity
  private target = 0;
  private burstT = 0;
  private dpr = Math.min(devicePixelRatio, 2);
  private w = 0;
  private h = 0;

  constructor(private el: HTMLElement) {
    this.canvas.id = 'fire';
    document.body.append(this.canvas);
  }

  /** 0..1 — how hot the card should burn. */
  setIntensity(v: number) {
    this.target = Math.max(0, Math.min(1, v));
  }

  /** Brief flare-up (a strong play was rolled). */
  burst() {
    this.burstT = 1.2;
  }

  /** Snuff it out (a win). */
  extinguish() {
    this.target = 0;
    this.level = 0;
    this.burstT = 0;
    this.flames.length = 0;
  }

  /** Keep the canvas wrapped around the card (it moves on resize / mobile layout). */
  private place() {
    const r = this.el.getBoundingClientRect();
    const w = Math.round(r.width + PAD * 2), h = Math.round(r.height + PAD * 2);
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.canvas.width = w * this.dpr;
      this.canvas.height = h * this.dpr;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    this.canvas.style.transform = `translate(${r.left - PAD}px, ${r.top - PAD}px)`;
  }

  frame(dt: number) {
    this.level += (this.target - this.level) * Math.min(1, dt * 1.5);
    this.burstT = Math.max(0, this.burstT - dt);
    const L = Math.min(1, this.level + this.burstT * 0.5);
    this.place();

    const d = this.dpr, W = this.canvas.width, H = this.canvas.height;
    // Card rectangle inside the canvas (device pixels).
    const x0 = PAD * d, y0 = PAD * d, x1 = W - PAD * d, y1 = H - PAD * d;

    if (L > 0.01) {
      this.spawnAcc += dt * (20 + 420 * L * L);
      while (this.spawnAcc >= 1 && this.flames.length < MAX_FLAMES) {
        this.spawnAcc--;
        // A point on the card's edge, weighted toward the bottom and sides.
        const r = Math.random();
        let x: number, y: number, out = 0;
        if (r < 0.3) { x = x0 + Math.random() * (x1 - x0); y = y1; }
        else if (r < 0.55) { x = x0; y = y0 + Math.random() * (y1 - y0); out = -1; }
        else if (r < 0.8) { x = x1; y = y0 + Math.random() * (y1 - y0); out = 1; }
        else { x = x0 + Math.random() * (x1 - x0); y = y0; }
        const spark = Math.random() < 0.1 * L;
        const base = (10 + 30 * L) * d * (0.6 + Math.random() * 0.8);
        const max = spark ? 0.6 + Math.random() * 0.7 : 0.35 + Math.random() * (0.3 + 0.4 * L);
        this.flames.push({
          x, y,
          vx: (out * (10 + 25 * L) + (Math.random() - 0.5) * 14) * d,
          vy: -(30 + 90 * L) * d * (0.7 + Math.random() * 0.6),
          life: max, max, size: spark ? 2 * d : base, spark,
        });
      }
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    if (!this.flames.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.flames[i] = this.flames[this.flames.length - 1];
        this.flames.pop();
        continue;
      }
      f.x += f.vx * dt + Math.sin((f.y + f.x) * 0.02) * 12 * d * dt;
      f.y += f.vy * dt;
      const k = f.life / f.max; // 1 → 0
      if (f.spark) {
        ctx.globalAlpha = k;
        ctx.fillStyle = '#ffd36b';
        ctx.fillRect(f.x, f.y, f.size, f.size);
        continue;
      }
      const s = f.size * (0.5 + 0.7 * k);
      ctx.globalAlpha = Math.min(1, k * 1.4) * (0.5 + 0.4 * L);
      ctx.drawImage(this.sprite, f.x - s / 2, f.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function makeSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255, 240, 180, 1)');
  g.addColorStop(0.25, 'rgba(255, 170, 40, 0.9)');
  g.addColorStop(0.55, 'rgba(255, 70, 10, 0.45)');
  g.addColorStop(1, 'rgba(160, 0, 0, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}
