# Té Company golden ticket

An all-vector recreation of the Té Company golden ticket, with pointer-driven tilt and foil lighting. Everything on the ticket is SVG geometry and gradients, including the lettering, illustration, paper texture, and light. There are no photographs, bitmaps, canvas, or fonts.

Inspiration: [claude.ai/cli_landing](https://claude.ai/cli_landing).

## Run locally

Use Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

## Scripts

- `npm run build`: regenerate the ticket SVG and the portable `golden-ticket.html`, then build the app into `dist/` (a static site you can host anywhere).
- `npm test`: interaction and vector integrity checks.

`public/assets/golden-ticket.svg` and `golden-ticket.html` are generated and committed. Run `npm run build` after changing anything in `artwork/`, `scripts/`, or `src/`.

## Files

- `public/assets/golden-ticket.svg`: the finished ticket, 1848 × 772 units.
- `golden-ticket.html`: a self-contained interactive edition.
- `artwork/`: the outlined linework, the hidden teapot outline, and the paper recipe (`material.json`).
- `scripts/`: the Node.js generators. `src/`: the preview. `tests/`: the checks.

## How it works

- **Paper.** `scripts/build-vector.mjs` grows the gold paper from a seed: 54,000 curved flakes, 44,000 grain strokes, 42,000 fibers, and faint tonal swells. Edit the seed, palette, density, scale, and opacity in `artwork/material.json`. Identical settings produce identical bytes.
- **Foil.** `scripts/build-ticket.mjs` clips shared gold, white-gold, and silver gradients to the outlined artwork, so one reflection crosses the figure, stamp, border, and lettering continuously. At rest the inks are flat.
- **Hidden print.** Two hairline teapots sit in the paper. One is under the speech balloon; the other, twice as large, is under the TÉ CO. stamp and runs off the bottom edge. Both show only in the light under the pointer.
- **Sparkle.** 2,400 tiny glints in 12 facets twinkle faintly in the light as the ticket tilts. Each facet is split into tiles so only lit tiles near the light are drawn.
- **Motion.** `src/ticket.js` tilts the ticket toward a mouse or pen within about 50px. It moves the light and reflections, stretches the shadow toward the lifted edge, and settles back on a critically damped spring. Touch, arrow keys, Escape, a motion toggle, and reduced-motion preferences are supported.

## Editing the SVG

Open `public/assets/golden-ticket.svg` in a vector editor. Text is outlined. Named groups separate the paper (`paper-grain`, `paper-glints`, `hidden-motifs`), the white border, speech balloon, portrait field, the twelve GOLDEN TICKET letters, the four message lines, the teapot figure, and the stamp. To change the artwork itself, edit `artwork/ticket-linework.svg` and rebuild.
