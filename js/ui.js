// Builds the page from content.js and reports scroll progress in chapter units.
// Knows nothing about the 3D scene.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON_PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
const ICON_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';

function photos(images) {
  if (!images || !images.length) return '';
  return `<div class="photos">${images.map((im) =>
    `<img src="${esc(im.src)}" alt="${esc(im.alt || '')}" loading="lazy" decoding="async"${im.width ? ` width="${im.width}" height="${im.height}"` : ''}>`
  ).join('')}</div>`;
}

// Room types: one card each; tapping opens that room's photos (see openGallery).
function rooms(list) {
  if (!list || !list.length) return '';
  return `<div class="photos rooms">${list.map((r, i) =>
    `<button type="button" class="room-card" data-room="${i}" aria-label="${esc(r.name)}: see ${r.images.length} photos">`
    + `<img src="${esc(r.card)}" alt="" loading="lazy" decoding="async" width="720" height="480">`
    + `<span class="room-name">${esc(r.name)}</span><span class="room-count">${r.images.length} photos</span></button>`
  ).join('')}</div>`;
}

function heroSection(c) {
  return `
  <section class="chapter chapter--hero" id="arrival" data-stop="0" data-mood="day">
    <div class="sticky">
      <div class="hero-copy">
        <p class="kicker">${esc(c.hero.kicker)}</p>
        <h1><span class="w1" translate="no">Yathvik</span> <span class="w2" translate="no">Place</span><span class="sr">, Moodbidri</span></h1>
        <p class="lede">${esc(c.hero.lede)}</p>
        <p class="cue">${esc(c.hero.cue)}</p>
      </div>
    </div>
  </section>`;
}

function chapterSection(ch, i, c) {
  const phone = c.phones[0];
  return `
  <section class="chapter" id="${esc(ch.id)}" data-stop="${i + 1}" data-mood="${esc(ch.mood)}" aria-labelledby="${esc(ch.id)}-title">
    <div class="sticky">
      <article class="panel panel--${esc(ch.mood)}">
        <p class="kicker"><span class="num">${esc(ch.number)}</span>${esc(ch.kicker)}</p>
        <h2 id="${esc(ch.id)}-title">${esc(ch.title)}</h2>
        <p class="body">${esc(ch.body)}</p>
        ${photos(ch.images)}
        ${rooms(ch.rooms)}
        <p class="note">${esc(ch.note)}</p>
        <div class="actions">
          <a class="btn" href="tel:${esc(phone.tel)}" data-track="call" data-where="${esc(ch.id)}">${ICON_PHONE}${esc(ch.action)}</a>
          ${(ch.links || []).map((l) => `<a class="btn btn-outline" href="${esc(l.href)}" target="_blank" rel="noopener" data-track="social" data-where="${esc(ch.id)}">${esc(l.label)}</a>`).join('')}
        </div>
      </article>
    </div>
  </section>`;
}

function visitSection(c, stop) {
  const v = c.visit;
  return `
  <section class="chapter chapter--visit" id="visit" data-stop="${stop}" data-mood="night" aria-labelledby="visit-title">
    <div class="sticky">
      <article class="panel panel--night panel--visit">
        <p class="kicker">${esc(v.kicker)}</p>
        <h2 id="visit-title">${esc(v.title)}</h2>
        <address><span translate="no">${esc(c.name)}</span><br>${c.address.lines.map(esc).join('<br>')}</address>
        <ul class="phones">
          ${c.phones.map((p) => `<li><a href="tel:${esc(p.tel)}" aria-label="${esc(v.callLabel)} ${esc(p.display)}" data-track="call" data-where="visit">${esc(p.display)}</a></li>`).join('')}
        </ul>
        <p class="email"><a href="mailto:${esc(c.email)}" data-track="email" data-where="visit">${esc(c.email)}</a></p>
        <ul class="social">
          ${c.social.map((s) => `<li><a href="${esc(s.href)}" target="_blank" rel="noopener" data-track="social" data-where="visit">${esc(s.label)} <span>${esc(s.handle)}</span></a></li>`).join('')}
        </ul>
        <div class="actions">
          <a class="btn" href="${esc(c.maps.link)}" target="_blank" rel="noopener" data-track="directions" data-where="visit">${ICON_PIN}${esc(v.directions)}</a>
          <a class="btn btn-outline" href="tel:${esc(c.phones[0].tel)}" data-track="call" data-where="visit">${ICON_PHONE}${esc(v.callLabel)}</a>
        </div>
        <div class="map" data-src="${esc(c.maps.embed)}" data-title="Map showing ${esc(c.name)}, ${esc(c.address.oneLine)}">
          <p class="map-hint">Map loads as you scroll</p>
        </div>
      </article>
    </div>
  </section>`;
}

// ---- Markup builders. Pure functions of content.js, used both here in the
// browser and by tools/build.mjs, which writes their output into index.html
// so the text is in the page source for search engines and link previews.

export function storyHTML(c) {
  return heroSection(c) + c.chapters.map((ch, i) => chapterSection(ch, i, c)).join('') + visitSection(c, c.chapters.length + 1);
}

