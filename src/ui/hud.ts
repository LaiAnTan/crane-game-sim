import anime from 'animejs';
import type { Game } from '../sim/game';
import { prizeThumb } from '../render/boxTexture';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private creditsEl = $('credits');
  private promptEl = $('prompt');
  private banner = $('banner');
  private b1 = $<HTMLButtonElement>('b1');
  private b2 = $<HTMLButtonElement>('b2');
  private staff = $<HTMLButtonElement>('staff');
  private lastPrompt = '';
  private lastCredits = -1;

  constructor(private game: Game) {
    this.updatePrizeCard();
  }

  bumpCredits() {
    anime({ targets: this.creditsEl, scale: [1.5, 1], duration: 450, easing: 'easeOutBack' });
  }

  showBanner(text: string, color = '#ff5fa2') {
    this.banner.textContent = text;
    this.banner.style.textShadow = `0 4px 0 ${color}, 0 10px 30px ${color}88`;
    anime.remove(this.banner);
    anime
      .timeline({ targets: this.banner })
      .add({ opacity: [0, 1], scale: [0.6, 1], duration: 500, easing: 'easeOutBack' })
      .add({ opacity: 0, scale: 1.1, duration: 500, delay: 1400, easing: 'easeInQuad' });
  }

  updatePrizeCard() {
    const p = this.game.machine.prize;
    $<HTMLImageElement>('prize-img').src = prizeThumb(p);
    $('prize-title').textContent = p.title;
    $('prize-sub').textContent = `Size ${p.size}`;
    $('prize-size').textContent = `Box ${Math.round(p.w * 100)}×${Math.round(p.d * 100)}×${Math.round(p.h * 100)} cm · ${Math.round(p.mass * 1000)} g`;
    anime({ targets: '#prize-card', opacity: [0, 1], translateX: [-20, 0], duration: 500, easing: 'easeOutQuad' });
  }

  private promptFor(): string {
    const g = this.game;
    const cd = g.countdown();
    const cdTxt = cd !== null ? `<span class="cd">${Math.ceil(cd)}</span>` : '';
    switch (g.phase) {
      case 'idle':
        return (g.staffAvailable ? 'Stuck? Press <kbd>S</kbd> すみません! · ' : '') +
          'Press <kbd>Space</kbd> to insert ¥100 &nbsp;·&nbsp; <kbd>5</kbd> for ¥500 (6 plays) &nbsp;·&nbsp; <kbd>I</kbd> debug';
      case 'ready':
        return `Hold <kbd>→</kbd> button ① to move right · <kbd>S</kbd> すみません` + cdTxt;
      case 'moveX':
        return 'Release to stop';
      case 'waitY':
        return `Hold <kbd>↑</kbd> button ② to move back${cdTxt}`;
      case 'moveY':
        return 'Release to drop';
      case 'win':
        return 'GET! 🎉 Loading the next prize…';
      case 'staff':
        return '店員さんが位置を直しています… (staff is adjusting the prize)';
      default:
        return '…';
    }
  }

  update() {
    const g = this.game;
    if (g.credits !== this.lastCredits) {
      this.lastCredits = g.credits;
      this.creditsEl.textContent = String(g.credits).padStart(2, '0');
    }
    const p = this.promptFor();
    if (p !== this.lastPrompt) {
      this.lastPrompt = p;
      this.promptEl.innerHTML = p;
    }
    this.b1.classList.toggle('ready', g.phase === 'ready');
    this.b2.classList.toggle('ready', g.phase === 'waitY');
    this.b1.disabled = !(g.phase === 'ready' || g.phase === 'moveX');
    this.b2.disabled = !(g.phase === 'waitY' || g.phase === 'moveY');
    this.staff.disabled = !(g.phase === 'idle' || g.phase === 'ready');
    this.staff.classList.toggle('ready', g.staffAvailable);
  }
}
