# Debugging and tuning

## Physics debug overlay (I)

Press **I** to toggle the overlay.

**In the machine:**

| Marker | Meaning |
|---|---|
| Thin wireframes | Every Rapier collider (from `world.debugRender()`) |
| Red dot + dashed line | The prize's centre of mass and a plumb line down from it |
| White dot | The box's geometric centre (compare with the red dot to see the offset) |
| Yellow dots | Contact points between the claw and the prize |
| Blue / orange arrows at the arm tips | Arm motor torque: blue closing, orange opening. Length is proportional to N·m |
| Green arrow | Prize velocity |
| Green square | The funnel's drop opening |

**Panel:**
- **Claw:** phase and time; this play's profile (normal / STRONG) with its grip/lift/carry; the active torque cap; each arm's angle and torque; head mass; cable length and slack; gantry position; claw→box contact force in newtons.
- **Prize:** mass and weight, centre-of-mass offset, pitch/yaw/roll, speed, state (bridge / stuck / won), bar gap.
- **Payout:** mode, spend since win, next-play strong chance and the chance this play rolled at, floor → ceiling, plays / wins / misses.

## Operator panel (`)

Live sliders for:
- normal and strong grip / lift / carry
- floor, ceiling and curve
- arm jitter, staff threshold, and the bar gap margin (changing the gap rebuilds the rack)

There's also a mode switch (Progressive / Skill only).

Changes apply from the next play and are not saved.

## Console helpers

```js
game                 // the Game instance (credits, payout, machine, …)
view                 // the Renderer3D (camera, controls, scene)
__sim(500)           // simulate the payout roll for 500 plays (no physics), assuming every strong play wins
```

## Headless simulation (`tools/`)

The simulation runs in Node through [tsx](https://github.com/privatenumber/tsx). Prizes are referred to by their index in `CATALOG` (0 = Ruby … 5 = Ai).

| Script | Usage | Purpose |
|---|---|---|
| `payout-curve.ts` | `npm run sim:curve` | Chance table and expected spend to the first strong play |
| `claw-reach.ts` | `npm run sim:reach` | Lands the open claw on a box and reports tip height vs box bottom |
| `funnel-drop.ts` | `npm run sim:funnel` | Drops each prize through the rods at several angles and reports win/stuck |
| `strength-calibrate.ts` | `npm run sim:strength [normal\|strong]` · `npm run sim:calibrate` | Per-box held lift and movement at the current settings, or search each box's `armTrim` and `strongTrim` so normal and strong arms respond the same on every box (runs one process per box) |
| `bot-session.ts` | `npx tsx tools/bot-session.ts <grip> <lift> <prize> <seed> [progressive]` | A bot plays a whole session (walk the box, push the wedge, call staff after 8 plays without progress) and reports plays/yen to win. With `progressive` it ignores grip/lift and uses the default payout settings. Env `F` (wedge aim factor, default 0.8) and `GAP` (bar gap margin) |
| `walk.ts` | `npx tsx tools/walk.ts <grip> <lift> <aimDz> [prize]` | Repeats one aim point for 15 plays and logs how the box moves |
| `play-trace.ts` | `npx tsx tools/play-trace.ts <grip> <lift> <prize> <seed> <aimDz> [carry]` | Per-play lift height, highest corner, box pose, and when it dropped |
| `contact-forces.ts` | `npx tsx tools/contact-forces.ts [aimDz]` | Vertical and total contact force per claw part during drop / grab / lift |

Tools use seeded random numbers, so runs are repeatable.

## Notes from tuning

- Win rate is very sensitive to the **lift** power and the **bar gap**. In bot sessions, 1–2 mm of gap or 0.01 N·m of lift changes how many plays a box takes by a large factor.
- The bot isn't a good player: it pushes the high end of a wedged box, which often doesn't work. Real players do much better, so treat bot numbers as an upper bound on difficulty.