export function navHTML(c) {
  return [...c.chapters.map((ch) => ({ id: ch.id, label: ch.nav })), { id: 'visit', label: c.visit.nav }]
    .map((l) => `<a href="#${esc(l.id)}" data-target="${esc(l.id)}">${esc(l.label)}</a>`).join('');
}

export function headerActionsHTML(c) {
  return `<a class="btn top-directions" href="${esc(c.maps.link)}" target="_blank" rel="noopener" data-track="directions" data-where="header">Directions</a>`
    + `<a class="btn top-call" href="tel:${esc(c.phones[0].tel)}" data-track="call" data-where="header">${esc(c.visit.callLabel)}</a>`;
}

export function callbarHTML(c) {
  return `<a class="btn" href="tel:${esc(c.phones[0].tel)}" data-track="call" data-where="callbar">${ICON_PHONE}${esc(c.visit.callLabel)}</a>`
    + `<a class="btn btn-outline" href="${esc(c.maps.link)}" target="_blank" rel="noopener" data-track="directions" data-where="callbar">${ICON_PIN}Directions</a>`;
}

export function footerHTML(c) {
  return `<img src="brand/logo-white.svg" alt="${esc(c.name)}" width="150" height="130">`
    + `<p>${esc(c.footer.note)}</p>`
    + `<p>${esc(c.address.oneLine)}</p>`
    + `<p>${c.phones.map((p) => `<a href="tel:${esc(p.tel)}" data-track="call" data-where="footer">${esc(p.display)}</a>`).join(' · ')}</p>`
    + `<p><a href="mailto:${esc(c.email)}" data-track="email" data-where="footer">${esc(c.email)}</a></p>`
    + `<p>${c.social.map((s) => `<a href="${esc(s.href)}" target="_blank" rel="noopener" data-track="social" data-where="footer">${esc(s.label)}</a>`).join(' · ')}</p>`
    + `<p>© ${esc(c.footer.year)} <span translate="no">${esc(c.name)}</span> · <a class="foot-small" href="sounds/credits.html">Sound credits</a></p>`;
}

// ---- Browser: fill anything the build did not, then wire up behaviour.

