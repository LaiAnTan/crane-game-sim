# GiGO Bridge Crane — 橋渡し crane game simulator

A browser simulator of the Japanese **bridge-style crane game** (橋渡し, *hashi-watashi*) as found in GiGO and Taito Station arcades: a prize box lies across a rack of chrome rods, and you nudge, tilt and wedge it with a weak two-arm UFO-Catcher claw until it drops through a gap into the funnel below.

It aims to feel like the real thing: physics-driven box movement with an off-centre centre of mass, hold-to-move controls, weak arms most of the time, and a hidden payout system whose chance of a strong claw rises with the money you put in.

![stack](https://img.shields.io/badge/three.js-r169-black) ![physics](https://img.shields.io/badge/physics-Rapier%203D-orange) ![lang](https://img.shields.io/badge/TypeScript-5.6-blue)

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

## How to play

| Key / button | Action |
|---|---|
| **Space** / ¥100 | Insert ¥100 (1 credit) |
| **5** / ¥500 | Insert ¥500 (6 credits — the standard Japanese bonus) |
| Hold **→** (or **D**, **1**, button ①) | Move the claw right — release to stop. One press only. |
| Hold **↑** (or **W**, **2**, button ②) | Move the claw back — release to drop. One press only. |
| **S** / すみません！ | Call staff between plays to reset the prize to an easier spot |
| **H** / 履歴 | Win history |
| **I** | Physics debug overlay |
| **`** | Operator settings panel (arm powers, payout curve, bar gap…) |
| **M** | Mute |
| Drag / scroll | Rotate / zoom the camera |

Each round: insert credit → hold ① → hold ② → the claw opens, drops, closes, lifts, returns home and opens. Like the real machine, each button can only be pressed once per play, and a 30 s / 15 s timer moves things along if you wait.

**Winning** — the box has to fall *between* rods and through the funnel's central opening. The claw can never lift a box clear: at most one end comes up about 5 cm before the arms slip, so you win by walking the box, tipping it into a wedge, and pushing it through.

## Features

- **Machine** — GiGO-style cabinet (magenta trim, GiGO header sign, two pink buttons), white UFO-Catcher-9-style head with a coiled cable and clear acrylic diamond arms, a full chrome rod rack in white clamps, a funnel to a central drop opening, and a back wall stacked with prize boxes.
- **Physics** ([docs/physics.md](docs/physics.md)) — Rapier 3D at 240 Hz. The claw hangs on a one-way "cable" joint and backs off on contact; each arm is a hinge with a torque-limited PD motor ("arm power"); boxes have real dimensions, mass and an off-centre centre of mass.
- **Payout** ([docs/payout.md](docs/payout.md)) — separate grip / lift / carry power per play, play-to-play jitter, and a progressive strong-claw chance that rises from ¥0 to guaranteed at the ceiling (天井).
- **Money used & pity** — a 使用金額 counter that grows until you win, a 天井 gauge, and a fire effect around the card that intensifies as the pity rises and flares when a strong claw is rolled.
- **History** — every win with prize, plays and yen spent, plus average / best / total; saved in the browser.
- **Prize boxes** ([docs/prizes.md](docs/prizes.md)) — six generic coloured boxes from small (9 cm) to premium (16 × 27 cm), each with its own mass and centre of mass. The rod gap is sized per box so it can always drop through once it stands on end.
- **Debug mode** ([docs/debugging.md](docs/debugging.md)) — collider wireframes, centre of mass, contact points and forces, arm torque, live payout numbers.

## Docs

| Doc | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Project layout, game loop, state machine, rendering |
| [docs/physics.md](docs/physics.md) | Claw, cable, arms, rod rack, funnel, prize boxes, lift cap |
| [docs/payout.md](docs/payout.md) | Arm powers, progressive chance curve, staff, money counter |
| [docs/prizes.md](docs/prizes.md) | Prize catalogue, box art, adding a prize, image sources |
| [docs/debugging.md](docs/debugging.md) | Debug overlay, operator panel, headless simulation tools |

## Tech

- [Three.js](https://threejs.org/) — rendering, OrbitControls, bloom post-processing
- [Rapier 3D](https://rapier.rs/) (`@dimforge/rapier3d-compat`) — rigid-body physics (WASM)
- [anime.js](https://animejs.com/) — UI animation only (never claw motion)
- [Vite](https://vitejs.dev/) + TypeScript, no UI framework

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | Typecheck the app and the simulation tools |
| `npm run sim:curve` | Print the strong-claw chance curve |
| `npm run sim:reach` | Check the open claw's tips reach below the box bottom |
| `npm run sim:funnel` | Drop each prize through the rods and check it reaches the opening |
| `npm run sim:session -- 0 0 0 5 progressive` | Headless bot plays a full session (see [docs/debugging.md](docs/debugging.md)) |

## Disclaimer

A fan-made simulator for fun. Not affiliated with GiGO, Taito, SEGA or any prize maker. Prize boxes are generic and contain no third-party artwork.
