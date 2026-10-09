import * as THREE from 'three';
import { CLAW } from '../sim/config';
import type { Machine } from '../sim/machine';

const MAX_CONTACTS = 48;
const TORQUE_SCALE = 0.25; // metres of arrow per N·m

/** 3D physics overlay: collider wireframes, centre of mass, contacts, arm torque, velocity. */
export class DebugViz {
  readonly group = new THREE.Group();
  private wire: THREE.LineSegments;
  private com: THREE.Mesh;
  private centre: THREE.Mesh;
  private plumb: THREE.Line;
  private contacts: THREE.InstancedMesh;
  private torqueArrows: THREE.ArrowHelper[] = [];
  private velArrow: THREE.ArrowHelper;
  private opening: THREE.LineLoop;
  private openingVersion = -1;
  private tmp = new THREE.Object3D();
  contactForce = 0;
  contactCount = 0;

  constructor(scene: THREE.Scene, private machine: Machine) {
    const onTop = (m: THREE.Material) => {
      m.depthTest = false;
      m.transparent = true;
      return m;
    };
    this.group.visible = false;
    this.group.renderOrder = 999;
    scene.add(this.group);

    this.wire = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }),
    );
    this.wire.frustumCulled = false;
    this.group.add(this.wire);

    this.com = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 12), onTop(new THREE.MeshBasicMaterial({ color: '#ff3355' })));
    this.centre = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), onTop(new THREE.MeshBasicMaterial({ color: '#ffffff' })));
    this.plumb = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]),
      onTop(new THREE.LineDashedMaterial({ color: '#ff3355', dashSize: 0.01, gapSize: 0.006 })),
    );
    this.group.add(this.com, this.centre, this.plumb);

    this.contacts = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.004, 8, 6),
      onTop(new THREE.MeshBasicMaterial({ color: '#ffd400' })),
      MAX_CONTACTS,
    );
    this.contacts.frustumCulled = false;
    this.group.add(this.contacts);

    for (let i = 0; i < 2; i++) {
      const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.05, '#35e0ff', 0.015, 0.01);
      a.traverse((o) => ((o as THREE.Mesh).material && onTop((o as THREE.Mesh).material as THREE.Material)));
      this.torqueArrows.push(a);
      this.group.add(a);
    }
    this.velArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.05, '#7dff6a', 0.012, 0.008);
    this.velArrow.traverse((o) => ((o as THREE.Mesh).material && onTop((o as THREE.Mesh).material as THREE.Material)));
    this.group.add(this.velArrow);

    this.opening = new THREE.LineLoop(new THREE.BufferGeometry(), onTop(new THREE.LineBasicMaterial({ color: '#7dff6a' })));
    this.group.add(this.opening);
  }

  get visible() {
    return this.group.visible;
  }
  set visible(v: boolean) {
    this.group.visible = v;
  }

  update() {
    if (!this.group.visible) return;
    const m = this.machine;

    // Collider wireframes straight from Rapier's debug renderer.
    const { vertices, colors } = m.world.debugRender();
    const geo = this.wire.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));

    // Drop zone outline.
    if (m.staticsVersion !== this.openingVersion) {
      this.openingVersion = m.staticsVersion;
      const o = m.funnel.opening, y = m.funnel.yBottom;
      this.opening.geometry.setFromPoints([
        new THREE.Vector3(o.x0, y, o.z0), new THREE.Vector3(o.x1, y, o.z0),
        new THREE.Vector3(o.x1, y, o.z1), new THREE.Vector3(o.x0, y, o.z1),
      ]);
    }

    // Centre of mass vs geometric centre, with a plumb line to see what it rests on.
    const b = m.prizeBody;
    if (b) {
      const c = b.worldCom(), t = b.translation(), v = b.linvel();
      this.com.position.set(c.x, c.y, c.z);
      this.centre.position.set(t.x, t.y, t.z);
      this.plumb.position.set(c.x, c.y, c.z);
      this.plumb.scale.y = c.y - m.funnel.yBottom;
      this.plumb.computeLineDistances();
      const vel = new THREE.Vector3(v.x, v.y, v.z);
      const speed = vel.length();
      this.velArrow.visible = speed > 0.01;
      if (this.velArrow.visible) {
        this.velArrow.position.set(c.x, c.y, c.z);
        this.velArrow.setDirection(vel.normalize());
        this.velArrow.setLength(Math.min(0.25, 0.02 + speed * 0.5), 0.012, 0.008);
      }
    }

    // Claw ↔ prize contact points.
    const { points, force } = m.clawContacts();
    this.contactForce = force;
    this.contactCount = points.length;
    const n = Math.min(points.length, MAX_CONTACTS);
    for (let i = 0; i < n; i++) {
      this.tmp.position.set(points[i].x, points[i].y, points[i].z);
      this.tmp.updateMatrix();
      this.contacts.setMatrixAt(i, this.tmp.matrix);
    }
    this.contacts.count = n;
    this.contacts.instanceMatrix.needsUpdate = true;

    // Arm torque: arrow at each arm tip, pointing the way the motor pushes.
    const claw = m.claw;
    claw.arms.forEach(({ body, side }, i) => {
      const tau = claw.lastTorque[i];
      const th = claw.armAngle(i) * side;
      const p = body.translation();
      const tipX = p.x + side * CLAW.tipX * Math.cos(th) + CLAW.armLength * Math.sin(th);
      const tipY = p.y - CLAW.armLength * Math.cos(th) + side * CLAW.tipX * Math.sin(th);
      const a = this.torqueArrows[i];
      a.position.set(tipX, tipY, p.z);
      const dir = Math.sign(tau) * side; // opening pushes outward
      a.setDirection(new THREE.Vector3(dir || side, 0, 0));
      a.setLength(Math.max(0.012, Math.abs(tau) * TORQUE_SCALE), 0.012, 0.008);
      a.setColor(tau < 0 ? '#35e0ff' : '#ff9f35');
    });
  }
}
