# Architecture

The simulation (`src/sim`) is pure TypeScript + Rapier with no DOM or Three.js imports, so it runs both in the browser and headlessly in Node (see [debugging.md](debugging.md)). Rendering (`src/render`) and UI (`src/ui`) only read simulation state.

```
src/
  main.ts            boot, input, fixed-step loop, wiring of events → sound / HUD / history
  sim/
    config.ts        every physical constant (metres, kg, seconds)
    machine.ts       Rapier world, rod rack, funnel, shelf + back-wall prizes, prize body, queries
    claw.ts          gantry, cable joint, head, diamond arms, arm torque controller
    game.ts          state machine, credits, money used, staff, win detection, lift cap
    payout.ts        operator settings, progressive strong-claw chance
    catalog.ts       prize list (sizes, mass, centre of mass, images)
  render/
    scene.ts         Three.js scene: cabinet, lights, bloom, claw/prize meshes synced to bodies
    boxTexture.ts    draws generic box faces (front/back/sides/ends) on canvases from each prize's colours
    debugViz.ts      3D debug overlay
  ui/
    hud.ts           credits, prompt, prize card, buttons, GET! banner
    money.ts         money-used card, pity gauge, history panel
    fire.ts          fire effect around the money card
    debug.ts         operator settings panel (`)
    debugLive.ts     live physics read-out (I)
    audio.ts         WebAudio blips, motor hum, win jingle
tools/               headless simulation scripts (Node + tsx)
```

## Coordinates

Metres, y up. The deck / rod-rack area sits around y = 0. The player stands at +z looking toward −z. Button ① moves +x, button ② moves −z. The claw's home is front-left.

## Loop

`main.ts` runs a fixed-step accumulator: each animation frame advances `game.tick(1/240)` as many times as needed (capped at 40 steps per frame), then renders once. `game.tick` runs the state machine and then `machine.step()`, which updates the claw controllers and steps Rapier.

## State machine (`game.ts`)

```
idle ──coin──▶ ready ──hold ①──▶ moveX ──release──▶ waitY ──hold ②──▶ moveY ──release──▶
open ─▶ drop ─▶ grab ─▶ lift ─▶ top ─▶ return ─▶ release ─▶ settle ─▶ ready / idle
                                                                    └─▶ win ─▶ (next prize)
idle / ready ──S──▶ staff ─▶ ready / idle
```

| Phase | What happens |
|---|---|
| `ready` | Credit available; 30 s timer, then the play starts by itself |
| `moveX` / `moveY` | Gantry moves while the button is held; stops on release or at the rail end. `waitY` has a 15 s timer |
| `open` | Arms open |
| `drop` | Cable pays out until the head lands (cable goes slack) or reaches full length, then backs off 3 mm |
| `grab` | Arms close at **grip** power |
| `lift` / `top` | Cable reels in at **lift** power, short pause at the top |
| `return` | Gantry heads home at **carry** power |
| `release` / `settle` | Arms open over the home position, then reset |
| `win` | Banner, history entry, next prize loaded |
| `staff` | すみません: prize fades and is re-placed in an easier spot |

Win detection runs every tick in every phase, so a prize that drops mid-lift or while settling still counts.

## Events

`Game.on()` emits `coin`, `play` (with `strong`), `phase`, `motor`, `win` (with `yen`, `plays`, `prizeId`), `miss`, `staffAvailable`, `staffStart`, `staffDone` and `prizeLoaded`. `main.ts` routes them to sound, the HUD, the history and the fire effect.

## Rendering

`Renderer3D` builds the cabinet procedurally (no model files). Each frame it rebuilds the static meshes if `machine.staticsVersion` changed (the rod spacing depends on the prize), then copies Rapier body poses onto the claw and prize meshes. Lighting: a dark room with a RectAreaLight ceiling panel and a shadow-casting spotlight inside the cabinet, coloured spill lights outside, and UnrealBloom for the LEDs. The claw casts no shadow on purpose, because it made judging its position harder.
