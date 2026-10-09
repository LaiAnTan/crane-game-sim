import type RAPIER from '@dimforge/rapier3d-compat';
import { CLAW, GANTRY, GROUP_ARM, GROUP_CLAW } from './config';

type R = typeof RAPIER;

/** Max overlap (m) at which a ghosted arm segment may turn solid again. */
const GHOST_RELEASE_DEPTH = 0.008;

/**
 * Two-arm UFO-catcher claw.
 *
 * gantry (kinematic, no collider) ── prismatic "cable" ── head (dynamic)
 * head ── revolute hinge ── left arm / right arm (dynamic)
 *
 * The cable is a prismatic joint whose lower limit is the paid-out cable length,
 * so it can only pull up: when the head lands on something the cable goes slack
 * and the claw rests on it with its own weight, like the real thing.
 *
 * Arm strength is a torque cap on a PD controller per hinge — the simulated
 * equivalent of the operator's "arm power" setting.
 */
export class Claw {
  readonly gantry: RAPIER.RigidBody;
  readonly head: RAPIER.RigidBody;
  readonly arms: { body: RAPIER.RigidBody; side: 1 | -1; joint: RAPIER.RevoluteImpulseJoint }[] = [];
  readonly armColliders = new Set<number>();
  /** Lower plastic arm segments (not the tips) — see setArmsGhost(). */
  readonly segments: RAPIER.Collider[] = [];
  /** Every claw collider (head + arm parts), for contact queries. */
  readonly colliders: RAPIER.Collider[] = [];
  /** Torque applied to each arm on the last step (N·m, positive = opening). */
  lastTorque = [0, 0];
  private cableJoint: RAPIER.PrismaticImpulseJoint;

  x: number = GANTRY.homeX;
  z: number = GANTRY.homeZ;
  cable: number = CLAW.cableIdle;

  /** Angle the arms are being driven toward (positive = open). */
  armGoal: number = CLAW.idleAngle;
  armTarget: number = CLAW.idleAngle;
  armRate = 2.5; // rad/s ramp of the target
  /** Max closing torque (N·m). */
  power = 0.3;
  /** Max opening torque (N·m) — opening is never the weak direction. */
  openPower = 0.5;

