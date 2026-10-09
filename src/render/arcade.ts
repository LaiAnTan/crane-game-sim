import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CLAW } from '../sim/config';
import { CATALOG, type Prize } from '../sim/catalog';
import { prizeMaterials, type BoxPose } from './boxTexture';

/**
 * The arcade around the playable machine: tiled floor, ceiling with light strips, three panelled walls
 * and rows of neighbouring crane machines (single and two-in-one). Purely decorative — no physics.
 *
 * Layout (metres, y up, the player stands at +z). The playable machine is at x = 0 with its back on
 * `backZ`. Neighbours line the back wall on both sides and the two side walls, all facing into the room.
 * The further a machine is from the player's default view, the cheaper it is drawn (see `lodFor`).
 */

export const ROOM = { halfW: 4.4, depth: 5.6, height: 2.45 };

const BW = 0.81; // single cabinet width (matches the playable machine)
const BD = 0.73; // cabinet depth
const LOWER_H = 0.9;
const GLASS_H = 0.81;
const HEADER_H = 0.29;
export const CAB_H = LOWER_H + GLASS_H + HEADER_H;

type Kind = 'single' | 'twin';
type Lod = 0 | 1 | 2;

function mkCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Small deterministic RNG so the room looks the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PASTELS = ['#ff9ec4', '#9ad7ff', '#ffe27a', '#b9f0a0', '#c7a8ff', '#ffb27a', '#ffffff', '#8fe0d0'];
const PLUSH_SETS = [
  ['#2b2f4a', '#3a3f66', '#ffffff'],
  ['#ff9ec4', '#ffd0e4', '#ffffff'],
  ['#9ad7ff', '#6bb7f5', '#ffffff'],
  ['#ffe27a', '#ffc94a', '#fff3c0'],
  ['#b9f0a0', '#7fd36a', '#e8ffd9'],
  ['#c7a8ff', '#a07aff', '#f0e6ff'],
];

export class ArcadeRoom {
  readonly group = new THREE.Group();
  private signTex: THREE.CanvasTexture;
  private logoTex: THREE.CanvasTexture;
  private prizeTex: THREE.CanvasTexture[] = [];
  private m: Record<string, THREE.Material>;

