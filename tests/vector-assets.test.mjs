import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateMaterial } from '../scripts/build-vector.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const svg = readFileSync(new URL('../public/assets/golden-ticket.svg', import.meta.url), 'utf8');

test('the ticket is self-contained native vector artwork', () => {
  assert.match(svg, /<svg\b[^>]*viewBox="20 26 1848 772"/);
  assert.doesNotMatch(svg, /<(?:image|foreignObject|text|filter|script)\b/i, 'Artwork must not depend on raster images, live fonts, or raster filters');
  assert.doesNotMatch(svg, /data:image|(?:href|src)="(?:https?:|file:|.*\.(?:png|jpe?g))/i);
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Editable groups must have unique identifiers');
  for (const id of ['paper-grain','speech-balloon','white-border','portrait-white-field','teapot-figure-ink','te-co-stamp-ink']) assert.ok(ids.includes(id), `Missing artwork group ${id}`);
  for (let line = 1; line <= 4; line++) assert.ok(ids.includes(`message-line-${line}`));
  assert.equal(ids.filter(id => /^golden-\d-/.test(id)).length, 6);
  assert.equal(ids.filter(id => /^ticket-\d-/.test(id)).length, 6);
  assert.ok((svg.match(/<path\b/g) || []).length > 100);
});

test('hidden hairline teapots are invisible until lit', () => {
  const hidden = svg.match(/<g id="hidden-motifs"([^>]*)>([\s\S]*?)<\/g><\/g>/);
  assert.ok(hidden, 'Missing the hidden motifs');
  assert.match(hidden[1], /fill="none"/, 'Motifs are outlines, not fills');
  assert.match(hidden[1], /clip-path="url\(#paper-outline\)"/, 'A motif that runs off the edge is cut at the paper');
  assert.match(hidden[2], /<g id="hidden-motifs-emboss"[^>]*opacity="\.0\d"/, 'The resting outline is almost invisible');
  assert.match(hidden[2], /<g id="hidden-motifs-light" stroke="url\(#hidden-light\)" opacity="0">/, 'The lit outline is invisible at rest');
  assert.equal((hidden[2].match(/<path\b/g) || []).length, 4, 'Both teapots in both layers');
  assert.ok(svg.indexOf('id="hidden-motifs"') < svg.indexOf('id="printed-artwork"'), 'Hidden print sits under the printed artwork');
});

test('the paper carries faint glints, hidden until lit and under the inks', () => {
  const glints = svg.match(/<g id="paper-glints"([^>]*)>([\s\S]*?)<\/g><g id="hidden-motifs"/);
  assert.ok(glints, 'Missing paper glints');
  assert.match(glints[1], /fill="url\(#glint-light\)"/);
  assert.match(svg, /<radialGradient id="glint-light"/);
  const facets = glints[2].match(/<g class="paper-glint"[^>]*>/g) || [];
  assert.equal(facets.length, 12);
  for (const facet of facets) assert.match(facet, /fill-opacity="0"/, 'Every glint facet starts hidden');
  assert.match(glints[1], /data-reach="\d+"/, 'The preview knows how far a tile can catch the light');
  const tiles = glints[2].match(/<g data-x="[\d.]+" data-y="[\d.]+">/g) || [];
  assert.ok(tiles.length > 600, 'Facets are split into tiles across the paper');
  assert.ok(svg.indexOf('id="paper-grain"') < svg.indexOf('id="paper-glints"'), 'Glints sit on the paper grain');
  assert.ok(svg.indexOf('id="paper-glints"') < svg.indexOf('id="printed-artwork"'), 'Inks cover the glints');
});

test('the border is white gold that shares the silver light; the lettering stays silver', () => {
  const whiteGold = svg.match(/<linearGradient id="foil-white-gold"([^>]*)>/);
  assert.ok(whiteGold, 'Missing white-gold paint');
  assert.match(whiteGold[1], /^ href="#foil-silver"$/, 'Inherits the silver light position and nothing else');
  assert.match(svg, /<linearGradient id="foil-paint-white-border" href="#foil-white-gold"/);
  assert.match(svg, /<g id="white-border"[^>]*fill="#ebe5d7"/);
  assert.match(svg, /<linearGradient id="foil-paint-golden-1-g" href="#foil-silver"/);
  assert.match(svg, /<g id="golden-1-g"[^>]*fill="#e4e7e8"/);
});

test('the ticket rests with flat inks; every reflection layer starts hidden', () => {
  const sheens = svg.match(/<rect class="foil-sheen"[^>]*>/g) || [];
  assert.equal(sheens.length, 15, 'Figure, stamp, border, and twelve letters');
  for (const sheen of sheens) assert.match(sheen, /opacity="0"/);
});

test('portable HTML contains actual SVG geometry and no embedded photograph', () => {
  const html = readFileSync(new URL('../golden-ticket.html', import.meta.url), 'utf8');
  assert.match(html, /<svg class="artwork"/);
  assert.doesNotMatch(html, /data:image\/(?:jpeg|png|webp)|<(?:image|img|canvas)\b/i);
  assert.match(html, /id="teapot-figure-ink"/);
  assert.match(html, /<radialGradient id="surface-spotlight"/);
});

test('the ticket is reproducible in a directory with no photograph or raster dependencies', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'golden-ticket-vector-test-'));
  try {
    await mkdir(join(temporary, 'scripts'));
    await mkdir(join(temporary, 'artwork'));
    const inputs = ['scripts/build-vector.mjs', 'scripts/build-ticket.mjs', 'artwork/ticket-linework.svg', 'artwork/material.json', 'artwork/hidden-teapot.svg'];
    await Promise.all(inputs.map(name => copyFile(new URL(`../${name}`, import.meta.url), join(temporary, name))));
    execFileSync(process.execPath, [join(temporary, 'scripts/build-ticket.mjs')], { cwd: temporary, stdio: 'pipe' });
    const actual = await readFile(join(temporary, 'public/assets/golden-ticket.svg'));
    const expected = await readFile(new URL('../public/assets/golden-ticket.svg', import.meta.url));
    assert.deepEqual(actual, expected, 'Build must reproduce the delivered asset from vector-only inputs');
  } finally { await rm(temporary, {recursive: true, force: true}); }
});

