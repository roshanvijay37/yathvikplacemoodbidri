// Entry point: build the page, then load the 3D scene only if the device can
// run it. The page is complete and usable before (and without) the scene.

import { content } from '../content.js';
import { renderPage } from './ui.js';
import { startSound } from './sound.js';

const ui = renderPage(content);
startAnalytics(content.analytics);
// a speaker button; nothing plays or downloads until it is tapped
startSound({ getProgress: ui.progress });

// Google Analytics 4, only if a measurement ID is set in content.js. Taps on
// any link marked data-track (Call, Directions) are sent as events, tagged
// with where on the page they happened.
function startAnalytics({ ga4 } = {}) {
  if (!ga4) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', ga4);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`;
  document.head.appendChild(s);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-track]');
    if (a) window.gtag('event', `${a.dataset.track}_click`, { link_location: a.dataset.where || '' });
  });
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function quality() {
  const q = new URLSearchParams(location.search);
  if (q.has('debug') && ['low', 'high'].includes(q.get('tier'))) return q.get('tier'); // testing only
  const small = window.matchMedia('(max-width: 899px)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const lowMemory = navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4;
  const saveData = navigator.connection && navigator.connection.saveData;
  return small || coarse || lowMemory || saveData || !strongGPU() ? 'low' : 'high';
}

// The full desktop scene (scanned furniture, grass, mirror-polished marble,
// ambient occlusion) needs a dedicated graphics card: on an Intel Iris Xe
// laptop at 1440x900 it ran near 10 frames a second before stepping down,
// where the lighter version holds about 55. So only a GPU that names itself as
// a discrete or high-end one gets it; integrated graphics, and browsers that
// hide the GPU's name, get the lighter version.
function strongGPU() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return /NVIDIA|GeForce|RTX|GTX|Quadro|Radeon RX|Radeon Pro|Arc\(TM\) A|Arc A\d|Apple M\d+ (Pro|Max|Ultra)/i.test(name);
  } catch {
    return false;
  }
}

async function start3D() {
  // Visitors who asked their browser to save data get the light version.
  if (navigator.connection && navigator.connection.saveData) return;
  if (!hasWebGL()) {
    if (new URLSearchParams(location.search).has('debug')) console.warn('WebGL unavailable');
    return;
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  try {
    const { createScene } = await import('./scene.js');
    await createScene({
      host: document.getElementById('stage'),
      quality: quality(),
      reducedMotion,
      getProgress: ui.progress,
      // tap points reuse each chapter's own title and call button text
      hotspots: content.chapters.map((ch, i) => ({ id: ch.id, chapter: i + 1, label: ch.title, action: ch.action, tel: content.phones[0].tel })),
    });
    document.body.classList.add('has-3d');
  } catch (err) {
    // The CSS fallback stays in place; the page works without the scene.
    console.warn('3D scene unavailable:', err);
    if (new URLSearchParams(location.search).has('debug')) {
      const box = document.createElement('pre');
      box.style.cssText = 'position:fixed;left:6px;top:70px;z-index:100;margin:0;padding:6px 8px;font:11px/1.35 monospace;color:#fff;background:rgba(120,0,0,.85);max-width:92vw;white-space:pre-wrap';
      box.textContent = `3D failed: ${err && (err.stack || err.message || err)}`;
      document.body.appendChild(box);
    }
  }
}

// Let the text, fonts and first paint go first.
if (document.readyState === 'complete') start3D();
else window.addEventListener('load', start3D, { once: true });
