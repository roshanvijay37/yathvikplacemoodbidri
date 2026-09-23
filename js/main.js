// Entry point: build the page, then load the 3D scene only if the device can
// run it. The page is complete and usable before (and without) the scene.

import { content } from '../content.js';
import { renderPage } from './ui.js';

const ui = renderPage(content);
startAnalytics(content.analytics);

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
  const small = window.matchMedia('(max-width: 899px)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const lowMemory = navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4;
  const saveData = navigator.connection && navigator.connection.saveData;
  return small || coarse || lowMemory || saveData ? 'low' : 'high';
}

async function start3D() {
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
