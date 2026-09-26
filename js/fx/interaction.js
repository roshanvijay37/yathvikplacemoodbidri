// Phone tilt (look around by tilting the phone) and tap points in the scene
// that open a small card with the chapter's call button.

import * as THREE from 'three';

// Maps device tilt to the same -0.5..0.5 look offset the mouse gives on
// desktop. iOS only reports orientation after the visitor allows it, which it
// asks for on the first tap; Android reports it straight away.
export function startTilt(target, reducedMotion) {
  if (!('DeviceOrientationEvent' in window) || !window.matchMedia('(pointer: coarse)').matches) return;
  let base = null;
  const onOrient = (e) => {
    if (reducedMotion.matches || e.gamma == null || e.beta == null) return;
    if (!base) base = { g: e.gamma, b: e.beta };
    const gx = THREE.MathUtils.clamp((e.gamma - base.g) / 50, -0.5, 0.5);
    const by = THREE.MathUtils.clamp((e.beta - base.b) / 40, -0.5, 0.5);
    target.set(gx, by);
  };
  const listen = () => window.addEventListener('deviceorientation', onOrient, { passive: true });
  const DOE = window.DeviceOrientationEvent;
  if (typeof DOE.requestPermission === 'function') {
    const ask = () => {
      DOE.requestPermission().then((r) => { if (r === 'granted') listen(); }).catch(() => {});
      window.removeEventListener('touchend', ask);
    };
    window.addEventListener('touchend', ask, { once: true, passive: true });
  } else {
    listen();
  }
  // re-centre when the phone is put down and picked up differently
  document.addEventListener('visibilitychange', () => { base = null; });
}

// items: [{ chapter, pos: [x,y,z], label, action, tel }]
export function createHotspots(items, camera) {
  if (!items || !items.length) return { update() {} };
  const layer = document.createElement('div');
  layer.className = 'hotspots';
  document.body.appendChild(layer);
  const v = new THREE.Vector3();
  const spots = items.map((it, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'hotspot';
    const id = `hotspot-card-${i}`;
    wrap.innerHTML = `
      <button type="button" class="hotspot-dot" aria-expanded="false" aria-controls="${id}" aria-label="${it.label}"><span aria-hidden="true"></span></button>
      <div class="hotspot-card" id="${id}" role="group" aria-label="${it.label}">
        <p>${it.label}</p>
        <a class="btn" href="tel:${it.tel}" data-track="call" data-where="hotspot-${it.id}">${it.action}</a>
      </div>`;
    const btn = wrap.querySelector('button');
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      spots.forEach((s) => { s.btn.setAttribute('aria-expanded', 'false'); s.wrap.classList.remove('open'); });
      btn.setAttribute('aria-expanded', String(open));
      wrap.classList.toggle('open', open);
    });
    layer.appendChild(wrap);
    return { ...it, wrap, btn, world: new THREE.Vector3(...it.pos) };
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') spots.forEach((s) => { s.btn.setAttribute('aria-expanded', 'false'); s.wrap.classList.remove('open'); }); });

  return {
    update(chapter, w, h) {
      const panel = document.querySelector('.chapter.is-active .panel');
      const pr = panel ? panel.getBoundingClientRect() : null;
      for (const s of spots) {
        v.copy(s.world).project(camera);
        const x = (v.x * 0.5 + 0.5) * w, y = (1 - (v.y * 0.5 + 0.5)) * h;
        let show = s.chapter === chapter && v.z < 1 && x > 24 && x < w - 24 && y > 90 && y < h - 110;
        if (show && pr) show = !(x > pr.left - 30 && x < pr.right + 30 && y > pr.top - 30 && y < pr.bottom + 30);
        s.wrap.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        if (s.wrap.classList.contains('show') !== show) {
          s.wrap.classList.toggle('show', show);
          s.btn.tabIndex = show ? 0 : -1;
          if (!show) { s.btn.setAttribute('aria-expanded', 'false'); s.wrap.classList.remove('open'); }
        }
      }
    },
  };
}