export function renderPage(c) {
  const main = document.getElementById('story');
  const fill = (el, html) => { if (el && !el.children.length) el.innerHTML = html; };
  if (!main.querySelector('[data-stop]')) main.insertAdjacentHTML('beforeend', storyHTML(c));
  const nav = document.getElementById('nav');
  fill(nav, navHTML(c));
  fill(document.getElementById('top-actions'), headerActionsHTML(c));
  fill(document.getElementById('callbar'), callbarHTML(c));
  fill(document.getElementById('foot'), footerHTML(c));

  const sections = [...main.querySelectorAll('[data-stop]')];
  const navLinks = [...nav.querySelectorAll('a')];

  // Scroll anchors: stop i is reached when the middle of its section is in view.
  let anchors = [];
  const measure = () => {
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    anchors = sections.map((s, i) => {
      if (i === 0) return 0;
      const top = s.getBoundingClientRect().top + window.scrollY;
      return Math.min(top + (s.offsetHeight - vh) / 2, max);
    });
  };
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);

  const progress = () => {
    const y = window.scrollY;
    if (y <= anchors[0]) return 0;
    for (let i = 0; i < anchors.length - 1; i++) {
      if (y < anchors[i + 1]) return i + (y - anchors[i]) / Math.max(1, anchors[i + 1] - anchors[i]);
    }
    return anchors.length - 1;
  };

  // Jump links (header nav, skip link, brand) glide to the point where their
  // chapter's scene and panel are fully in place, not to the section's top.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stopOf = (id) => sections.findIndex((s) => s.id === id);
  function goTo(id, smooth = true) {
    const i = stopOf(id);
    if (i < 0) return false;
    window.scrollTo({ top: anchors[i], behavior: smooth && !reduced.matches ? 'smooth' : 'auto' });
    return true;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = a.getAttribute('href').slice(1);
    if (!goTo(id)) return;
    e.preventDefault();
    history.replaceState(null, '', id === 'arrival' ? location.pathname + location.search : `#${id}`);
    closeMenu();
    const target = document.getElementById(id);
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
  // Deep links (e.g. /#hall) land on their chapter once layout has settled.
  if (location.hash.length > 1) {
    const id = decodeURIComponent(location.hash.slice(1));
    window.addEventListener('load', () => { measure(); goTo(id, false); }, { once: true });
  }

  // Phone menu: the header's section links in a drop-down.
  const top = document.getElementById('top-bar');
  const menuBtn = document.getElementById('menu-btn');
  const menuLabel = menuBtn && menuBtn.querySelector('.menu-label');
  function setMenu(open) {
    if (!menuBtn) return;
    top.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    if (menuLabel) menuLabel.textContent = open ? 'Close' : 'Menu';
  }
  function closeMenu() { setMenu(false); }
  if (menuBtn) {
    menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && top.classList.contains('menu-open')) { closeMenu(); menuBtn.focus(); } });
    document.addEventListener('click', (e) => { if (!top.contains(e.target)) closeMenu(); });
    window.addEventListener('scroll', () => { if (top.classList.contains('menu-open')) closeMenu(); }, { passive: true });
  }

  // Progress through the story, and the browser bar colour for the time of day.
  const bar = document.getElementById('progress-bar');
  const themeMeta = document.getElementById('theme-color');
  const THEME = { day: '#f3eee6', night: '#1d1712' };

  // Active chapter: header mood, nav state, panel entrance
  let current = -1;
  const heroCopy = main.querySelector('.hero-copy');
  const update = () => {
    const p = progress();
    // The hero text steps aside as the walk towards the gateway begins.
    const fade = Math.min(1, Math.max(0, (p - 0.1) / 0.22));
    heroCopy.style.opacity = String(1 - fade);
    heroCopy.style.transform = `translateY(${(-24 * fade).toFixed(1)}px)`;
    heroCopy.parentElement.style.setProperty('--fade', fade.toFixed(3));
    heroCopy.style.visibility = fade >= 1 ? 'hidden' : '';
    if (bar) bar.style.transform = `scaleX(${Math.min(1, p / (sections.length - 1)).toFixed(4)})`;
    const idx = Math.min(sections.length - 1, Math.round(p));
    if (idx === current) return;
    current = idx;
    const s = sections[idx];
    document.body.dataset.chapter = String(idx);
    document.body.dataset.mood = s.dataset.mood;
    sections.forEach((sec, i) => sec.classList.toggle('is-active', i === idx));
    navLinks.forEach((a) => { if (a.dataset.target === s.id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
    if (themeMeta) themeMeta.setAttribute('content', THEME[s.dataset.mood] || THEME.day);
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);

  // Load the map only when the visit section is near.
  const map = main.querySelector('.map');
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    map.innerHTML = `<iframe title="${esc(map.dataset.title)}" src="${esc(map.dataset.src)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  }, { rootMargin: '800px 0px' });
  io.observe(map);

  setupGallery(main, c);

  return { progress, stops: sections.length };
}

// Full-screen photo viewer for a room type: swipe or arrow keys between
// photos, Escape or the close button to leave. Built on <dialog>, so focus
// stays inside it and the page behind cannot be tabbed into.
function setupGallery(main, c) {
  const list = c.chapters.flatMap((ch) => ch.rooms || []);
  if (!list.length || typeof HTMLDialogElement !== 'function') return;
  const dlg = document.createElement('dialog');
  dlg.className = 'gallery';
  dlg.setAttribute('aria-labelledby', 'gallery-title');
  dlg.innerHTML = `
    <div class="gallery-top"><h2 id="gallery-title"></h2><p class="gallery-pos" aria-live="polite"></p>
      <button type="button" class="gallery-close" aria-label="Close photos">×</button></div>
    <div class="gallery-track" tabindex="0"></div>
    <button type="button" class="gallery-nav gallery-prev" aria-label="Previous photo">‹</button>
    <button type="button" class="gallery-nav gallery-next" aria-label="Next photo">›</button>`;
  document.body.appendChild(dlg);
  const title = dlg.querySelector('h2');
  const pos = dlg.querySelector('.gallery-pos');
  const track = dlg.querySelector('.gallery-track');
  let count = 0;
  let cur = 0; // the photo shown, or being glided to by the arrows

  const show = () => { pos.textContent = `${cur + 1} / ${count}`; };
  const go = (d) => {
    cur = Math.min(count - 1, Math.max(0, cur + d));
    track.scrollTo({ left: cur * track.clientWidth, behavior: 'smooth' });
    show();
  };
  // swipes: follow wherever the scroll comes to rest (a timer, as older
  // Safari has no scrollend)
  let settle;
  track.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => { cur = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); show(); }, 140);
  }, { passive: true });
  dlg.querySelector('.gallery-prev').addEventListener('click', () => go(-1));
  dlg.querySelector('.gallery-next').addEventListener('click', () => go(1));
  dlg.querySelector('.gallery-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });
  dlg.addEventListener('close', () => {
    document.documentElement.classList.remove('gallery-open');
    track.innerHTML = '';
  });

  main.addEventListener('click', (e) => {
    const btn = e.target.closest('.room-card');
    if (!btn) return;
    const r = list[Number(btn.dataset.room)];
    count = r.images.length;
    title.textContent = r.name;
    track.innerHTML = r.images.map((im, i) =>
      `<figure><img src="${esc(im.src)}" alt="${esc(im.alt || '')}" width="${im.width}" height="${im.height}" decoding="async"${i ? ' loading="lazy"' : ''}></figure>`
    ).join('');
    dlg.classList.toggle('one', count < 2);
    document.documentElement.classList.add('gallery-open');
    dlg.showModal();
    track.scrollLeft = 0;
    cur = 0;
    show();
    track.focus({ preventScroll: true });
  });
}
