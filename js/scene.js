// The 3D world: a bronze gateway extruded from the brand mark, a colonnade of
// smaller marks along a path, and four places along it: restaurant, stay,
// bar and hall. Scroll progress (in chapter units) drives the camera and the
// time of day.
//
// Realism comes from: a physically based sky whose light is also used for
// reflections (pre-computed per time of day), CC0 PBR textures (textures/),
// soft shadow maps, contact shadows under objects, HDR bloom on lamps,
// ACES tone mapping, and a little film grain. Phones get a lighter set, and
// the effects step down automatically if frames are slow.
//
// This module knows nothing about page content. Camera stops, moods and the
// layout are in chapters.js.

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries as mergeRaw, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ScenePass, DepthFxPass, DofPass, SunMask, TaaPass } from './fx/passes.js';
import { addWind, addFlicker, buildPool, buildRain, buildHallDecor } from './fx/life.js';
import { startTilt, createHotspots } from './fx/interaction.js';
import { useContactShadows } from './fx/shadows.js';
import { buildGrass } from './fx/grass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { LAYOUT, CAMERA_KEYS, MOODS, HOTSPOTS } from './chapters.js';

const MARK_URL = new URL('../brand/mark.svg', import.meta.url);
const LOGO_URL = new URL('../brand/logo.svg', import.meta.url);
const TEX_URL = new URL('../textures/', import.meta.url);
const MODEL_URL = new URL('../models/', import.meta.url);

const C = (hex) => new THREE.Color(hex);
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const deg = THREE.MathUtils.degToRad;
const Y = new THREE.Vector3(0, 1, 0);

// Deterministic random so the scene is identical on every load.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

// The mark as a solid, 1 unit tall, standing on y = 0, facing +z.
function markGeometry(svgText, low) {
  const data = new SVGLoader().parse(svgText);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth: 30,
    curveSegments: low ? 6 : 14,
    bevelEnabled: true,
    bevelThickness: 1.8,
    bevelSize: 1.4,
    bevelSegments: low ? 2 : 4,
  });
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const h = bb.max.y - bb.min.y;
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.max.y, -(bb.min.z + bb.max.z) / 2);
  // SVG y points down. Scaling y and z by -1 together is a rotation about x,
  // so faces keep their winding. UVs stay in SVG units (used by the grain).
  g.scale(1 / h, -1 / h, -1 / h);
  return g;
}

// Merge any mix of indexed and non-indexed geometries.
function mergeGeometries(list) {
  const mixed = list.some((g) => g.index) && list.some((g) => !g.index);
  return mergeRaw(mixed ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list);
}

// Box whose UVs are in texture tiles: `tile` metres of surface per texture.
function box(w, h, d, x, y, z, tile = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile) {
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
    }
  }
  g.translate(x, y, z);
  return g;
}

function rbox(w, h, d, r, x, y, z) {
  const g = new RoundedBoxGeometry(w, h, d, 2, r);
  g.translate(x, y, z);
  return g;
}

function cyl(rt, rb, h, seg, x, y, z) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

// Solid of revolution from [radius, height] pairs.
function lathe(profile, seg, y = 0) {
  const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg);
  g.translate(0, y, 0);
  return g;
}

function scaleUV(g, sx, sy) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return g;
}

function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const radialTexture = (inner, outer) => canvasTexture(128, 128, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

// Brushed-metal grain for the bronze: fine streaks in the roughness channel.
function brushedTexture() {
  const t = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = 90 + Math.floor(rand() * 90);
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.fillRect(rand() * w, rand() * h, 30 + rand() * 220, 1);
    }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// A lit room seen through a window: warm light, curtains drawn to the sides.
function roomTexture() {
  return canvasTexture(128, 160, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.35, 4, w / 2, h * 0.45, h * 0.75);
    g.addColorStop(0, '#fff1d6');
    g.addColorStop(0.55, '#e8b479');
    g.addColorStop(1, '#6a3f22');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (const side of [0, 1]) {
      const x0 = side ? w - 30 : 0;
      for (let i = 0; i < 30; i++) {
        const shade = 0.55 + 0.25 * Math.sin(i * 0.9);
        ctx.fillStyle = `rgba(${Math.round(150 * shade)},${Math.round(92 * shade)},${Math.round(52 * shade)},0.9)`;
        ctx.fillRect(x0 + i, 0, 1, h);
      }
    }
    ctx.fillStyle = 'rgba(40,24,14,0.45)';
    ctx.fillRect(0, h * 0.78, w, h * 0.22); // furniture line
  });
}

// Lawn: mottled greens and dry patches, tiled every 4 m.
function grassTexture() {
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#56663a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const g = 70 + Math.floor(rand() * 60), r = 50 + Math.floor(rand() * 45);
      ctx.fillStyle = `rgba(${r},${g},${Math.floor(r * 0.55)},0.55)`;
      ctx.fillRect(rand() * w, rand() * h, 1, 2 + rand() * 3);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Palm trunk: grey-brown with the leaf-scar rings of a coconut palm.
function trunkTexture() {
  const t = canvasTexture(32, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7a6a58';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 5 + Math.floor(rand() * 3)) {
      ctx.fillStyle = `rgba(40,32,24,${0.25 + rand() * 0.3})`;
      ctx.fillRect(0, y, w, 1 + Math.floor(rand() * 2));
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Palms draw from their own random sequence, then burn as many numbers from
// the shared one as the first version did, so everything placed after them
// (palm spots, lamps, furniture) stays exactly where it was.
const prng = (s0) => { let st = s0; return () => ((st = (st * 16807) % 2147483647) - 1) / 2147483646; };
const burn = (n) => { for (let i = 0; i < n; i++) rand(); };

// One palm frond, seen flat: a rib with drooping leaflets on both sides, some
// missing, tips thinning out (alpha cut-out). Greyscale: each frond's colour
// comes from its vertex colour, so green and dead fronds share one texture.
function frondTexture(balance = true) {
  const r = prng(4242);
  const t = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (let x = 6; x < w - 4; x += 3.2) {
      const along = x / w;
      const len = (h / 2 - 3) * (0.5 + 0.5 * Math.sin(along * Math.PI)) * (0.85 + r() * 0.3);
      for (const dir of [-1, 1]) {
        if (r() < 0.06) continue; // a torn or missing leaflet
        const g = 150 + Math.floor(r() * 80);
        ctx.strokeStyle = `rgb(${g},${g},${Math.floor(g * 0.92)})`;
        ctx.lineWidth = 2.2 - along * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, h / 2);
        // leaflets sweep towards the tip and curve down at their ends
        ctx.quadraticCurveTo(x + len * 0.35, h / 2 + dir * len * 0.7, Math.min(w - 1, x + len * 0.75), h / 2 + dir * len);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgb(200,190,150)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  });
  t.anisotropy = 4;
  if (balance) burn(83);
  return t;
}

// A palm 1 unit tall: a gently curved, tapering trunk with a flared base, a
// crown of V-folded fronds (the leaflets hang either side of the rib), a few
// dead fronds hanging against the trunk, and a cluster of coconuts. Scaled
// per instance to 8-14 m.
function palmGeometries(low, balance = true, far = false) {
  const r = prng(777);
  const lean = 0.08;
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.2, 0.35, 0),
    new THREE.Vector3(lean * 0.6, 0.7, 0), new THREE.Vector3(lean, 1, 0),
  ]);
  const trunkGeo = new THREE.TubeGeometry(path, far ? 4 : low ? 10 : 16, 0.016, far ? 4 : low ? 6 : 8, false);
  const p = trunkGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const c = path.getPoint(Math.min(1, Math.max(0, y)));
    const k = 1.25 - 0.45 * y + 0.9 * Math.exp(-y * 28); // taper, and a flared base
    p.setX(i, c.x + (p.getX(i) - c.x) * k);
    p.setZ(i, c.z + (p.getZ(i) - c.z) * k);
  }
  trunkGeo.computeVertexNormals();
  scaleUV(trunkGeo, 3, 18);

  const crown = new THREE.Vector3(lean, 1, 0);
  const fronds = [];
  const frond = (L, rise, droop, tiltX, yaw, colour, segs) => {
    const pos = [], uv = [], at = [], col = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = t * L, y = rise * t - droop * t * t;
      const half = 0.06 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.06));
      const fold = half * 0.55; // leaflets hang below the rib
      pos.push(x, y - fold, -half, x, y, 0, x, y - fold, half);
      uv.push(t, 0, t, 0.5, t, 1);
      at.push(t, t, t);
      for (let v = 0; v < 3; v++) col.push(colour.r, colour.g, colour.b);
      if (i < segs) {
        const a = i * 3;
        idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1)); // 0 at base, 1 at tip (wind)
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.rotateX(tiltX);
    g.rotateY(yaw);
    g.translate(crown.x, crown.y, crown.z);
    g.computeVertexNormals();
    fronds.push(g);
  };
  const green = new THREE.Color();
  const n = far ? 9 : low ? 14 : 20, segs = far ? 3 : low ? 6 : 8;
  for (let k = 0; k < n; k++) {
    // young fronds stand up in the middle; older ones arch out and droop
    const age = k / n;
    const L = 0.34 + r() * 0.1, rise = 0.24 - age * 0.14 + r() * 0.05, droop = 0.1 + age * 0.3 + r() * 0.08;
    green.setRGB(0.2 + r() * 0.06, 0.34 + r() * 0.08 - age * 0.04, 0.08 + r() * 0.03);
    frond(L, rise, droop, (r() - 0.5) * 0.5, (k / n) * Math.PI * 2 * 2.618 + r() * 0.3, green, segs);
  }
  const dead = new THREE.Color();
  for (let k = 0; k < (far ? 0 : low ? 1 : 2); k++) {
    dead.setRGB(0.26 + r() * 0.05, 0.17 + r() * 0.03, 0.08);
    frond(0.22 + r() * 0.04, -0.06, 0.5 + r() * 0.1, (r() - 0.5) * 0.3, r() * Math.PI * 2, dead, segs);
  }

  // coconuts, bunched just under the crown
  const nuts = [];
  for (let k = 0; k < (far ? 0 : low ? 5 : 7); k++) {
    const a = r() * Math.PI * 2, rr = 0.016 + r() * 0.01;
    const g = new THREE.IcosahedronGeometry(0.0105 + r() * 0.002, 0);
    g.scale(1, 1.15, 1);
    g.translate(crown.x + Math.cos(a) * rr, crown.y - 0.025 - r() * 0.02, crown.z + Math.sin(a) * rr);
    nuts.push(g);
  }
  if (balance) burn(low ? 45 : 65);
  return { trunkGeo, frondGeo: mergeGeometries(fronds), nutGeo: nuts.length ? mergeGeometries(nuts) : null };
}

