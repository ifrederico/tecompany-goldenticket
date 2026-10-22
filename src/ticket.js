/** Pointer-driven tilt, SVG lighting, and shadow for the golden ticket. */
export function initGoldenTicket(root = document) {
  const stage = root.querySelector('#stage');
  const card = root.querySelector('#ticket');
  const light = root.querySelector('#surface-light');
  const sheen = root.querySelector('#surface-sheen');
  const spotlight = root.querySelector('#surface-spotlight');
  const goldFoil = root.querySelector('#foil-gold');
  const silverFoil = root.querySelector('#foil-silver');
  const hiddenLight = root.querySelector('#hidden-light');
  const hiddenLines = root.querySelector('#hidden-motifs-light');
  const glintLight = root.querySelector('#glint-light');
  // Glint facets and their tiles. A tile is drawn only while it can catch the light.
  const glintReach = Number(root.querySelector('#paper-glints').dataset.reach);
  const glints = [...root.querySelectorAll('.paper-glint')].map(facet => ({
    facet,
    tiles: [...facet.children].map(tile => ({ tile, x: Number(tile.dataset.x), y: Number(tile.dataset.y) })),
  }));
  const foilSheens = [...root.querySelectorAll('.foil-sheen')];
  const toggle = root.querySelector('#motion-toggle');
  const download = root.querySelector('#download-vector');
  const inlineArt = root.querySelector('svg.artwork');
  // Download the inline SVG itself, so the portable HTML needs no separate file.
  const vectorDownloadUrl = inlineArt && download
    ? URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(inlineArt)], { type: 'image/svg+xml' }))
    : null;
  if (vectorDownloadUrl) download.href = vectorDownloadUrl;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const listenerOptions = { signal: events.signal };
  const current = { rx: 0, ry: 0, x: .5, y: .5, light: 0 };
  const target = { ...current };
  const velocity = { rx: 0, ry: 0, x: 0, y: 0, light: 0 };
  // Spring frequencies (rad/s): responsive while following, unhurried on return.
  const FOLLOW = 12;
  const SETTLE = 6;
  // Maximum tilt in degrees: a restrained lean toward the pointer.
  const TILT_X = 5;
  const TILT_Y = 7;
  // How close (CSS px) a mouse or pen must come to the card's edge to wake it.
  const REACH = 50;
  // Paper sparkle: the brightest a glint facet ever gets.
  const GLINT = .6;
  let omega = FOLLOW;
  let enabled = !reducedMotion.matches;
  let frame = 0;
  let lastTime = 0;
  let touchId = null;
  let bounds;

  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

  // Show or skip an element, touching the DOM only when that changes.
  function draw(item, element, on) {
    if (item.drawn === on) return;
    item.drawn = on;
    element.style.display = on ? '' : 'none';
  }

  function renderLight() {
    // Light travel follows the normalized tilt, so a gentle lean still moves
    // the sheen and reflections across the whole ticket.
    const lean = current.ry / TILT_Y;
    const pitch = current.rx / TILT_X;
    const shift = (lean * .192 - pitch * .104) * 1848;
    sheen.setAttribute('x1', String(1848 * .12 + shift));
    sheen.setAttribute('x2', String(1848 * .88 + shift));
    spotlight.setAttribute('cx', String(current.x * 1848));
    spotlight.setAttribute('cy', String(current.y * 772));
    // Move the paint inside the actual artwork. Its shared user-space gradient
    // keeps reflections continuous across separate paths and letter outlines.
    const cx = 20 + current.x * 1848;
    const cy = 26 + current.y * 772;
    const angle = .495 + lean * .192 - pitch * .091;
    for (const [gradient, span] of [[goldFoil, 1115], [silverFoil, 1505]]) {
      const dx = Math.cos(angle) * span / 2;
      const dy = Math.sin(angle) * span / 2;
      gradient.setAttribute('x1', (cx - dx).toFixed(2));
      gradient.setAttribute('y1', (cy - dy).toFixed(2));
      gradient.setAttribute('x2', (cx + dx).toFixed(2));
      gradient.setAttribute('y2', (cy + dy).toFixed(2));
    }
    // The hidden outlines only appear inside the pool of light under the pointer.
    hiddenLight.setAttribute('cx', cx.toFixed(2));
    hiddenLight.setAttribute('cy', cy.toFixed(2));
    // At rest the inks are flat; reflections fade in only while the light is on.
    const amount = clamp(current.light, 0, 1);
    hiddenLines.style.opacity = String(amount);
    for (const foil of foilSheens) foil.style.opacity = String(amount);
    // Each glint facet faces its own way: it flashes briefly each time the
    // light crosses its angle, so only a few sparkle at once, under the light.
    // Dark facets and tiles beyond the pool are skipped: shading the gradient
    // over the whole ticket for every facet costs half the frame rate.
    glintLight.setAttribute('cx', cx.toFixed(2));
    glintLight.setAttribute('cy', cy.toFixed(2));
    glints.forEach((glint, i) => {
      const travel = Math.cos(i * 2.4) * cx + Math.sin(i * 2.4) * cy;
      const glance = ((1 + Math.cos(travel / 48 + i * 1.7)) / 2) ** 8;
      const level = amount * glance * GLINT;
      glint.facet.style.fillOpacity = level.toFixed(3);
      draw(glint, glint.facet, level >= .005);
      if (glint.drawn) for (const tile of glint.tiles) draw(tile, tile.tile, Math.hypot(tile.x - cx, tile.y - cy) < glintReach);
    });
  }

  // The shadow reaches toward whichever edge lifts off the page: longer, softer
  // and a touch deeper there, tighter where the ticket presses down. With no
  // lift it equals the resting shadow in styles.css.
  function shadowFor(lx, ly) {
    const lift = Math.min(Math.hypot(lx, ly), 1);
    const px = n => `${n.toFixed(2)}px`;
    return [
      `${px(lx * .5)} ${px(1 + ly * .5)} ${px(1.5 + lift)} rgba(60, 40, 20, .06)`,
      `${px(lx * 1.5)} ${px(2 + ly * 1.5)} ${px(4 + lift * 3)} rgba(60, 40, 20, .07)`,
      `${px(lx * 5)} ${px(10 + ly * 6)} ${px(22 + lift * 10)} -12px rgba(60, 40, 20, ${(.22 + lift * .06).toFixed(3)})`,
    ].join(', ');
  }

  function paint() {
    const resting = current.light === 0 && current.rx === 0 && current.ry === 0;
    card.style.transform = resting ? 'none' : `rotateX(${current.rx.toFixed(3)}deg) rotateY(${current.ry.toFixed(3)}deg)`;
    // Leaning right lifts the left edge; leaning toward the top lifts the bottom.
    card.style.boxShadow = resting ? '' : shadowFor(-current.ry / TILT_Y, current.rx / TILT_X);
    light.style.opacity = String(current.light * .6);
    stage.dataset.active = String(!resting);
    renderLight();
  }

  function tick(now) {
    const dt = (lastTime ? Math.min(now - lastTime, 50) : 1000 / 60) / 1000;
    lastTime = now;
    // A critically damped spring, solved exactly for each frame: identical on
    // 60 Hz and 120 Hz displays, no overshoot from rest, and the card keeps its
    // momentum when the pointer leaves instead of snapping into a new motion.
    const decay = Math.exp(-omega * dt);
    let settled = true;
    for (const key of Object.keys(current)) {
      const offset = current[key] - target[key];
      const drift = (velocity[key] + omega * offset) * dt;
      current[key] = target[key] + (offset + drift) * decay;
      velocity[key] = (velocity[key] - omega * drift) * decay;
      const epsilon = key === 'rx' || key === 'ry' ? .005 : .0005;
      if (Math.abs(target[key] - current[key]) > epsilon || Math.abs(velocity[key]) > epsilon * 10) settled = false;
    }
    if (settled) {
      Object.assign(current, target);
      for (const key of Object.keys(velocity)) velocity[key] = 0;
    }
    paint();
    frame = settled ? 0 : requestAnimationFrame(tick);
    if (settled) lastTime = 0;
  }

  function wake() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function reset(immediate = false) {
    Object.assign(target, { rx: 0, ry: 0, x: .5, y: .5, light: 0 });
    omega = SETTLE;
    if (immediate) {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      Object.assign(current, target);
      for (const key of Object.keys(velocity)) velocity[key] = 0;
      paint();
    } else wake();
  }

  function syncToggle() {
    toggle.textContent = reducedMotion.matches ? 'Reduced motion' : enabled ? 'Motion on' : 'Motion off';
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.disabled = reducedMotion.matches;
  }

  function measure() {
    bounds = stage.getBoundingClientRect();
    paint();
  }

  // Turn toward the light at (x, y), in card units. Presence fades the whole
  // response, and slows the spring, as the pointer moves away from the card.
  function point(x, y, presence = 1) {
    const tiltX = clamp(x, 0, 1) * 2 - 1;
    const tiltY = clamp(y, 0, 1) * 2 - 1;
    Object.assign(target, { rx: -tiltY * TILT_X * presence, ry: tiltX * TILT_Y * presence, x, y, light: presence });
    omega = SETTLE + (FOLLOW - SETTLE) * presence;
    wake();
  }

  // Mouse and pen wake the ticket as they approach; no need to be on top of it.
  function approach(event) {
    if (!enabled || event.pointerType === 'touch') return;
    const dx = Math.max(bounds.left - event.clientX, 0, event.clientX - bounds.right);
    const dy = Math.max(bounds.top - event.clientY, 0, event.clientY - bounds.bottom);
    const t = Math.min(Math.hypot(dx, dy) / REACH, 1);
    const presence = 1 - t * t * (3 - 2 * t);
    if (presence === 0) {
      if (target.light !== 0) reset();
      return;
    }
    point(
      clamp((event.clientX - bounds.left) / bounds.width, -.2, 1.2),
      clamp((event.clientY - bounds.top) / bounds.height, -.2, 1.2),
      presence,
    );
  }

  function aimTouch(event) {
    if (!enabled || event.pointerType !== 'touch' || event.pointerId !== touchId) return;
    point(
      clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    );
  }

  function finishTouch(event) {
    if (event.pointerId !== touchId) return;
    if (stage.hasPointerCapture(touchId)) stage.releasePointerCapture(touchId);
    touchId = null;
    reset();
  }

  document.addEventListener('pointermove', approach, { ...listenerOptions, passive: true });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget && touchId === null) reset(); }, listenerOptions);
  stage.addEventListener('pointermove', aimTouch, { ...listenerOptions, passive: true });
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !enabled) return;
    touchId = event.pointerId;
    bounds = stage.getBoundingClientRect();
    stage.setPointerCapture(touchId);
    aimTouch(event);
  }, listenerOptions);
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(name, finishTouch, listenerOptions);
  stage.addEventListener('keydown', event => {
    if (event.key === 'Escape') { reset(); return; }
    if (!enabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const dx = event.key === 'ArrowLeft' ? -.12 : event.key === 'ArrowRight' ? .12 : 0;
    const dy = event.key === 'ArrowUp' ? -.12 : event.key === 'ArrowDown' ? .12 : 0;
    point(clamp(target.x + dx, 0, 1), clamp(target.y + dy, 0, 1));
  }, listenerOptions);
  stage.addEventListener('blur', () => reset(), listenerOptions);
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    reset(true);
    syncToggle();
  }, listenerOptions);
  reducedMotion.addEventListener('change', () => {
    enabled = !reducedMotion.matches;
    reset(true);
    syncToggle();
  }, listenerOptions);
  window.addEventListener('blur', () => reset(true), listenerOptions);
  window.addEventListener('resize', measure, listenerOptions);
  window.addEventListener('scroll', () => {
    bounds = stage.getBoundingClientRect();
    reset(true);
  }, { ...listenerOptions, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(true); }, listenerOptions);
  const observer = new ResizeObserver(measure);
  observer.observe(stage);
  measure();
  syncToggle();

  return () => {
    events.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
    if (vectorDownloadUrl) URL.revokeObjectURL(vectorDownloadUrl);
  };
}
