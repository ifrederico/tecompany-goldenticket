/**
 * The ticket's printed artwork on procedural gold paper, from vector source and
 * a seeded material recipe. No raster input is used.
 */
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const outline = 'M21 27H1867V797H21Z';
const rect = '<rect x="20" y="26" width="1848" height="772"';
const f = n => Number(n.toFixed(2));
const shiftPath = (d, dx, dy) => {
  let axis = 0;
  return d.replace(/-?\d*\.?\d+/g, n => String(f(Number(n) + (axis++ % 2 ? dy : dx))));
};

// `skip` starts the sequence that many draws in.
export function randomSequence(seed, skip = 0) {
  seed += skip * 0x6D2B79F5;
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Compact curved flakes. Random orientation and unequal
// radii make the foil granular rather than a field of identical dots.
export function flake(x, y, radius, aspect, angle, rand) {
  const ux = Math.cos(angle) * radius;
  const uy = Math.sin(angle) * radius;
  const vx = -Math.sin(angle) * radius * aspect;
  const vy = Math.cos(angle) * radius * aspect;
  const p = [
    [x + ux, y + uy],
    [x + vx * (.7 + rand() * .6), y + vy],
    [x - ux * (.6 + rand() * .5), y - uy],
    [x - vx, y - vy * (.7 + rand() * .4)],
  ];
  const start = [(p[3][0] + p[0][0]) / 2, (p[3][1] + p[0][1]) / 2];
  let d = `M${f(start[0])} ${f(start[1])}`;
  for (let i = 0; i < 4; i++) {
    const next = p[(i + 1) % 4];
    d += `Q${f(p[i][0])} ${f(p[i][1])} ${f((p[i][0] + next[0]) / 2)} ${f((p[i][1] + next[1]) / 2)}`;
  }
  return d + 'Z';
}

export function generateMaterial(config) {
  // The flakes once filled a single 379 × 283 tile, 54,000 of them at 9 draws
  // each. The rest of the paper continues the sequence where they left it, so
  // it stays exactly as approved.
  const rand = randomSequence(config.seed, Math.round(54000 * config.density) * 9);
  const flakeRand = randomSequence(config.seed ^ 0x666c616b);
  // Three small tiles at unrelated prime sizes, each with one family of tones
  // at the original density. Together they repeat only every few million
  // units. They are drawn dark, mid, then light, so light flakes always land
  // on top, as they did in the single tile; the light specks show most and
  // get the largest tile.
  const tiles = [
    { size: [199, 151], tones: [0, 1] },
    { size: [181, 137], tones: [2, 3] },
    { size: [263, 197], tones: [4, 5, 6] },
  ];
  const perUnit = 54000 * config.density / (379 * 283) / config.facets.length;
  const facetPatterns = tiles.map(({ size: [tileW, tileH], tones }, layer) => {
    const facets = config.facets.map(() => []);
    const facetCount = Math.round(perUnit * tones.length * tileW * tileH);
    for (let i = 0; i < facetCount; i++) {
      const x = flakeRand() * tileW, y = flakeRand() * tileH;
      const size = .38 + Math.pow(flakeRand(), 2) * 2.1;
      const tone = tones[Math.floor(flakeRand() * tones.length)];
      const angle = (flakeRand() - .5) * Math.PI * .68;
      const aspect = .2 + flakeRand() * .52;
      const d = flake(x, y, size, aspect, angle, flakeRand);
      facets[tone].push(d);
      // Wrap crossing flakes to the opposite edge, preserving seamless joins.
      const xs = [0], ys = [0];
      if (x < size * 1.4) xs.push(tileW);
      if (x > tileW - size * 1.4) xs.push(-tileW);
      if (y < size * 1.4) ys.push(tileH);
      if (y > tileH - size * 1.4) ys.push(-tileH);
      for (const dx of xs) for (const dy of ys) if (dx || dy) facets[tone].push(shiftPath(d, dx, dy));
    }
    const facetPaths = tones.map(i => `<path fill="${config.facets[i]}" d="${facets[i].join('')}"/>`).join('');
    return `<pattern id="foil-facets-${layer + 1}" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="scale(${config.facetScale})">${facetPaths}</pattern>`;
  });

  // A second, incommensurate tile breaks up recognizable repetitions. A full-
  // surface fiber layer below adds further non-repeating variation.
  const micros = Array.from({length: 6}, () => []);
  const microCount = Math.round(44000 * config.density);
  for (let i = 0; i < microCount; i++) {
    const x = rand() * 487, y = rand() * 347;
    const group = Math.floor(rand() * micros.length);
    const dx = .08 + rand() * .65, dy = (rand() - .5) * .45;
    micros[group].push(`M${f(x)} ${f(y)}l${f(dx)} ${f(dy)}`);
  }
  const microPaths = micros.map((parts, i) => `<path fill="none" stroke="${i < 3 ? '#faf5e9' : '#79543c'}" stroke-width="${[.38,.62,.9,.32,.48,.68][i]}" stroke-linecap="round" d="${parts.join('')}"/>`).join('');

  // Keep the ink's pattern independent and shallow. Nested pattern references
  // are costly in some SVG exporters, even when the browser caches them well.
  const inkRand = randomSequence(config.seed ^ 0x7465636f);
  const inkFlecks = [];
  for (let i = 0; i < 4800; i++) {
    inkFlecks.push(`M${f(inkRand() * 197)} ${f(inkRand() * 163)}l${f(.08 + inkRand() * .65)} ${f((inkRand() - .5) * .4)}`);
  }
  const inkPath = `<path fill="none" stroke="#f1e5d3" stroke-width=".55" stroke-linecap="round" d="${inkFlecks.join('')}"/>`;

  const fibers = Array.from({length: 6}, () => []);
  const fiberCount = Math.round(config.fiberCount * config.density);
  for (let i = 0; i < fiberCount; i++) {
    const x = 20 + rand() * 1848, y = 26 + rand() * 772;
    const length = 1.5 + Math.pow(rand(), 2) * 6;
    const slope = (rand() - .5) * 2.4;
    const group = Math.floor(rand() * fibers.length);
    fibers[group].push(`M${f(x)} ${f(y)}q${f(length * .45)} ${f(slope - .7)} ${f(length)} ${f(slope)}`);
  }
  const fiberPaths = fibers.map((parts, i) => `<path fill="none" stroke="${['#f6ebd9','#f2e7d5','#e2c6a4','#8b684e','#ab7b56','#fff9ec'][i]}" stroke-width="${[.42,.7,.52,.4,.65,.35][i]}" stroke-linecap="round" d="${parts.join('')}"/>`).join('');

  // These swells are deliberately very low contrast: broad paper variation,
  // without the obvious central shine of polished metal or a plastic card.
  const mottles = [];
  for (let i = 0; i < 23; i++) {
    const x = 20 + rand() * 1848, y = 26 + rand() * 772;
    mottles.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(50 + rand() * 210)}" ry="${f(35 + rand() * 100)}" fill="url(#material-${i % 2 ? 'warm' : 'light'}-swelling)"/>`);
  }

  const defs = `${facetPatterns.join('\n')}
<pattern id="foil-micrograin" width="487" height="347" patternUnits="userSpaceOnUse" patternTransform="rotate(11)">${microPaths}</pattern>
<pattern id="figure-ink-material" width="788" height="652" patternUnits="userSpaceOnUse"><rect width="788" height="652" fill="#412e22"/><g transform="scale(4)" opacity="${config.inkGrainOpacity}">${inkPath}</g></pattern>
<pattern id="stamp-ink-material" width="788" height="652" patternUnits="userSpaceOnUse"><rect width="788" height="652" fill="#6d4d36"/><g transform="scale(4)" opacity="${config.inkGrainOpacity * 1.3}">${inkPath}</g></pattern>
<radialGradient id="material-light-swelling"><stop stop-color="#fff2de" stop-opacity=".12"/><stop offset="1" stop-color="#fff2de" stop-opacity="0"/></radialGradient>
<radialGradient id="material-warm-swelling"><stop stop-color="#694529" stop-opacity=".08"/><stop offset="1" stop-color="#694529" stop-opacity="0"/></radialGradient>`;
  const grain = `<g id="paper-grain" data-name="Procedural vector gold paper" clip-path="url(#paper-outline)">
<g id="paper-tonal-swells">${mottles.join('')}</g>
<g id="gold-foil-facets" opacity="${config.facetOpacity}">${tiles.map((_, i) => `${rect} fill="url(#foil-facets-${i + 1})"/>`).join('')}</g>
<g id="gold-micrograin" opacity="${config.micrograinOpacity}">${rect} fill="url(#foil-micrograin)"/></g>
<g id="paper-fibers" opacity="${config.fiberOpacity}">${fiberPaths}</g>
</g>`;
  return { defs, grain };
}

export async function buildArtwork() {
  const [source, configText] = await Promise.all([
    readFile(new URL('artwork/ticket-linework.svg', root), 'utf8'),
    readFile(new URL('artwork/material.json', root), 'utf8'),
  ]);
  const config = JSON.parse(configText);
  const material = generateMaterial(config);
  let artwork = source.match(/<g id="printed-artwork">([\s\S]*)<\/g><\/svg>/)?.[1];
  if (!artwork) throw new Error('Vector source is missing the printed-artwork group.');
  for (const [id, opacity] of Object.entries({
    'teapot-figure-ink-edge': .65,
    'teapot-figure-ink': .92,
    'te-co-stamp-soft-ink': .6,
    'te-co-stamp-ink': .8,
  })) artwork = artwork.replace(`<g id="${id}"`, `<g id="${id}" opacity="${opacity}"`);
  const header = `<svg xmlns="http://www.w3.org/2000/svg" width="1848" height="772" viewBox="20 26 1848 772" role="img" aria-labelledby="title description">
<title id="title">Té Company Golden Ticket — gold paper and reflective foil</title>
<desc id="description">Gold, white-gold and silver foil ink with outlined lettering, teapot illustration, speech balloon, border, and Té Co stamp. The gold paper is built from seeded vector flakes, fibers, and micrograin. No photograph, bitmap, raster filter, or font is required. You my lucky friend, are holding a golden ticket from Té Company! In other words you are… the chosen one.</desc>`;
  const commonDefs = `<linearGradient id="gold-paper" x1="0" y1="0" x2="1" y2=".8">${config.base.map((color, i) => `<stop offset="${f(i / (config.base.length - 1))}" stop-color="${color}"/>`).join('')}</linearGradient>
<linearGradient id="cool-paper" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#d5dfe3"/><stop offset=".6" stop-color="#d8e0e3"/><stop offset="1" stop-color="#e0e6e8"/></linearGradient>
<clipPath id="paper-outline"><path d="${outline}"/></clipPath>`;
  const paper = `<path id="paper-base" fill="url(#gold-paper)" d="${outline}"/>`;
  const ink = `<g id="printed-artwork">${artwork}</g>`;
  const texturedInk = ink.replace('fill="#412e22"', 'fill="url(#figure-ink-material)"').replace('fill="#6d4d36"', 'fill="url(#stamp-ink-material)"');
  const svg = `${header}<defs>${commonDefs}${material.defs}</defs>${paper}${material.grain}${texturedInk}</svg>`;
  return { svg, seed: config.seed };
}
