import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CLAW, GANTRY, INTERIOR } from '../sim/config';
import { CATALOG } from '../sim/catalog';
import type { Machine } from '../sim/machine';
import { prizeMaterials } from './boxTexture';

export const BG = '#100d16';

const C = {
  body: '#e9e9ee',
  magenta: '#d6157e',
  deck: '#d9dbe0',
  chrome: '#d7dbe2',
  rubber: '#e2434b',
  dark: '#2a2633',
};

export class Renderer3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private composer: EffectComposer;
  private staticGroup = new THREE.Group();
  private staticsVersion = -1;
  private carriage!: THREE.Mesh;
  private crossbar!: THREE.Mesh;
  private cableMesh!: THREE.Mesh;
  private head!: THREE.Group;
  private arms: THREE.Group[] = [];
  private prizeMesh: THREE.Mesh | null = null;
  private prizeId = '';
  private buttons: THREE.Mesh[] = [];
  private leds: THREE.MeshStandardMaterial[] = [];
  private time = 0;
  prizeOpacity = 1;

  constructor(container: HTMLElement, private machine: Machine) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Dark arcade floor: the machine's own lights do most of the work.
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 2.6, 6.5);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;

    this.camera = new THREE.PerspectiveCamera(36, container.clientWidth / container.clientHeight, 0.05, 30);
    this.camera.position.set(0.42, 0.5, 1.75);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.16, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.7;
    this.controls.maxDistance = 4;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.update();

    const size = new THREE.Vector2(container.clientWidth, container.clientHeight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(size, 0.45, 0.5, 0.95));
    this.composer.addPass(new OutputPass());

    this.lights();
    this.cabinet();
    this.gantry();
    this.claw();
    this.scene.add(this.staticGroup);

    addEventListener('resize', () => {
      const w = container.clientWidth, h = container.clientHeight;
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
  }

  private lights() {
    // Room: very low, cool ambient plus coloured spill from neighbouring machines.
    this.scene.add(new THREE.HemisphereLight('#6b5a8f', '#0b0910', 0.18));
    const rim = new THREE.DirectionalLight('#6f7dff', 0.55);
    rim.position.set(-2, 2.5, -2.5);
    this.scene.add(rim);
    const spillPink = new THREE.PointLight('#ff2d95', 1.4, 3.2, 1.6);
    spillPink.position.set(1.4, 0.2, 1.2);
    const spillCyan = new THREE.PointLight('#2fd4ff', 1.0, 3.2, 1.6);
    spillCyan.position.set(-1.5, 0.6, 0.9);
    this.scene.add(spillPink, spillCyan);

    // Cabinet ceiling: a bright LED panel lighting the play field from above.
    RectAreaLightUniformsLib.init();
    const panel = new THREE.RectAreaLight('#fff6ee', 1.3, INTERIOR.x1 - INTERIOR.x0 - 0.06, 0.4);
    panel.position.set(0, INTERIOR.height - 0.01, 0.02);
    panel.lookAt(0, 0, 0.02);
    this.scene.add(panel);
    const top = new THREE.SpotLight('#fff8f2', 1.4, 2, 0.95, 0.6, 1.2);
    top.position.set(0, INTERIOR.height - 0.02, 0.05);
    top.target.position.set(0, 0, 0);
    top.castShadow = true;
    top.shadow.mapSize.set(1024, 1024);
    top.shadow.bias = -0.0004;
    top.shadow.camera.near = 0.1;
    top.shadow.camera.far = 1.5;
    this.scene.add(top, top.target);
    // Soft glow the lit cabinet throws onto the floor in front of it.
    const pool = new THREE.SpotLight('#ffe9f4', 1.6, 2.5, 0.7, 0.9, 1.4);
    pool.position.set(0, -0.45, 0.75);
    pool.target.position.set(0, -0.92, 1.4);
    this.scene.add(pool, pool.target);
  }

  private mat(color: string, opts: THREE.MeshStandardMaterialParameters = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05, ...opts });
  }

  private box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private led(color: string) {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 });
    this.leds.push(m);
    return m;
  }

  private cabinet() {
    const X0 = INTERIOR.x0, X1 = INTERIOR.x1, Z0 = INTERIOR.z0, Z1 = INTERIOR.z1;
    const top = INTERIOR.height;
    const bodyM = this.mat(C.body, { roughness: 0.22 });
    const magM = this.mat(C.magenta, { roughness: 0.28 });
    const darkM = this.mat(C.dark, { roughness: 0.6 });
    const silverM = this.mat('#c9ccd3', { metalness: 0.85, roughness: 0.25 });
    const F = 0.045; // frame
    const BW = X1 - X0 + 2 * F, BD = Z1 - Z0 + 2 * F;
    const floorY = -0.92;
    const FZ = Z1 + F; // front face z

    // Lower cabinet: white panels with magenta pinstripes (GiGO livery)
    // Hollow lower cabinet (four walls + floor) so the funnel under the rods is visible.
    const baseH = -0.02 - floorY, baseY = (floorY - 0.02) / 2;
    this.box(BW, baseH, F, bodyM, 0, baseY, FZ - F / 2);
    this.box(BW, baseH, F, bodyM, 0, baseY, -FZ + F / 2);
    this.box(F, baseH, BD, bodyM, -BW / 2 + F / 2, baseY, 0);
    this.box(F, baseH, BD, bodyM, BW / 2 - F / 2, baseY, 0);
    this.box(BW, 0.02, BD, darkM, 0, floorY + 0.06, 0);
    for (const sx of [-1, 1]) this.box(0.035, -0.12 - floorY, 0.004, magM, sx * (BW / 2 - 0.05), (floorY - 0.12) / 2 + 0.0, FZ + 0.001);
    this.box(BW + 0.006, 0.035, BD + 0.006, magM, 0, floorY + 0.05, 0);
    this.box(BW + 0.01, 0.05, BD + 0.01, darkM, 0, floorY + 0.025, 0); // kick plate
    // Chrome sill under the front glass
    this.box(BW, 0.022, 0.03, silverM, 0, -0.012, FZ - 0.01);

    // The space under the rods is empty; the funnel is built with the statics.

    // Prize outlet (取出口) front-left
    const ox = 0; // central opening drops straight to the outlet
    this.box(0.2, 0.2, 0.01, darkM, ox, -0.55, FZ + 0.001);
    const flap = this.box(0.19, 0.19, 0.008,
      new THREE.MeshPhysicalMaterial({ color: '#d9eeff', transparent: true, opacity: 0.4, roughness: 0.05 }),
      ox, -0.55, FZ + 0.01);
    flap.renderOrder = 2;
    this.box(0.22, 0.014, 0.02, magM, ox, -0.44, FZ + 0.008);
    this.text('景品取出口', 0.13, 0.025, ox, -0.67, FZ + 0.002, 'rgba(0,0,0,0)', C.magenta);

    // Control panel: silver deck, card-reader screen, two big pink buttons
    const panel = new THREE.Group();
    panel.position.set(0, -0.15, FZ + 0.075);
    panel.rotation.x = 0.22;
    this.scene.add(panel);
    this.box(BW, 0.07, 0.16, this.mat('#e7e8ec', { metalness: 0.4, roughness: 0.3 }), 0, 0, 0, panel);
    this.box(BW, 0.004, 0.16, this.mat('#2b2d33', { roughness: 0.4 }), 0, 0.036, 0, panel);
    // payment terminal
    this.box(0.09, 0.012, 0.11, darkM, -0.28, 0.044, -0.005, panel);
    const scr = this.box(0.07, 0.002, 0.06, this.led('#2f6bff'), -0.28, 0.051, -0.02, panel);
    scr.scale.set(1, 1, 1);
    const plr = this.text('PLAYER 1', 0.1, 0.022, 0, 0, 0, 'rgba(0,0,0,0)', '#e6e6ea');
    plr.rotation.x = -Math.PI / 2;
    plr.position.set(-0.03, 0.039, 0.05);
    panel.add(plr);
    const btnX = [0.05, 0.17];
    btnX.forEach((bx, i) => {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.04, 0.012, 40), silverM);
      ring.position.set(bx, 0.042, -0.005);
      panel.add(ring);
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.4),
        new THREE.MeshPhysicalMaterial({ color: '#ff7aa8', emissive: '#ff3d86', emissiveIntensity: 0.35, roughness: 0.15, clearcoat: 1 }),
      );
      b.scale.y = 0.45;
      b.position.set(bx, 0.046, -0.005);
      panel.add(b);
      this.buttons.push(b);
      const t = this.text(i === 0 ? '①' : '②', 0.03, 0.03, 0, 0, 0, 'rgba(0,0,0,0)', '#ffffff');
      t.rotation.x = -Math.PI / 2;
      t.position.set(bx, 0.062, -0.005);
      panel.add(t);
    });

    // Corner pillars: silver uprights with magenta caps
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = sx * (X1 + F / 2), pz = sz * (Z1 + F / 2);
      this.box(F, top + 0.02, F, sz > 0 ? silverM : bodyM, px, top / 2 - 0.01, pz);
    }
    // Interior LED strips on the front pillars
    for (const sx of [-1, 1]) this.box(0.006, top - 0.04, 0.006, this.led('#ffffff'), sx * (X1 - 0.004), top / 2, Z1 - 0.004);

    // Glass
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', transparent: true, opacity: 0.05, roughness: 0.02, metalness: 0,
      envMapIntensity: 0.6, depthWrite: false, side: THREE.DoubleSide,
    });
    const g1 = this.box(X1 - X0, top, 0.006, glass, 0, top / 2, Z1 + 0.004);
    const g2 = this.box(0.006, top, Z1 - Z0, glass, X0 - 0.004, top / 2, 0);
    const g3 = this.box(0.006, top, Z1 - Z0, glass, X1 + 0.004, top / 2, 0);
    for (const g of [g1, g2, g3]) g.renderOrder = 3;

    // Back wall (mostly hidden by the stacked prizes)
    this.box(X1 - X0, top, 0.01, this.mat('#f2f2f5', { roughness: 0.5 }), 0, top / 2, Z0 - 0.006).receiveShadow = true;

    // Ceiling light panel
    this.box(BW, 0.03, BD, bodyM, 0, top + 0.015, 0);
    this.box(X1 - X0 - 0.04, 0.006, 0.08, this.led('#ffffff'), 0, top - 0.004, 0.08);

    // Header: magenta frame, white sign with GiGO logo + rainbow arrows
    const header = new THREE.Group();
    header.position.set(0, top + 0.03, 0);
    this.scene.add(header);
    this.box(BW, 0.2, BD, bodyM, 0, 0.1, 0, header);
    this.box(BW + 0.004, 0.045, BD + 0.004, magM, 0, 0.222, 0, header);
    this.box(BW + 0.004, 0.012, BD + 0.004, magM, 0, 0.006, 0, header);
    const [sc, sctx] = mkCanvas(1600, 400);
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, 1600, 400);
    sctx.fillStyle = '#1f7ae0';
    sctx.font = '900 200px "Avenir Next", system-ui, sans-serif';
    sctx.textBaseline = 'middle';
    sctx.fillText('GiGO', 90, 215);
    sctx.fillStyle = '#1f7ae0';
    sctx.font = '600 44px "Avenir Next", system-ui';
    ['Get', 'into the', 'Gaming', 'Oasis'].forEach((l, i) => sctx.fillText(l, 640, 105 + i * 62));
    // Rainbow chevrons
    const cols = ['#ff2d2d', '#ff8a00', '#ffd500', '#2fc53b', '#2f8bff'];
    cols.forEach((col, i) => {
      sctx.fillStyle = col;
      sctx.beginPath();
      const x = 930 + i * 115, y = 60;
      sctx.moveTo(x, y + 280);
      sctx.lineTo(x + 170, y);
      sctx.lineTo(x + 250, y);
      sctx.lineTo(x + 80, y + 280);
      sctx.closePath();
      sctx.fill();
    });
    const signTex = canvasTex(sc);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(BW - 0.02, 0.18),
      new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.95 }),
    );
    sign.position.set(0, 0.1, BD / 2 + 0.002);
    header.add(sign);
    // Machine number plate
    const num = this.text('25', 0.05, 0.03, 0, 0, 0, '#ffffff', '#333');
    num.position.set(-BW / 2 + 0.05, 0.222, BD / 2 + 0.004);
    header.add(num);

    // Dark glossy arcade floor that fades into the background.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 64),
      new THREE.MeshStandardMaterial({ color: '#1a1622', roughness: 0.38, metalness: 0.25 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private text(s: string, w: number, h: number, x: number, y: number, z: number, bg: string, fg: string) {
    const [c, ctx] = mkCanvas(512, Math.round((512 * h) / w));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = fg;
    ctx.font = `800 ${c.height * 0.7}px "Hiragino Sans", system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, c.width / 2, c.height / 2, c.width * 0.95);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true }));
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }

  private gantry() {
    const chrome = this.mat(C.chrome, { metalness: 0.9, roughness: 0.2 });
    const y = GANTRY.y + 0.03;
    for (const sx of [-1, 1]) {
      this.box(0.018, 0.02, INTERIOR.z1 - INTERIOR.z0, chrome, sx * (INTERIOR.x1 - 0.012), y, 0);
    }
    this.crossbar = this.box(INTERIOR.x1 - INTERIOR.x0 - 0.02, 0.016, 0.026, chrome, 0, y - 0.004, 0);
    this.carriage = this.box(0.07, 0.04, 0.07, this.mat('#f4f4f6', { roughness: 0.2 }), 0, y - 0.025, 0);
    // White coiled cable (stretched along y every frame)
    const pts: THREE.Vector3[] = [];
    const turns = 26;
    for (let i = 0; i <= turns * 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.011, -i / (turns * 16), Math.sin(a) * 0.011));
    }
    this.cableMesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 16, 0.0028, 6),
      this.mat('#f7f7f9', { roughness: 0.35 }),
    );
    this.scene.add(this.cableMesh);
  }

  private claw() {
    // SEGA UFO-Catcher-style head: white rounded body, grey band, clear acrylic arms.
    const white = new THREE.MeshPhysicalMaterial({ color: '#fbfbfc', roughness: 0.25, clearcoat: 0.6 });
    const grey = this.mat('#9aa0aa', { roughness: 0.4 });
    this.head = new THREE.Group();
    const hh = CLAW.headHalfHeight;
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.135, hh * 2.1, 0.075, 4, 0.03), white);
    this.head.add(body);
    const band = new THREE.Mesh(new RoundedBoxGeometry(0.137, 0.014, 0.077, 2, 0.006), grey);
    band.position.y = -hh * 0.35;
    this.head.add(band);
    // Blue GiGO logo on both faces of the head, as on the real UFO Catcher 9 heads.
    const [lc, lctx] = mkCanvas(512, 160);
    lctx.fillStyle = '#1f7ae0';
    lctx.font = '900 132px "Avenir Next", system-ui, sans-serif';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText('GiGO', 256, 88);
    const logoM = new THREE.MeshBasicMaterial({ map: canvasTex(lc), transparent: true });
    for (const side of [1, -1]) {
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.031), logoM);
      logo.position.set(0, 0.008, side * 0.0382);
      if (side < 0) logo.rotation.y = Math.PI;
      this.head.add(logo);
    }
    this.scene.add(this.head);

    const L = CLAW.armLength, fl = CLAW.footLength;
    const acrylic = new THREE.MeshPhysicalMaterial({
      color: '#e9f6ff', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0,
      clearcoat: 1, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
    });
    const edge = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 });
    const tipM = this.mat('#d9dde3', { metalness: 0.9, roughness: 0.2 });
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      // Diamond-shaped acrylic plate in the arm's x/y plane (outward = +side).
      // Acrylic diamond matching the physics arm (hinge → elbow → tip).
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
      g.add(plate);
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge));
      const phi = side * CLAW.footSlope;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(fl, 0.008, 0.016), tipM);
      foot.position.set(side * CLAW.tipX + (-side * fl * Math.cos(phi)) / 2, -L + (-side * fl * Math.sin(phi)) / 2, 0);
      foot.rotation.z = phi;
      g.add(foot);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 16), grey);
      pin.rotation.x = Math.PI / 2;
      g.add(pin);
      this.scene.add(g);
      this.arms.push(g);
    }
  }

  private rebuildStatics() {
    const g = this.staticGroup;
    for (const c of [...g.children]) {
      g.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const deckM = this.mat(C.deck, { roughness: 0.85 });
    const barM = this.mat(C.chrome, { metalness: 1, roughness: 0.18 });
    const shelfM = this.mat('#ffffff', { roughness: 0.3 });
    for (const p of this.machine.statics) {
      if (p.kind === 'wall' || p.kind === 'pit' || p.kind === 'funnel') continue;
      let mesh: THREE.Mesh;
      if (p.shape === 'box') {
        const geo = new THREE.BoxGeometry(p.half[0] * 2, p.half[1] * 2, p.half[2] * 2);
        if (p.kind === 'display') {
          const prize = CATALOG.find((c) => c.id === p.prizeId)!;
          mesh = new THREE.Mesh(geo, prizeMaterials(prize, 'standing'));
        } else mesh = new THREE.Mesh(geo, p.kind === 'deck' ? deckM : shelfM);
      } else {
        const m = barM;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.half[0], p.half[0], p.half[1] * 2, 24), m);
        if (p.alongX) mesh.rotation.z = Math.PI / 2;
      }
      mesh.position.set(...p.pos);
      mesh.receiveShadow = true;
      mesh.castShadow = p.kind !== 'deck';
      g.add(mesh);
    }
    // Supports under each bar end
    this.buildFunnel(g);

    // White plastic clamps at both ends of every rod.
    const br = this.machine.bridge;
    const clampM = this.mat('#f4f4f6', { roughness: 0.35 });
    for (const z of br.rods) for (const x of [INTERIOR.x0 + 0.012, INTERIOR.x1 - 0.012]) {
      const c = this.box(0.03, 0.026, 0.028, clampM, x, br.barY - 0.004, z, g);
      c.receiveShadow = true;
    }
  }

  /** Glossy white funnel panels + a dark chute below the central opening. */
  private buildFunnel(g: THREE.Group) {
    const f = this.machine.funnel;
    const t = f.top, o = f.opening, yt = f.yTop, yb = f.yBottom;
    const quads: number[][][] = [
      [[t.x0, yt, t.z0], [t.x0, yt, t.z1], [o.x0, yb, o.z1], [o.x0, yb, o.z0]],
      [[t.x1, yt, t.z1], [t.x1, yt, t.z0], [o.x1, yb, o.z0], [o.x1, yb, o.z1]],
      [[t.x1, yt, t.z0], [t.x0, yt, t.z0], [o.x0, yb, o.z0], [o.x1, yb, o.z0]],
      [[t.x0, yt, t.z1], [t.x1, yt, t.z1], [o.x1, yb, o.z1], [o.x0, yb, o.z1]],
    ];
    const pos: number[] = [];
    for (const [a, b, c, d] of quads) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const panel = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      color: '#f2f3f6', roughness: 0.25, clearcoat: 0.6, side: THREE.DoubleSide,
    }));
    panel.receiveShadow = true;
    g.add(panel);
    // Chute walls below the opening, fading into darkness.
    const chute = new THREE.Mesh(
      new THREE.BoxGeometry(o.x1 - o.x0, 0.4, o.z1 - o.z0),
      new THREE.MeshStandardMaterial({ color: '#2a2633', roughness: 0.9, side: THREE.BackSide }),
    );
    chute.position.set((o.x0 + o.x1) / 2, yb - 0.2, (o.z0 + o.z1) / 2);
    g.add(chute);
    // Chrome lip around the opening.
    const lipM = this.mat('#d7dbe2', { metalness: 0.9, roughness: 0.2 });
    const w = o.x1 - o.x0, d = o.z1 - o.z0, cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
    this.box(w + 0.012, 0.006, 0.006, lipM, cx, yb, o.z0, g);
    this.box(w + 0.012, 0.006, 0.006, lipM, cx, yb, o.z1, g);
    this.box(0.006, 0.006, d, lipM, o.x0, yb, cz, g);
    this.box(0.006, 0.006, d, lipM, o.x1, yb, cz, g);
  }

  setButtonLit(i: 0 | 1, lit: boolean) {
    const m = this.buttons[i].material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = lit ? 1.4 : 0.35;
    this.buttons[i].position.y = lit ? 0.041 : 0.046;
  }

  render(dt: number) {
    const m = this.machine;
    this.time += dt;
    if (m.staticsVersion !== this.staticsVersion) {
      this.staticsVersion = m.staticsVersion;
      this.rebuildStatics();
    }

    const c = m.claw;
    const g = c.gantry.translation();
    this.crossbar.position.z = g.z;
    this.carriage.position.set(g.x, GANTRY.y + 0.01, g.z);
    const h = c.head.translation();
    const hq = c.head.rotation();
    this.head.position.set(h.x, h.y, h.z);
    this.head.quaternion.set(hq.x, hq.y, hq.z, hq.w);
    const top = GANTRY.y - 0.01, bottom = h.y + CLAW.headHalfHeight;
    this.cableMesh.position.set(h.x, top, h.z);
    this.cableMesh.scale.y = Math.max(0.001, top - bottom);
    c.arms.forEach((a, i) => {
      const t = a.body.translation(), q = a.body.rotation();
      this.arms[i].position.set(t.x, t.y, t.z);
      this.arms[i].quaternion.set(q.x, q.y, q.z, q.w);
    });

    // Prize
    if (m.prizeBody) {
      if (this.prizeId !== m.prize.id || !this.prizeMesh) {
        if (this.prizeMesh) this.scene.remove(this.prizeMesh);
        const p = m.prize;
        this.prizeMesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.d, p.h), prizeMaterials(p, 'lying').map((x) => x.clone()));
        this.prizeMesh.castShadow = true;
        this.prizeMesh.receiveShadow = true;
        this.scene.add(this.prizeMesh);
        this.prizeId = p.id;
      }
      const t = m.prizeBody.translation(), q = m.prizeBody.rotation();
      this.prizeMesh.position.set(t.x, t.y, t.z);
      this.prizeMesh.quaternion.set(q.x, q.y, q.z, q.w);
      for (const mt of this.prizeMesh.material as THREE.MeshStandardMaterial[]) {
        mt.transparent = this.prizeOpacity < 1;
        mt.opacity = this.prizeOpacity;
      }
    }

    // LED shimmer
    this.leds.forEach((l, i) => (l.emissiveIntensity = 1.3 + 0.5 * Math.sin(this.time * 2.2 + i * 0.7)));

    this.controls.update();
    this.composer.render();
  }
}

function mkCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function canvasTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function radialTex() {
  const [c, ctx] = mkCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(60,40,80,0.28)');
  g.addColorStop(1, 'rgba(60,40,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return canvasTex(c);
}
