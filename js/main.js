// Entry point: build the page, then load the 3D scene only if the device can
// run it. The page is complete and usable before (and without) the scene.

import { content } from '../content.js';
import { renderPage } from './ui.js';

const ui = renderPage(content);

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
  if (!hasWebGL()) return;
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
  }
}

// Let the text, fonts and first paint go first.
if (document.readyState === 'complete') start3D();
else window.addEventListener('load', start3D, { once: true });
