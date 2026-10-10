# Physics

All values live in `src/sim/config.ts`. Rapier steps at **240 Hz** with 8 solver iterations.

## Claw

```
gantry (kinematic, no collider)
  └─ prismatic "cable" joint (only pulls up)
       └─ head (dynamic, 0.4 kg cylinder)
            ├─ revolute hinge ─ left arm  (upper segment → elbow → lower segment → rubber tip)
            └─ revolute hinge ─ right arm
```

### Cable
The cable is a prismatic joint whose **lower limit is the paid-out cable length**. It can pull the head up but never push it down, so when the head lands on something the cable goes slack and the head rests on it. The `drop` phase pays the cable out at 0.195 m/s. It detects landing as "the head is lagging the cable and isn't falling" for 50 ms, then **backs off 3 mm** so the cable carries the head instead of its weight pressing on the prize, like a real machine stopping on contact.

### Arms
Each arm is a hinge with a PD controller toward a moving target angle:

```
τ = clamp(kp·(target − θ) − kd·ω,  −power,  +openPower)
```

- **`power`** is the closing torque cap in N·m: the operator's *arm power*. It changes per phase: grip → lift → carry (see [payout.md](payout.md)).
- **`openPower`** is fixed (opening is never the weak direction).
- The target ramps at a limited rate, so the arms visibly swing closed over `closeTime` (0.6 s).

Each arm is a steep chevron (< >), like the real acrylic arms: the upper segment runs out to an elbow 6 cm out and 7.5 cm down, so the arms clear the box sides. The lower segment then comes back in to the tip, 16 cm below the hinge and slightly inside it. Both segments are about 37–39° from vertical. When the claw lands on a box, the open tips reach below the box bottom (`npm run sim:reach`).

The **rubber tip** slopes 0.72 rad toward the inside, so a hanging load pries the arm open. Whether the box stays up depends on arm power against that prying force. The acrylic segments have low friction (0.22), so they slide over box edges instead of biting.

The claw never collides with itself (collision groups in `config.ts`). Every part (head, plastic arms and rubber tips) collides with the prize, rods and deck at all times. So the arms can nudge or press the box as the claw comes down, and they squeeze its sides when they close.

## Lift cap
The claw can **never lift a prize clear**. `game.ts` records the box's 8 corner heights when the lift starts. If any corner rises more than `MAX_LIFT` (5 cm), or the whole box rises more than `MAX_CLEAR` (8 mm), the arms slip: power drops to 0 and they open slightly. The box can then tip and swing on its own, so a corner can end up higher after the slip.

## Rod rack and funnel

- Rods run left-to-right (parallel to the front glass). The clear gap between rods is the **diagonal of the box's footprint, √(w² + d²), plus `gapExtra`** (default 1.6 cm). Once a box stands on end it can always pass through, whichever way it is turned. The rack is rebuilt for each prize. The prize starts across the pair either side of `BRIDGE.cz`.
- `rodGap()` in `machine.ts` also keeps the box able to bridge the gap when lying flat. Its length must cover the rod pitch plus `MIN_OVERHANG` (1.2 cm) past each rod centre, so the margin shrinks for boxes that are too short (with a console warning). `npm run sim:funnel` checks both conditions for every prize.
- Rods are bare chrome, friction 0.22.
- Under the rack is empty space: a **funnel** of four sloped panels down to a 30 × 30 cm central opening, 30 cm below the rods. Funnel friction is low (0.15), so boxes slide straight to the opening.
- **Win**: the prize's centre drops below the opening (`WIN_Y`).
- **Stuck**: the prize leaves the rack area, or is lodged in the funnel and not falling. Either one lights up the すみません button.

## Prize boxes

Each box is a cuboid with its real dimensions (`w × d × h`) and mass. Its **centre of mass is offset** along the height axis toward the figure's base (`comAlongH`, about −8 to −24 % of the height) and slightly low. Rapier gets this through `setAdditionalMassProperties`, so boxes tip toward their heavy end. Friction is 0.5 and restitution 0.04, and CCD is on.

The box lies on its back across the rods: front art up, box top toward the back, base end (warning label) facing you. About 1 in 4 placements is flipped end-for-end.

## Arm power is proportional to box weight

Operators re-tune arm power for each prize so every box plays alike. Each play's grip/lift/carry are multiplied by

```
armScale = (mass / 0.34 kg) × trim        trim = armTrim (normal plays) or strongTrim (strong plays)
```

- **Weight term:** a box twice as heavy gets arms twice as strong.
- **Trims:** per-box shape corrections, because the same force grips a narrow, tall or wide box differently.

`npm run sim:calibrate` finds both trims. It plays a fixed set of grabs on every box (front end, middle and back end, 3 seeds). It measures how far the claw lifts the box **while holding it**, which ignores the swing after the arms slip, then searches:

- **`armTrim`:** normal arms lift the gripped end 1.5 cm on average, a nudge that only rarely wins on its own (override with `NORMAL_LIFT=…`).
- **`strongTrim`:** the weakest strong arms that bring the end up to the 5 cm lift cap (4.8 cm average), × 1.5 so play-to-play jitter doesn't drop a strong play below it.

With the stored trims, normal arms lift every box's gripped end 1.4–1.9 cm, and strong arms lift every box's end to the 5 cm cap (tall box 4.6 cm). With chevron arms the tips catch under the box edge as the claw rises, so for the standard, mini and wide boxes even the minimum arm power still lifts about 1.8–1.9 cm, and their normal trims sit at the bottom of the range. `ONLY=normal npm run sim:calibrate` recalibrates just the normal trims.

After a strong lift, what happens next still depends on the box. The same 5 cm lift tips some boxes into the gap and barely moves the tall box (the `move` column of `npm run sim:strength strong`).

`npm run sim:strength [normal|strong]` reports the current response per box. Rerun the calibration after changing box sizes, arm geometry, or the normal or strong arm power.

## Known behaviours

- A play that grips one end usually "walks" the box a few millimetres toward the other end. Repeated plays tip it into a **diagonal wedge** across the next pair of rods, which is the classic bridge-game state. Pushing or lifting the high end at the right spot drops it through.
- Pressing the arms onto the box's top edges produces a few newtons of downward force. That force scales with arm power. Check it with the debug overlay (claw→box force) or `tools/contact-forces.ts`.
