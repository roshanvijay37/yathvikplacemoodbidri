// Yathvik Place: film tour (test page).
// Clips load only when their chapter comes near, and only the clips on screen
// play. Portrait screens get 4:5 phone cuts (…-m.mp4), others 16:9.
(() => {
  const MEDIA = 'media/';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const portrait = matchMedia('(max-aspect-ratio: 1/1)').matches;
  const autoplay = !reduced && !saveData;
  const sfx = portrait ? '-m' : '';
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  /* ---------- hero title: letter by letter ---------- */
  document.querySelectorAll('[data-split]').forEach((el) => {
    const text = el.textContent;
    el.textContent = '';
    [...text].forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'ch-l';
      s.style.setProperty('--i', i + (el.classList.contains('word-italic') ? 4 : 0));
      s.textContent = c;
      s.setAttribute('aria-hidden', 'true');
      el.appendChild(s);
    });
  });

  /* ---------- clips ---------- */
  const sections = [...document.querySelectorAll('[data-clip]')];
  const clips = sections.map((sec) => {
    const video = sec.querySelector('video');
    const name = sec.dataset.clip;
    const c = { sec, video, name, loaded: false, visible: false, btn: null };
    if (!autoplay) addPlayButton(c);
    return c;
  });

  function load(c) {
    if (c.loaded) return;
    c.loaded = true;
    c.video.preload = 'auto';
    c.video.src = MEDIA + c.name + sfx + '.mp4';
  }
  function addPlayButton(c) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'play';
    b.setAttribute('aria-label', 'Play the clip');
    b.addEventListener('click', () => { load(c); c.video.play().catch(() => {}); b.hidden = true; });
    (c.sec.querySelector('.stage') || c.sec).appendChild(b);
    c.btn = b;
  }
  function play(c) {
    if (!autoplay) return;
    load(c);
    const p = c.video.play();
    if (p && p.catch) p.catch(() => { if (!c.btn) addPlayButton(c); c.btn.hidden = false; });
  }

  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const c = clips.find((x) => x.sec === e.target);
      if (!c.video.poster) c.video.poster = MEDIA + c.name + sfx + '.webp';
      if (autoplay) load(c);
    }
  }, { rootMargin: '120% 0px' });
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const c = clips.find((x) => x.sec === e.target);
      c.visible = e.isIntersecting;
      if (c.visible) play(c); else c.video.pause();
    }
  }, { threshold: 0.12 });
  clips.forEach((c) => { near.observe(c.sec); seen.observe(c.sec); });
  document.addEventListener('visibilitychange', () => {
    for (const c of clips) if (document.hidden) c.video.pause(); else if (c.visible) play(c);
  });

  /* ---------- opening curtain ---------- */
  const curtain = document.getElementById('curtain');
  const hero = clips[0];
  hero.video.poster = MEDIA + 'hero' + sfx + '.webp';
  if (autoplay) load(hero);
  const t0 = performance.now();
  let opened = false;
  function open() {
    if (opened) return;
    opened = true;
    const wait = reduced ? 0 : Math.max(0, 2100 - (performance.now() - t0));
    setTimeout(() => {
      curtain.classList.add('gone');
      document.body.classList.add('is-open');
    }, wait);
  }
  if (!autoplay) open();
  else {
    hero.video.addEventListener('canplay', open, { once: true });
    setTimeout(open, 4500); // never hold the page for a slow connection
  }

  /* ---------- scroll: chapters open, words rise ---------- */
  const bar = document.getElementById('progress');
  const counter = document.getElementById('counter');
  const heroSec = document.querySelector('.hero');
  const chapters = [...document.querySelectorAll('.ch')];
  let ticking = false;
  function frame() {
    ticking = false;
    const vh = innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    heroSec.style.setProperty('--hs', clamp01(scrollY / vh).toFixed(3));
    let current = '00';
    for (const sec of chapters) {
      const r = sec.getBoundingClientRect();
      if (r.bottom < -vh * 0.2 || r.top > vh * 1.2) continue;
      const enter = clamp01((vh - r.top) / vh);            // 0 → top at the bottom edge, 1 → docked
      const run = clamp01(-r.top / Math.max(1, r.height - vh)); // how far through while docked
      const text = clamp01((enter - 0.55) / 0.45) * (1 - clamp01((run - 0.86) / 0.14));
      sec.style.setProperty('--c', reduced ? 0 : (1 - ease(enter)).toFixed(4));
      sec.style.setProperty('--k', run.toFixed(4));
      sec.style.setProperty('--t', reduced ? 1 : ease(text).toFixed(4));
      if (r.top <= vh * 0.5) current = sec.dataset.n;
    }
    counter.textContent = current;
  }
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  frame();

  /* ---------- stills ---------- */
  const STILLS = [
    ['facade', 'The front'],
    ['drone', 'From above'],
    ['reception', 'Reception'],
    ['lounge', 'The lounge'],
    ['foodies', 'The restaurant'],
    ['restaurant', 'The dining room'],
    ['dining-dark', 'Round mirrors, low light'],
    ['booth-red', 'A corner booth'],
    ['gold-wall', 'Gold on black'],
    ['booths', 'Booth seating'],
    ['room', 'A stay room'],
    ['room-view', 'Palms outside the window'],
    ['arch', 'Opening-day flowers'],
    ['planet', 'Moodbidri, from the sky'],
  ];
  const strip = document.getElementById('strip');
  STILLS.forEach(([file, cap], i) => {
    const li = document.createElement('li');
    li.innerHTML =
      `<figure style="margin:0"><button type="button" aria-label="Open photo: ${cap}">` +
      `<img src="stills/${file}-800.webp" alt="${cap}" loading="lazy" decoding="async" width="800" height="450"></button>` +
      `<figcaption><b>${String(i + 1).padStart(2, '0')}</b>${cap}</figcaption></figure>`;
    li.querySelector('button').addEventListener('click', () => { if (!dragged) show(i); });
    strip.appendChild(li);
  });
  new IntersectionObserver((es, o) => {
    if (es[0].isIntersecting) { strip.classList.add('in'); o.disconnect(); }
  }, { threshold: 0.15 }).observe(strip);

  // drag to scroll with a mouse (touch scrolls natively)
  let down = false, dragged = false, sx = 0, sl = 0;
  strip.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    down = true; dragged = false; sx = e.clientX; sl = strip.scrollLeft;
  });
  addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 5) { dragged = true; strip.classList.add('dragging'); }
    if (dragged) strip.scrollLeft = sl - dx;
  });
  addEventListener('pointerup', () => {
    if (!down) return;
    down = false; strip.classList.remove('dragging');
    setTimeout(() => { dragged = false; }, 0);
  });

  /* ---------- lightbox ---------- */
  const lb = document.getElementById('lightbox');
  const lbImg = lb.querySelector('img');
  const lbCap = lb.querySelector('.lb-cap');
  let idx = 0;
  function show(i) {
    idx = (i + STILLS.length) % STILLS.length;
    const [file, cap] = STILLS[idx];
    lbImg.src = `stills/${file}.webp`;
    lbImg.alt = cap;
    lbCap.textContent = cap;
    if (!lb.open) { lb.showModal(); document.body.classList.add('locked'); }
  }
  lb.addEventListener('close', () => document.body.classList.remove('locked'));
  lb.querySelector('.lb-prev').addEventListener('click', () => show(idx - 1));
  lb.querySelector('.lb-next').addEventListener('click', () => show(idx + 1));
  lb.querySelector('.lb-close').addEventListener('click', () => lb.close());
  lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });
  let tx = null;
  lb.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
    tx = null;
  });
})();