test('material seed changes the geometry and all paint references resolve locally', () => {
  const config = JSON.parse(readFileSync(new URL('../artwork/material.json', import.meta.url), 'utf8'));
  const a = generateMaterial({...config, density: .01});
  const b = generateMaterial({...config, density: .01, seed: config.seed + 1});
  assert.notEqual(a.defs, b.defs);
  assert.notEqual(a.grain, b.grain);
  const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  for (const match of svg.matchAll(/url\(#([^)]*)\)/g)) assert.ok(ids.has(match[1]), `Unresolved paint: ${match[1]}`);
  assert.ok(ids.has('foil-facets-1') && ids.has('paper-fibers') && ids.has('gold-micrograin'));
});

test('flake tiles repeat at unrelated sizes and draw every tone from dark to light', () => {
  const config = JSON.parse(readFileSync(new URL('../artwork/material.json', import.meta.url), 'utf8'));
  const tiles = [...svg.matchAll(/<pattern id="foil-facets-\d" width="(\d+)" height="(\d+)"[^>]*>([\s\S]*?)<\/pattern>/g)];
  assert.equal(tiles.length, 3);
  const sizes = tiles.flatMap(tile => [Number(tile[1]), Number(tile[2])]);
  assert.equal(new Set(sizes).size, sizes.length, 'No two tile sides match, so the tiles never line up');
  const tones = tiles.flatMap(tile => [...tile[3].matchAll(/<path fill="([^"]+)"/g)].map(m => m[1]));
  assert.deepEqual(tones, config.facets, 'Light flakes land on top of dark ones');
  const fills = svg.match(/<g id="gold-foil-facets"[^>]*>([\s\S]*?)<\/g>/)[1].match(/url\(#[^)]+\)/g);
  assert.deepEqual(fills, ['url(#foil-facets-1)', 'url(#foil-facets-2)', 'url(#foil-facets-3)']);
});