// Soft blotchy alpha for low mist layers.
function mistTexture() {
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rand() * w, y = rand() * h, r = 20 + rand() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Weathering for the facade, mapped over its whole face: rising damp along the
// base, rain streaks running down from the parapet and from every window sill.
function grimeTexture(len, h, sills) {
  const W = 1024, H = 512;
  const t = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const px = (z) => (z / len) * W, py = (y) => H - (y / h) * H;
    let g = ctx.createLinearGradient(0, py(0), 0, py(0.9));
    g.addColorStop(0, 'rgba(92,78,62,0.55)');
    g.addColorStop(1, 'rgba(92,78,62,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, py(0.9), W, py(0) - py(0.9));
    const streak = (x, y0, len0, width, alpha) => {
      const gg = ctx.createLinearGradient(0, y0, 0, y0 + len0);
      gg.addColorStop(0, `rgba(70,62,52,${alpha})`);
      gg.addColorStop(1, 'rgba(70,62,52,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(x - width / 2, y0, width, len0);
    };
    for (let x = 0; x < W; x += 3 + rand() * 9) streak(x, py(h), 12 + rand() * 60, 1 + rand() * 3, 0.1 + rand() * 0.18);
    for (const s of sills) {
      const x0 = px(s.u - s.w / 2), x1 = px(s.u + s.w / 2);
      for (let x = x0; x < x1; x += 2 + rand() * 6) streak(x, py(s.y), 8 + rand() * 46, 1 + rand() * 2.5, 0.08 + rand() * 0.2);
    }
  });
  return t;
}

// Tone variation per marble tile and broad unevenness, so the paving is not
// one flawless repeat. Works on the texture's own UVs (2 x 2 tiles per repeat).
function weatherMarble(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_MAP
      {
        vec2 tileId = floor(vMapUv * 2.0);
        float h = fract(sin(dot(tileId, vec2(12.9898, 78.233))) * 43758.5453);
        float broad = sin(vMapUv.x * 0.37 + sin(vMapUv.y * 0.21)) * sin(vMapUv.y * 0.29);
        diffuseColor.rgb *= 0.93 + 0.1 * h + 0.035 * broad;
      }
      #endif`);
  };
  mat.customProgramCacheKey = () => 'weather-marble';
}

// Uneven patina on the bronze: slow darker and lighter patches.
function weatherBronze(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_ROUGHNESSMAP
      {
        vec2 q = vRoughnessMapUv * 0.9;
        float n = sin(q.x * 1.7 + sin(q.y * 1.3)) * sin(q.y * 2.1 + sin(q.x * 0.7));
        diffuseColor.rgb *= 0.9 + 0.1 * n;
      }
      #endif`);
  };
  mat.customProgramCacheKey = () => 'weather-bronze';
}

// The facade's grime map, sampled in the facade's own coordinates.
function grimePlaster(mat, grime, origin) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrime = { value: grime };
    sh.uniforms.uGrimeOrigin = { value: origin }; // (zFrom, len, h)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFacadePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacadePos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFacadePos;\nuniform sampler2D uGrime;\nuniform vec3 uGrimeOrigin;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 guv = vec2((uGrimeOrigin.x - vFacadePos.z) / uGrimeOrigin.y, vFacadePos.y / uGrimeOrigin.z);
          diffuseColor.rgb *= texture2D(uGrime, clamp(guv, 0.0, 1.0)).rgb;
        }`);
  };
  mat.customProgramCacheKey = () => 'grime-plaster';
}

// Scanned CC0 models (models/, see models/README.md) placed as instances.
// The model is normalised: centred, standing on y = 0, scaled to a target
// height, then turned by `rotY` so its front matches the placement's facing.
function toFloatAttributes(g) {
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(name);
    if (!a || a.array instanceof Float32Array) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  return g;
}
function instancesOf(root, matrices, { height, rotY = 0, cast = true }) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const k = height / size.y;
  const norm = new THREE.Matrix4().makeRotationY(rotY)
    .multiply(new THREE.Matrix4().makeScale(k, k, k))
    .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = toFloatAttributes(o.geometry.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, o.matrixWorld));
    g.computeBoundingSphere();
    const im = new THREE.InstancedMesh(g, o.material, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = cast;
    im.receiveShadow = true;
    meshes.push(im);
  });
  return meshes;
}

/* ------------------------------------------------------------------ */
/* Textures: CC0 PBR sets from Poly Haven, see textures/README.md       */
/* ------------------------------------------------------------------ */

const loader = new THREE.TextureLoader();
function loadSet(name, res, maxAniso) {
  const load = (file, srgb) => new Promise((resolve) => {
    loader.load(new URL(`${name}/${res}/${file}.jpg`, TEX_URL).href, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    }, undefined, () => resolve(null));
  });
  return Promise.all([load('diff', true), load('nor', false), load('arm', false)])
    .then(([map, normalMap, arm]) => ({ map, normalMap, arm }));
}
// Applies a set once it has arrived; until then the material shows its colour.
function applySet(mats, setPromise, normalScale = 1, onDone = () => {}) {
  setPromise.then(({ map, normalMap, arm }) => {
    for (const m of [].concat(mats)) {
      if (map) m.map = map;
      if (normalMap) { m.normalMap = normalMap; m.normalScale = new THREE.Vector2(normalScale, normalScale); }
      if (arm) { m.roughnessMap = arm; m.aoMap = arm; }
      m.needsUpdate = true;
    }
    onDone();
  });
}

/* ------------------------------------------------------------------ */
/* Lamp halos: one draw call for every lamp, complementing the bloom   */
/* ------------------------------------------------------------------ */

const G_RESTAURANT = 0, G_BAR = 1, G_HALL = 2, G_PATH = 3;

function glowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uGroups: { value: new THREE.Vector4() }, uScale: { value: 400 }, uMax: { value: 256 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aGroup; attribute vec3 aColor;
      uniform vec4 uGroups; uniform float uScale; uniform float uMax; uniform float uTime;
      varying vec3 vColor; varying float vI;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float g = aGroup < 0.5 ? uGroups.x : aGroup < 1.5 ? uGroups.y : aGroup < 2.5 ? uGroups.z : uGroups.w;
        vI = g; vColor = aColor;
        float fl = 1.0 + 0.1 * sin(uTime * 8.7 + position.x * 7.1 + position.z * 3.3) * sin(uTime * 4.9 + position.y * 11.0);
        vI *= fl;
        gl_PointSize = g < 0.01 ? 0.0 : min(aSize * fl * uScale / -mv.z, uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vI;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(vColor * exp(-d * d * 6.0) * 0.8 * vI, 1.0);
      }`,
  });
}

class GlowBuilder {
  constructor() { this.p = []; this.s = []; this.g = []; this.c = []; }
  add(x, y, z, size, group, color) {
    const col = C(color);
    this.p.push(x, y, z); this.s.push(size); this.g.push(group); this.c.push(col.r, col.g, col.b);
  }
  build(material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(this.s, 1));
    geo.setAttribute('aGroup', new THREE.Float32BufferAttribute(this.g, 1));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(this.c, 3));
    const pts = new THREE.Points(geo, material);
    pts.frustumCulled = false;
    return pts;
  }
}

