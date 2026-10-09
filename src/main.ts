import RAPIER from '@dimforge/rapier3d-compat';
import { Machine } from './sim/machine';
import { Game } from './sim/game';
import { DEFAULT_SETTINGS, Payout } from './sim/payout';
import { PHYSICS_DT } from './sim/config';
import { Renderer3D } from './render/scene';
import { Hud } from './ui/hud';
import { Sfx } from './ui/audio';
import { DebugPanel } from './ui/debug';
import { DebugViz } from './render/debugViz';
import { DebugLive } from './ui/debugLive';
import { FireBorder } from './ui/fire';
import { MoneyPanel } from './ui/money';

await RAPIER.init();

const settings = structuredClone(DEFAULT_SETTINGS);
const machine = new Machine(RAPIER);
const game = new Game(machine, new Payout(settings));
const view = new Renderer3D(document.getElementById('stage')!, machine);
const hud = new Hud(game);
const sfx = new Sfx();
const debug = new DebugPanel(game);
const debugViz = new DebugViz(view.scene, machine);
const debugLive = new DebugLive(game, debugViz);
const fire = new FireBorder(document.getElementById('money')!);
const money = new MoneyPanel(game, fire);

game.on((e) => {
  switch (e.type) {
    case 'coin':
      sfx.coin();
      hud.bumpCredits();
      break;
    case 'motor':
      sfx.setMotor(e.on);
      break;
    case 'play':
      if (e.strong) fire.burst();
      break;
    case 'win':
      money.addWin(e);
      sfx.win();
      hud.showBanner('GET!');
      break;
    case 'miss':
      sfx.miss();
      break;
    case 'staffAvailable':
      sfx.chime();
      break;
    case 'staffDone':
      sfx.chime();
      break;
    case 'prizeLoaded':
      hud.updatePrizeCard();
      break;
  }
});

// ---- Input -----------------------------------------------------------------
function press(btn: 1 | 2, down: boolean) {
  const before = game.phase;
  game.press(btn, down);
  view.setButtonLit((btn - 1) as 0 | 1, down);
  document.getElementById(`b${btn}`)!.classList.toggle('on', down);
  if (down && game.phase !== before) sfx.button();
}

const KEY1 = ['ArrowRight', 'KeyD', 'Digit1'];
const KEY2 = ['ArrowUp', 'KeyW', 'Digit2'];
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') {
    e.preventDefault();
    game.insertCoin(100);
  } else if (e.code === 'Digit5') game.insertCoin(500);
  else if (KEY1.includes(e.code)) press(1, true);
  else if (KEY2.includes(e.code)) press(2, true);
  else if (e.code === 'KeyS') game.callStaff();
  else if (e.code === 'KeyM') sfx.muted = !sfx.muted;
});
addEventListener('keyup', (e) => {
  if (KEY1.includes(e.code)) press(1, false);
  else if (KEY2.includes(e.code)) press(2, false);
});
addEventListener('blur', () => {
  press(1, false);
  press(2, false);
});

for (const btn of [1, 2] as const) {
  const el = document.getElementById(`b${btn}`)!;
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    press(btn, true);
  });
  el.addEventListener('pointerup', () => press(btn, false));
  el.addEventListener('pointercancel', () => press(btn, false));
}
document.getElementById('coin100')!.onclick = () => game.insertCoin(100);
document.getElementById('coin500')!.onclick = () => game.insertCoin(500);
document.getElementById('staff')!.onclick = () => game.callStaff();

// ---- Loop --------------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= PHYSICS_DT && steps < 40) {
    game.tick(PHYSICS_DT);
    acc -= PHYSICS_DT;
    steps++;
  }
  if (steps === 40) acc = 0;

  // Staff fade-out / fade-in around the repositioning.
  view.prizeOpacity = game.phase === 'staff' ? Math.max(0.15, 1 - game.t * 1.5) : 1;

  debugViz.update();
  view.render(dt);
  debugLive.update();
  money.update();
  fire.frame(dt);
  hud.update();
  debug.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Console helper: simulate the payout logic for N plays without physics.
(window as any).__sim = (n = 500) => {
  const p = new Payout(structuredClone(settings));
  let strong = 0, wins = 0, maxGap = 0, sinceWin = 0;
  for (let i = 0; i < n; i++) {
    const prof = p.nextPlay();
    sinceWin++;
    if (prof.strong) {
      strong++;
      wins++;
      maxGap = Math.max(maxGap, sinceWin);
      sinceWin = 0;
      p.onWin(); // assume a strong play converts
    }
  }
  const res = { plays: n, strongPlays: strong, avgYenPerStrong: Math.round((n * settings.pricePerPlay) / Math.max(1, strong)), longestDrought: maxGap, ceilingPlays: settings.ceiling / settings.pricePerPlay };
  console.table(res);
  return res;
};
(window as any).game = game;
(window as any).view = view;
