// Ambient sound, off until the visitor taps the speaker button. Nothing is
// downloaded before that tap (browsers would not play it anyway). Five looping
// recordings are mixed by scroll position, the same way the lighting is:
// birds at dawn, a dining room by day, rain and crickets in the evening, rain
// at the bar, nadaswaram and thavil in the hall. Credits: sounds/credits.html.

const TRACKS = ['dawn', 'restaurant', 'rain', 'night', 'hall'];

// Level of each track per chapter (0 arrival … 5 visit), in TRACKS order.
const MIX = [
  [1.0, 0.0, 0.0, 0.0, 0.0],   // arrival, dawn: birds
  [0.35, 0.8, 0.0, 0.0, 0.0],  // restaurant: a dining room, birds outside
  [0.0, 0.0, 0.45, 0.35, 0.0], // stay, dusk: light rain, first crickets
  [0.0, 0.3, 0.9, 0.12, 0.0],  // bar: rain on the canopy, murmur inside
  [0.0, 0.0, 0.0, 0.12, 0.85], // hall: nadaswaram and thavil
  [0.0, 0.0, 0.0, 0.7, 0.12],  // visit, night: crickets, the hall far off
];
const MASTER = 0.55;

const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

export function startSound({ getProgress, base = new URL('../sounds/', import.meta.url) }) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-toggle';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', 'Ambient sound');
  button.title = 'Ambient sound';
  button.innerHTML = ICON_OFF;
  // in the header, beside the menu (phones) or before Directions (desktop)
  const bar = document.getElementById('top-bar');
  if (bar) bar.insertBefore(button, document.getElementById('top-actions')); else document.body.appendChild(button);

  let ctx = null, master = null, gains = [], on = false, loading = null, raf = 0;

  async function load() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    gains = TRACKS.map(() => { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); return g; });
    // start each loop as soon as it arrives; the rest keep downloading
    await Promise.all(TRACKS.map(async (name, i) => {
      try {
        const data = await (await fetch(new URL(`${name}.m4a`, base))).arrayBuffer();
        const buffer = await new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(gains[i]);
        src.start(0, Math.random() * buffer.duration); // loops never line up the same way twice
      } catch { /* one missing loop leaves the others playing */ }
    }));
  }

  function levels(p) {
    const i = Math.max(0, Math.min(MIX.length - 2, Math.floor(p)));
    const f = Math.max(0, Math.min(1, p - i));
    const s = f * f * (3 - 2 * f);
    return MIX[i].map((a, k) => a + (MIX[i + 1][k] - a) * s);
  }

  function tick() {
    raf = 0;
    if (!on || !ctx) return;
    const lv = levels(getProgress());
    const t = ctx.currentTime;
    gains.forEach((g, k) => g.gain.setTargetAtTime(lv[k], t, 0.6));
    raf = requestAnimationFrame(tick);
  }

  async function set(next) {
    on = next;
    button.setAttribute('aria-pressed', String(on));
    button.innerHTML = on ? ICON_ON : ICON_OFF;
    button.classList.toggle('is-on', on);
    if (on) {
      if (!ctx) {
        button.classList.add('is-loading');
        loading = load();
      }
      // resume inside the tap (browsers only allow sound after one), but do
      // not wait on it: the fade-in and mixing are scheduled either way
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      master.gain.setTargetAtTime(MASTER, ctx.currentTime, 0.8);
      if (!raf) raf = requestAnimationFrame(tick);
      await loading;
      button.classList.remove('is-loading');
    } else if (ctx) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      setTimeout(() => { if (!on && ctx.state === 'running') ctx.suspend(); }, 1200);
    }
  }

  button.addEventListener('click', () => set(!on));
  if (new URLSearchParams(location.search).has('debug')) {
    window.__sound = { state: () => ({ on, ctx: ctx && ctx.state, levels: gains.map((g) => +g.gain.value.toFixed(3)), master: master && +master.gain.value.toFixed(3) }) };
  }
  // quiet while the tab is in the background
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !on) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });
}
