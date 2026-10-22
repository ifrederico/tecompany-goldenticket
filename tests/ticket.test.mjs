import test from 'node:test';
import assert from 'node:assert/strict';
import { initGoldenTicket } from '../src/ticket.js';

// Exercise lifecycle behavior without depending on a particular display or GPU.
function fixture(reduced = false) {
  class Element extends EventTarget {
    style = {};
    dataset = {};
    children = [];
    attributes = {};
    captures = new Set();
    setAttribute(name, value) { this.attributes[name] = value; }
    getBoundingClientRect() { return { left: 100, top: 100, right: 1100, bottom: 540, width: 1000, height: 440 }; }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
  }
  const elements = Object.fromEntries(['stage', 'ticket', 'surface-light', 'surface-sheen', 'surface-spotlight', 'foil-gold', 'foil-silver', 'hidden-light', 'hidden-motifs-light', 'glint-light', 'paper-glints', 'motion-toggle'].map(id => [id, new Element()]));
  const sheens = [new Element(), new Element()];
  // Each facet has a tile near the left of the ticket and one at the far right.
  const glints = Array.from({ length: 12 }, () => Object.assign(new Element(), {
    children: [[300, 400], [1700, 400]].map(([x, y]) => Object.assign(new Element(), { dataset: { x: String(x), y: String(y) } })),
  }));
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    querySelector: selector => elements[selector.slice(1)],
    querySelectorAll: selector => selector === '.foil-sheen' ? sheens : selector === '.paper-glint' ? glints : [],
  });
  elements.document = doc;
  elements['paper-glints'].dataset.reach = '448';
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const win = Object.assign(new EventTarget(), { matchMedia: () => media });
  const frames = new Map();
  let nextFrame = 1;
  let clock = 0;
  const replacements = {
    document: doc,
    window: win,
    requestAnimationFrame: callback => { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class { observe() {} disconnect() {} },
  };
  const previous = Object.fromEntries(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, replacements);
  const destroy = initGoldenTicket(doc);
  return {
    elements, media, frames, sheens, glints,
    send(id, type, properties = {}) {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, properties);
      elements[id].dispatchEvent(event);
      return event;
    },
    step() {
      const pending = [...frames.values()];
      frames.clear();
      clock += 1000 / 60;
      for (const callback of pending) callback(clock);
    },
    flush() {
      let count = 0;
      while (frames.size && count++ < 1000) this.step();
      assert.equal(frames.size, 0, 'Animation must stop when settled');
    },
    cleanup() {
      destroy();
      assert.equal(frames.size, 0);
      for (const key of Object.keys(replacements)) {
        if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
        else delete globalThis[key];
      }
    },
  };
}

test('motion settles, returns exactly to the original, and can be disabled', () => {
  const f = fixture();
  try {
    assert.equal(f.elements.ticket.style.transform, 'none');
    assert.equal(f.frames.size, 0, 'No idle animation loop');
    f.send('document', 'pointermove', { clientX: 950, clientY: 180, pointerType: 'mouse' });
    f.flush();
    assert.notEqual(f.elements.ticket.style.transform, 'none');
    assert.equal(f.elements['surface-light'].style.opacity, '0.6');
    assert.equal(f.elements['surface-spotlight'].attributes.cx, String(.85 * 1848));
    assert.equal(f.elements['surface-spotlight'].attributes.cy, String((80 / 440) * 772));
    f.send('document', 'pointerout', { relatedTarget: null });
    f.flush();
    assert.equal(f.elements.ticket.style.transform, 'none');
    assert.equal(f.elements['surface-light'].style.opacity, '0');
    assert.equal(f.elements.stage.dataset.active, 'false');
    f.send('motion-toggle', 'click');
    f.send('document', 'pointermove', { clientX: 950, clientY: 180, pointerType: 'mouse' });
    assert.equal(f.frames.size, 0);
    assert.equal(f.elements['motion-toggle'].attributes['aria-pressed'], 'false');
  } finally { f.cleanup(); }
});

test('leaving the ticket eases it back to rest instead of snapping', () => {
  const f = fixture();
  try {
    const tilt = () => Number(f.elements.ticket.style.transform.match(/rotateY\(([-\d.]+)deg\)/)[1]);
    f.send('document', 'pointermove', { clientX: 1100, clientY: 540, pointerType: 'mouse' });
    f.flush();
    const start = tilt();
    f.send('document', 'pointermove', { clientX: 2000, clientY: 540, pointerType: 'mouse' });
    f.step();
    assert.ok(tilt() > start * .98, 'The return starts gently');
    for (let i = 0; i < 18; i++) f.step();
    assert.ok(tilt() < start * .7 && tilt() > start * .2, 'The return is unhurried but under way after 300 ms');
    f.flush();
    assert.equal(f.elements.ticket.style.transform, 'none');
  } finally { f.cleanup(); }
});

