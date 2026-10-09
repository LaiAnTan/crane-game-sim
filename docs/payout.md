# Payout, arm power and money

Japanese crane machines expose separate **arm power** settings for the grab, the lift and the carry back home. Many cabinets also run a payout setting that makes a strong claw more likely the more money has gone in, up to a guaranteed strong claw at the ceiling (天井, *tenjō*). This simulator models both. Settings live in `src/sim/payout.ts` and can be changed live in the operator panel (`` ` ``).

## Arm powers

Closing-torque caps in N·m for a 340 g reference box. Every play multiplies them by the prize's weight ÷ 340 g times its shape trim (see [physics.md](physics.md#arm-power-is-proportional-to-box-weight)):

| Profile | grip | lift | carry |
|---|---|---|---|
| normal | 0.07 | 0.032 | 0.02 |
| strong | 0.40 | 0.30 | 0.05 |

- **grip** — while the arms close
- **lift** — while the claw rises
- **carry** — at the top and on the way home

Each play multiplies every power by a random factor of 1 ± `jitter` (±12 %), so no two plays are identical.

Normal arms can only nudge the box. In headless tests, an expert bot with normal arms only rarely won within 80 plays. Strong arms reliably bring one end up to the 5 cm lift cap, which moves the box a lot and often tips it into the wedge. Even strong arms can't lift the box clear (see the lift cap), so a strong play is a big opportunity, not a guaranteed win.

## Progressive strong-claw chance

```
chance(spend) = 0                                         spend ≤ floor
              = ((spend − floor) / (ceiling − floor))^curve   floor < spend < ceiling
              = 1                                         spend ≥ ceiling
```

`spend` is ¥100 × plays since the last win. Defaults: `floor` ¥1,000, `ceiling` ¥6,000, `curve` 1.6.

| Spend since win | ¥1,000 | ¥2,000 | ¥3,000 | ¥4,000 | ¥5,000 | ¥6,000 |
|---|---|---|---|---|---|---|
| Strong chance | 0 % | 7.6 % | 23 % | 44 % | 70 % | 100 % |

On average the first strong play comes at about ¥2,400 (`npm run sim:curve`). A win resets the counter. The operator panel can also switch to **Skill only** (never strong).

## Money used and pity

- **使用金額 / money used** — the yen value of the coins inserted since the last win (¥100 coin = ¥100, ¥500 coin = ¥500), plus the session total. Resets on a win; any leftover credits carry over as free plays.
- **天井 gauge** — `spend / ceiling`, i.e. how close the play counter is to a guaranteed strong claw, together with the chance for the next play. It counts plays, so with ¥500 coins (6 plays for ¥500) it fills slightly faster than the yen counter suggests.
- **Fire** — burns around the money card with intensity `(spend / ceiling)^1.15`, and flares when a play rolls strong arms. It goes out on a win.

## Staff (すみません)

Between plays, **S** or the すみません button calls staff, who re-place the prize in an easier position: shifted toward one rod and slightly twisted. The button lights up when the prize is stuck, or after `staffAfter` (12) misses in a row.

## History

Every win is saved to `localStorage` (`crane-history-v1`): prize, yen spent, plays and time. The panel shows the number of wins plus average, best and total spend. If storage is unavailable (private window, blocked site data), history works for the current session only.