  constructor(R: R, private world: RAPIER.World) {
    this.gantry = world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.x, GANTRY.y, this.z),
    );

    const headY = GANTRY.y - this.cable;
    this.head = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(this.x, headY, this.z).setLinearDamping(0.6),
    );
    const headCol = world.createCollider(
      R.ColliderDesc.cylinder(CLAW.headHalfHeight, CLAW.headRadius)
        .setMass(CLAW.headMass)
        .setFriction(0.5)
        .setCollisionGroups(GROUP_CLAW),
      this.head,
    );
    this.colliders.push(headCol);

    const cable = R.JointData.prismatic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.cableJoint = world.createImpulseJoint(cable, this.gantry, this.head, true) as RAPIER.PrismaticImpulseJoint;
    this.cableJoint.setContactsEnabled(false);

    for (const side of [-1, 1] as const) this.makeArm(R, side, headY);
    this.applyCableLimits();
  }

  private makeArm(R: R, side: 1 | -1, headY: number) {
    const hx = this.x + side * CLAW.hingeOffsetX;
    const hy = headY - CLAW.headHalfHeight;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(hx, hy, this.z).setAngularDamping(1.5),
    );
    // Diamond-shaped arm (like SEGA UFO Catcher acrylic arms): the upper segment
    // bows outward to an elbow so the arm clears the box sides, then the lower
    // segment comes back in so the tip can reach under the box bottom.
    const L = CLAW.armLength;
    const E = { x: side * CLAW.elbowX, y: -CLAW.elbowY };
    const T = { x: side * CLAW.tipX, y: -L };
    const segment = (a: { x: number; y: number }, b: { x: number; y: number }, mass: number) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const ang = Math.atan2(dy, dx);
      return this.world.createCollider(
        R.ColliderDesc.cuboid(Math.hypot(dx, dy) / 2, 0.0055, 0.007)
          .setTranslation((a.x + b.x) / 2, (a.y + b.y) / 2, 0)
          .setRotation({ x: 0, y: 0, z: Math.sin(ang / 2), w: Math.cos(ang / 2) })
          .setMass(mass)
          .setFriction(0.22) // smooth acrylic
          .setCollisionGroups(GROUP_CLAW),
        body,
      );
    };
    const upper = segment({ x: 0, y: 0 }, E, CLAW.armMass * 0.35);
    // The upper section sits right over the box's top edges when the head lands, so it
    // never touches the prize (it would press the box down); the lower arm and tip do.
    upper.setCollisionGroups(GROUP_ARM);
    const shaft = segment(E, T, CLAW.armMass * 0.4);
    this.armColliders.add(upper.handle);
    // Foot — slopes down toward the inside so a hanging load pries the arm open.
    const phi = side * CLAW.footSlope;
    const fl = CLAW.footLength;
    const fx = T.x + (-side * fl * Math.cos(phi)) / 2;
    const fy = T.y + (-side * fl * Math.sin(phi)) / 2;
    const foot = this.world.createCollider(
      R.ColliderDesc.cuboid(fl / 2, 0.005, 0.008)
        .setTranslation(fx, fy, 0)
        .setRotation({ x: 0, y: 0, z: Math.sin(phi / 2), w: Math.cos(phi / 2) })
        .setMass(CLAW.armMass * 0.25)
        .setFriction(0.7) // rubber tip
        .setCollisionGroups(GROUP_CLAW),
      body,
    );
    this.armColliders.add(shaft.handle);
    this.armColliders.add(foot.handle);
    this.colliders.push(upper, shaft, foot);
    this.segments.push(shaft);

    const jd = R.JointData.revolute(
      { x: side * CLAW.hingeOffsetX, y: -CLAW.headHalfHeight, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    );
    const joint = this.world.createImpulseJoint(jd, this.head, body, true) as RAPIER.RevoluteImpulseJoint;
    joint.setContactsEnabled(false);
    // Hinge angle is measured about +z; for the left arm "open" is negative.
    if (side === 1) joint.setLimits(CLAW.closedAngle - 0.05, CLAW.openAngle + 0.05);
    else joint.setLimits(-CLAW.openAngle - 0.05, -CLAW.closedAngle + 0.05);
    this.arms.push({ body, side, joint });
  }

  private applyCableLimits() {
    this.cableJoint.setLimits(-this.cable, -CLAW.cableMin + 0.03);
  }

  /**
   * While the claw comes down, the plastic arm segments pass through the prize so only
   * the rubber tips can push it. Call with false to make them solid again — each segment
   * turns solid once it overlaps the prize by less than GHOST_RELEASE_DEPTH; the light arm
   * is then nudged out rather than the box being knocked.
   */
  setArmsGhost(on: boolean, prize?: RAPIER.Collider) {
    for (const seg of this.segments) {
      if (on) seg.setCollisionGroups(GROUP_ARM);
      else if (seg.collisionGroups() === GROUP_ARM) {
        const hit = prize ? seg.contactCollider(prize, 0) : null;
        if (!hit || hit.distance > -GHOST_RELEASE_DEPTH) seg.setCollisionGroups(GROUP_CLAW);
      }
    }
  }

  /** Signed hinge angle of an arm, positive = open. */
  armAngle(i: number): number {
    const { body, side } = this.arms[i];
    const qh = this.head.rotation();
    const qa = body.rotation();
    // q_rel = conj(qh) * qa, only the z component matters for a z hinge.
    const w = qh.w * qa.w + qh.x * qa.x + qh.y * qa.y + qh.z * qa.z;
    const z = qh.w * qa.z - qh.z * qa.w - qh.x * qa.y + qh.y * qa.x;
    return side * 2 * Math.atan2(z, w);
  }

  headY(): number {
    return this.head.translation().y;
  }

  /** True while the head is resting on something and the cable hangs loose. */
  isSlack(): boolean {
    // Lagging behind the paid-out cable *and* not falling = sitting on something.
    return GANTRY.y - this.headY() < this.cable - 0.006 && this.head.linvel().y > -0.03;
  }

  /** Called once per physics step, before world.step(). */
  update(dt: number) {
    this.gantry.setNextKinematicTranslation({ x: this.x, y: GANTRY.y, z: this.z });
    this.applyCableLimits();

    const d = this.armGoal - this.armTarget;
    const stepMax = this.armRate * dt;
    this.armTarget += Math.max(-stepMax, Math.min(stepMax, d));

    const hw = this.head.angvel().z;
    for (let i = 0; i < this.arms.length; i++) {
      const { body, side } = this.arms[i];
      const theta = this.armAngle(i);
      const omega = side * (body.angvel().z - hw);
      let tau = CLAW.kp * (this.armTarget - theta) - CLAW.kd * omega;
      tau = tau > 0 ? Math.min(tau, this.openPower) : Math.max(tau, -this.power);
      body.resetTorques(true);
      body.addTorque({ x: 0, y: 0, z: side * tau }, true);
      this.lastTorque[i] = tau;
    }
  }

  /** Snap everything back to the idle pose (used when resetting the machine). */
  teleportHome() {
    this.x = GANTRY.homeX;
    this.z = GANTRY.homeZ;
    this.cable = CLAW.cableIdle;
    this.armGoal = this.armTarget = CLAW.idleAngle;
    const headY = GANTRY.y - this.cable;
    this.gantry.setTranslation({ x: this.x, y: GANTRY.y, z: this.z }, true);
    this.head.setTranslation({ x: this.x, y: headY, z: this.z }, true);
    this.head.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.head.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.head.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    for (const { body, side } of this.arms) {
      body.setTranslation({ x: this.x + side * CLAW.hingeOffsetX, y: headY - CLAW.headHalfHeight, z: this.z }, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
}
