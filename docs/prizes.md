# Prizes

## Catalogue

`src/sim/catalog.ts` defines six generic prize boxes covering the range of real Japanese prize-figure packaging:

| Prize | Size | Box (W × D × H cm) | Mass | Rod gap | armTrim | strongTrim |
|---|---|---|---|---|---|---|
| Standard Figure (pink) | M | 11 × 8 × 20 | 300 g | 15.2 cm | 0.91 | 0.23 |
| Mini Figure (mint) | S | 9 × 7 × 18 | 180 g | 13.0 cm | 0.98 | 1.11 |
| Wide Figure (violet) | L wide | 15 × 9 × 24 | 420 g | 19.1 cm | 0.74 | 0.74 |
| Tall Figure (sky) | L tall | 12 × 9 × 26 | 500 g | 16.6 cm | 2.45 | 2.22 |
| Slim Figure (lemon) | S slim | 8 × 6 × 20 | 220 g | 11.6 cm | 3.79 | 4.67 |
| Premium Figure (coral) | XL | 16 × 11 × 27 | 700 g | 21.0 cm | 0.81 | 0.27 |

Each box's centre of mass is offset toward its base (`comAlongH`), so boxes tip toward their heavy end. Arm power scales with each box's weight times its `armTrim` (normal plays) or `strongTrim` (strong plays), so every box is about equally hard (see [physics.md](physics.md#arm-power-is-proportional-to-box-weight)). When a prize is won, the next one in the list is loaded and the rod rack is rebuilt for its size.

## Rod gap

The gap between rods is set per prize so the box can always get through:

```
gap = min( √(w² + d²) + gapExtra ,  h − 2·MIN_OVERHANG − 2·rodRadius )
```

- The first term fits the box's footprint diagonal, so a box standing on end drops through at any rotation.
- The second keeps the box long enough to rest across two rods when lying flat.

`npm run sim:funnel` checks every prize: it rests on the rods at the start, and when stood on end at 0°, 45° and 90° it drops through the rods and the funnel opening.

## Box art

`src/render/boxTexture.ts` draws every face on a canvas from the prize's `colors`. No images are used.

| Face | Contents |
|---|---|
| Front | Gradient, scattered stars, PRIZE header band, a "window" panel with a large star, title, size, NOT FOR SALE band |
| Back | Star, title, box dimensions, mass, barcode |
| Sides | Gradient, title and size |
| Base end | White CAUTION sticker with a yellow band and barcode. When the box lies on the rods, this end faces the player. |
| Top end | Accent colour with a star and the size |

The same faces are used for the prize on the rods (lying pose) and for the back-wall stacks (standing pose).

## Adding a prize

Add an entry to `CATALOG`:

```ts
{
  id: 'my-box', title: 'My Figure', size: 'M',
  w: 0.11, d: 0.08, h: 0.2,   // upright box, metres
  mass: 0.3,                  // kg
  comAlongH: -0.16,           // centre of mass toward the base, as a fraction of h
  colors: { bg: '#ffd9e8', bg2: '#ff8fb8', accent: '#e8478a', ink: '#5a2440' },
},
```

Keep `h ≥ √(w² + d²) + 0.062` m so the box can both fit through the gap and bridge it. Then:

1. `npm run sim:funnel` checks it rests on the rods and drops through on end.
2. `npm run sim:calibrate` gives its `armTrim` and `strongTrim`. Paste both into the entry.