test('the card wakes as the pointer approaches, before it is on top of it', () => {
  const f = fixture();
  try {
    const tilt = () => Number(f.elements.ticket.style.transform.match(/rotateY\(([-\d.]+)deg\)/)[1]);
    // 25 px right of the card: halfway into the 50 px reach.
    f.send('document', 'pointermove', { clientX: 1125, clientY: 320, pointerType: 'mouse' });
    f.flush();
    const presence = .5;
    assert.ok(Math.abs(tilt() - 7 * presence) < .01, 'Tilt is proportional to proximity');
    assert.ok(Math.abs(Number(f.elements['surface-light'].style.opacity) - .6 * presence) < .001);
    f.send('document', 'pointermove', { clientX: 1160, clientY: 320, pointerType: 'mouse' });
    f.flush();
    assert.equal(f.elements.ticket.style.transform, 'none', 'Beyond 50 px, the card rests');
    f.send('document', 'pointermove', { clientX: 1300, clientY: 320, pointerType: 'mouse' });
    assert.equal(f.frames.size, 0, 'Far pointer movement does not animate a resting card');
  } finally { f.cleanup(); }
});

test('hidden outlines appear only in the light under the pointer and vanish at rest', () => {
  const f = fixture();
  try {
    const lines = f.elements['hidden-motifs-light'];
    const light = f.elements['hidden-light'];
    f.send('document', 'pointermove', { clientX: 300, clientY: 450, pointerType: 'mouse' });
    f.flush();
    assert.equal(lines.style.opacity, '1');
    assert.equal(light.attributes.cx, (20 + .2 * 1848).toFixed(2));
    assert.equal(light.attributes.cy, (26 + (350 / 440) * 772).toFixed(2));
    f.send('document', 'pointerout', { relatedTarget: null });
    f.flush();
    assert.equal(lines.style.opacity, '0');
  } finally { f.cleanup(); }
});

test('the paper sparkles faintly, a few glints at a time, only under the light', () => {
  const f = fixture();
  try {
    const levels = () => f.glints.map(glint => Number(glint.style.fillOpacity));
    const drawn = element => element.style.display !== 'none';
    assert.ok(levels().every(level => level === 0), 'No glints at rest');
    assert.ok(!f.glints.some(drawn), 'Nothing is drawn at rest');
    f.send('document', 'pointermove', { clientX: 300, clientY: 450, pointerType: 'mouse' });
    f.flush();
    const here = levels();
    assert.equal(f.elements['glint-light'].attributes.cx, f.elements['hidden-light'].attributes.cx, 'Glints share the pool of light');
    assert.ok(Math.max(...here) > .2 && Math.max(...here) <= .6, 'Faint, never bright');
    assert.ok(here.filter(level => level < .05).length >= 6, 'Most facets stay dark at any moment');
    for (const [i, glint] of f.glints.entries()) {
      assert.equal(drawn(glint), here[i] >= .005, 'Only lit facets are drawn');
      if (drawn(glint)) assert.deepEqual(glint.children.map(drawn), [true, false], 'Only tiles in the pool of light are drawn');
    }
    f.send('document', 'pointermove', { clientX: 330, clientY: 460, pointerType: 'mouse' });
    f.flush();
    assert.notDeepEqual(levels(), here, 'A small movement shifts which glints catch the light');
    f.send('document', 'pointerout', { relatedTarget: null });
    f.flush();
    assert.ok(levels().every(level => level === 0), 'Glints vanish at rest');
    assert.ok(!f.glints.some(drawn));
  } finally { f.cleanup(); }
});

