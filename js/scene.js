// The 3D world: a bronze gateway extruded from the brand mark, a colonnade of
// smaller marks along a path, and four places along it: restaurant, stay,
// bar and hall. Scroll progress (in chapter units) drives the camera and the
// time of day. Everything is procedural; the only asset is brand/mark.svg.
//
// This module knows nothing about page content. Camera stops, moods and the
// layout are in chapters.js.

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT, CAMERA_KEYS, MOODS } from './chapters.js';

const MARK_URL = new URL('../brand/mark.svg', import.meta.url);

const C = (hex) => new THREE.Color(hex);
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

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
    curveSegments: low ? 5 : 12,
    bevelEnabled: true,
    bevelThickness: 1.6,
    bevelSize: 1.2,
    bevelSegments: low ? 1 : 3,
  });
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const h = bb.max.y - bb.min.y;
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.max.y, -(bb.min.z + bb.max.z) / 2);
  // SVG y points down. Scaling y and z by -1 together is a rotation about x,
  // so faces keep their winding.
  g.scale(1 / h, -1 / h, -1 / h);
  return g;
}

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cyl(rt, rb, h, seg, x, y, z) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const radialTexture = (inner, outer) => canvasTexture(128, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

function floorTexture() {
  const t = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      const v = 236 + Math.floor(rand() * 19);
      ctx.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
      ctx.fillRect(rand() * s, rand() * s, 2, 2);
    }
    ctx.strokeStyle = '#cdbfab';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ------------------------------------------------------------------ */
/* Point-sprite glows: one draw call for every lamp in the scene       */
/* ------------------------------------------------------------------ */

// Groups let each area's lamps fade independently.
const G_RESTAURANT = 0, G_BAR = 1, G_HALL = 2, G_PATH = 3;

function glowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uGroups: { value: new THREE.Vector4() },
      uScale: { value: 400 },
      uMax: { value: 256 },
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aGroup;
      attribute vec3 aColor;
      uniform vec4 uGroups;
      uniform float uScale;
      uniform float uMax;
      varying vec3 vColor;
      varying float vI;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float g = aGroup < 0.5 ? uGroups.x : aGroup < 1.5 ? uGroups.y : aGroup < 2.5 ? uGroups.z : uGroups.w;
        vI = g;
        vColor = aColor;
        gl_PointSize = g < 0.01 ? 0.0 : min(aSize * uScale / -mv.z, uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vI;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float halo = exp(-d * d * 6.0) * 0.8;
        float core = smoothstep(0.24, 0.0, d) * 1.6;
        gl_FragColor = vec4(vColor * (halo + core) * vI, 1.0);
        #include <colorspace_fragment>
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

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export async function createScene({ host, quality, reducedMotion, getProgress }) {
  const low = quality === 'low';
  const svgText = await (await fetch(MARK_URL)).text();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  let dprCap = low ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 30, 180);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 900);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  /* ---------- materials ---------- */
  const bronze = new THREE.MeshStandardMaterial({ color: '#7a4c24', metalness: 0.7, roughness: 0.5 });
  const bronzePolished = new THREE.MeshStandardMaterial({ color: '#9a6734', metalness: 0.95, roughness: 0.22 });
  const stone = new THREE.MeshStandardMaterial({ color: '#e9dcc9', roughness: 0.82 });
  const linen = new THREE.MeshStandardMaterial({ color: '#f3ece2', roughness: 0.7 });
  const sand = new THREE.MeshStandardMaterial({ color: '#d9c7ae', roughness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: '#3b2718', roughness: 0.55 });
  const darkWood = new THREE.MeshStandardMaterial({ color: '#22170f', roughness: 0.7 });
  const marble = new THREE.MeshStandardMaterial({ color: '#d8ccbb', roughness: 0.35 });

  const unitMark = markGeometry(svgText, low);

  /* ---------- sky, stars, floor ---------- */
  const skyUniforms = {
    top: { value: C('#fff') }, horizon: { value: C('#fff') }, bottom: { value: C('#fff') },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: C('#fff') }, sunStrength: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 top, horizon, bottom, sunDir, sunColor;
        uniform float sunStrength;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = d.y > 0.0
            ? mix(horizon, top, pow(smoothstep(0.0, 1.0, d.y), 0.55))
            : mix(horizon, bottom, smoothstep(0.0, 0.2, -d.y));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 1200.0) * 3.0 + pow(s, 14.0) * 0.35) * sunStrength;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  scene.add(sky);

  const starCount = low ? 260 : 700;
  const starPos = [];
  for (let i = 0; i < starCount; i++) {
    const u = rand() * Math.PI * 2, v = 0.06 + rand() * 0.94;
    const r = 360, y = v * v;
    const rr = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(u) * rr * r, y * r, Math.sin(u) * rr * r);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: '#fff4e6', size: low ? 1.6 : 1.8, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  scene.add(stars);

  const floorMap = floorTexture();
  floorMap.repeat.set(700 / 2.4, 700 / 2.4);
  floorMap.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), low ? 4 : 8);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({ color: '#d6c8b3', map: floorMap, roughness: 0.62 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -60;
  scene.add(floor);

  // Soft contact shadows (a dark radial blot, no shadow maps).
  const shadowTex = radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: '#000' });
  const addShadow = (x, z, w, d, rot = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), shadowMat);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, 0.012, z);
    scene.add(m);
  };

  const glows = new GlowBuilder();
  const pools = [[], [], [], []]; // light pools on surfaces, per glow group
  const pool = (group, x, y, z, r) => {
    const g = new THREE.PlaneGeometry(r * 2, r * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    pools[group].push(g);
  };

  /* ---------- the gateway ---------- */
  const gate = new THREE.Mesh(unitMark, bronze);
  gate.scale.setScalar(LAYOUT.gateHeight);
  gate.position.y = 0.25;
  scene.add(gate);
  const plinth = new THREE.Mesh(box(18.5, 0.25, 3.2, 0, 0.125, 0), stone);
  scene.add(plinth);
  addShadow(0, 0, 22, 7);
  // Uplights at the foot of the three pillars.
  for (const x of [-3.26, 0, 3.26]) {
    glows.add(x, 0.35, 1.7, 0.7, G_PATH, '#ffc27a');
    pool(G_PATH, x, 0.26, 1.8, 1.4);
  }

  // Bronze inlay line and bollards leading along the path.
  scene.add(new THREE.Mesh(box(0.1, 0.02, 100, 0, 0.01, -58), bronzePolished));
  {
    const zs = [];
    for (let z = -6; z >= -110; z -= 8) zs.push(z);
    const bol = new THREE.InstancedMesh(cyl(0.09, 0.11, 0.7, low ? 8 : 14, 0, 0.35, 0), bronze, zs.length * 2);
    const m = new THREE.Matrix4();
    let i = 0;
    for (const z of zs) for (const x of [-3, 3]) {
      bol.setMatrixAt(i++, m.makeTranslation(x, 0, z));
      glows.add(x, 0.74, z, 0.45, G_PATH, '#ffcf8f');
      pool(G_PATH, x, 0.015, z, 1.3);
    }
    scene.add(bol);
  }

  /* ---------- colonnade ---------- */
  {
    const { height, x, zStart, zEnd, step } = LAYOUT.colonnade;
    const spots = [];
    const { zFrom, zTo } = LAYOUT.stay;
    for (let z = zStart; z >= zEnd; z -= step) {
      spots.push([-x, z, Math.PI / 2]);
      // the stay building stands in for the colonnade on its side of the path
      if (z > zFrom + 3 || z < zTo - 3) spots.push([x, z, -Math.PI / 2]);
    }
    const col = new THREE.InstancedMesh(unitMark, bronze, spots.length);
    const q = new THREE.Quaternion(), s = new THREE.Vector3(height, height, height), m = new THREE.Matrix4();
    spots.forEach(([px, pz, ry], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      col.setMatrixAt(i, m.compose(new THREE.Vector3(px, 0, pz), q, s));
      addShadow(px, pz, 2.2, 6, 0);
    });
    scene.add(col);
  }

  /* ---------- restaurant: tables under a bronze pergola ---------- */
  {
    const { xs, zs, lampY } = LAYOUT.restaurant;
    const seg = low ? 14 : 28;
    const n = xs.length * zs.length;
    const tops = new THREE.InstancedMesh(cyl(0.78, 0.78, 0.06, seg, 0, 0.76, 0), linen, n);
    const stems = new THREE.InstancedMesh(mergeGeometries([cyl(0.05, 0.05, 0.72, 8, 0, 0.38, 0), cyl(0.32, 0.36, 0.04, seg, 0, 0.02, 0)]), bronze, n);
    const stools = new THREE.InstancedMesh(cyl(0.22, 0.2, 0.46, low ? 10 : 18, 0, 0.23, 0), sand, n * 4);
    const shades = new THREE.InstancedMesh(mergeGeometries([cyl(0.08, 0.34, 0.28, low ? 12 : 24, 0, 0, 0), cyl(0.008, 0.008, 3.9 - lampY, 4, 0, (3.9 - lampY) / 2, 0)]), bronze, n);
    const m = new THREE.Matrix4();
    let i = 0, k = 0;
    for (const x of xs) for (const z of zs) {
      m.makeTranslation(x, 0, z);
      tops.setMatrixAt(i, m); stems.setMatrixAt(i, m);
      shades.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, lampY, z));
      for (const [dx, dz] of [[1.05, 0], [-1.05, 0], [0, 1.05], [0, -1.05]]) stools.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(x + dx, 0, z + dz));
      glows.add(x, lampY - 0.18, z, 1.1, G_RESTAURANT, '#ffd29a');
      pool(G_RESTAURANT, x, 0.8, z, 1.1);
      addShadow(x, z, 3, 3);
      i++;
    }
    scene.add(tops, stems, stools, shades);

    const px = 6.2, z0 = -15.5, z1 = -31.5, top = 3.95;
    const parts = [];
    for (const x of [-px, px]) for (const z of [z0, (z0 + z1) / 2, z1]) parts.push(box(0.16, top, 0.16, x, top / 2, z));
    for (const x of [-px, px]) parts.push(box(0.14, 0.2, z0 - z1 + 0.3, x, top, (z0 + z1) / 2));
    for (let z = z0; z >= z1 - 0.01; z -= 4) parts.push(box(px * 2 + 0.3, 0.08, 0.06, 0, top + 0.1, z));
    scene.add(new THREE.Mesh(mergeGeometries(parts), bronze));
  }

  /* ---------- stay: a building whose windows light up ---------- */
  const windows = [];
  let windowMesh;
  {
    const { x, zFrom, zTo, floors, cols, floorHeight } = LAYOUT.stay;
    const len = zFrom - zTo, h = floors * floorHeight + 0.8, depth = 9;
    const zc = (zFrom + zTo) / 2;
    scene.add(new THREE.Mesh(box(depth, h, len, x + depth / 2, h / 2, zc), stone));
    addShadow(x + 1, zc, 5, len + 3);

    const bands = [];
    for (let f = 1; f <= floors; f++) bands.push(box(0.3, 0.14, len + 0.2, x - 0.1, f * floorHeight, zc));
    bands.push(box(0.4, 0.5, len + 0.4, x - 0.15, h - 0.2, zc));
    const frames = [];
    const winW = 1.7, winH = 2.1, spacing = len / cols;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const wz = zFrom - spacing * (c + 0.5), wy = f * floorHeight + 0.55 + winH / 2 + 0.2;
      windows.push({ y: wy, z: wz, threshold: 0.08 + rand() * 0.84, lit: -1 });
      frames.push(box(0.12, winH + 0.24, winW + 0.24, x - 0.04, wy, wz));
    }
    scene.add(new THREE.Mesh(mergeGeometries([...bands, ...frames]), bronze));

    const winGeo = new THREE.PlaneGeometry(winW, winH);
    winGeo.rotateY(-Math.PI / 2);
    windowMesh = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), windows.length);
    windows.forEach((w, i) => {
      windowMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x - 0.11, w.y, w.z));
      windowMesh.setColorAt(i, C('#2e2a28'));
    });
    scene.add(windowMesh);
  }
  const winOff = C('#2e2a28'), winOn = C('#ffc781').multiplyScalar(1.25), winTmp = new THREE.Color();

  /* ---------- bar: a counter under a low canopy ---------- */
  const barLight = new THREE.PointLight('#ffb468', 0, 0, 2);
  {
    const { x, zFrom, zTo } = LAYOUT.bar;
    const len = zFrom - zTo, zc = (zFrom + zTo) / 2;
    scene.add(new THREE.Mesh(box(0.72, 1.05, len, x, 0.525, zc), wood));
    scene.add(new THREE.Mesh(box(0.95, 0.06, len + 0.2, x + 0.05, 1.08, zc), bronzePolished));
    scene.add(new THREE.Mesh(box(0.04, 0.12, len, x + 0.37, 0.12, zc), bronze));
    // back bar
    const bx = x - 2.3;
    scene.add(new THREE.Mesh(box(0.25, 3.4, len, bx, 1.7, zc), darkWood));
    const shelves = [];
    for (const sy of [1.35, 2.05, 2.75]) shelves.push(box(0.4, 0.05, len - 0.6, bx + 0.25, sy, zc));
    scene.add(new THREE.Mesh(mergeGeometries(shelves), bronze));
    const strip = new THREE.MeshBasicMaterial({ color: C('#ffb066').multiplyScalar(0.9), toneMapped: false });
    const strips = [];
    for (const sy of [1.3, 2.0, 2.7]) strips.push(box(0.02, 0.04, len - 0.8, bx + 0.14, sy + 0.02, zc));
    const stripMesh = new THREE.Mesh(mergeGeometries(strips), strip);
    stripMesh.userData.base = strip.color.clone();
    scene.add(stripMesh);
    // bottles
    const nb = low ? 36 : 84;
    const bottle = new THREE.InstancedMesh(mergeGeometries([cyl(0.045, 0.045, 0.24, 8, 0, 0.12, 0), cyl(0.015, 0.03, 0.1, 6, 0, 0.29, 0)]),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15, metalness: 0.2 }), nb);
    const tones = ['#5a3312', '#2f4a2c', '#7a4a1c', '#c9b99a', '#3b1d10'];
    for (let i = 0; i < nb; i++) {
      const sy = [1.375, 2.075, 2.775][i % 3];
      bottle.setMatrixAt(i, new THREE.Matrix4().makeTranslation(bx + 0.28, sy, zFrom - 0.5 - rand() * (len - 1)));
      bottle.setColorAt(i, C(tones[i % tones.length]));
    }
    scene.add(bottle);
    // canopy
    scene.add(new THREE.Mesh(box(6, 0.18, len + 2, x - 0.4, 4.3, zc), darkWood));
    for (const cz of [zFrom + 0.8, zTo - 0.8]) for (const cx of [x - 3.2, x + 2.4]) scene.add(new THREE.Mesh(box(0.16, 4.3, 0.16, cx, 2.15, cz), bronze));
    // stools and pendant lamps
    const ns = Math.floor(len / 1.6);
    const stool = new THREE.InstancedMesh(mergeGeometries([cyl(0.2, 0.2, 0.06, 16, 0, 0.78, 0), cyl(0.03, 0.03, 0.76, 6, 0, 0.38, 0), cyl(0.18, 0.2, 0.03, 16, 0, 0.015, 0)]), bronze, ns);
    const lamps = new THREE.InstancedMesh(mergeGeometries([new THREE.SphereGeometry(0.13, 12, 8), cyl(0.006, 0.006, 1.7, 4, 0, 0.85, 0)]), bronzePolished, ns);
    for (let i = 0; i < ns; i++) {
      const z = zFrom - 0.8 - i * 1.6;
      stool.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + 1.05, 0, z));
      lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 2.6, z));
      glows.add(x, 2.5, z, 0.9, G_BAR, '#ffb35f');
      pool(G_BAR, x + 0.05, 1.115, z, 0.55);
      pool(G_BAR, x + 1.1, 0.015, z, 0.9);
    }
    scene.add(stool, lamps);
    addShadow(x, zc, 3, len + 2);
    barLight.position.set(x + 0.6, 2.6, zc);
    scene.add(barLight);
    scene.userData.barStrip = stripMesh;
  }

  /* ---------- hall: a rotunda of marks, lit for an event ---------- */
  const hallLight = new THREE.PointLight('#ffc27a', 0, 0, 2);
  let festive;
  {
    const { x: cx, z: cz, radius, marks, markHeight } = LAYOUT.hall;
    const dais = new THREE.Mesh(cyl(radius + 1.5, radius + 1.6, 0.14, low ? 40 : 80, cx, 0.07, cz), marble);
    scene.add(dais);
    const inlay = new THREE.Mesh(new THREE.RingGeometry(4.8, 4.95, low ? 48 : 96), bronzePolished);
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.set(cx, 0.145, cz);
    scene.add(inlay);

    const ring = new THREE.InstancedMesh(unitMark, bronze, marks);
    const q = new THREE.Quaternion(), s = new THREE.Vector3(markHeight, markHeight, markHeight), m = new THREE.Matrix4();
    const tops = [];
    for (let k = 0; k < marks; k++) {
      const th = ((k + 0.5) / marks) * Math.PI * 2; // gap faces the approach (+z)
      const px = cx + Math.sin(th) * radius, pz = cz + Math.cos(th) * radius;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), th + Math.PI);
      ring.setMatrixAt(k, m.compose(new THREE.Vector3(px, 0.14, pz), q, s));
      tops.push(new THREE.Vector3(px, markHeight * 0.96 + 0.14, pz));
    }
    scene.add(ring);

    // chandelier ring and festoon strands from each mark to the centre
    const chY = 8;
    const ch = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.05, 8, low ? 48 : 96), bronzePolished);
    ch.rotation.x = Math.PI / 2;
    ch.position.set(cx, chY, cz);
    scene.add(ch);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      glows.add(cx + Math.cos(a) * 2.4, chY - 0.1, cz + Math.sin(a) * 2.4, 0.55, G_HALL, '#ffd9a0');
    }
    glows.add(cx, chY - 0.4, cz, 3.2, G_HALL, '#ffb96a');
    const bulbs = low ? 9 : 14;
    const centre = new THREE.Vector3(cx, chY, cz);
    for (const t of tops) for (let b = 1; b < bulbs; b++) {
      const f = b / bulbs;
      const p = t.clone().lerp(centre, f);
      p.y -= Math.sin(f * Math.PI) * 1.4;
      glows.add(p.x, p.y, p.z, 0.32, G_HALL, '#ffe0b0');
    }
    for (let k = 0; k < tops.length; k++) {
      const a = tops[k], b = tops[(k + 1) % tops.length];
      if (k === tops.length - 1) continue; // leave the entrance open
      for (let j = 1; j < bulbs; j++) {
        const f = j / bulbs;
        const p = a.clone().lerp(b, f);
        p.y -= Math.sin(f * Math.PI) * 1.1;
        glows.add(p.x, p.y, p.z, 0.3, G_HALL, '#ffe0b0');
      }
    }
    pool(G_HALL, cx, 0.15, cz, 8);

    // rising lights
    const n = low ? 120 : 320;
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
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uScale: { value: 400 }, uColor: { value: C('#ffcf8a') } },
      vertexShader: /* glsl */`
        attribute float aSpeed;
        uniform float uTime, uScale;
        varying float vFade;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * aSpeed, 10.0) + 0.3;
          p.x += sin(uTime * 0.6 + position.z) * 0.25;
          vFade = sin(p.y / 10.3 * 3.14159);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(0.16 * uScale / -mv.z, 48.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uAmount;
        varying float vFade;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          gl_FragColor = vec4(uColor * exp(-d * d * 4.0) * vFade * uAmount * 1.4, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    festive.frustumCulled = false;
    scene.add(festive);

    hallLight.position.set(cx, 5.5, cz);
    scene.add(hallLight);
  }

  const gateLight = new THREE.PointLight('#ffc27a', 0, 0, 2);
  gateLight.position.set(0, 1.2, 4);
  scene.add(gateLight);

  /* ---------- glows and pools ---------- */
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
  scene.add(hemi, sun, sun.target);

  /* ---------- moods (pre-parsed) ---------- */
  const colourKeys = ['skyTop', 'skyHorizon', 'skyBottom', 'sunColor', 'hemiSky', 'hemiGround', 'fog'];
  const moods = MOODS.map((m) => {
    const o = { ...m };
    for (const k of colourKeys) o[k] = C(m[k]);
    return o;
  });
  const cur = { ...moods[0] };
  for (const k of colourKeys) cur[k] = moods[0][k].clone();

  function applyMood(p) {
    const i = Math.min(moods.length - 2, Math.floor(p));
    const f = smooth(clamp01(p - i));
    const a = moods[i], b = moods[i + 1];
    for (const k of Object.keys(a)) {
      if (colourKeys.includes(k)) cur[k].copy(a[k]).lerp(b[k], f);
      else cur[k] = a[k] + (b[k] - a[k]) * f;
    }
    skyUniforms.top.value.copy(cur.skyTop);
    skyUniforms.horizon.value.copy(cur.skyHorizon);
    skyUniforms.bottom.value.copy(cur.skyBottom);
    const el = THREE.MathUtils.degToRad(cur.sunElev), az = THREE.MathUtils.degToRad(cur.sunAzim);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    skyUniforms.sunDir.value.copy(dir);
    skyUniforms.sunColor.value.copy(cur.sunColor);
    skyUniforms.sunStrength.value = clamp01(cur.sunIntensity / 2);
    sun.color.copy(cur.sunColor);
    sun.intensity = cur.sunIntensity;
    sun.position.copy(camera.position).addScaledVector(dir, 60);
    sun.target.position.copy(camera.position);
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    hemi.intensity = cur.hemiIntensity;
    scene.fog.color.copy(cur.fog);
    scene.fog.near = cur.fogNear;
    scene.fog.far = cur.fogFar;
    scene.environmentIntensity = cur.env;
    renderer.toneMappingExposure = cur.exposure;
    starMat.opacity = cur.stars;
    stars.visible = cur.stars > 0.01;

    const L = cur.lamps, F = cur.festive;
    glowMat.uniforms.uGroups.value.set(L, L, Math.max(F, L * 0.5), L);
    poolMats[G_RESTAURANT].opacity = 0.55 * L;
    poolMats[G_BAR].opacity = 0.45 * L;
    poolMats[G_HALL].opacity = 0.2 * Math.max(F, L * 0.5);
    poolMats[G_PATH].opacity = 0.5 * L;
    barLight.intensity = 14 * L;
    hallLight.intensity = 38 * Math.max(F, L * 0.4);
    gateLight.intensity = 22 * L;
    festive.material.uniforms.uAmount.value = F;
    festive.visible = F > 0.01;
    const strip = scene.userData.barStrip;
    strip.material.color.copy(strip.userData.base).multiplyScalar(0.15 + 0.85 * L);

    // windows switch on one by one as the evening arrives
    let changed = false;
    windows.forEach((w, idx) => {
      const lit = smooth(clamp01((cur.windows - w.threshold) / 0.08 + 0.5));
      if (Math.abs(lit - w.lit) < 0.002) return;
      w.lit = lit;
      windowMesh.setColorAt(idx, winTmp.copy(winOff).lerp(winOn, lit));
      changed = true;
    });
    if (changed) windowMesh.instanceColor.needsUpdate = true;
  }

  /* ---------- camera path ---------- */
  const keys = CAMERA_KEYS.map((k) => ({ p: k.p, pos: new THREE.Vector3(...k.pos), look: new THREE.Vector3(...k.look) }));
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

  /* ---------- sizing ---------- */
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // On portrait screens the text panel covers the lower part of the view,
    // so render the lower part of a taller frustum: the subject sits higher.
    if (camera.aspect < 0.8) {
      camera.fov = 66;
      camera.setViewOffset(w, h * 1.36, 0, h * 0.36, w, h);
    } else {
      camera.fov = camera.aspect < 1.2 ? 52 : 42;
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    const fullHeight = renderer.getDrawingBufferSize(new THREE.Vector2()).y * (camera.view && camera.view.enabled ? 1.36 : 1);
    const scale = fullHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    glowMat.uniforms.uScale.value = scale;
    festive.material.uniforms.uScale.value = scale;
    const range = renderer.getContext().getParameter(renderer.getContext().ALIASED_POINT_SIZE_RANGE);
    glowMat.uniforms.uMax.value = Math.min(range ? range[1] : 256, 512);
    needsRender = true;
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
  let needsRender = true;
  let time = 0;
  let last = performance.now();
  const frameTimes = [];
  const right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

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
        pos.y += Math.sin(time * 0.35) * 0.06;
        pos.x += Math.sin(time * 0.23) * 0.05;
        right.subVectors(look, pos).cross(up).normalize();
        look.addScaledVector(right, pointer.x * 1.2).addScaledVector(up, -pointer.y * 0.8);
      }
      camera.position.copy(pos);
      camera.lookAt(look);
      sky.position.copy(pos);
      stars.position.copy(pos);
      if (moving || needsRender) applyMood(p);
      festive.material.uniforms.uTime.value = time;
      renderer.render(scene, camera);
      lastP = p;
      needsRender = false;

      // If the first second of frames is slow, drop to 1x pixel ratio.
      if (frameTimes.length < 60) {
        frameTimes.push(dt);
        if (frameTimes.length === 60) {
          const sorted = [...frameTimes].sort((a, b) => a - b);
          if (sorted[30] > 0.024 && renderer.getPixelRatio() > 1) {
            renderer.setPixelRatio(1);
            resize();
          }
        }
      }
    }
    requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(host);
  resize();
  sampleCamera(p);
  camera.position.copy(pos);
  camera.lookAt(look);
  applyMood(p);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  reducedMotion.addEventListener?.('change', () => { needsRender = true; });
  requestAnimationFrame(frame);

  return { renderer, scene, camera };
}
