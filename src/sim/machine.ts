import type RAPIER from '@dimforge/rapier3d-compat';
import { BRIDGE, FUNNEL, GROUP_PRIZE, GROUP_STATIC, INTERIOR, PHYSICS_DT, SHELF, WIN_Y } from './config';
import { Claw } from './claw';
import { CATALOG, type Prize } from './catalog';

type R = typeof RAPIER;

export interface StaticPiece {
  kind: 'deck' | 'bar' | 'rail' | 'funnel' | 'shelf' | 'display' | 'wall' | 'pit';
  /** For 'display' pieces: which catalogue prize stands there. */
  prizeId?: string;
  shape: 'box' | 'cyl';
  /** Half extents for boxes; [radius, halfHeight] in x/y for cylinders. */
  half: [number, number, number];
  pos: [number, number, number];
  /** Cylinders lie along x when true (bars), otherwise stand along y. */
  alongX?: boolean;
  /** Optional rotation quaternion (x, y, z, w) for boxes. */
  rot?: [number, number, number, number];
}

interface Rect { x0: number; x1: number; z0: number; z1: number }

export interface Bridge { gap: number; barZs: [number, number]; barY: number; hole: Rect; rods: number[] }
export interface Funnel { top: Rect; opening: Rect; yTop: number; yBottom: number }

export type PrizeState = 'bridge' | 'stuck' | 'won';

export class Machine {
  readonly world: RAPIER.World;
  readonly claw: Claw;
  statics: StaticPiece[] = [];
  staticsVersion = 0;
  bridge!: Bridge;
  funnel!: Funnel;
  prize!: Prize;
  prizeBody: RAPIER.RigidBody | null = null;
  /** Box is placed with its pedestal end at +x when flipped. */
  prizeFlipped = false;
  private staticBodies: RAPIER.RigidBody[] = [];