test('the shadow reaches toward the lifted edge and returns to the resting shadow', () => {
  const f = fixture();
  try {
    const card = f.elements.ticket;
    const fall = () => card.style.boxShadow.match(/([-\d.]+)px ([-\d.]+)px ([-\d.]+)px -12px/).slice(1).map(Number);
    assert.equal(card.style.boxShadow, '', 'At rest the stylesheet shadow applies');
    // Top-left presses that corner down and lifts the bottom-right.
    f.send('document', 'pointermove', { clientX: 110, clientY: 110, pointerType: 'mouse' });
    f.flush();
    const [x1, y1, blur1] = fall();
    assert.ok(x1 > 3 && y1 > 13 && blur1 > 28, 'Longer and softer toward the bottom-right');
    // Bottom-right lifts the top-left instead.
    f.send('document', 'pointermove', { clientX: 1090, clientY: 530, pointerType: 'mouse' });
    f.flush();
    const [x2, y2] = fall();
    assert.ok(x2 < -3 && y2 < 7, 'The shadow moves toward the top-left');
    f.send('document', 'pointerout', { relatedTarget: null });
    f.flush();
    assert.equal(card.style.boxShadow, '');
  } finally { f.cleanup(); }
});

test('touch requires contact and resets on cancellation; keyboard Escape resets', () => {
  const f = fixture();
  try {
    const touch = { clientX: 950, clientY: 180, pointerType: 'touch', pointerId: 7 };
    f.send('stage', 'pointermove', touch);
    f.send('document', 'pointermove', touch);
    assert.equal(f.frames.size, 0);
    f.send('stage', 'pointerdown', touch);
    f.flush();
    assert.equal(f.elements['surface-light'].style.opacity, '0.6');
    f.send('stage', 'pointercancel', touch);
    f.flush();
    assert.equal(f.elements.ticket.style.transform, 'none');
    assert.equal(f.elements.stage.hasPointerCapture(7), false);
    const key = f.send('stage', 'keydown', { key: 'ArrowRight' });
    f.flush();
    assert.equal(key.defaultPrevented, true);
    assert.notEqual(f.elements.ticket.style.transform, 'none');
    f.send('stage', 'keydown', { key: 'Escape' });
    f.flush();
    assert.equal(f.elements.ticket.style.transform, 'none');
  } finally { f.cleanup(); }
});

test('reduced motion disables interaction and live preference changes reset motion', () => {
  const f = fixture(true);
  try {
    assert.equal(f.elements['motion-toggle'].disabled, true);
    f.send('document', 'pointermove', { clientX: 950, clientY: 180, pointerType: 'mouse' });
    assert.equal(f.frames.size, 0);
    f.media.matches = false;
    f.media.dispatchEvent(new Event('change'));
    f.send('stage', 'keydown', { key: 'ArrowRight' });
    assert.ok(f.frames.size);
    f.media.matches = true;
    f.media.dispatchEvent(new Event('change'));
    assert.equal(f.frames.size, 0);
    assert.equal(f.elements.ticket.style.transform, 'none');
    assert.equal(f.elements['surface-light'].style.opacity, '0');
  } finally { f.cleanup(); }
});

test('inks are flat at rest; gold and silver reflections travel with the light and reset', () => {
  const f = fixture();
  try {
    for (const sheen of f.sheens) assert.equal(sheen.style.opacity, '0', 'No frozen reflection at rest');
    const gold = f.elements['foil-gold'];
    const silver = f.elements['foil-silver'];
    const restGold = { ...gold.attributes };
    const restSilver = { ...silver.attributes };
    const centerX = el => (Number(el.attributes.x1) + Number(el.attributes.x2)) / 2;
    f.send('document', 'pointermove', {clientX: 200, clientY: 180, pointerType: 'mouse'});
    f.flush();
    const left = centerX(gold);
    f.send('document', 'pointermove', {clientX: 1000, clientY: 480, pointerType: 'mouse'});
    f.flush();
    for (const sheen of f.sheens) assert.equal(sheen.style.opacity, '1');
    assert.ok(centerX(gold) > left + 1000, 'The reflection must cross the artwork with the pointer');
    assert.ok(Math.abs(centerX(gold) - centerX(silver)) < .02, 'Both metals share the same light position');
    assert.notDeepEqual(gold.attributes, silver.attributes, 'Gold and silver use different reflection widths');
    f.send('document', 'pointerout', { relatedTarget: null });
    f.flush();
    assert.deepEqual(gold.attributes, restGold);
    assert.deepEqual(silver.attributes, restSilver);
    for (const sheen of f.sheens) assert.equal(sheen.style.opacity, '0');
    f.send('motion-toggle', 'click');
    f.send('document', 'pointermove', {clientX: 1000, clientY: 480, pointerType: 'mouse'});
    assert.deepEqual(gold.attributes, restGold);
    assert.equal(f.frames.size, 0);
  } finally { f.cleanup(); }
});