  constructor(private floorY: number, private backZ: number) {
    this.signTex = this.makeSign();
    this.logoTex = this.makeLogoSign();
    for (let i = 0; i < PLUSH_SETS.length; i++) this.prizeTex.push(this.makePrizeWall(i));
    const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.05, ...o });
    this.m = {
      body: std('#e9e9ee', { roughness: 0.25 }),
      mag: std('#1f5fd0', { roughness: 0.3 }),
      dark: std('#2a2633', { roughness: 0.6 }),
      silver: std('#c9ccd3', { metalness: 0.85, roughness: 0.25 }),
      deck: std('#e7e8ec', { metalness: 0.4, roughness: 0.3 }),
      btn: new THREE.MeshStandardMaterial({ color: '#ff7aa8', emissive: '#ff3d86', emissiveIntensity: 0.35, roughness: 0.2 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: '#ffffff', transparent: true, opacity: 0.06, roughness: 0.02, depthWrite: false,
      }),
      led: new THREE.MeshBasicMaterial({ color: '#d8f0ff' }),
      edge: new THREE.MeshBasicMaterial({ color: '#3a86ff' }),
    };
    this.shell();
    this.rows();
  }

  // ---------------------------------------------------------------- room shell

  private shell() {
    const { halfW, depth, height } = ROOM;
    const fy = this.floorY, wz = this.backZ - 0.06;
    const W = halfW * 2;

    // Floor: pale glossy 60 cm tiles.
    const [fc, fx] = mkCanvas(256, 256);
    fx.fillStyle = '#dcdde1';
    fx.fillRect(0, 0, 256, 256);
    fx.strokeStyle = '#a9abb3';
    fx.lineWidth = 5;
    fx.strokeRect(0, 0, 256, 256);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, depth),
      new THREE.MeshStandardMaterial({ map: tex(fc, [W / 0.6, depth / 0.6]), roughness: 0.4, metalness: 0.0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, fy - 0.003, wz + depth / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Walls: dark grey panels with logo band and a light skirting.
    const wallTex = this.makeWall();
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, side: THREE.DoubleSide });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, height), wallMat);
    back.position.set(0, fy + height / 2, wz);
    this.group.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMat);
      side.rotation.y = -s * Math.PI / 2;
      side.position.set(s * halfW, fy + height / 2, wz + depth / 2);
      this.group.add(side);
    }

    // Ceiling: dark tiles, fluorescent strips, a duct. Single-sided, so from above you see straight in.
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(W, depth),
      new THREE.MeshStandardMaterial({ color: '#2b2d33', roughness: 0.9 }),
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, fy + height, wz + depth / 2);
    this.group.add(ceil);
    const strip = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    for (const z of [0.55, 1.7, 2.85, 4.0]) {
      for (let x = -3.6; x <= 3.7; x += 1.8) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.14), strip);
        s.position.set(x, fy + height - 0.02, z);
        this.group.add(s);
      }
    }
    const duct = new THREE.Mesh(new THREE.BoxGeometry(W, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: '#8d9099', metalness: 0.6, roughness: 0.4 }));
    duct.position.set(0, fy + height - 0.09, 1.3);
    this.group.add(duct);
  }

  private makeWall() {
    const [c, x] = mkCanvas(2048, 1024);
    x.fillStyle = '#3f4a5e';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#343e50';
    for (let i = 0; i < c.width; i += 512) x.fillRect(i, 0, 6, c.height);
    x.fillStyle = '#e4e5ea';
    x.fillRect(0, c.height - 130, c.width, 130);
    x.fillStyle = '#1f5fd0';
    x.fillRect(0, c.height - 134, c.width, 6);
    return tex(c);
  }

  // ---------------------------------------------------------------- textures

  private makeSign() {
    const [c, x] = mkCanvas(800, 200);
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 800, 200);
    x.fillStyle = '#1f7ae0';
    x.font = '900 100px system-ui, sans-serif';
    x.textBaseline = 'middle';
    x.fillText('GiGO', 45, 110);
    ['#ff2d2d', '#ff8a00', '#ffd500', '#2fc53b', '#2f8bff'].forEach((col, i) => {
      x.fillStyle = col;
      x.beginPath();
      const px = 465 + i * 58, py = 30;
      x.moveTo(px, py + 140);
      x.lineTo(px + 85, py);
      x.lineTo(px + 125, py);
      x.lineTo(px + 40, py + 140);
      x.closePath();
      x.fill();
    });
    return tex(c);
  }

  /** Blue banner sign, like the cabinet in the reference photo. */
  private makeLogoSign() {
    const [c, x] = mkCanvas(800, 200);
    x.fillStyle = '#1b4fa0';
    x.fillRect(0, 0, 800, 200);
    x.fillStyle = '#ffffff';
    x.font = '900 100px system-ui, sans-serif';
    x.textBaseline = 'middle';
    x.fillText('GiGO', 300, 105);
    x.font = '700 36px system-ui, sans-serif';
    x.fillText('Gaming Oasis', 40, 105);
    return tex(c);
  }

  /** Back panel of a cabinet: rows of little plush/box silhouettes. */
  private makePrizeWall(seed: number) {
    const r = rng(seed * 977 + 13);
    const set = PLUSH_SETS[seed % PLUSH_SETS.length];
    const [c, x] = mkCanvas(512, 320);
    x.fillStyle = '#eef0f4';
    x.fillRect(0, 0, 512, 320);
    const cols = 6, rows = 4, cw = 512 / cols, ch = 260 / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const body = r() < 0.7 ? set[0] : PASTELS[Math.floor(r() * PASTELS.length)];
        x.fillStyle = body;
        x.beginPath();
        x.roundRect(i * cw + 6, 10 + j * ch + 6, cw - 12, ch - 12, 14);
        x.fill();
        x.fillStyle = set[2];
        x.beginPath();
        x.arc(i * cw + cw / 2 - 12, 10 + j * ch + ch / 2, 9, 0, Math.PI * 2);
        x.arc(i * cw + cw / 2 + 12, 10 + j * ch + ch / 2, 9, 0, Math.PI * 2);
        x.fill();
      }
    }
    // pile of white balls at the bottom
    x.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      x.beginPath();
      x.arc(r() * 512, 285 + r() * 30, 14, 0, Math.PI * 2);
      x.fill();
    }
    return tex(c);
  }

  // ---------------------------------------------------------------- machines

  private rows() {
    const fy = this.floorY;
    const from = new THREE.Vector3(0, 0, 1.2); // rough camera spot: drives the level of detail
    const place = (kind: Kind, x: number, z: number, rotY: number, seed: number) => {
      const w = kind === 'twin' ? BW * 2 + 0.04 : BW;
      const d = Math.hypot(x - from.x, z - from.z);
      const lod: Lod = d < 2 ? 0 : d < 3.4 ? 1 : 2;
      const g = this.machine(kind, w, lod, seed);
      g.position.set(x, fy + 0.002, z);
      g.rotation.y = rotY;
      this.group.add(g);
    };

    // Back wall row, either side of the playable machine. Edge → centre of each cabinet.
    const backRow = (dir: 1 | -1, layout: Kind[]) => {
      let edge = BW / 2 + 0.02;
      layout.forEach((kind, i) => {
        const w = kind === 'twin' ? BW * 2 + 0.04 : BW;
        place(kind, dir * (edge + w / 2), 0, 0, i * 7 + (dir > 0 ? 3 : 11));
        edge += w + 0.04;
      });
    };
    backRow(1, ['single', 'twin', 'single', 'single']);
    backRow(-1, ['twin', 'single', 'single', 'single']);

    // Side wall rows, backs against the walls, facing the room.
    const sideX = ROOM.halfW - BD / 2 - 0.005;
    const sideRow = (sx: 1 | -1, layout: Kind[]) => {
      let z = 1.0;
      layout.forEach((kind, i) => {
        const w = kind === 'twin' ? BW * 2 + 0.04 : BW;
        place(kind, sx * sideX, z + w / 2, -sx * Math.PI / 2, i * 5 + (sx > 0 ? 17 : 29));
        z += w + 0.04;
      });
    };
    sideRow(1, ['single', 'twin', 'single']);
    sideRow(-1, ['twin', 'single', 'single']);
  }

  private prizeMats = new Map<string, THREE.Material[]>();
  private prizeMatsFor(p: Prize, pose: BoxPose) {
    const key = `${p.id}:${pose}`;
    let m = this.prizeMats.get(key);
    if (!m) {
      m = prizeMaterials(p, pose);
      this.prizeMats.set(key, m);
    }
    return m;
  }
  private geo = {
    rod: new THREE.CylinderGeometry(1, 1, 1, 8),
  };

  /**
   * Contents of one play cell, laid out like the playable machine: a white back shelf with prize boxes
   * standing on it, a rack of chrome rods over a dark pit, a box or two lying across the rods, and a
   * claw hanging from the ceiling. `cx` is the cell centre (machine-local x), `hw` its width.
   */
  private stuff(g: THREE.Group, cx: number, hw: number, lod: Lod, seed: number) {
    const r = rng(seed * 131 + 7);
    const rx = hw / 2 - 0.06;
    const floorTop = LOWER_H + 0.005;
    const shelfD = 0.13, shelfH = 0.05;
    const shelfZ = -BD / 2 + 0.05 + shelfD / 2 + 0.01;
    const shelfTop = LOWER_H + shelfH;

    // Shelf along the back wall
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(hw - 0.09, shelfH, shelfD), this.m.body);
    shelf.position.set(cx, LOWER_H + shelfH / 2, shelfZ);
    g.add(shelf);

    // Standing prize boxes on the shelf (same box art as the playable machine)
    let x = cx - rx + 0.02;
    while (true) {
      const p = CATALOG[Math.floor(r() * CATALOG.length)];
      const half = p.w / 2;
      if (x + p.w > cx + rx) break;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), this.prizeMatsFor(p, 'standing'));
      mesh.position.set(x + half, shelfTop + p.h / 2, shelfZ + (r() - 0.5) * 0.015);
      mesh.rotation.y = (r() - 0.5) * 0.12;
      g.add(mesh);
      x += p.w + 0.006;
    }

    // Dark pit and chrome rod rack in front of the shelf
    const pitZ0 = shelfZ + shelfD / 2 + 0.01, pitZ1 = BD / 2 - 0.07;
    const pit = new THREE.Mesh(new THREE.BoxGeometry(hw - 0.09, 0.01, pitZ1 - pitZ0), this.m.dark);
    pit.position.set(cx, floorTop + 0.004, (pitZ0 + pitZ1) / 2);
    g.add(pit);
    const rodY = LOWER_H + 0.03;
    const rods = Math.max(3, Math.floor((pitZ1 - pitZ0) / 0.075));
    for (let i = 0; i < rods; i++) {
      const rod = new THREE.Mesh(this.geo.rod, this.m.silver);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(cx, rodY, pitZ0 + 0.03 + (i * (pitZ1 - pitZ0 - 0.06)) / (rods - 1));
      rod.scale.set(0.006, hw - 0.09, 0.006);
      g.add(rod);
    }

    // A box lying across the rods, near enough to be seen
    if (lod === 0 || r() < 0.6) {
      const p = CATALOG[Math.floor(r() * CATALOG.length)];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.d, p.h), this.prizeMatsFor(p, 'lying'));
      mesh.position.set(cx + (r() - 0.5) * rx, rodY + 0.006 + p.d / 2, pitZ0 + 0.1);
      mesh.rotation.y = (r() - 0.5) * 0.7;
      g.add(mesh);
    }

    // Claw: the same head, coiled cable and acrylic arms as the playable machine
    const clawX = cx + (r() * 2 - 1) * rx * 0.5;
    const clawZ = pitZ0 + (pitZ1 - pitZ0) * (0.3 + r() * 0.4);
    const topY = LOWER_H + GLASS_H;
    const clawY = LOWER_H + CLAW.armLength + 0.1 + r() * 0.12;
    const claw = this.clawTemplate().clone();
    claw.position.set(clawX, clawY, clawZ);
    g.add(claw);
    const cable = this.cableTemplate().clone();
    cable.position.set(clawX, topY, clawZ);
    cable.scale.y = topY - clawY;
    g.add(cable);
  }

  private clawHead?: THREE.Group;
  private cableMesh?: THREE.Mesh;

  /** Coiled white cable, 1 m long hanging down from the origin; scale.y stretches it. */
  private cableTemplate() {
    if (!this.cableMesh) {
      const pts: THREE.Vector3[] = [];
      const turns = 26;
      for (let i = 0; i <= turns * 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * 0.011, -i / (turns * 16), Math.sin(a) * 0.011));
      }
      this.cableMesh = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 16, 0.0028, 6),
        new THREE.MeshStandardMaterial({ color: '#f7f7f9', roughness: 0.35 }),
      );
    }
    return this.cableMesh;
  }

  /** Claw head + two acrylic arms, built once and cloned (clones share geometry and materials). */
  private clawTemplate() {
    if (this.clawHead) return this.clawHead;
    const root = new THREE.Group();
    const white = new THREE.MeshPhysicalMaterial({ color: '#fbfbfc', roughness: 0.25, clearcoat: 0.6 });
    const grey = new THREE.MeshStandardMaterial({ color: '#9aa0aa', roughness: 0.4 });
    const hh = CLAW.headHalfHeight;
    root.add(new THREE.Mesh(new RoundedBoxGeometry(0.135, hh * 2.1, 0.075, 4, 0.03), white));
    const band = new THREE.Mesh(new RoundedBoxGeometry(0.137, 0.014, 0.077, 2, 0.006), grey);
    band.position.y = -hh * 0.35;
    root.add(band);
    const [lc, lctx] = mkCanvas(512, 160);
    lctx.fillStyle = '#1f7ae0';
    lctx.font = '900 132px system-ui, sans-serif';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText('GiGO', 256, 88);
    const logoM = new THREE.MeshBasicMaterial({ map: tex(lc), transparent: true });
    for (const side of [1, -1]) {
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.031), logoM);
      logo.position.set(0, 0.008, side * 0.0382);
      if (side < 0) logo.rotation.y = Math.PI;
      root.add(logo);
    }

    const L = CLAW.armLength, fl = CLAW.footLength;
    const acrylic = new THREE.MeshPhysicalMaterial({
      color: '#e9f6ff', transparent: true, opacity: 0.45, roughness: 0.05, clearcoat: 1,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const edge = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 });
    const tipM = new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 0.9, roughness: 0.2 });
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.x = side * CLAW.hingeOffsetX;
      const ex = side * CLAW.elbowX, ey = -CLAW.elbowY, tx = side * CLAW.tipX;
      const s = new THREE.Shape();
      s.moveTo(-side * 0.008, 0.006);
      s.lineTo(ex + side * 0.008, ey);
      s.lineTo(tx + side * 0.006, -L);
      s.lineTo(tx - side * 0.008, -L + 0.004);
      s.lineTo(ex - side * 0.01, ey);
      s.lineTo(side * 0.006, 0.006);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false });
      geo.translate(0, 0, -0.003);
      const plate = new THREE.Mesh(geo, acrylic);
      plate.renderOrder = 4;
      arm.add(plate);
      arm.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge));
      const phi = side * CLAW.footSlope;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(fl, 0.008, 0.016), tipM);
      foot.position.set(side * CLAW.tipX + (-side * fl * Math.cos(phi)) / 2, -L + (-side * fl * Math.sin(phi)) / 2, 0);
      foot.rotation.z = phi;
      arm.add(foot);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 16), grey);
      pin.rotation.x = Math.PI / 2;
      arm.add(pin);
      root.add(arm);
    }
    this.clawHead = root;
    return root;
  }

  /** One neighbouring cabinet. Origin is the floor at the cabinet centre, front faces +z. */
  private machine(kind: Kind, w: number, lod: Lod, seed: number) {
    const g = new THREE.Group();
    const M = this.m;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    const box = (bw: number, bh: number, bd: number, mat: THREE.Material, x: number, y: number, z: number) =>
      add(new THREE.BoxGeometry(bw, bh, bd), mat, x, y, z);
    const halves = kind === 'twin' ? 2 : 1;
    const hw = w / halves;
    const wallTex = this.prizeTex[seed % this.prizeTex.length];
    const backMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.6, emissive: '#ffffff', emissiveMap: wallTex, emissiveIntensity: 0.25 });
    const signMat = (t: THREE.Texture) => new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.55 });

    // Blue LED strips running down the front edges (and between the two halves of a twin).
    const edgeH = LOWER_H + GLASS_H;
    const edgeXs = [-w / 2 + 0.006, w / 2 - 0.006];
    if (kind === 'twin') edgeXs.push(0);
    for (const ex of edgeXs) box(0.012, edgeH, 0.012, M.edge, ex, edgeH / 2, BD / 2 + 0.004);

    // Far away: one white block, a lit prize panel and a header strip.
    if (lod === 2) {
      box(w, LOWER_H, BD, M.body, 0, LOWER_H / 2, 0);
      box(w + 0.01, 0.05, BD + 0.01, M.mag, 0, LOWER_H - 0.1, 0.0);
      const p = add(new THREE.PlaneGeometry(w - 0.06, GLASS_H - 0.06), backMat, 0, LOWER_H + GLASS_H / 2, 0.2);
      p.scale.x = 1;
      box(w, HEADER_H, BD, M.body, 0, LOWER_H + GLASS_H + HEADER_H / 2, 0);
      const t = seed % 3 === 0 ? this.signTex : this.logoTex;
      for (let i = 0; i < halves; i++) {
        add(new THREE.PlaneGeometry(hw - 0.04, 0.2), signMat(t), -w / 2 + hw * (i + 0.5), LOWER_H + GLASS_H + HEADER_H / 2, BD / 2 + 0.002);
      }
      return g;
    }

    // Lower cabinet with magenta pinstripes
    box(w, LOWER_H, BD, M.body, 0, LOWER_H / 2, 0);
    box(w + 0.006, 0.035, BD + 0.006, M.mag, 0, 0.07, 0);
    box(w + 0.01, 0.05, BD + 0.01, M.dark, 0, 0.025, 0);
    for (const sx of [-1, 1]) box(0.035, LOWER_H - 0.18, 0.004, M.mag, sx * (w / 2 - 0.05), LOWER_H / 2 + 0.03, BD / 2 + 0.002);
    // Control deck: same placement and tilt as the playable machine (0.13 m below the glass floor,
    // sticking out of the front), silver top, dark strip, card reader and two big pink buttons.
    const deck = new THREE.Group();
    deck.position.set(0, LOWER_H - 0.13, BD / 2 + 0.075);
    deck.rotation.x = 0.22;
    g.add(deck);
    const dbox = (bw: number, bh: number, bd: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      m.position.set(x, y, z);
      deck.add(m);
    };
    dbox(w, 0.07, 0.16, M.deck, 0, 0, 0);
    dbox(w, 0.004, 0.16, M.dark, 0, 0.036, 0);
    const ringGeo = new THREE.CylinderGeometry(0.038, 0.04, 0.012, 24);
    const domeGeo = new THREE.SphereGeometry(0.032, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2.4);
    for (let i = 0; i < halves; i++) {
      const cx = -w / 2 + hw * (i + 0.5);
      dbox(0.09, 0.012, 0.11, M.dark, cx - 0.28, 0.044, -0.005); // card reader
      for (const bx of [0.05, 0.17]) {
        const ring = new THREE.Mesh(ringGeo, M.silver);
        ring.position.set(cx + bx, 0.042, -0.005);
        deck.add(ring);
        const b = new THREE.Mesh(domeGeo, M.btn);
        b.scale.y = 0.45;
        b.position.set(cx + bx, 0.046, -0.005);
        deck.add(b);
      }
    }

    // Shell: pillars, glass, back panel, ceiling box, header
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(0.045, GLASS_H, 0.045, sz > 0 ? M.silver : M.body, sx * (w / 2 - 0.0225), LOWER_H + GLASS_H / 2, sz * (BD / 2 - 0.0225));
    }
    const glass = box(w - 0.09, GLASS_H, BD - 0.09, M.glass, 0, LOWER_H + GLASS_H / 2, 0);
    glass.renderOrder = 3;
    add(new THREE.PlaneGeometry(w - 0.09, GLASS_H - 0.02), M.deck, 0, LOWER_H + GLASS_H / 2, -BD / 2 + 0.05);
    box(w, 0.03, BD, M.body, 0, LOWER_H + GLASS_H + 0.015, 0);
    box(w, HEADER_H - 0.03, BD, M.body, 0, LOWER_H + GLASS_H + 0.03 + (HEADER_H - 0.03) / 2, 0);
    box(w + 0.004, 0.04, BD + 0.004, M.mag, 0, LOWER_H + GLASS_H + HEADER_H - 0.016, 0);
    const signY = LOWER_H + GLASS_H + 0.03 + (HEADER_H - 0.1) / 2;
    const signT = seed % 3 === 0 ? this.signTex : this.logoTex;
    for (let i = 0; i < halves; i++) {
      add(new THREE.PlaneGeometry(hw - 0.05, 0.19), signMat(signT), -w / 2 + hw * (i + 0.5), signY, BD / 2 + 0.002);
      this.stuff(g, -w / 2 + hw * (i + 0.5), hw, lod, seed * 3 + i);
    }

    if (lod === 1) return g;

    // Near detail: two-in-one divider, buttons, outlets, LED strips, prize shelf lip
    if (kind === 'twin') {
      box(0.03, GLASS_H, BD - 0.09, M.silver, 0, LOWER_H + GLASS_H / 2, 0);
      box(0.012, LOWER_H - 0.1, 0.004, M.mag, 0, LOWER_H / 2, BD / 2 + 0.003);
    }
    for (let i = 0; i < halves; i++) {
      const cx = -w / 2 + hw * (i + 0.5);
      // prize outlet
      box(0.2, 0.2, 0.01, M.dark, cx, 0.37, BD / 2 + 0.001);
      box(0.22, 0.014, 0.02, M.mag, cx, 0.48, BD / 2 + 0.008);
      // (buttons are on the control deck above)
      box(0.006, GLASS_H - 0.04, 0.006, M.led, cx - hw / 2 + 0.05, LOWER_H + GLASS_H / 2, BD / 2 - 0.05);
      box(0.006, GLASS_H - 0.04, 0.006, M.led, cx + hw / 2 - 0.05, LOWER_H + GLASS_H / 2, BD / 2 - 0.05);
    }
    return g;
  }
}