  constructor(private R: R) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = PHYSICS_DT;
    this.world.numSolverIterations = 8;
    this.claw = new Claw(R, this.world);
  }

  /**
   * Builds the rod rack for the given prize. The gap is the diagonal of the box's
   * footprint (√(w² + d²)) plus a margin, so once the box stands on end it can always
   * pass through, whichever way it is turned. The margin shrinks if needed so the box,
   * lying across two rods, still overhangs each rod by at least MIN_OVERHANG.
   */
  setPrize(prize: Prize, gapExtra = 0.016, rng = Math.random) {
    this.prize = prize;
    this.buildStatics(rodGap(prize, gapExtra));
    this.placePrize('initial', rng);
  }

  private buildStatics(gap: number) {
    const R = this.R;
    for (const b of this.staticBodies) this.world.removeRigidBody(b);
    this.staticBodies = [];
    const pieces: StaticPiece[] = [];

    // GiGO-style rod rack: evenly spaced chrome rods across the full width, held by
    // white clamps on two side rails, over a tray far below. The prize starts across
    // the pair of rods either side of BRIDGE.cz and can drop through any gap.
    const r = BRIDGE.barRadius;
    const barY = BRIDGE.barLift + r;
    const pitch = gap + 2 * r;
    const barZs: [number, number] = [BRIDGE.cz - pitch / 2, BRIDGE.cz + pitch / 2];
    const zFirst = SHELF.z1 + 0.02, zLast = INTERIOR.z1 - 0.05;
    const rods: number[] = [];
    for (let z = barZs[0]; z >= zFirst; z -= pitch) rods.unshift(z);
    for (let z = barZs[1]; z <= zLast; z += pitch) rods.push(z);
    const hole: Rect = {
      x0: INTERIOR.x0 + 0.004, x1: INTERIOR.x1 - 0.004,
      z0: rods[0] - r - BRIDGE.holeLip, z1: rods[rods.length - 1] + r + BRIDGE.holeLip,
    };
    this.bridge = { gap, barZs, barY, hole, rods };

    // Deck strips in front of and behind the rack.
    const T = 0.02;
    const deckHx = (INTERIOR.x1 - INTERIOR.x0) / 2;
    for (const [z0, z1] of [[INTERIOR.z0, hole.z0], [hole.z1, INTERIOR.z1]]) {
      if (z1 - z0 < 0.002) continue;
      pieces.push({ kind: 'deck', shape: 'box', half: [deckHx, T / 2, (z1 - z0) / 2], pos: [0, -T / 2, (z0 + z1) / 2] });
    }

    const rodLen = INTERIOR.x1 - INTERIOR.x0 - 0.01;
    for (const z of rods) {
      pieces.push({ kind: 'bar', shape: 'cyl', half: [r, rodLen / 2, r], pos: [0, barY, z], alongX: true });
    }
    // Side rails the rod clamps sit on.
    const railZ = (hole.z0 + hole.z1) / 2, railH = (hole.z1 - hole.z0) / 2;
    for (const x of [INTERIOR.x0 + 0.012, INTERIOR.x1 - 0.012]) {
      pieces.push({ kind: 'rail', shape: 'box', half: [0.01, 0.012, railH], pos: [x, barY - r - 0.012, railZ] });
    }

    // Sample-prize shelf along the back wall (見本), one of each prize standing up.
    const shz = (SHELF.z0 + SHELF.z1) / 2;
    pieces.push({
      kind: 'shelf', shape: 'box',
      half: [(INTERIOR.x1 - INTERIOR.x0) / 2, SHELF.height / 2, (SHELF.z1 - SHELF.z0) / 2],
      pos: [(INTERIOR.x0 + INTERIOR.x1) / 2, SHELF.height / 2, shz],
    });
    // Back wall packed with stacked prize boxes, like a real GiGO / Taito set-up.
    let px = INTERIOR.x0 + 0.006;
    for (let col = 0; ; col++) {
      const p = CATALOG[col % CATALOG.length];
      if (px + p.w > INTERIOR.x1 - 0.004) break;
      for (let y = SHELF.height; y + p.h < INTERIOR.height - 0.12; y += p.h + 0.001) {
        pieces.push({
          kind: 'display', shape: 'box', prizeId: p.id,
          half: [p.w / 2, p.h / 2, p.d / 2],
          pos: [px + p.w / 2, y + p.h / 2, SHELF.z0 + 0.004 + p.d / 2],
        });
      }
      px += p.w + 0.003;
    }

    // Glass walls (colliders only; rendered by the cabinet).
    const H = INTERIOR.height / 2;
    const w = 0.01;
    const mx = (INTERIOR.x0 + INTERIOR.x1) / 2;
    const mz = (INTERIOR.z0 + INTERIOR.z1) / 2;
    const hx = (INTERIOR.x1 - INTERIOR.x0) / 2;
    const hz = (INTERIOR.z1 - INTERIOR.z0) / 2;
    pieces.push({ kind: 'wall', shape: 'box', half: [w, H + 0.3, hz], pos: [INTERIOR.x0 - w, H - 0.3, mz] });
    pieces.push({ kind: 'wall', shape: 'box', half: [w, H + 0.3, hz], pos: [INTERIOR.x1 + w, H - 0.3, mz] });
    pieces.push({ kind: 'wall', shape: 'box', half: [hx, H + 0.3, w], pos: [mx, H - 0.3, INTERIOR.z0 - w] });
    pieces.push({ kind: 'wall', shape: 'box', half: [hx, H + 0.3, w], pos: [mx, H - 0.3, INTERIOR.z1 + w] });
    // Pit floor under both holes.
    // Funnel: empty space under the rods, four sloped panels down to a central opening.
    const top = hole;
    const ocx = 0, ocz = (hole.z0 + hole.z1) / 2;
    const opening: Rect = {
      x0: ocx - FUNNEL.openingX / 2, x1: ocx + FUNNEL.openingX / 2,
      z0: Math.max(hole.z0 + 0.02, ocz - FUNNEL.openingZ / 2), z1: Math.min(hole.z1 - 0.02, ocz + FUNNEL.openingZ / 2),
    };
    this.funnel = { top, opening, yTop: FUNNEL.yTop, yBottom: FUNNEL.yBottom };
    const dy = FUNNEL.yBottom - FUNNEL.yTop, my = (FUNNEL.yTop + FUNNEL.yBottom) / 2, th = 0.006;
    for (const [tx, bx] of [[top.x0, opening.x0], [top.x1, opening.x1]]) {
      const ang = Math.atan2(dy, bx - tx);
      pieces.push({
        kind: 'funnel', shape: 'box',
        half: [Math.hypot(bx - tx, dy) / 2, th, (top.z1 - top.z0) / 2 + 0.01],
        pos: [(tx + bx) / 2, my, (top.z0 + top.z1) / 2],
        rot: [0, 0, Math.sin(ang / 2), Math.cos(ang / 2)],
      });
    }
    for (const [tz, bz] of [[top.z0, opening.z0], [top.z1, opening.z1]]) {
      const ang = Math.atan2(-dy, bz - tz);
      pieces.push({
        kind: 'funnel', shape: 'box',
        half: [(top.x1 - top.x0) / 2 + 0.01, th, Math.hypot(bz - tz, dy) / 2],
        pos: [(top.x0 + top.x1) / 2, my, (tz + bz) / 2],
        rot: [Math.sin(ang / 2), 0, 0, Math.cos(ang / 2)],
      });
    }
    // Floor of the prize chute, well below the opening.
    pieces.push({ kind: 'pit', shape: 'box', half: [hx, 0.01, hz], pos: [mx, -0.7, mz] });

    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    this.staticBodies.push(body);
    for (const p of pieces) {
      let desc: RAPIER.ColliderDesc;
      if (p.shape === 'box') {
        desc = R.ColliderDesc.cuboid(...p.half);
        if (p.rot) desc.setRotation({ x: p.rot[0], y: p.rot[1], z: p.rot[2], w: p.rot[3] });
      }
      else {
        desc = R.ColliderDesc.cylinder(p.half[1], p.half[0]);
        if (p.alongX) desc.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
      }
      desc.setTranslation(...p.pos);
      const friction = { deck: 0.6, bar: 0.22, rail: 0.5, funnel: 0.15, shelf: 0.6, display: 0.5, wall: 0.2, pit: 0.6 }[p.kind];
      desc.setFriction(friction).setRestitution(0.05).setCollisionGroups(GROUP_STATIC);
      this.world.createCollider(desc, body);
    }

    this.statics = pieces;
    this.staticsVersion++;
  }

  /**
   * 'initial' = the operator's standard set-up (box square across both bars).
   * 'assist'  = 位置直し: staff nudges the box into an easier spot.
   */
  placePrize(mode: 'initial' | 'assist', rng = Math.random) {
    const R = this.R;
    const p = this.prize;
    if (this.prizeBody) this.world.removeRigidBody(this.prizeBody);

    // Lying on its back across the bars: x = width, y = depth, z = height.
    // The box top points to the back so the art reads upright from the front.
    const hx = p.w / 2, hy = p.d / 2, hz = p.h / 2;
    this.prizeFlipped = rng() < 0.25;
    const comZ = -p.comAlongH * p.h; // pedestal end at local +z
    const m = p.mass;
    const inertia = {
      x: (m / 12) * (p.d ** 2 + p.h ** 2),
      y: (m / 12) * (p.w ** 2 + p.h ** 2),
      z: (m / 12) * (p.w ** 2 + p.d ** 2),
    };

    let x = (rng() - 0.5) * 0.12;
    let z = BRIDGE.cz + (rng() - 0.5) * 0.012;
    let yaw = (this.prizeFlipped ? Math.PI : 0) + (rng() - 0.5) * 0.04;
    if (mode === 'assist') {
      // Slide toward one bar and twist a little — a good grab should finish it.
      const dir = rng() < 0.5 ? -1 : 1;
      z = BRIDGE.cz + dir * (0.016 + rng() * 0.008);
      yaw += dir * (0.12 + rng() * 0.1);
    }
    const y = this.bridge.barY + BRIDGE.barRadius + hy + 0.002;

    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setAdditionalMassProperties(m, { x: 0, y: -0.004, z: comZ }, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setCcdEnabled(true);
    this.prizeBody = this.world.createRigidBody(desc);
    this.world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz).setDensity(0).setFriction(0.5).setRestitution(0.04).setCollisionGroups(GROUP_PRIZE),
      this.prizeBody,
    );
  }

  /** World-space heights of the prize box's 8 corners. */
  prizeCornerYs(): number[] {
    const b = this.prizeBody;
    if (!b) return [];
    const t = b.translation(), q = b.rotation();
    const hx = this.prize.w / 2, hy = this.prize.d / 2, hz = this.prize.h / 2;
    const ys: number[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * hx, y = sy * hy, z = sz * hz;
      // y of v rotated by q: v + w·t + q×t, with t = 2(q×v)
      const tx = 2 * (q.y * z - q.z * y);
      const ty = 2 * (q.z * x - q.x * z);
      const tz = 2 * (q.x * y - q.y * x);
      ys.push(t.y + y + q.w * ty + (q.z * tx - q.x * tz));
    }
    return ys;
  }

  /** Contact points and total normal force (N) between the claw and the prize this step. */
  clawContacts(): { points: { x: number; y: number; z: number }[]; force: number } {
    const points: { x: number; y: number; z: number }[] = [];
    let impulse = 0;
    const pb = this.prizeBody;
    if (!pb) return { points, force: 0 };
    const pc = pb.collider(0);
    for (const cc of this.claw.colliders) {
      this.world.contactPair(cc, pc, (man) => {
        for (let i = 0; i < man.numSolverContacts(); i++) {
          const p = man.solverContactPoint(i);
          points.push({ x: p.x, y: p.y, z: p.z });
        }
        for (let i = 0; i < man.numContacts(); i++) impulse += man.contactImpulse(i);
      });
    }
    return { points, force: impulse / PHYSICS_DT };
  }

  prizeState(): PrizeState {
    const b = this.prizeBody;
    if (!b) return 'stuck';
    const t = b.translation();
    if (t.y < WIN_Y) return 'won';
    const h = this.bridge.hole;
    // Centre has left the space between the bars: it slid off onto the deck or was carried away.
    const onBridge = t.x > h.x0 - 0.01 && t.x < h.x1 + 0.01 && t.z > h.z0 - 0.01 && t.z < h.z1 + 0.01;
    if (!onBridge) return 'stuck';
    // Fell between the rods but is lodged in the funnel above the opening.
    if (t.y < this.bridge.barY - 0.07 && b.linvel().y > -0.05) return 'stuck';
    return 'bridge';
  }

  step() {
    this.claw.update(PHYSICS_DT);
    this.world.step();
  }
}

/** Ends of a box lying across two rods must reach this far past each rod's centre. */
export const MIN_OVERHANG = 0.012;

/** Clear gap between rods for a prize: fits its footprint diagonal, but still supports it lying flat. */
export function rodGap(prize: Prize, gapExtra: number): number {
  const fit = Math.hypot(prize.w, prize.d);
  const r = BRIDGE.barRadius;
  // Lying across rods: h must cover the rod pitch (gap + 2r) plus an overhang at each end.
  const maxGap = prize.h - 2 * MIN_OVERHANG - 2 * r;
  const gap = Math.min(fit + gapExtra, maxGap);
  if (gap < fit + 0.004) console.warn(`[rods] ${prize.id}: box too short (${prize.h} m) to bridge a gap that fits its ${fit.toFixed(3)} m footprint diagonal`);
  return gap;
}
