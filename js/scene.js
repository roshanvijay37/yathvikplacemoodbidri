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
import { mergeGeometries as mergeRaw } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { LAYOUT, CAMERA_KEYS, MOODS } from './chapters.js';

const MARK_URL = new URL('../brand/mark.svg', import.meta.url);
const TEX_URL = new URL('../textures/', import.meta.url);

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

// One palm frond: a rib with leaflets angled towards the tip (alpha cut-out).
function frondTexture() {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (let x = 4; x < w - 4; x += 3) {
      const len = (h / 2 - 2) * (0.55 + 0.45 * Math.sin((x / w) * Math.PI));
      const g = 90 + Math.floor(rand() * 60);
      ctx.strokeStyle = `rgb(${Math.floor(g * 0.55)},${g},${Math.floor(g * 0.35)})`;
      ctx.lineWidth = 1.6;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, h / 2);
        ctx.lineTo(Math.min(w, x + len * 0.9), h / 2 + dir * len);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#6d6a3a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  });
}

// A palm 1 unit tall: a gently curved, tapering trunk and a crown of drooping
// fronds. Scaled per instance to 8-14 m.
function palmGeometries(low) {
  const lean = 0.08;
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.2, 0.35, 0),
    new THREE.Vector3(lean * 0.6, 0.7, 0), new THREE.Vector3(lean, 1, 0),
  ]);
  const trunkGeo = new THREE.TubeGeometry(path, low ? 8 : 16, 0.016, low ? 5 : 8, false);
  const p = trunkGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const c = path.getPoint(Math.min(1, Math.max(0, y)));
    const k = 1.25 - 0.45 * y; // taper towards the top
    p.setX(i, c.x + (p.getX(i) - c.x) * k);
    p.setZ(i, c.z + (p.getZ(i) - c.z) * k);
  }
  scaleUV(trunkGeo, 3, 18);
  const crown = new THREE.Vector3(lean, 1, 0);
  const fronds = [];
  const n = low ? 9 : 13;
  for (let k = 0; k < n; k++) {
    const segs = low ? 5 : 8, L = 0.3 + rand() * 0.08, droop = 0.12 + rand() * 0.14, rise = 0.1 + rand() * 0.06;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = t * L, y = rise * t - droop * t * t;
      const half = 0.05 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05));
      pos.push(x, y, -half, x, y, half);
      uv.push(t, 0, t, 1);
      if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.rotateX((rand() - 0.5) * 0.6);
    g.rotateY((k / n) * Math.PI * 2 + rand() * 0.3);
    g.translate(crown.x, crown.y, crown.z);
    g.computeVertexNormals();
    fronds.push(g);
  }
  return { trunkGeo, frondGeo: mergeGeometries(fronds) };
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
    uniforms: { uGroups: { value: new THREE.Vector4() }, uScale: { value: 400 }, uMax: { value: 256 } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aGroup; attribute vec3 aColor;
      uniform vec4 uGroups; uniform float uScale; uniform float uMax;
      varying vec3 vColor; varying float vI;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float g = aGroup < 0.5 ? uGroups.x : aGroup < 1.5 ? uGroups.y : aGroup < 2.5 ? uGroups.z : uGroups.w;
        vI = g; vColor = aColor;
        gl_PointSize = g < 0.01 ? 0.0 : min(aSize * uScale / -mv.z, uMax);
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

export async function createScene({ host, quality, reducedMotion, getProgress }) {
  const low = quality === 'low';
  let needsRender = true;
  const redraw = () => { needsRender = true; };
  const svgText = await (await fetch(MARK_URL)).text();

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  // Sharp-screen phones start at 2x; the quality ladder lowers it if frames are slow.
  const screenDpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(screenDpr, low ? (screenDpr >= 2.5 ? 2 : 1.5) : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  const shadowCasters = [];
  const cast = (o, receive = true) => { o.castShadow = true; o.receiveShadow = receive; shadowCasters.push(o); return o; };

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
  flat(scaleUV(new THREE.PlaneGeometry(7, 60), 7 / 1.5, 60 / 1.5), marble, 0, PLAZA.zNear + 30).position.y = 0.002;
  const lawnMat = new THREE.MeshStandardMaterial({ map: grassTexture(), color: '#a39e86', roughness: 1, metalness: 0 });
  flat(scaleUV(new THREE.PlaneGeometry(1400, 1400), 1400 / 4, 1400 / 4), lawnMat, 0, -60).position.y = -0.01;
  scene.add(cast(new THREE.Mesh(mergeGeometries([
    box(plazaW + 0.6, 0.12, 0.3, 0, 0.06, PLAZA.zFar, 1.5),
    box(0.3, 0.12, plazaL, -PLAZA.x, 0.06, (PLAZA.zNear + PLAZA.zFar) / 2, 1.5),
    box(0.3, 0.12, plazaL, PLAZA.x, 0.06, (PLAZA.zNear + PLAZA.zFar) / 2, 1.5),
    box(PLAZA.x - 3.5, 0.12, 0.3, -(PLAZA.x + 3.5) / 2, 0.06, PLAZA.zNear, 1.5),
    box(PLAZA.x - 3.5, 0.12, 0.3, (PLAZA.x + 3.5) / 2, 0.06, PLAZA.zNear, 1.5),
  ]), marbleWarm)));

  // Coconut palms on the lawn around the plaza.
  {
    const { trunkGeo, frondGeo } = palmGeometries(low);
    const spots = [];
    const tries = low ? 70 : 150;
    for (let i = 0; i < tries; i++) {
      const x = (rand() < 0.5 ? -1 : 1) * (PLAZA.x + 3 + rand() * 70);
      const z = 45 - rand() * 250;
      spots.push([x, z]);
    }
    for (let i = 0; i < (low ? 8 : 16); i++) spots.push([(rand() - 0.5) * 90, PLAZA.zFar - 6 - rand() * 60]);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ map: trunkTexture(), color: '#8a735e', roughness: 1 }), spots.length);
    const fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.5, side: THREE.DoubleSide, color: '#b7c69a', roughness: 0.75 }), spots.length);
    const q = new THREE.Quaternion(), m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      const h = 8 + rand() * 6;
      q.setFromAxisAngle(Y, rand() * Math.PI * 2);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(h, h, h));
      trunks.setMatrixAt(i, m);
      fronds.setMatrixAt(i, m);
    });
    scene.add(trunks, fronds);
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
  const lampColor = ['#ffcf94', '#ffb25e', '#ffd8a0', '#ffc27a'];
  const bulbMats = lampColor.map((c) => new THREE.MeshStandardMaterial({ color: '#1a120a', emissive: c, emissiveIntensity: 0, roughness: 0.4 }));
  const bulbs = [[], [], [], []];
  const bulb = (group, x, y, z, r = 0.07) => bulbs[group].push([x, y, z, r]);
  const glows = new GlowBuilder();
  const pools = [[], [], [], []];
  const pool = (group, x, y, z, r) => {
    const g = new THREE.PlaneGeometry(r * 2, r * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    pools[group].push(g);
  };

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
      shades.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, lampY, z));
      for (let c = 0; c < 4; c++) {
        const a = c * Math.PI / 2 + Math.PI / 4;
        const dx = Math.sin(a) * 0.98, dz = Math.cos(a) * 0.98;
        q.setFromAxisAngle(Y, Math.atan2(-dx, -dz));
        const cm = new THREE.Matrix4().compose(new THREE.Vector3(x + dx, 0, z + dz), q, one);
        chairFrames.setMatrixAt(k, cm); chairBacks.setMatrixAt(k, cm); chairSeats.setMatrixAt(k, cm);
        k++;
      }
      bulb(G_RESTAURANT, x, lampY + 0.08, z, 0.06);
      glows.add(x, lampY + 0.02, z, 0.9, G_RESTAURANT, '#ffd29a');
      pool(G_RESTAURANT, x, 0.78, z, 1.0);
      blob(x, z, 3.2, 3.2);
      i++;
    }
    scene.add(tops, bases, chairFrames, chairBacks, chairSeats, shades);

    const px = 6.2, z0 = -15.5, z1 = -31.5, top = 3.95;
    const parts = [];
    for (const x of [-px, px]) for (const z of [z0, (z0 + z1) / 2, z1]) parts.push(rbox(0.16, top, 0.16, 0.02, x, top / 2, z));
    for (const x of [-px, px]) parts.push(rbox(0.14, 0.2, z0 - z1 + 0.3, 0.02, x, top, (z0 + z1) / 2));
    for (let z = z0; z >= z1 - 0.01; z -= 2) parts.push(rbox(px * 2 + 0.3, 0.08, 0.06, 0.01, 0, top + 0.1, z));
    scene.add(cast(new THREE.Mesh(mergeGeometries(parts), bronze)));
  }

  /* ---------- stay: a plastered building whose windows light up ---------- */
  const windows = [];
  let roomMesh;
  {
    const { x, zFrom, zTo, floors, cols, floorHeight } = LAYOUT.stay;
    const len = zFrom - zTo, h = floors * floorHeight + 0.8, depth = 9;
    const zc = (zFrom + zTo) / 2;
    scene.add(cast(new THREE.Mesh(box(depth, h, len, x + depth / 2, h / 2, zc, 3), plaster)));
    blob(x + 1, zc, 5, len + 3);

    const trims = [];
    for (let f = 1; f <= floors; f++) trims.push(rbox(0.32, 0.14, len + 0.2, 0.03, x - 0.1, f * floorHeight, zc));
    trims.push(rbox(0.5, 0.5, len + 0.5, 0.05, x - 0.18, h - 0.2, zc));
    const frames = [];
    const winW = 1.7, winH = 2.1, spacing = len / cols;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const wz = zFrom - spacing * (c + 0.5), wy = f * floorHeight + 0.55 + winH / 2 + 0.2;
      if (f === 0 && (c === 2 || c === 3)) continue; // entrance
      windows.push({ y: wy, z: wz, threshold: 0.08 + rand() * 0.84, lit: -1 });
      frames.push(box(0.12, winH + 0.2, 0.1, x - 0.05, wy, wz - winW / 2 - 0.05), box(0.12, winH + 0.2, 0.1, x - 0.05, wy, wz + winW / 2 + 0.05),
        box(0.12, 0.1, winW + 0.2, x - 0.05, wy + winH / 2 + 0.05, wz), box(0.2, 0.08, winW + 0.3, x - 0.1, wy - winH / 2 - 0.04, wz));
    }
    scene.add(cast(new THREE.Mesh(mergeGeometries([...trims, ...frames]), bronzeDark)));

    // Entrance: glazed doors under a bronze canopy.
    const ez = zFrom - spacing * 3;
    scene.add(cast(new THREE.Mesh(rbox(2.4, 0.18, 7, 0.04, x - 1.1, 3.1, ez), bronze)));
    for (const dz of [-3.2, 3.2]) scene.add(cast(new THREE.Mesh(cyl(0.05, 0.05, 3.05, 12, x - 2.1, 1.52, ez + dz), bronze)));

    const winGeo = new THREE.PlaneGeometry(winW, winH);
    winGeo.rotateY(-Math.PI / 2);
    roomMesh = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({ map: roomTexture(), color: '#ffffff' }), windows.length + 1);
    const glass = new THREE.InstancedMesh(winGeo, new THREE.MeshStandardMaterial({ color: '#2a3038', metalness: 1, roughness: 0.06, transparent: true, opacity: 0.6 }), windows.length + 1);
    windows.forEach((w, i) => {
      roomMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x - 0.02, w.y, w.z));
      glass.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x - 0.07, w.y, w.z));
      roomMesh.setColorAt(i, C('#000000'));
    });
    // lobby doors, wider and always the first to light
    const lobby = windows.length;
    windows.push({ y: 1.45, z: ez, threshold: 0.02, lit: -1 });
    const dm = new THREE.Matrix4().compose(new THREE.Vector3(x - 0.02, 1.45, ez), new THREE.Quaternion(), new THREE.Vector3(1, 1.3, 2.2));
    roomMesh.setMatrixAt(lobby, dm);
    glass.setMatrixAt(lobby, dm.clone().setPosition(x - 0.07, 1.45, ez));
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
    for (const sy of [1.3, 2.0, 2.7]) strips.push(box(0.02, 0.03, len - 0.8, bx + 0.14, sy + 0.02, zc));
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
    scene.add(cast(new THREE.Mesh(box(6, 0.18, len + 2, x - 0.4, 4.3, zc, 1), woodDark)));
    for (const cz of [zFrom + 0.8, zTo - 0.8]) for (const cx of [x - 3.2, x + 2.4]) scene.add(cast(new THREE.Mesh(rbox(0.16, 4.3, 0.16, 0.02, cx, 2.15, cz), bronze)));
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
      lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 2.5, z));
      bulb(G_BAR, x, 2.53, z, 0.05);
      glows.add(x, 2.5, z, 0.7, G_BAR, '#ffb35f');
      pool(G_BAR, x + 0.05, 1.115, z, 0.55);
      pool(G_BAR, x + 1.1, 0.015, z, 0.9);
    }
    scene.add(stool, lamps);
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
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isWebGL2 ? (low ? 2 : 4) : 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
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
  let allowBloom = true, allowShadows = true;

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
    stars.visible = cur.stars > 0.01;

    const L = cur.lamps, F = cur.festive, H = Math.max(F, L * 0.5);
    const lampLevel = [L, L, H, L];
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

  // If frames are slow, give up effects one at a time, cheapest loss first.
  const debug = new URLSearchParams(location.search).has('debug');
  const ladder = [
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
  ];
  if (debug) window.__scene = { renderer, scene, camera, sun, bloom, composer };
  const steps = [];
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
      `tier ${quality}  webgl${isWebGL2 ? 2 : 1}  msaa ${rt.samples}`,
      `gpu ${gpu}`,
      `screen dpr ${window.devicePixelRatio}  render dpr ${renderer.getPixelRatio().toFixed(2)}`,
      `bloom ${bloom.enabled ? 'on' : 'off'}  shadows ${allowShadows ? sun.shadow.mapSize.x : 'off'}`,
      `frame ${lastMedian ? lastMedian.toFixed(1) + ' ms' : 'measuring'}`,
      `steps ${steps.length ? steps.join(', ') : 'none'}`,
    ].join('\n');
  }
  // Judge only after start-up (shader compiles, texture uploads) has settled,
  // and only step down after two slow windows in a row.
  let frameTimes = [];
  let slowWindows = 0;
  const adaptFrom = performance.now() + 4000;
  function adapt(dt) {
    if (performance.now() < adaptFrom) return;
    frameTimes.push(dt);
    if (frameTimes.length < 60) return;
    const sorted = [...frameTimes].sort((x, y) => x - y);
    frameTimes = [];
    slowWindows = sorted[30] >= 0.028 ? slowWindows + 1 : 0;
    lastMedian = sorted[30] * 1000;
    if (debug) console.info(`[scene] median frame ${lastMedian.toFixed(1)} ms`);
    updateOverlay();
    if (slowWindows < 2) return;
    slowWindows = 0;
    while (ladder.length) {
      const step = ladder.shift();
      if (step()) {
        steps.push(step.name);
        if (step.name === 'pixelRatioDown' && renderer.getPixelRatio() > 1.26) ladder.unshift(step);
        if (debug) console.info('[scene] quality step down:', step.name);
        updateOverlay();
        break;
      }
    }
  }

  /* ---------- loop ---------- */
  const pointer = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();
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

  function render() {
    grain.uniforms.uTime.value = time;
    composer.render();
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
      if (!still) {
        pointer.lerp(pointerTarget, 1 - Math.exp(-dt * 2.5));
        pos.y += Math.sin(time * 0.35) * 0.05;
        pos.x += Math.sin(time * 0.23) * 0.04;
        right.subVectors(look, pos).cross(Y).normalize();
        look.addScaledVector(right, pointer.x * 1.2).addScaledVector(Y, -pointer.y * 0.8);
      }
      camera.position.copy(pos);
      camera.lookAt(look);
      sky.position.copy(pos);
      nightDome.position.copy(pos);
      stars.position.copy(pos);
      if (moving || needsRender) applyMood(p);
      placeSun();
      festive.material.uniforms.uTime.value = time;
      render();
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
  requestAnimationFrame(frame);

  return { renderer, scene, camera };
}