// Film grain and a soft vignette, applied after tone mapping.
const GrainShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.035 }, uVignette: { value: 0.28 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float n = hash(vUv * 1024.0 + fract(uTime) * 91.7) - 0.5;
      c.rgb += n * uGrain;
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.35, 0.85, length(q * vec2(1.1, 1.0)));
      gl_FragColor = c;
    }`,
};

function setSky(sky, m) {
  const u = sky.material.uniforms;
  u.turbidity.value = m.turbidity;
  u.rayleigh.value = m.rayleigh;
  u.mieCoefficient.value = m.mie;
  u.mieDirectionalG.value = m.mieG;
  u.sunPosition.value.setFromSphericalCoords(1, deg(90 - m.skyElev), deg(m.skyAzim));
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export async function createScene({ host, quality, reducedMotion, getProgress, hotspots = [] }) {
  const low = quality === 'low';
  let needsRender = true;
  // Time and weather shared by every shader that moves (wind, flicker, water, rain).
  const fxShared = { uTime: { value: 0 }, uWind: { value: 1 }, uRain: { value: 0 } };
  const redraw = () => { needsRender = true; };
  const [svgText, logoText] = await Promise.all([MARK_URL, LOGO_URL].map((u) => fetch(u).then((r) => r.text())));

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  // Sharp-screen phones start at 2x; the quality ladder lowers it if frames are slow.
  const screenDpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(screenDpr, low ? (screenDpr >= 2.5 ? 2 : 1.5) : 2));
  const params = new URLSearchParams(location.search);
  const TONE = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };
  // ACES chosen after comparing AgX and Neutral on every chapter (?debug&tm=agx|neutral)
  renderer.toneMapping = (params.has('debug') && TONE[params.get('tm')]) || THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // desktop: shadows sharp at contact and softer with distance (PCSS)
  if (!low && renderer.capabilities.isWebGL2 && !(params.has('debug') && params.has('pcf'))) useContactShadows(renderer);
  host.appendChild(renderer.domElement);
  const isWebGL2 = renderer.capabilities.isWebGL2;
  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), low ? 4 : 8);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 60, 400);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1200);

  /* ---------- materials ---------- */
  const res = low ? '512' : '1k';
  const hi = !low;
  const brushed = brushedTexture();
  brushed.repeat.set(1 / 60, 1 / 60);
  const Metal = hi ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const bronze = new Metal({ color: '#a8754a', metalness: 1, roughness: 0.4, roughnessMap: brushed, ...(hi && { anisotropy: 0.3 }) });
  const bronzePolished = new Metal({ color: '#b5824f', metalness: 1, roughness: 0.22 });
  const bronzeDark = new THREE.MeshStandardMaterial({ color: '#6e4a2c', metalness: 1, roughness: 0.38 });

  const marble = new THREE.MeshStandardMaterial({ color: '#f4ede4', roughness: 0.85, metalness: 0 });
  const marbleWarm = new THREE.MeshStandardMaterial({ color: '#f6e6d2', roughness: 0.7, metalness: 0 });
  const tableTop = new THREE.MeshStandardMaterial({ color: '#ece4da', roughness: 0.32, metalness: 0 });
  const plaster = new THREE.MeshStandardMaterial({ color: '#f1e6d6', roughness: 1, metalness: 0 });
  const Lacquer = hi ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const wood = new Lacquer({ color: '#ffffff', roughness: 0.8, metalness: 0, ...(hi && { clearcoat: 0.8, clearcoatRoughness: 0.12 }) });
  const woodDark = new THREE.MeshStandardMaterial({ color: '#8a6a5e', roughness: 0.85, metalness: 0 });
  const fabric = new THREE.MeshStandardMaterial({ color: '#b9a288', roughness: 0.95, metalness: 0 });
  const leather = new THREE.MeshStandardMaterial({ color: '#3a2518', roughness: 0.55, metalness: 0 });

  // Full-resolution marble on every device: it fills most of the view.
  applySet([marble, marbleWarm], loadSet('marble', '1k', maxAniso), 0.8, redraw);
  applySet(plaster, loadSet('plaster', res, maxAniso), 1, redraw);
  applySet([wood, woodDark], loadSet('wood', res, maxAniso), 0.6, redraw);

  const unitMark = markGeometry(svgText, low);
  weatherMarble(marble);
  weatherMarble(marbleWarm);
  weatherBronze(bronze);
  const shadowCasters = [];
  const cast = (o, receive = true) => { o.castShadow = true; o.receiveShadow = receive; o.layers.enable(2); shadowCasters.push(o); return o; };

  /* ---------- sky, stars, floor ---------- */
  const sky = new Sky();
  sky.scale.setScalar(900);
  sky.frustumCulled = false;
  sky.renderOrder = -2;
  scene.add(sky);

  // The physical sky does not go fully dark after sunset; a night dome fades
  // in over it (between the sky box at 450 m and the stars at 420 m).
  const nightDome = new THREE.Mesh(
    new THREE.SphereGeometry(440, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
      uniforms: { uAmount: { value: 0 }, uTop: { value: C('#03050b') }, uHorizon: { value: C('#1c1510') } },
      vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform float uAmount; uniform vec3 uTop, uHorizon; varying vec3 vDir;
        void main() {
          float h = normalize(vDir).y;
          vec3 c = mix(uHorizon, uTop, smoothstep(-0.02, 0.45, h));
          gl_FragColor = vec4(c, uAmount);
        }`,
    }),
  );
  nightDome.renderOrder = -1.5;
  nightDome.frustumCulled = false;
  scene.add(nightDome);

  const starCount = low ? 300 : 800;
  const starPos = [];
  for (let i = 0; i < starCount; i++) {
    const u = rand() * Math.PI * 2, v = 0.08 + rand() * 0.92;
    const y = v * v, rr = Math.sqrt(1 - y * y), r = 420;
    starPos.push(Math.cos(u) * rr * r, y * r, Math.sin(u) * rr * r);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: '#fff4e6', size: low ? 1.5 : 1.7, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  scene.add(stars);

  // Clouds: a drifting fbm layer projected onto a plane overhead, lit from the
  // sun's side. Between the stars (420 m) and the night dome (440 m).
  const cloudUniforms = {
    uTime: { value: 0 }, uCover: { value: 0.4 }, uOpacity: { value: 1 }, uBright: { value: 2 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uLit: { value: C('#ffffff') }, uShade: { value: C('#9aa4b0') },
  };
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(430, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, uniforms: cloudUniforms,
      vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uCover, uOpacity, uBright; uniform vec3 uSunDir, uLit, uShade; varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s + 0.03; }
        void main() {
          vec3 d = normalize(vDir);
          if (d.y < 0.01) discard;
          vec2 uv = d.xz / (d.y + 0.09);
          vec3 p = vec3(uv * 1.1 + vec2(uTime * 0.006, uTime * 0.002), uTime * 0.003);
          float n = fbm(p);
          float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.3, n);
          float fade = smoothstep(0.01, 0.16, d.y);
          float toSun = pow(max(dot(d, normalize(uSunDir)), 0.0), 3.0);
          vec3 col = mix(uShade, uLit, 0.35 + 0.65 * toSun) * uBright;
          col *= 1.0 - 0.4 * smoothstep(0.55, 1.0, n);
          gl_FragColor = vec4(col, c * fade * uOpacity);
        }`,
    }),
  );
  clouds.renderOrder = -0.5;
  clouds.frustumCulled = false;
  scene.add(clouds);

  // Low mist over the approach, visible at dawn only.
  const mistMat = new THREE.MeshBasicMaterial({ map: mistTexture(), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  const mist = new THREE.Group();
  for (const [y, s] of [[0.35, 1], [0.9, 1.3], [1.6, 1.7]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mistMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, -10);
    m.material.map.repeat.set(3 * s, 3 * s);
    mist.add(m);
  }
  scene.add(mist);

  // A marble plaza (texture covers 1.5 m; UVs are in those tiles) with an
  // approach path, a stone kerb, and lawn beyond it.
  const PLAZA = { x: 24, zNear: 22, zFar: -146 };
  const plazaW = PLAZA.x * 2, plazaL = PLAZA.zNear - PLAZA.zFar;
  const flat = (geo, material, x, z) => {
    const m = new THREE.Mesh(geo, material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  flat(scaleUV(new THREE.PlaneGeometry(plazaW, plazaL), plazaW / 1.5, plazaL / 1.5), marble, 0, (PLAZA.zNear + PLAZA.zFar) / 2);

  // Polished marble: a faint mirror image, stronger at grazing angles and at
  // night. Desktop only — it renders the scene a second time.
  let reflector = null;
  if (!low) {
    reflector = new Reflector(new THREE.PlaneGeometry(plazaW, plazaL), {
      textureWidth: 512, textureHeight: 512, clipBias: 0.003, multisample: 0, // a faint reflection on stone does not need more
      shader: {
        name: 'MarbleReflection',
        uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uStrength: { value: 0.15 } },
        vertexShader: /* glsl */`
          uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
          void main() { vUv = textureMatrix * vec4(position, 1.0); vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */`
          uniform sampler2D tDiffuse; uniform float uStrength; varying vec4 vUv; varying vec3 vWorld;
          void main() {
            vec3 v = normalize(cameraPosition - vWorld);
            float fresnel = 0.25 + 0.75 * pow(1.0 - clamp(v.y, 0.0, 1.0), 3.0);
            vec3 c = texture2DProj(tDiffuse, vUv).rgb;
            gl_FragColor = vec4(c, uStrength * fresnel);
          }`,
      },
    });
    reflector.material.transparent = true;
    reflector.material.depthWrite = false;
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, 0.004, (PLAZA.zNear + PLAZA.zFar) / 2);
    reflector.renderOrder = 1;
    scene.add(reflector);
  }
  flat(scaleUV(new THREE.PlaneGeometry(7, 60), 7 / 1.5, 60 / 1.5), marble, 0, PLAZA.zNear + 30).position.y = 0.002;
  const lawnMat = new THREE.MeshStandardMaterial({ map: grassTexture(), color: '#c9c19c', roughness: 1, metalness: 0 });
  flat(scaleUV(new THREE.PlaneGeometry(1400, 1400), 1400 / 4, 1400 / 4), lawnMat, 0, -60).position.y = -0.01;
  // Desktop: real blades of grass near the camera, fading into the lawn texture.
  const grass = low ? null : buildGrass({
    scene, shared: fxShared, rand,
    paved: [[-PLAZA.x - 0.45, PLAZA.x + 0.45, PLAZA.zFar - 0.45, PLAZA.zNear + 0.45], [-3.7, 3.7, PLAZA.zNear, PLAZA.zNear + 60.3]],
  });
  // Layer 3 is seen by the main camera only: the marble mirror (layer 0) would
  // otherwise draw a million blades again for a reflection no one can see.
  if (grass) { grass.mesh.layers.set(3); camera.layers.enable(3); }
  scene.add(cast(new THREE.Mesh(mergeGeometries([
    box(plazaW + 0.6, 0.12, 0.3, 0, 0.06, PLAZA.zFar, 1.5),
    box(0.3, 0.12, plazaL, -PLAZA.x, 0.06, (PLAZA.zNear + PLAZA.zFar) / 2, 1.5),
    box(0.3, 0.12, plazaL, PLAZA.x, 0.06, (PLAZA.zNear + PLAZA.zFar) / 2, 1.5),
    box(PLAZA.x - 3.5, 0.12, 0.3, -(PLAZA.x + 3.5) / 2, 0.06, PLAZA.zNear, 1.5),
    box(PLAZA.x - 3.5, 0.12, 0.3, (PLAZA.x + 3.5) / 2, 0.06, PLAZA.zNear, 1.5),
  ]), marbleWarm)));

  // Coconut palms on the lawn around the plaza.
  {
    const { trunkGeo, frondGeo, nutGeo } = palmGeometries(low);
    const spots = [];
    const tries = low ? 70 : 150;
    for (let i = 0; i < tries; i++) {
      const x = (rand() < 0.5 ? -1 : 1) * (PLAZA.x + 3 + rand() * 70);
      const z = 45 - rand() * 250;
      spots.push([x, z]);
    }
    for (let i = 0; i < (low ? 8 : 16); i++) spots.push([(rand() - 0.5) * 90, PLAZA.zFar - 6 - rand() * 60]);
    const trunkMap = trunkTexture();
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ map: trunkMap, color: '#c2b29c', roughness: 1, ...(hi && { bumpMap: trunkMap, bumpScale: 2.5 }) }), spots.length);
    const fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.7 }), spots.length);
    const nuts = new THREE.InstancedMesh(nutGeo, new THREE.MeshStandardMaterial({ color: '#5f6428', roughness: 0.55 }), spots.length);
    const q = new THREE.Quaternion(), m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      const h = 8 + rand() * 6;
      q.setFromAxisAngle(Y, rand() * Math.PI * 2);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(h, h, h));
      trunks.setMatrixAt(i, m);
      fronds.setMatrixAt(i, m);
      nuts.setMatrixAt(i, m);
    });
    addWind(trunks.material, fxShared, 'trunk');
    addWind(fronds.material, fxShared, 'frond');
    addWind(nuts.material, fxShared, 'trunk');
    for (const o of [trunks, fronds, nuts]) o.layers.enable(2);
    scene.add(trunks, fronds, nuts);
  }

  // The horizon: coconut and areca plantations and broadleaf trees in a belt
  // beyond the lawn, and low wooded hills far off, fading into the haze.
  // Generic Dakshina Kannada country, not a model of the real skyline.
  const horizonHaze = [];
  {
    const r = prng(9001);
    const { trunkGeo, frondGeo } = palmGeometries(true, false, true);
    const farPalms = [];
    const count = low ? 200 : 420;
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = 110 + r() * 190;
      const x = Math.cos(a) * d, z = -60 + Math.sin(a) * d * 1.2;
      if (Math.abs(x) < PLAZA.x + 60 && z > PLAZA.zFar - 60 && z < 60) continue;
      farPalms.push([x, z, 9 + r() * 7]);
    }
    const fm = new THREE.Matrix4(), fq = new THREE.Quaternion();
    const ft = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#8f8272', roughness: 1 }), farPalms.length);
    const ff = new THREE.InstancedMesh(frondGeo, new THREE.MeshStandardMaterial({ alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8 }), farPalms.length);
    ff.material.map = frondTexture(false);
    farPalms.forEach(([x, z, h], i) => {
      fq.setFromAxisAngle(Y, r() * Math.PI * 2);
      fm.compose(new THREE.Vector3(x, 0, z), fq, new THREE.Vector3(h, h, h));
      ft.setMatrixAt(i, fm); ff.setMatrixAt(i, fm);
    });
    addWind(ff.material, fxShared, 'frond');
    scene.add(ft, ff);

    // broadleaf trees: a trunk and a few lumpy canopy blobs, one draw call
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.25, 0.4, 5, 5); trunk.translate(0, 2.5, 0); parts.push(trunk);
    for (const [x, y, z, s] of [[0, 7, 0, 3.4], [1.8, 6, 0.6, 2.5], [-1.6, 6.3, -0.4, 2.6], [0.3, 8.8, -0.2, 2.2]]) {
      const b = new THREE.IcosahedronGeometry(s, 1);
      const bp = b.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const X = bp.getX(i), Yv = bp.getY(i), Z = bp.getZ(i);
        const k = 0.8 + 0.22 * Math.sin(X * 2.1 + Z * 1.3) * Math.sin(Yv * 2.7 + X) + 0.12 * Math.sin(X * 5.3 + Yv * 4.1 + Z * 3.7);
        bp.setXYZ(i, X * k, Yv * k * 0.8, Z * k);
      }
      b.translate(x, y, z); parts.push(b);
    }
    // welded, so each canopy shades smoothly rather than in facets
    const treeGeo = mergeVertices(mergeGeometries(parts.map((g) => { g.deleteAttribute('normal'); g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; })), 0.01);
    treeGeo.computeVertexNormals();
    const treeSpots = [];
    for (let i = 0; i < (low ? 140 : 300); i++) {
      const a = r() * Math.PI * 2, d = 150 + r() * 200;
      treeSpots.push([Math.cos(a) * d, -60 + Math.sin(a) * d * 1.2, 0.8 + r() * 0.9]);
    }
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: '#35502a', roughness: 0.95 }), treeSpots.length);
    const tc = new THREE.Color();
    treeSpots.forEach(([x, z, sc], i) => {
      fq.setFromAxisAngle(Y, r() * Math.PI * 2);
      fm.compose(new THREE.Vector3(x, 0, z), fq, new THREE.Vector3(sc, sc * (0.9 + r() * 0.4), sc));
      trees.setMatrixAt(i, fm);
      trees.setColorAt(i, tc.setRGB(0.75 + r() * 0.4, 0.8 + r() * 0.35, 0.7 + r() * 0.3));
    });
    scene.add(trees);

    // hills: a ring of ridges ~700 m out, coloured by distance into the sky's haze
    const seg = low ? 160 : 320, ring = [], hidx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const hgt = 18 + 26 * (0.5 + 0.5 * Math.sin(a * 3 + 1.1)) + 14 * Math.sin(a * 7.3 + 0.4) + 8 * Math.sin(a * 17.1 + 2.2) + 4 * Math.sin(a * 41 + 1.7);
      const rad = 720 + 60 * Math.sin(a * 5 + 0.3);
      const x = Math.cos(a) * rad, z = -60 + Math.sin(a) * rad;
      ring.push(x, -2, z, x, Math.max(6, hgt), z);
      if (i < seg) { const k = i * 2; hidx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const hillGeo = new THREE.BufferGeometry();
    hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    hillGeo.setIndex(hidx);
    const hillMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: false,
      uniforms: { uHaze: { value: new THREE.Color('#c9d3dc') }, uLand: { value: new THREE.Color('#2e3d2a') }, uAmount: { value: 0.7 } },
      vertexShader: /* glsl */`varying float vY; void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uHaze, uLand; uniform float uAmount; varying float vY;
        void main() {
          // thicker haze towards the foot of the hills, where the air is deeper
          float a = clamp(uAmount + (1.0 - smoothstep(0.0, 60.0, vY)) * 0.2, 0.0, 1.0);
          gl_FragColor = vec4(mix(uLand, uHaze, a), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const hills = new THREE.Mesh(hillGeo, hillMat);
    hills.renderOrder = -0.4;
    hills.frustumCulled = false;
    scene.add(hills);
    horizonHaze.push(hillMat);
  }

  // Soft contact darkening under objects (grounds them without extra passes).
  const shadowTex = radialTexture('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)');
  const blobMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: '#000', opacity: 0.55 });
  const blob = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), blobMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    scene.add(m);
  };

  /* ---------- lamps: emissive bulbs (bloom) + halos + light pools ---------- */
  const lampColor = ['#ffcf94', '#ffb25e', '#ffd8a0', '#ffc27a', '#ffb347'];
  const G_FLAME = 4;
  const bulbMats = lampColor.map((c) => new THREE.MeshStandardMaterial({ color: '#1a120a', emissive: c, emissiveIntensity: 0, roughness: 0.4 }));
  const bulbs = [[], [], [], [], []];
  const bulb = (group, x, y, z, r = 0.07) => bulbs[group].push([x, y, z, r]);
  const glows = new GlowBuilder();
  const pools = [[], [], [], []];
  const pool = (group, x, y, z, r) => {
    const g = new THREE.PlaneGeometry(r * 2, r * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    pools[group].push(g);
  };

  /* ---------- reflecting pool with floating diyas, before the gateway ---------- */
  const poolFx = buildPool({
    scene, shared: fxShared, reflector, kerbMaterial: marbleWarm, halfW: 3.2, z0: 4.2, z1: 19,
    addFlame: (x, y, z) => bulb(G_FLAME, x, y, z, 0.022),
    addGlow: (x, y, z) => glows.add(x, y, z, 0.32, G_PATH, '#ffc070'),
    addPool: (x, y, z) => pool(G_PATH, x, y, z, 0.45),
  });

  /* ---------- the gateway ---------- */
  const gate = cast(new THREE.Mesh(unitMark, bronze));
  gate.scale.setScalar(LAYOUT.gateHeight);
  gate.position.y = 0.3;
  scene.add(gate);
  const plinthGeo = mergeGeometries([box(18.6, 0.3, 3.4, 0, 0.15, 0, 1.5)]);
  scene.add(cast(new THREE.Mesh(plinthGeo, marbleWarm)));
  blob(0, 0, 22, 7);
  for (const x of [-3.26, 0, 3.26]) {
    bulb(G_PATH, x, 0.34, 1.75, 0.09);
    glows.add(x, 0.36, 1.75, 0.6, G_PATH, '#ffc27a');
    pool(G_PATH, x, 0.31, 1.9, 1.3);
  }

  // Bronze inlay and bollards leading along the path.
  scene.add(new THREE.Mesh(box(0.1, 0.02, 100, 0, 0.01, -58), bronzePolished));
  {
    const zs = [];
    for (let z = -6; z >= -110; z -= 8) zs.push(z);
    const bolGeo = lathe([[0, 0], [0.13, 0], [0.13, 0.03], [0.09, 0.06], [0.08, 0.62], [0.1, 0.66], [0.1, 0.72], [0, 0.74]], low ? 12 : 24);
    const bol = cast(new THREE.InstancedMesh(bolGeo, bronze, zs.length * 2));
    const m = new THREE.Matrix4();
    let i = 0;
    for (const z of zs) for (const x of [-3, 3]) {
      bol.setMatrixAt(i++, m.makeTranslation(x, 0, z));
      bulb(G_PATH, x, 0.69, z, 0.07);
      glows.add(x, 0.69, z, 0.4, G_PATH, '#ffcf8f');
      pool(G_PATH, x, 0.015, z, 1.3);
    }
    scene.add(bol);
  }

  /* ---------- colonnade ---------- */
  {
    const { height, x, zStart, zEnd, step } = LAYOUT.colonnade;
    const { zFrom, zTo } = LAYOUT.stay;
    const spots = [];
    for (let z = zStart; z >= zEnd; z -= step) {
      spots.push([-x, z, Math.PI / 2]);
      // the stay building stands in for the colonnade on its side of the path
      if (z > zFrom + 3 || z < zTo - 3) spots.push([x, z, -Math.PI / 2]);
    }
    const col = cast(new THREE.InstancedMesh(unitMark, bronze, spots.length));
    const q = new THREE.Quaternion(), s = new THREE.Vector3(height, height, height), m = new THREE.Matrix4();
    spots.forEach(([px, pz, ry], i) => {
      q.setFromAxisAngle(Y, ry);
      col.setMatrixAt(i, m.compose(new THREE.Vector3(px, 0, pz), q, s));
      blob(px, pz, 2.2, 6);
    });
    scene.add(col);
  }

  // Where the scanned models go (desktop), and the stand-ins they replace.
  const placements = { tables: [], chairs: [], lanterns: [], stools: [], shelves: [], replaced: { restaurant: [], lanterns: [], stools: [], bottles: [] } };

  /* ---------- restaurant: tables and chairs under a bronze pergola ---------- */
  {
    const { xs, zs, lampY } = LAYOUT.restaurant;
    const seg = low ? 24 : 48;
    const n = xs.length * zs.length;
    const topGeo = scaleUV(cyl(0.72, 0.72, 0.035, seg, 0, 0.755, 0), 0.96, 0.96);
    const tops = cast(new THREE.InstancedMesh(topGeo, tableTop, n));
    const baseGeo = lathe([[0, 0], [0.34, 0], [0.34, 0.015], [0.3, 0.03], [0.06, 0.06], [0.045, 0.1], [0.045, 0.7], [0.12, 0.73], [0.12, 0.738], [0, 0.738]], low ? 16 : 32);
    const bases = cast(new THREE.InstancedMesh(baseGeo, bronzeDark, n));

    // Chair: bronze legs, lacquered back, fabric seat. Faces +z.
    const frameGeo = mergeGeometries([
      ...[[-0.19, 0.19], [0.19, 0.19], [-0.19, -0.19], [0.19, -0.19]].map(([x, z]) => cyl(0.014, 0.012, 0.45, 6, x, 0.225, z)),
      cyl(0.014, 0.014, 0.44, 6, -0.19, 0.67, -0.2), cyl(0.014, 0.014, 0.44, 6, 0.19, 0.67, -0.2),
    ]);
    const backGeo = rbox(0.44, 0.24, 0.035, 0.012, 0, 0.78, -0.21);
    const seatGeo = rbox(0.46, 0.07, 0.45, 0.03, 0, 0.485, 0);
    const chairsN = n * 4;
    const chairFrames = cast(new THREE.InstancedMesh(frameGeo, bronzeDark, chairsN));
    const chairBacks = cast(new THREE.InstancedMesh(backGeo, wood, chairsN));
    const chairSeats = cast(new THREE.InstancedMesh(seatGeo, fabric, chairsN));

    const shadeGeo = mergeGeometries([
      lathe([[0.02, 0.36], [0.06, 0.34], [0.2, 0.22], [0.3, 0.06], [0.33, 0], [0.32, -0.01], [0.29, 0.05], [0.19, 0.2], [0.05, 0.32], [0.02, 0.33]], low ? 20 : 40),
      cyl(0.006, 0.006, 4.05 - lampY, 4, 0, 0.36 + (4.05 - lampY) / 2, 0),
    ]);
    const shades = cast(new THREE.InstancedMesh(shadeGeo, bronzePolished, n), false);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    let i = 0, k = 0;
    for (const x of xs) for (const z of zs) {
      m.makeTranslation(x, 0, z);
      tops.setMatrixAt(i, m); bases.setMatrixAt(i, m);
      placements.tables.push(m.clone());
      placements.lanterns.push(new THREE.Matrix4().makeTranslation(x, 0, z));
      shades.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, lampY, z));
      for (let c = 0; c < 4; c++) {
        const a = c * Math.PI / 2 + Math.PI / 4;
        const dx = Math.sin(a) * 0.98, dz = Math.cos(a) * 0.98;
        q.setFromAxisAngle(Y, Math.atan2(-dx, -dz));
        const cm = new THREE.Matrix4().compose(new THREE.Vector3(x + dx, 0, z + dz), q, one);
        chairFrames.setMatrixAt(k, cm); chairBacks.setMatrixAt(k, cm); chairSeats.setMatrixAt(k, cm);
        placements.chairs.push(cm.clone());
        k++;
      }
      bulb(G_RESTAURANT, x, lampY + 0.08, z, 0.06);
      glows.add(x, lampY + 0.02, z, 0.9, G_RESTAURANT, '#ffd29a');
      pool(G_RESTAURANT, x, 0.78, z, 1.0);
      blob(x, z, 3.2, 3.2);
      i++;
    }
    scene.add(tops, bases, chairFrames, chairBacks, chairSeats, shades);
    placements.replaced.restaurant.push(tops, bases, chairFrames, chairBacks, chairSeats);
    placements.replaced.lanterns.push(shades);

    const px = 6.2, z0 = -15.5, z1 = -31.5, top = 3.95;
    const parts = [];
    for (const x of [-px, px]) for (const z of [z0, (z0 + z1) / 2, z1]) parts.push(rbox(0.16, top, 0.16, 0.02, x, top / 2, z));
    for (const x of [-px, px]) parts.push(rbox(0.14, 0.2, z0 - z1 + 0.3, 0.02, x, top, (z0 + z1) / 2));
    for (let z = z0; z >= z1 - 0.01; z -= 2) parts.push(rbox(px * 2 + 0.3, 0.08, 0.06, 0.01, 0, top + 0.1, z));
    scene.add(cast(new THREE.Mesh(mergeGeometries(parts), bronze)));
  }

  /* ---------- stay: a plastered building whose windows light up ---------- */
  // The facade is a 35 cm slab with real openings, so windows sit in reveals
  // and cast their own shadows; balconies, sills, AC units, a parapet with
  // water tanks, and the name on the roof line.
  const windows = [];
  let roomMesh, signGlow;
  {
    const { x, zFrom, zTo, floors, cols, floorHeight } = LAYOUT.stay;
    const len = zFrom - zTo, h = floors * floorHeight + 0.8, depth = 9, slab = 0.35;
    const zc = (zFrom + zTo) / 2;
    const winW = 1.7, winH = 2.1, spacing = len / cols;
    const ez = zFrom - spacing * 3, doorW = 3.8, doorH = 2.8;

    // body behind the facade slab
    scene.add(cast(new THREE.Mesh(box(depth - slab, h, len, x + slab + (depth - slab) / 2, h / 2, zc, 3), plaster)));
    blob(x + 1, zc, 5, len + 3);

    // facade slab with openings; shape u runs along the facade from zFrom
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(len, 0); shape.lineTo(len, h); shape.lineTo(0, h); shape.lineTo(0, 0);
    const openings = [], sills = [];
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      if (f === 0 && (c === 2 || c === 3)) continue; // entrance
      const u = spacing * (c + 0.5), wy = f * floorHeight + 0.55 + winH / 2 + 0.2;
      openings.push({ u, y: wy, w: winW, h: winH, f, c });
      sills.push({ u, y: wy - winH / 2, w: winW + 0.3 });
      windows.push({ y: wy, z: zFrom - u, threshold: 0.08 + rand() * 0.84, lit: -1 });
    }
    for (const o of openings) {
      const hole = new THREE.Path();
      hole.moveTo(o.u - o.w / 2, o.y - o.h / 2); hole.lineTo(o.u - o.w / 2, o.y + o.h / 2);
      hole.lineTo(o.u + o.w / 2, o.y + o.h / 2); hole.lineTo(o.u + o.w / 2, o.y - o.h / 2); hole.lineTo(o.u - o.w / 2, o.y - o.h / 2);
      shape.holes.push(hole);
    }
    const du = zFrom - ez;
    const door = new THREE.Path();
    door.moveTo(du - doorW / 2, 0.02); door.lineTo(du - doorW / 2, doorH); door.lineTo(du + doorW / 2, doorH); door.lineTo(du + doorW / 2, 0.02); door.lineTo(du - doorW / 2, 0.02);
    shape.holes.push(door);
    const facadeGeo = new THREE.ExtrudeGeometry(shape, { depth: slab, bevelEnabled: false, curveSegments: 1 });
    scaleUV(facadeGeo, 1 / 3, 1 / 3);
    facadeGeo.rotateY(Math.PI / 2);
    facadeGeo.translate(x, 0, zFrom);
    const facadeMat = plaster.clone();
    grimePlaster(facadeMat, grimeTexture(len, h, sills), new THREE.Vector3(zFrom, len, h));
    applySet(facadeMat, loadSet('plaster', res, maxAniso), 1, redraw);
    scene.add(cast(new THREE.Mesh(facadeGeo, facadeMat)));

    // window frames set back in the reveals, projecting stone sills, floor bands
    const frames = [], stone = [];
    for (const o of openings) {
      const z = zFrom - o.u, fx = x + slab - 0.1;
      frames.push(box(0.08, o.h, 0.06, fx, o.y, z - o.w / 2 + 0.03), box(0.08, o.h, 0.06, fx, o.y, z + o.w / 2 - 0.03),
        box(0.08, 0.06, o.w, fx, o.y + o.h / 2 - 0.03, z), box(0.08, 0.06, o.w, fx, o.y - o.h / 2 + 0.03, z), box(0.06, 0.04, o.w, fx, o.y + 0.2, z));
      stone.push(box(0.5, 0.07, o.w + 0.3, x + 0.08, o.y - o.h / 2 - 0.035, z));
    }
    for (let f = 1; f <= floors; f++) stone.push(rbox(0.16, 0.12, len, 0.02, x - 0.06, f * floorHeight - 0.1, zc));
    stone.push(box(0.4, 0.6, len + 0.1, x + 0.1, 0.3, zc, 1.5)); // plinth band
    scene.add(cast(new THREE.Mesh(mergeGeometries(frames), bronzeDark)));
    scene.add(cast(new THREE.Mesh(mergeGeometries(stone), marbleWarm)));

    // balconies on the upper floors: slab, bronze rail, glass front
    const balcSlabs = [], balcRails = [], balcGlass = [];
    for (const o of openings) {
      if (o.f === 0 || (o.c + o.f) % 2) continue;
      const z = zFrom - o.u, y0 = o.y - o.h / 2 - 0.1, bw = o.w + 0.9, bd = 1.0;
      balcSlabs.push(rbox(bd, 0.14, bw, 0.03, x - bd / 2, y0, z));
      balcRails.push(cyl(0.025, 0.025, bw, 10, 0, 0, 0).rotateX(Math.PI / 2).translate(x - bd + 0.05, y0 + 1.05, z));
      for (const dz of [-bw / 2 + 0.03, bw / 2 - 0.03]) balcRails.push(box(bd, 0.04, 0.04, x - bd / 2, y0 + 1.05, z + dz), cyl(0.02, 0.02, 1.0, 8, x - bd + 0.05, y0 + 0.55, z + dz));
      balcGlass.push(box(0.02, 0.9, bw - 0.1, x - bd + 0.06, y0 + 0.55, z));
    }
    if (balcSlabs.length) {
      scene.add(cast(new THREE.Mesh(mergeGeometries(balcSlabs), marbleWarm)));
      scene.add(cast(new THREE.Mesh(mergeGeometries(balcRails), bronze)));
      scene.add(new THREE.Mesh(mergeGeometries(balcGlass), new THREE.MeshStandardMaterial({ color: '#b9c6cc', metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false })));
    }

    // outdoor AC units beside some windows
    const acs = [];
    for (const o of openings) {
      if (rand() > 0.3 || o.f === 0) continue;
      const z = zFrom - o.u + (o.w / 2 + 0.7) * (rand() < 0.5 ? -1 : 1);
      acs.push(rbox(0.32, 0.55, 0.8, 0.03, x - 0.17, o.y - 0.55, z));
    }
    if (acs.length) scene.add(cast(new THREE.Mesh(mergeGeometries(acs), new THREE.MeshStandardMaterial({ color: '#d8d5ce', roughness: 0.55, metalness: 0.1 }))));

    // parapet and coping; black water tanks on the roof
    scene.add(cast(new THREE.Mesh(box(0.35, 0.9, len, x + 0.17, h + 0.45, zc, 3), facadeMat)));
    scene.add(cast(new THREE.Mesh(rbox(0.5, 0.08, len + 0.2, 0.02, x + 0.17, h + 0.94, zc), marbleWarm)));
    const tankMat = new THREE.MeshStandardMaterial({ color: '#1b1b1c', roughness: 0.6 });
    for (const dz of [-6, 5]) {
      const tank = new THREE.Mesh(mergeGeometries([cyl(0.75, 0.8, 1.5, 20, 0, 0.75, 0), cyl(0.3, 0.75, 0.2, 20, 0, 1.6, 0)]), tankMat);
      tank.position.set(x + 4, h + 0.3, zc + dz);
      scene.add(cast(tank));
      scene.add(new THREE.Mesh(box(1.8, 0.3, 1.8, x + 4, h + 0.15, zc + dz), marbleWarm));
    }

    // the name on the roof line, above the entrance, with a warm glow at night
    const logoGeo = markGeometry(logoText, low);
    const sign = new THREE.Mesh(logoGeo, bronzePolished);
    sign.scale.setScalar(2.4);
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(x + 0.1, h + 0.98, ez);
    scene.add(cast(sign, false));
    signGlow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.2), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,190,120,0.9)', 'rgba(255,190,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    signGlow.rotation.y = -Math.PI / 2;
    signGlow.position.set(x + 0.2, h + 2.2, ez);
    scene.add(signGlow);

    // entrance canopy with down-lights over glazed doors
    scene.add(cast(new THREE.Mesh(rbox(2.4, 0.18, 7, 0.04, x - 1.1, 3.1, ez), bronze)));
    for (const dz of [-3.2, 3.2]) scene.add(cast(new THREE.Mesh(cyl(0.05, 0.05, 3.05, 12, x - 2.1, 1.52, ez + dz), bronze)));
    for (const dz of [-2.2, 0, 2.2]) { bulb(G_PATH, x - 1.2, 2.98, ez + dz, 0.06); pool(G_PATH, x - 1.2, 0.02, ez + dz, 1.2); }

    const winGeo = new THREE.PlaneGeometry(winW, winH);
    winGeo.rotateY(-Math.PI / 2);
    roomMesh = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({ map: roomTexture(), color: '#ffffff' }), windows.length + 1);
    const glass = new THREE.InstancedMesh(winGeo, new THREE.MeshStandardMaterial({ color: '#2a3038', metalness: 1, roughness: 0.06, transparent: true, opacity: 0.6 }), windows.length + 1);
    windows.forEach((w, i) => {
      roomMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + slab - 0.015, w.y, w.z)); // just in front of the body wall
      glass.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + slab - 0.12, w.y, w.z));
      roomMesh.setColorAt(i, C('#000000'));
    });
    // lobby doors, wider and always the first to light
    const lobby = windows.length;
    windows.push({ y: doorH / 2, z: ez, threshold: 0.02, lit: -1 });
    const dm = new THREE.Matrix4().compose(new THREE.Vector3(x + slab - 0.015, doorH / 2 + 0.02, ez), new THREE.Quaternion(), new THREE.Vector3(1, doorH / winH, doorW / winW));
    roomMesh.setMatrixAt(lobby, dm);
    glass.setMatrixAt(lobby, dm.clone().setPosition(x + slab - 0.12, doorH / 2 + 0.02, ez));
    roomMesh.setColorAt(lobby, C('#000000'));
    scene.add(roomMesh, glass);
  }
  const winOff = C('#20242c'), winOn = C('#ffffff').multiplyScalar(2.2), winTmp = new THREE.Color();

  /* ---------- bar: a lacquered counter under a low canopy ---------- */
  const barLight = new THREE.PointLight('#ffb468', 0, 0, 2);
  let stripMat;
  {
    const { x, zFrom, zTo } = LAYOUT.bar;
    const len = zFrom - zTo, zc = (zFrom + zTo) / 2;
    scene.add(cast(new THREE.Mesh(box(0.72, 1.05, len, x, 0.525, zc, 1), wood)));
    scene.add(cast(new THREE.Mesh(rbox(0.98, 0.06, len + 0.2, 0.02, x + 0.05, 1.08, zc), bronzePolished)));
    scene.add(new THREE.Mesh(cyl(0.025, 0.025, len, 12, 0, 0, 0).rotateX(Math.PI / 2).translate(x + 0.55, 0.22, zc), bronzePolished));
    const bx = x - 2.3;
    scene.add(cast(new THREE.Mesh(box(0.25, 3.4, len, bx, 1.7, zc, 1), woodDark)));
    const shelves = [];
    for (const sy of [1.35, 2.05, 2.75]) shelves.push(rbox(0.4, 0.05, len - 0.6, 0.01, bx + 0.25, sy, zc));
    scene.add(cast(new THREE.Mesh(mergeGeometries(shelves), bronzeDark)));
    stripMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb066', emissiveIntensity: 0 });
    const strips = [];
    for (const sy of [1.35, 2.05, 2.75]) strips.push(box(0.02, 0.025, len - 0.8, bx + 0.3, sy - 0.045, zc)); // under each shelf, clear of it
    scene.add(new THREE.Mesh(mergeGeometries(strips), stripMat));
    const nb = low ? 42 : 96;
    const bottleGeo = lathe([[0, 0], [0.045, 0], [0.047, 0.01], [0.047, 0.2], [0.03, 0.25], [0.015, 0.28], [0.015, 0.34], [0, 0.34]], low ? 8 : 14);
    const bottle = new THREE.InstancedMesh(bottleGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.08, metalness: 0.1, emissive: '#3a1c08', emissiveIntensity: 0.4 }), nb);
    const tones = ['#5a3312', '#2f4a2c', '#7a4a1c', '#c9b99a', '#3b1d10', '#6b2a1e'];
    for (let i = 0; i < nb; i++) {
      const sy = [1.375, 2.075, 2.775][i % 3];
      const s = 0.85 + rand() * 0.35;
      bottle.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(bx + 0.28, sy, zFrom - 0.5 - rand() * (len - 1)), new THREE.Quaternion(), new THREE.Vector3(1, s, 1)));
      bottle.setColorAt(i, C(tones[i % tones.length]));
    }
    scene.add(bottle);
    placements.replaced.bottles.push(bottle);
    for (const sy of [1.375, 2.075, 2.775]) for (let z = zFrom - 0.9; z > zTo + 0.6; z -= 1.7) {
      placements.shelves.push(new THREE.Matrix4().compose(new THREE.Vector3(bx + 0.27, sy, z + (rand() - 0.5) * 0.3), new THREE.Quaternion().setFromAxisAngle(Y, rand() * Math.PI * 2), new THREE.Vector3(1, 1, 1)));
    }
    scene.add(cast(new THREE.Mesh(box(6, 0.18, len + 2, x - 0.4, 4.3, zc, 1), woodDark)));
    for (const cz of [zFrom + 0.8, zTo - 0.8]) for (const cx of [x - 3.2, x + 2.4]) scene.add(cast(new THREE.Mesh(rbox(0.16, 4.3, 0.16, 0.02, cx, 2.15, cz), bronzeDark))); // matte: polished posts flare under the bar lamps
    const ns = Math.floor(len / 1.6);
    const stoolGeo = mergeGeometries([
      lathe([[0, 0.74], [0.2, 0.74], [0.21, 0.76], [0.2, 0.8], [0, 0.81]], 20),
      cyl(0.028, 0.028, 0.74, 8, 0, 0.37, 0),
      lathe([[0, 0], [0.2, 0], [0.2, 0.015], [0.03, 0.03], [0, 0.03]], 20),
      lathe([[0.14, 0.28], [0.15, 0.285], [0.14, 0.29]], 20),
    ]);
    const stool = cast(new THREE.InstancedMesh(stoolGeo, leather, ns));
    const lampGeo = mergeGeometries([
      lathe([[0.01, 0.22], [0.08, 0.2], [0.14, 0.1], [0.15, 0], [0.14, -0.01], [0.13, 0.09], [0.07, 0.18], [0.01, 0.2]], 24),
      cyl(0.005, 0.005, 1.5, 4, 0, 0.95, 0),
    ]);
    const lamps = new THREE.InstancedMesh(lampGeo, bronzePolished, ns);
    for (let i = 0; i < ns; i++) {
      const z = zFrom - 0.8 - i * 1.6;
      stool.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + 1.05, 0, z));
      placements.stools.push(new THREE.Matrix4().makeRotationY(rand() * Math.PI * 2).setPosition(x + 1.05, 0, z));
      lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 2.5, z));
      bulb(G_BAR, x, 2.53, z, 0.05);
      glows.add(x, 2.5, z, 0.7, G_BAR, '#ffb35f');
      pool(G_BAR, x + 0.05, 1.115, z, 0.55);
      pool(G_BAR, x + 1.1, 0.015, z, 0.9);
    }
    scene.add(stool, lamps);
    placements.replaced.stools.push(stool);
    blob(x, zc, 3, len + 2);
    barLight.position.set(x + 0.6, 2.6, zc);
    scene.add(barLight);
  }

  /* ---------- hall: a rotunda of marks, lit for an event ---------- */
  const hallLight = new THREE.PointLight('#ffc27a', 0, 0, 2);
  let festive;
  {
    const { x: cx, z: cz, radius, marks, markHeight } = LAYOUT.hall;
    const daisGeo = scaleUV(cyl(radius + 1.5, radius + 1.6, 0.14, low ? 48 : 96, cx, 0.07, cz), (2 * radius + 3) / 1.5, 1);
    scene.add(cast(new THREE.Mesh(daisGeo, marbleWarm)));
    const inlay = new THREE.Mesh(new THREE.RingGeometry(4.8, 4.95, low ? 64 : 128), bronzePolished);
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.set(cx, 0.145, cz);
    scene.add(inlay);

    const ring = cast(new THREE.InstancedMesh(unitMark, bronze, marks));
    const q = new THREE.Quaternion(), s = new THREE.Vector3(markHeight, markHeight, markHeight), m = new THREE.Matrix4();
    const tops = [];
    for (let k = 0; k < marks; k++) {
      const th = ((k + 0.5) / marks) * Math.PI * 2; // gap faces the approach (+z)
      const px = cx + Math.sin(th) * radius, pz = cz + Math.cos(th) * radius;
      q.setFromAxisAngle(Y, th + Math.PI);
      ring.setMatrixAt(k, m.compose(new THREE.Vector3(px, 0.14, pz), q, s));
      tops.push(new THREE.Vector3(px, markHeight * 0.96 + 0.14, pz));
    }
    scene.add(ring);

    const chY = 8;
    const ch = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.05, 12, low ? 64 : 128), bronzePolished);
    ch.rotation.x = Math.PI / 2;
    ch.position.set(cx, chY, cz);
    scene.add(ch);
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      bulb(G_HALL, cx + Math.cos(a) * 2.4, chY - 0.08, cz + Math.sin(a) * 2.4, 0.05);
    }
    glows.add(cx, chY - 0.3, cz, 3.0, G_HALL, '#ffb96a');
    const perStrand = low ? 9 : 14;
    const centre = new THREE.Vector3(cx, chY, cz);
    const strand = (a, b, sag, size) => {
      for (let j = 1; j < perStrand; j++) {
        const f = j / perStrand;
        const p = a.clone().lerp(b, f);
        p.y -= Math.sin(f * Math.PI) * sag;
        bulb(G_HALL, p.x, p.y, p.z, size);
        if (j % 3 === 0) glows.add(p.x, p.y, p.z, 0.3, G_HALL, '#ffe0b0');
      }
    };
    for (const t of tops) strand(t, centre, 1.4, 0.035);
    for (let k = 0; k < tops.length - 1; k++) strand(tops[k], tops[k + 1], 1.1, 0.03); // entrance left open
    pool(G_HALL, cx, 0.15, cz, 8);
    ring.layers.enable(2);
    buildHallDecor({
      scene, low, cx, cz, radius, tops, chandelier: { r: 2.4, y: chY }, marble: marbleWarm, brass: bronzePolished,
      addFlame: (x, y, z) => bulb(G_FLAME, x, y, z, 0.02),
      addGlow: (x, y, z) => glows.add(x, y, z, 0.55, G_HALL, '#ffc27a'),
    });

    const n = low ? 90 : 220;
    const base = [], speed = [];
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (radius - 1.5);
      base.push(cx + Math.cos(a) * r, rand() * 10, cz + Math.sin(a) * r);
      speed.push(0.25 + rand() * 0.5);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
    fg.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speed, 1));
    festive = new THREE.Points(fg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uScale: { value: 400 }, uColor: { value: C('#ffb45e') } },
      vertexShader: /* glsl */`
        attribute float aSpeed; uniform float uTime, uScale; varying float vFade;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * aSpeed, 10.0) + 0.3;
          p.x += sin(uTime * 0.6 + position.z) * 0.25;
          vFade = sin(p.y / 10.3 * 3.14159);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(0.09 * uScale / -mv.z, 28.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uAmount; varying float vFade;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          gl_FragColor = vec4(uColor * exp(-d * d * 5.0) * vFade * uAmount * 1.4, 1.0);
        }`,
    }));
    festive.frustumCulled = false;
    scene.add(festive);
    hallLight.position.set(cx, 8.3, cz); // at the chandelier: lower, it glares off the nearest arches
    scene.add(hallLight);
  }

  const gateLight = new THREE.PointLight('#ffc27a', 0, 0, 2);
  gateLight.position.set(0, 1.2, 4);
  scene.add(gateLight);

  /* ---------- assemble lamps ---------- */
  const bulbGeo = new THREE.SphereGeometry(1, 12, 8);
  // each group flickers its own way: diya lanterns and open flames most
  [[0.18, 1], [0.04, 0.6], [0.1, 1.3], [0.05, 0.8], [0.3, 1.4]].forEach(([amt, spd], gi) => addFlicker(bulbMats[gi], fxShared, amt, spd));
  bulbs.forEach((list, gi) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(bulbGeo, bulbMats[gi], list.length);
    list.forEach(([x, y, z, r], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, r, r))));
    scene.add(im);
  });
  const glowMat = glowMaterial();
  scene.add(glows.build(glowMat));
  const poolTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const poolMats = ['#ffcf8f', '#ffb35f', '#ffcf8f', '#ffc27a'].map((c) => new THREE.MeshBasicMaterial({
    map: poolTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  pools.forEach((list, gi) => { if (list.length) scene.add(new THREE.Mesh(mergeGeometries(list), poolMats[gi])); });

  const rainFx = buildRain({ scene, shared: fxShared, count: low ? 2600 : 7000 });
  {
    const { x, zFrom, zTo } = LAYOUT.bar;
    rainFx.setRoof(new THREE.Vector3(x - 3.5, -1, zTo - 1.2), new THREE.Vector3(x + 2.7, 4.3, zFrom + 1.2));
  }

  /* ---------- lights ---------- */
  const hemi = new THREE.HemisphereLight('#fff', '#888', 1);
  const sun = new THREE.DirectionalLight('#fff', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  const sc = sun.shadow.camera;
  const span = low ? 26 : 34;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(hemi, sun, sun.target);

  /* ---------- reflection environments, one per time of day ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envs = {};
  const groundTone = { dawn: '#7d6552', day: '#b3a28c', dusk: '#62493a' };
  for (const [key, mood] of [['dawn', MOODS[0]], ['day', MOODS[1]], ['dusk', MOODS[2]]]) {
    const es = new THREE.Scene();
    const s = new Sky();
    s.scale.setScalar(200);
    setSky(s, mood);
    es.add(s);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 32), new THREE.MeshBasicMaterial({ color: groundTone[key] }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    es.add(ground);
    envs[key] = pmrem.fromScene(es, 0.02, 0.1, 500).texture;
  }
  {
    // Night: a dark sky with warm lamp-lit shapes around, for bronze highlights.
    const es = new THREE.Scene();
    es.background = C('#07070b');
    const warm = new THREE.MeshBasicMaterial({ color: C('#ffb168').multiplyScalar(1.4) });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2 + rand() * 2, 3), warm);
      b.position.set(Math.cos(a) * 30, 2 + rand() * 4, Math.sin(a) * 30);
      es.add(b);
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 32), new THREE.MeshBasicMaterial({ color: '#1b1410' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    es.add(ground);
    envs.night = pmrem.fromScene(es, 0.03, 0.1, 500).texture;
  }
  pmrem.dispose();

  /* ---------- post-processing ---------- */
  // Desktop renders the scene into ScenePass's own multisampled target, so the
  // composer's buffers need no MSAA: every later full-screen pass would
  // otherwise render into, and resolve, a 4x target for nothing.
  const depthChain = !low && isWebGL2;
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isWebGL2 && !depthChain ? 2 : 0 });
  const composer = new EffectComposer(renderer, rt);
  let scenePass = null, depthFx = null, dof = null, sunMask = null, taa = null;
  if (depthChain) {
    // desktop: render into a target with depth, then ambient occlusion, light
    // shafts and depth of field read it
    scenePass = new ScenePass(scene, camera, 4);
    sunMask = new SunMask(1024);
    sunMask.scene = scene;
    depthFx = new DepthFxPass(camera, scenePass, sunMask);
    dof = new DofPass(camera, scenePass);
    taa = new TaaPass(camera, scenePass);
    composer.addPass(scenePass);
    composer.addPass(depthFx);
    composer.addPass(taa);
    composer.addPass(dof);
  } else {
    composer.addPass(new RenderPass(scene, camera));
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.8, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grain = new ShaderPass(GrainShader);
  composer.addPass(grain);

  /* ---------- moods (pre-parsed) ---------- */
  const colourKeys = ['sunColor', 'hemiSky', 'hemiGround', 'fog'];
  const moods = MOODS.map((m) => {
    const o = { ...m };
    for (const k of colourKeys) o[k] = C(m[k]);
    return o;
  });
  const cur = { ...moods[0] };
  for (const k of colourKeys) cur[k] = moods[0][k].clone();
  const lightDir = new THREE.Vector3();
  let envKey = '';
  const marbleBase = marble.color.clone(), marbleWarmBase = marbleWarm.color.clone();
  let allowBloom = true, allowShadows = true, allowTaa = true;

  function applyMood(p) {
    const i = Math.min(moods.length - 2, Math.floor(p));
    const f = smooth(clamp01(p - i));
    const a = moods[i], b = moods[i + 1];
    for (const k of Object.keys(a)) {
      if (colourKeys.includes(k)) cur[k].copy(a[k]).lerp(b[k], f);
      else if (typeof a[k] === 'number') cur[k] = a[k] + (b[k] - a[k]) * f;
      else cur[k] = f < 0.5 ? a[k] : b[k];
    }
    setSky(sky, cur);
    nightDome.material.uniforms.uAmount.value = clamp01((2 - cur.skyElev) / 10);
    nightDome.visible = nightDome.material.uniforms.uAmount.value > 0.001;
    lightDir.setFromSphericalCoords(1, deg(90 - cur.lightElev), deg(cur.lightAzim));
    sun.color.copy(cur.sunColor);
    sun.intensity = cur.sunIntensity;
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    hemi.intensity = cur.hemiIntensity;
    scene.fog.color.copy(cur.fog);
    scene.fog.near = cur.fogNear;
    scene.fog.far = cur.fogFar;
    if (cur.env !== envKey) { envKey = cur.env; scene.environment = envs[envKey]; }
    scene.environmentIntensity = cur.envIntensity;
    renderer.toneMappingExposure = cur.exposure;
    // Pay only for what the time of day shows: glow when it is visible (dusk
    // and night), shadow-map updates when the sun is strong enough to matter.
    bloom.strength = cur.bloom;
    bloom.enabled = allowBloom && cur.bloom > 0.15;
    renderer.shadowMap.autoUpdate = allowShadows && cur.sunIntensity > 0.6;
    starMat.opacity = cur.stars;
    cloudUniforms.uCover.value = cur.cloudCover;
    cloudUniforms.uBright.value = cur.cloudBright;
    cloudUniforms.uSunDir.value.setFromSphericalCoords(1, deg(90 - Math.max(cur.skyElev, 2)), deg(cur.skyAzim));
    cloudUniforms.uLit.value.copy(cur.sunColor).lerp(C('#ffffff'), 0.35);
    cloudUniforms.uShade.value.copy(cur.hemiSky).multiplyScalar(0.8);
    mistMat.opacity = cur.mist;
    mist.visible = cur.mist > 0.01;
    mistMat.color.copy(cur.fog);
    if (reflector) reflector.material.uniforms.uStrength.value = cur.reflect;
    signGlow.material.opacity = 0.55 * cur.lamps;
    fxShared.uRain.value = cur.rain;
    fxShared.uWind.value = 1 + cur.rain * 1.4;
    // wet stone: glossier and a little darker, stronger reflections
    marble.roughness = 0.85 - 0.5 * cur.wet;
    marbleWarm.roughness = 0.7 - 0.42 * cur.wet;
    marble.color.copy(marbleBase).multiplyScalar(1 - 0.18 * cur.wet);
    marbleWarm.color.copy(marbleWarmBase).multiplyScalar(1 - 0.18 * cur.wet);
    if (reflector) reflector.material.uniforms.uStrength.value = cur.reflect + 0.22 * cur.wet;
    if (depthFx) {
      const u = depthFx.mainQuad.material.uniforms;
      u.uRays.value = cur.rays;
      u.uColor.value.copy(cur.sunColor).multiplyScalar(Math.min(cur.sunIntensity, 3.4) * 0.07);
      u.uSunDir.value.copy(lightDir);
      u.uAO.value = 0.55;
    }
    stars.visible = cur.stars > 0.01;
    for (const m of horizonHaze) { m.uniforms.uHaze.value.copy(cur.fog); m.uniforms.uAmount.value = 0.55 + 0.25 * clamp01(cur.mist * 2); }

    const L = cur.lamps, F = cur.festive, H = Math.max(F, L * 0.5);
    const lampLevel = [L, L, H, L, L];
    bulbMats.forEach((mat, gi) => { mat.emissiveIntensity = 1.25 * lampLevel[gi]; });
    glowMat.uniforms.uGroups.value.set(L, L, H, L);
    poolMats[G_RESTAURANT].opacity = 0.45 * L;
    poolMats[G_BAR].opacity = 0.4 * L;
    poolMats[G_HALL].opacity = 0.18 * H;
    poolMats[G_PATH].opacity = 0.45 * L;
    barLight.intensity = 30 * L;
    hallLight.intensity = 34 * Math.max(F, L * 0.4);
    gateLight.intensity = 25 * L;
    stripMat.emissiveIntensity = 3.2 * L;
    festive.material.uniforms.uAmount.value = F;
    festive.visible = F > 0.01;

    // windows switch on one by one as the evening arrives
    let changed = false;
    windows.forEach((w, idx) => {
      const lit = smooth(clamp01((cur.windows - w.threshold) / 0.08 + 0.5));
      if (Math.abs(lit - w.lit) < 0.002) return;
      w.lit = lit;
      roomMesh.setColorAt(idx, winTmp.copy(winOff).lerp(winOn, lit));
      changed = true;
    });
    if (changed) roomMesh.instanceColor.needsUpdate = true;
  }

  /* ---------- camera path ---------- */
  // Keys may carry portrait-only overrides (`portrait: { pos, look }`) for
  // tall phone screens, where the text takes the lower part of the view.
  const toKeys = (portrait) => CAMERA_KEYS.map((k) => {
    const o = (portrait && k.portrait) || k;
    return { p: k.p, pos: new THREE.Vector3(...(o.pos || k.pos)), look: new THREE.Vector3(...(o.look || k.look)) };
  });
  const landscapeKeys = toKeys(false), portraitKeys = toKeys(true);
  let keys = landscapeKeys;
  const catmull = (out, a, b, c, d, t) => {
    const t2 = t * t, t3 = t2 * t;
    return out.set(0, 0, 0)
      .addScaledVector(a, -0.5 * t3 + t2 - 0.5 * t)
      .addScaledVector(b, 1.5 * t3 - 2.5 * t2 + 1)
      .addScaledVector(c, -1.5 * t3 + 2 * t2 + 0.5 * t)
      .addScaledVector(d, 0.5 * t3 - 0.5 * t2);
  };
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  function sampleCamera(p) {
    const last = keys.length - 1;
    p = Math.min(keys[last].p, Math.max(keys[0].p, p));
    let i = 0;
    while (i < last - 1 && p > keys[i + 1].p) i++;
    const t = (p - keys[i].p) / (keys[i + 1].p - keys[i].p);
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(last, i + 2)];
    catmull(pos, k0.pos, k1.pos, k2.pos, k3.pos, t);
    catmull(look, k0.look, k1.look, k2.look, k3.look, t);
  }

  // The shadow map covers the area the camera is looking at, from the light's side.
  const shadowFocus = new THREE.Vector3();
  function placeSun() {
    shadowFocus.lerpVectors(pos, look, 0.5);
    shadowFocus.y = 0;
    sun.target.position.copy(shadowFocus);
    sun.position.copy(shadowFocus).addScaledVector(lightDir, 100);
    if (sunMask && cur.rays > 0.001) sunMask.place(shadowFocus, lightDir);
  }

  /* ---------- sizing and quality ---------- */
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    bloom.resolution.set(Math.round(w * (low ? 0.35 : 0.5)), Math.round(h * (low ? 0.35 : 0.5)));
    camera.aspect = w / h;
    // On portrait screens the text panel covers the lower part of the view,
    // so render the lower part of a taller frustum: the subject sits higher.
    keys = camera.aspect < 0.8 ? portraitKeys : landscapeKeys;
    if (camera.aspect < 0.8) {
      camera.fov = 66;
      camera.setViewOffset(w, h * 1.36, 0, h * 0.36, w, h);
    } else {
      camera.fov = camera.aspect < 1.2 ? 52 : 42;
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    const fullHeight = renderer.getDrawingBufferSize(new THREE.Vector2()).y * (camera.view && camera.view.enabled ? 1.36 : 1);
    const scale = fullHeight / (2 * Math.tan(deg(camera.fov) / 2));
    glowMat.uniforms.uScale.value = scale;
    festive.material.uniforms.uScale.value = scale;
    const range = renderer.getContext().getParameter(renderer.getContext().ALIASED_POINT_SIZE_RANGE);
    glowMat.uniforms.uMax.value = Math.min(range ? range[1] : 256, 512);
    needsRender = true;
  }

  // If frames are slow, give up effects one at a time, in order of what each
  // costs against what it shows (measured on an Intel Iris Xe at 1440x900:
  // grass ~16 ms, ambient occlusion ~17 ms, marble mirror ~18 ms; depth of
  // field and TAA ~1-2 ms each).
  const debug = new URLSearchParams(location.search).has('debug');
  const ladder = [
    function grassOff() { if (!grass || !grass.mesh.visible) return false; grass.mesh.visible = false; return true; },
    function ambientOcclusionOff() { if (!depthFx || !depthFx.aoEnabled) return false; depthFx.aoEnabled = false; return true; },
    function reflectionsOff() { if (!reflector || !reflector.visible) return false; reflector.visible = false; return true; },
    function lightShaftsOff() { if (!depthFx || !depthFx.raysEnabled) return false; depthFx.raysEnabled = false; return true; },
    function depthOfFieldOff() { if (!dof || !dof.enabled) return false; dof.enabled = false; return true; },
    function temporalAAOff() { if (!taa || !allowTaa) return false; allowTaa = false; taa.enabled = false; return true; },
    function pixelRatioDown() {
      const r = renderer.getPixelRatio();
      const next = [1.5, 1.25].find((v) => v < r - 0.01);
      if (!next) return false;
      renderer.setPixelRatio(next); resize(); return true;
    },
    function shadowMap1024() {
      if (sun.shadow.mapSize.x <= 1024) return false;
      sun.shadow.mapSize.set(1024, 1024);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      return true;
    },
    function bloomOff() { if (!allowBloom) return false; allowBloom = false; bloom.enabled = false; glowMat.uniforms.uGroups.value.multiplyScalar(1.6); return true; },
    function pixelRatio1() { if (renderer.getPixelRatio() <= 1.01) return false; renderer.setPixelRatio(1); resize(); return true; },
    function shadowsOff() { if (!allowShadows) return false; allowShadows = false; renderer.shadowMap.autoUpdate = false; return true; },
    // last resort on weak GPUs: render fewer pixels and let the browser scale up
    function renderScale80() { if (renderer.getPixelRatio() <= 0.81) return false; renderer.setPixelRatio(0.8); resize(); return true; },
    function renderScale67() { if (renderer.getPixelRatio() <= 0.68) return false; renderer.setPixelRatio(0.67); resize(); return true; },
  ];
  if (debug) window.__scene = { renderer, scene, camera, sun, bloom, composer, reflector, clouds, depthFx, dof, sunMask, taa, grass, setTaa: (v) => { allowTaa = v; } };
  const steps = [];
  if (debug) window.__scene.adaptState = () => ({ steps: [...steps], median: +lastMedian.toFixed(1) });
  let lastMedian = 0;
  let overlay = null;
  if (debug) {
    overlay = document.createElement('pre');
    overlay.style.cssText = 'position:fixed;left:6px;top:70px;z-index:100;margin:0;padding:6px 8px;'
      + 'font:11px/1.35 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.72);pointer-events:none;max-width:92vw;white-space:pre-wrap';
    document.body.appendChild(overlay);
  }
  const gl = renderer.getContext();
  const gpuExt = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = gpuExt ? gl.getParameter(gpuExt.UNMASKED_RENDERER_WEBGL) : 'unknown';
  function updateOverlay() {
    if (!overlay) return;
    overlay.textContent = [
      `tier ${quality}  webgl${isWebGL2 ? 2 : 1}  msaa ${scenePass ? scenePass.target.samples : rt.samples}`,
      `gpu ${gpu}`,
      `screen dpr ${window.devicePixelRatio}  render dpr ${renderer.getPixelRatio().toFixed(2)}`,
      `bloom ${bloom.enabled ? 'on' : 'off'}  shadows ${allowShadows ? sun.shadow.mapSize.x : 'off'}`,
      `frame ${lastMedian ? lastMedian.toFixed(1) + ' ms' : 'measuring'}`,
      `steps ${steps.length ? steps.join(', ') : 'none'}`,
    ].join('\n');
  }
  // Judge only after start-up (shader compiles, texture uploads) has settled.
  // Frames are judged in one-second windows; mildly slow (over 28 ms) needs two
  // windows in a row, very slow gives up several effects at once, so a weak
  // GPU reaches a smooth setting in seconds rather than minutes.
  let frameTimes = [];
  let windowTime = 0;
  let slowWindows = 0;
  const adaptFrom = performance.now() + 4000;
  const fixedQuality = debug && new URLSearchParams(location.search).has('fixed'); // measuring: no step-downs
  function adapt(dt) {
    if (fixedQuality || performance.now() < adaptFrom) return;
    frameTimes.push(dt);
    windowTime += dt;
    if (windowTime < 1 || frameTimes.length < 8) return;
    const sorted = [...frameTimes].sort((x, y) => x - y);
    const median = sorted[sorted.length >> 1];
    frameTimes = [];
    windowTime = 0;
    lastMedian = median * 1000;
    if (debug) console.info(`[scene] median frame ${lastMedian.toFixed(1)} ms`);
    updateOverlay();
    if (median < 0.028) { slowWindows = 0; return; }
    slowWindows++;
    if (median < 0.045 && slowWindows < 2) return;
    slowWindows = 0;
    let drops = median >= 0.07 ? 3 : median >= 0.045 ? 2 : 1;
    while (drops > 0 && ladder.length) {
      const step = ladder.shift();
      if (!step()) continue;
      steps.push(step.name);
      if (step.name === 'pixelRatioDown' && renderer.getPixelRatio() > 1.26) ladder.unshift(step);
      if (debug) console.info('[scene] quality step down:', step.name);
      drops--;
    }
    updateOverlay();
  }

  /* ---------- loop ---------- */
  const pointer = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();
  startTilt(pointerTarget, reducedMotion);
  const spots = createHotspots(hotspots.map((h) => ({ ...h, pos: HOTSPOTS[h.id] })).filter((h) => h.pos), camera);
  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      pointerTarget.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    }, { passive: true });
  }

  let p = getProgress();
  let lastP = -1;
  let time = 0;
  let last = performance.now();
  const right = new THREE.Vector3();
  let lastYaw = null, yawRate = 0;
  // ?debug&cam=x,y,z,lookX,lookY,lookZ pins the camera, for inspecting one spot
  const debugCam = debug && params.get('cam') ? params.get('cam').split(',').map(Number) : null;

  function render() {
    grain.uniforms.uTime.value = time;
    camera.updateMatrixWorld();
    if (taa) taa.jitter();
    composer.render();
    if (taa) taa.unjitter();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const still = reducedMotion.matches;
    const target = getProgress();

    if (still) p = Math.round(target);
    else p += (target - p) * (1 - Math.exp(-dt * 3.2));
    if (Math.abs(target - p) < 0.0005) p = target;

    const moving = p !== lastP;
    if (moving || !still || needsRender) {
      if (!still) time += dt;
      sampleCamera(p);
      if (debugCam) { pos.set(debugCam[0], debugCam[1], debugCam[2]); look.set(debugCam[3], debugCam[4], debugCam[5]); }
      let roll = 0;
      if (!still) {
        pointer.lerp(pointerTarget, 1 - Math.exp(-dt * 2.5));
        // Handheld: a person carrying the camera. Layered slow sines (smooth,
        // never repeating exactly) for breathing and small aim corrections...
        const n = (a, b, c, o) => Math.sin(time * a + o) * 0.5 + Math.sin(time * b + o * 2.3) * 0.3 + Math.sin(time * c + o * 4.1) * 0.2;
        pos.x += n(0.23, 0.61, 1.37, 0.0) * 0.045;
        pos.y += n(0.31, 0.83, 1.91, 1.7) * 0.04;
        right.subVectors(look, pos).cross(Y).normalize();
        const reach = pos.distanceTo(look);
        look.addScaledVector(right, n(0.17, 0.47, 1.13, 3.1) * reach * 0.004 + pointer.x * 1.2)
          .addScaledVector(Y, n(0.19, 0.53, 1.29, 4.9) * reach * 0.003 - pointer.y * 0.8);
        // ...and a lean into turns, like a camera operator banking round a corner.
        const yaw = Math.atan2(look.x - pos.x, look.z - pos.z);
        let dYaw = lastYaw === null ? 0 : yaw - lastYaw;
        if (dYaw > Math.PI) dYaw -= Math.PI * 2; else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
        lastYaw = yaw;
        yawRate += ((dt > 0 ? dYaw / dt : 0) - yawRate) * (1 - Math.exp(-dt * 3));
        roll = THREE.MathUtils.clamp(-yawRate * 0.045, -0.035, 0.035) + n(0.29, 0.71, 1.53, 2.2) * 0.004;
      }
      camera.position.copy(pos);
      camera.lookAt(look);
      if (roll) camera.rotateZ(roll);
      sky.position.copy(pos);
      nightDome.position.copy(pos);
      stars.position.copy(pos);
      clouds.position.copy(pos);
      cloudUniforms.uTime.value = time;
      if (moving || needsRender) applyMood(p);
      placeSun();
      festive.material.uniforms.uTime.value = time;
      fxShared.uTime.value = time;
      glowMat.uniforms.uTime.value = time;
      rainFx.update(camera.position, still ? 0 : cur.rain);
      poolFx.update(cur, lightDir, cur.sunColor, time);
      if (dof) dof.focus = pos.distanceTo(look);
      if (grass) grass.update(camera.position);
      if (taa) { const on = !still && allowTaa; if (on && !taa.enabled) taa.reset = true; taa.enabled = on; }
      render();
      spots.update(Math.round(p), host.clientWidth, host.clientHeight);
      lastP = p;
      needsRender = false;
      if (!still && !document.hidden) adapt(dt);
    }
    requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(host);
  resize();
  sampleCamera(p);
  camera.position.copy(pos);
  camera.lookAt(look);
  applyMood(p);
  placeSun();
  renderer.compile(scene, camera);
  renderer.shadowMap.needsUpdate = true;
  render();
  updateOverlay();
  reducedMotion.addEventListener?.('change', () => { needsRender = true; });

  // Scanned furniture, lamps, plants and bottles replace their stand-ins once
  // they arrive (desktop only; phones keep the lighter procedural versions).
  if (!low) loadModels().catch((err) => { if (debug) console.warn('[scene] models:', err); });

  async function loadModels() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const get = (name) => loader.loadAsync(new URL(`${name}.glb`, MODEL_URL).href).then((g) => g.scene).catch(() => null);
    const [chair, table, lantern, stoolM, plantL, plantS, bottles] = await Promise.all(
      ['dining_chair_02', 'round_wooden_table_01', 'brass_diya_lantern', 'bar_chair_round_01', 'potted_plant_02', 'potted_plant_04', 'wine_bottles_01'].map(get));
    const swap = (model, matrices, opts, replaced) => {
      if (!model || !matrices.length) return;
      for (const im of instancesOf(model, matrices, opts)) scene.add(im);
      for (const r of replaced || []) r.visible = false;
    };
    swap(table, placements.tables, { height: 0.77 }, placements.replaced.restaurant.slice(0, 2));
    swap(chair, placements.chairs, { height: 0.97, rotY: 0 }, placements.replaced.restaurant.slice(2));
    // lanterns hang from the pergola: top at the beams, bulb inside
    const hang = placements.lanterns.map((m) => m.clone().setPosition(new THREE.Vector3().setFromMatrixPosition(m).setY(LAYOUT.restaurant.lampY - 0.25)));
    swap(lantern, hang, { height: 0.95, cast: false }, placements.replaced.lanterns);
    swap(stoolM, placements.stools, { height: 0.8 }, placements.replaced.stools);
    swap(bottles, placements.shelves, { height: 0.3, cast: false }, placements.replaced.bottles);

    // plants: gateway, pergola corners, building entrance, bar ends, hall entrance
    const { x: sx, zFrom: sz0, zTo: sz1, cols } = LAYOUT.stay;
    const ez = sz0 - ((sz0 - sz1) / cols) * 3;
    const { x: bxx, zFrom: bz0, zTo: bz1 } = LAYOUT.bar;
    const at = (x, y, z, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, rand() * Math.PI * 2), new THREE.Vector3(s, s, s));
    swap(plantL, [
      at(-10.2, 0, 0.4), at(10.2, 0, 0.4),
      at(-5.7, 0, -15), at(5.7, 0, -15), at(-5.7, 0, -32), at(5.7, 0, -32),
      at(sx - 2.7, 0, ez - 4.1, 1.1), at(sx - 2.7, 0, ez + 4.1, 1.1),
      at(bxx + 1.6, 0, bz0 + 1.4), at(bxx + 1.6, 0, bz1 - 1.4),
      at(-3.8, 0, -110.6), at(3.8, 0, -110.6),
    ], { height: 1.15 });
    swap(plantS, [at(bxx, 1.11, bz0 - 0.45), at(bxx, 1.11, bz1 + 0.45), at(-9.4, 0.3, 1.2, 0.9), at(9.4, 0.3, 1.2, 0.9)], { height: 0.42 });
    renderer.shadowMap.needsUpdate = true;
    needsRender = true;
  }
  requestAnimationFrame(frame);

  return { renderer, scene, camera };
}
