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

function heroSection(c) {
  return `
  <section class="chapter chapter--hero is-active" id="arrival" data-stop="0" data-mood="day">
    <div class="sticky">
      <div class="hero-copy">
        <p class="kicker">${esc(c.hero.kicker)}</p>
        <h1><span class="w1">Yathvik</span><span class="w2">Place</span><span class="sr">, Moodbidri</span></h1>
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
        <p class="note">${esc(ch.note)}</p>
        <div class="actions">
          <a class="btn" href="tel:${esc(phone.tel)}">${ICON_PHONE}${esc(ch.action)}</a>
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
        <address>${esc(c.name)}<br>${c.address.lines.map(esc).join('<br>')}</address>
        <ul class="phones">
          ${c.phones.map((p) => `<li><a href="tel:${esc(p.tel)}" aria-label="${esc(v.callLabel)} ${esc(p.display)}">${esc(p.display)}</a></li>`).join('')}
        </ul>
        <div class="actions">
          <a class="btn" href="${esc(c.maps.link)}" target="_blank" rel="noopener">${ICON_PIN}${esc(v.directions)}</a>
          <a class="btn btn-outline" href="tel:${esc(c.phones[0].tel)}">${ICON_PHONE}${esc(v.callLabel)}</a>
        </div>
        <div class="map" data-src="${esc(c.maps.embed)}" data-title="Map showing ${esc(c.name)}, ${esc(c.address.oneLine)}">
          <p class="map-hint">Map loads as you scroll</p>
        </div>
      </article>
    </div>
  </section>`;
}

export function renderPage(c) {
  const main = document.getElementById('story');
  const stopsCount = c.chapters.length + 1;
  main.insertAdjacentHTML('beforeend',
    heroSection(c) + c.chapters.map((ch, i) => chapterSection(ch, i, c)).join('') + visitSection(c, stopsCount));

  // Header navigation
  const nav = document.getElementById('nav');
  nav.innerHTML = [...c.chapters.map((ch) => ({ id: ch.id, label: ch.nav })), { id: 'visit', label: c.visit.nav }]
    .map((l) => `<a href="#${esc(l.id)}" data-target="${esc(l.id)}">${esc(l.label)}</a>`).join('');
  const topCall = document.getElementById('top-call');
  topCall.href = `tel:${c.phones[0].tel}`;
  topCall.insertAdjacentHTML('beforebegin',
    `<a class="btn top-directions" href="${esc(c.maps.link)}" target="_blank" rel="noopener">Directions</a>`);

  // Mobile call bar
  document.getElementById('callbar').innerHTML = `
    <a class="btn" href="tel:${esc(c.phones[0].tel)}">${ICON_PHONE}${esc(c.visit.callLabel)}</a>
    <a class="btn btn-outline" href="${esc(c.maps.link)}" target="_blank" rel="noopener">${ICON_PIN}Directions</a>`;

  // Footer
  document.getElementById('foot').innerHTML = `
    <img src="brand/logo-white.svg" alt="${esc(c.name)}" width="150" height="130">
    <p>${esc(c.footer.note)}</p>
    <p>${esc(c.address.oneLine)}</p>
    <p>${c.phones.map((p) => `<a href="tel:${esc(p.tel)}">${esc(p.display)}</a>`).join(' · ')}</p>
    <p>© ${new Date().getFullYear()} ${esc(c.name)}</p>`;

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
    const idx = Math.min(sections.length - 1, Math.round(p));
    if (idx === current) return;
    current = idx;
    const s = sections[idx];
    document.body.dataset.chapter = String(idx);
    document.body.dataset.mood = s.dataset.mood;
    sections.forEach((sec, i) => sec.classList.toggle('is-active', i === idx));
    navLinks.forEach((a) => a.setAttribute('aria-current', String(a.dataset.target === s.id)));
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

  return { progress, stops: sections.length };
}
