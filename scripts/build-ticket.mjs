/** Builds public/assets/golden-ticket.svg: the artwork with metallic ink, hidden print, and glints. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildArtwork, flake, randomSequence } from './build-vector.mjs';

const root = new URL('../', import.meta.url);
const stops = colors => colors.map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`).join('');
const gold = [[0,'#65431f'],[.18,'#aa7835'],[.34,'#c49d56'],[.44,'#e5c888'],[.49,'#fff4d0'],[.52,'#fffce9'],[.57,'#b9d1cb'],[.63,'#c6a38e'],[.75,'#966a2d'],[.9,'#b8944e'],[1,'#765026']];
const silver = [[0,'#cad0cd'],[.24,'#e7e9e5'],[.43,'#f7f4e7'],[.5,'#ffffff'],[.58,'#d5e2e3'],[.75,'#e1dcd5'],[1,'#c6cfcd']];
// White gold for the border: silver warmed toward champagne, never yellow.
const whiteGold = [[0,'#d3cbb8'],[.24,'#ebe5d6'],[.43,'#f8f2e2'],[.5,'#fffdf6'],[.58,'#e2e2d8'],[.75,'#e6dccb'],[1,'#cfc6b1']];
const restingInk = { gold: '#8a6232', 'white-gold': '#ebe5d7', silver: '#e4e7e8' };
// Hidden motifs in ticket units: source silhouettes, placed in open paper.
const motifs = [
  { source: 'artwork/hidden-teapot.svg', x: 198, y: 497, scale: 1.165 },
  // Twice the size, like a banknote pattern: it runs off the paper's edge.
  { source: 'artwork/hidden-teapot.svg', x: 1330, y: 530, scale: 2.33 },
];

// Bake placement into the path data so the light gradient shares the ticket's
// coordinates. Relative segments only scale; absolute points also translate.
function placePath(d, { x, y, scale }) {
  if (/[^MLHVCSQTZ\d\s.,e+-]/i.test(d)) throw new Error('Hidden motif paths support M L H V C S Q T Z only.');
  let first = true;
  return d.replace(/([MLHVCSQTZ])([^MLHVCSQTZ]*)/gi, (_, command, args) => {
    const upper = command.toUpperCase();
    const firstMove = first && upper === 'M'; // A path's first moveto is absolute.
    first = false;
    const numbers = args.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
    return command + numbers.map((n, i) => {
      const axis = upper === 'H' ? 0 : upper === 'V' ? 1 : i % 2;
      const absolute = command === upper || (firstMove && i < 2);
      return String(Number((Number(n) * scale + (absolute ? (axis ? y : x) : 0)).toFixed(2)));
    }).join(' ');
  });
}
const hiddenPaths = await Promise.all(motifs.map(async motif => {
  const source = await readFile(new URL(motif.source, root), 'utf8');
  return [...source.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(([, d]) => placePath(d, motif)).join('');
}));

// Paper sparkle: a sparse scatter of glints across the whole paper, sorted into
// facets that each face a different way. src/ticket.js flashes a facet only
// when the light reaches its angle, and only in the pool of light. A faint halo
// sets a glint apart from the paper's own pale flakes, which are just as small.
// Each facet is split into a grid of tiles so the preview draws only the lit
// facets' tiles inside the pool, instead of shading the whole ticket each frame.
const glintPool = 330;
const [cols, rows] = [12, 5];
const tileW = 1848 / cols, tileH = 772 / rows;
const glintFacets = Array.from({ length: 12 }, () => Array.from({ length: cols * rows }, () => ({ cores: [], halos: [] })));
let { svg, seed } = await buildArtwork();
const glintRand = randomSequence(seed ^ 0x676c696e);
for (let i = 0; i < 2400; i++) {
  const x = 20 + glintRand() * 1848, y = 26 + glintRand() * 772;
  const size = 1.1 + Math.pow(glintRand(), 3) * 2.2;
  const facet = glintFacets[Math.floor(glintRand() * glintFacets.length)];
  const tile = facet[Math.min(Math.floor((y - 26) / tileH), rows - 1) * cols + Math.min(Math.floor((x - 20) / tileW), cols - 1)];
  tile.cores.push(flake(x, y, size, .45 + glintRand() * .45, glintRand() * Math.PI, glintRand));
  const r = Number((size * 2.6).toFixed(2));
  tile.halos.push(`M${Number((x - r).toFixed(2))} ${Number(y.toFixed(2))}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`);
}
// A tile can hold lit glints while its center is within the pool radius plus
// half its diagonal and the widest halo.
const glintReach = Math.ceil(glintPool + Math.hypot(tileW, tileH) / 2 + 3.3 * 2.6);
const glints = glintFacets.map(tiles => `<g class="paper-glint" fill-opacity="0">${tiles.map(({ cores, halos }, i) => cores.length
  ? `<g data-x="${Number((20 + (i % cols + .5) * tileW).toFixed(1))}" data-y="${Number((26 + (Math.floor(i / cols) + .5) * tileH).toFixed(1))}"><path opacity=".3" d="${halos.join('')}"/><path d="${cores.join('')}"/></g>`
  : '').join('')}</g>`).join('');

const gradients = [
  `<linearGradient id="foil-gold" gradientUnits="userSpaceOnUse" x1="-140" y1="135" x2="840" y2="665">${stops(gold)}</linearGradient>`,
  `<linearGradient id="foil-silver" gradientUnits="userSpaceOnUse" x1="-340" y1="100" x2="1040" y2="700">${stops(silver)}</linearGradient>`,
  // Only stops of its own: it inherits the silver's coordinates through href,
  // so the light src/ticket.js moves across the silver crosses it too.
  `<linearGradient id="foil-white-gold" href="#foil-silver">${stops(whiteGold)}</linearGradient>`,
];
svg = svg.replace(/<g id="(teapot-figure-ink|te-co-stamp-ink|white-border|(?:golden|ticket)-\d-[^"]+)"([^>]*)>([\s\S]*?)<\/g>/g, (tag, id, attributes, paths) => {
  const metal = ['teapot-figure-ink', 'te-co-stamp-ink'].includes(id) ? 'gold'
    : id === 'white-border' ? 'white-gold'
    : /^(golden|ticket)-\d-/.test(id) ? 'silver' : null;
  if (!metal) return tag;
  const transform = attributes.match(/transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)"/);
  if (!transform) throw new Error(`Missing source transform for ${id}`);
  const [, x, y, scale] = transform.map(Number);
  // The source paths have local tracing coordinates. Compensate for their
  // group transform so one reflection crosses all the lettering coherently.
  const paint = `foil-paint-${id}`;
  gradients.push(`<linearGradient id="${paint}" href="#foil-${metal}" gradientTransform="matrix(${1 / scale} 0 0 ${1 / scale} ${-x / scale} ${-y / scale})"/>`);
  const clip = `foil-shape-${id}`;
  gradients.push(`<clipPath id="${clip}" clipPathUnits="userSpaceOnUse">${paths}</clipPath>`);
  // Flat resting ink. The reflection is a separate layer that the preview
  // fades in only while the light is on the ticket.
  let finish = attributes.replace(/fill="[^"]+"/, `fill="${restingInk[metal]}"`);
  if (metal === 'gold') {
    // A very fine engraved edge keeps the small stamp legible when its face
    // reflects near-white.
    finish = finish.replace(/opacity="[^"]+"/, 'opacity="1"');
    finish += ' stroke="#71502c" stroke-width="1.15" stroke-opacity=".65" stroke-linejoin="round" paint-order="stroke fill"';
  }
  // Paint one continuous rectangle through the outlined shapes. Applying the
  // gradient directly to each path would repeat it in every path's translated
  // tracing coordinate system, breaking the reflection into unrelated colors.
  return `<g id="${id}"${finish}>${paths}<rect class="foil-sheen" x="-8000" y="-8000" width="16000" height="16000" stroke="none" fill="url(#${paint})" clip-path="url(#${clip})" opacity="0"/></g>`;
});
// Hidden print: hairline outlines, almost invisible on the paper, that only
// catch the light where the pointer's light falls on them.
const lines = hiddenPaths.map(d => `<path d="${d}"/>`).join('');
gradients.push(`<radialGradient id="hidden-light" gradientUnits="userSpaceOnUse" cx="944" cy="412" r="270"><stop stop-color="#fffbf1" stop-opacity=".9"/><stop offset=".3" stop-color="#f2ddb0" stop-opacity=".6"/><stop offset=".62" stop-color="#d3e5e2" stop-opacity=".22"/><stop offset="1" stop-color="#d3e5e2" stop-opacity="0"/></radialGradient>`);
gradients.push(`<radialGradient id="glint-light" gradientUnits="userSpaceOnUse" cx="944" cy="412" r="${glintPool}"><stop stop-color="#fffefa"/><stop offset=".45" stop-color="#fff8e8" stop-opacity=".9"/><stop offset="1" stop-color="#fbeed3" stop-opacity="0"/></radialGradient>`);
const sparkle = `<g id="paper-glints" data-reach="${glintReach}" fill="url(#glint-light)" clip-path="url(#paper-outline)">${glints}</g>`;
svg = svg.replace('<g id="printed-artwork">', `${sparkle}<g id="hidden-motifs" clip-path="url(#paper-outline)" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><g id="hidden-motifs-emboss" stroke="#fff4e2" opacity=".06">${lines}</g><g id="hidden-motifs-light" stroke="url(#hidden-light)" opacity="0">${lines}</g></g><g id="printed-artwork">`);
svg = svg.replace('</defs>', `${gradients.join('')}</defs>`);
await mkdir(new URL('public/assets/', root), { recursive: true });
await writeFile(new URL('public/assets/golden-ticket.svg', root), svg);
console.log(`Golden ticket SVG saved (${Buffer.byteLength(svg).toLocaleString()} bytes).`);
