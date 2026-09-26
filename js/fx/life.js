// Things that move or dress the scene: wind in the palms, flickering flames,
// the reflecting pool with floating diyas, monsoon rain, and the hall dressed
// for an occasion (marigold garlands, a stage, brass lamps).
// Everything is procedural; functions take what they need from scene.js.

import * as THREE from 'three';

const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

/* ------------------------------------------------------------------ */
/* Wind                                                                */
/* ------------------------------------------------------------------ */

// Palms sway: the trunk bends a little towards the top; fronds ripple more
// towards their tips. `aT` is 0 at a frond's base and 1 at its tip; trunks use
// their own height (the palm geometry is 1 unit tall). Each palm gets its own
// phase from its position, so they never move in unison.
export function addWind(material, shared, kind) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uWind = shared.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind;
        ${kind === 'frond' ? 'attribute float aT;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ph = 0.0;
          #ifdef USE_INSTANCING
            ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.071;
          #endif
          float h = clamp(transformed.y, 0.0, 1.2);
          float sway = (sin(uTime * 0.7 + ph) + 0.4 * sin(uTime * 1.9 + ph * 1.7)) * 0.006 * uWind;
          ${kind === 'frond'
            ? `float t = aT;
               float flutter = sin(uTime * 2.3 + ph * 3.0 + t * 3.2) * 0.02 * t * t + sin(uTime * 5.1 + ph * 5.0 + t * 7.0) * 0.004 * t;
               transformed.y += flutter * uWind;
               transformed.x += sway + flutter * 0.5 * uWind;
               transformed.z += flutter * 0.35 * uWind;`
            : 'transformed.x += sway * h * h;'}
        }`);
  };
  material.customProgramCacheKey = () => `wind-${kind}`;
}

/* ------------------------------------------------------------------ */
/* Flicker                                                             */
/* ------------------------------------------------------------------ */

// Emissive flicker for instanced bulbs and flames: each instance flickers on
// its own (phase from its position). `amount` 0.03 is a steady bulb, 0.3 a flame.
export function addFlicker(material, shared, amount, speed = 1) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vFlick;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ph = 0.0;
          #ifdef USE_INSTANCING
            ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].y * 7.7 + instanceMatrix[3].z * 1.3;
          #endif
          float t = uTime * ${(9 * speed).toFixed(2)};
          float n = sin(t + ph) * 0.5 + sin(t * 2.31 + ph * 1.7) * 0.3 + sin(t * 5.7 + ph * 3.1) * 0.2;
          vFlick = 1.0 + n * ${amount.toFixed(3)};
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlick;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vFlick;');
  };
  material.customProgramCacheKey = () => `flicker-${amount}-${speed}`;
}

/* ------------------------------------------------------------------ */
/* Water: a reflecting pool before the gateway, with floating diyas     */
/* ------------------------------------------------------------------ */

function waterNormalTexture() {
  const S = 256;
  const h = new Float32Array(S * S);
  // sum of a few wrapped sine waves = seamless height field
  const waves = Array.from({ length: 9 }, (_, i) => ({ kx: Math.round(1 + hash(i) * 6), ky: Math.round(-3 + hash(i + 9) * 7), p: hash(i + 20) * 6.28, a: 0.5 + hash(i + 30) }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const w of waves) v += Math.sin(((x * w.kx + y * w.ky) / S) * 6.2832 + w.p) * w.a;
    h[y * S + x] = v;
  }
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)];
    const dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
    const n = new THREE.Vector3(-dx * 0.35, -dy * 0.35, 1).normalize();
    const i = (y * S + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Pool: x ±halfW, z from z0 to z1, water level y. With a reflector (desktop),
// the water samples the plaza's mirror image with ripple distortion and a
// Fresnel mix; without (phones), it is a glossy surface lit by the sky.
export function buildPool({ scene, shared, reflector, kerbMaterial, halfW = 3.2, z0 = 4, z1 = 19, y = 0.07, addFlame, addGlow, addPool }) {
  const len = z1 - z0, zc = (z0 + z1) / 2;
  const group = new THREE.Group();

  // kerb: four low marble walls
  const kerb = [
    [halfW * 2 + 0.7, 0.32, 0.35, 0, 0.16, z0 - 0.17], [halfW * 2 + 0.7, 0.32, 0.35, 0, 0.16, z1 + 0.17],
    [0.35, 0.32, len, -halfW - 0.17, 0.16, zc], [0.35, 0.32, len, halfW + 0.17, 0.16, zc],
  ].map(([w, h, d, x, yy, z]) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, yy, z); return g; });
  const kerbMesh = new THREE.Mesh(mergeBoxes(kerb), kerbMaterial);
  kerbMesh.castShadow = true; kerbMesh.receiveShadow = true;
  group.add(kerbMesh);
  // dark basin floor under the water
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, len), new THREE.MeshStandardMaterial({ color: '#1c2522', roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.012, zc);
  group.add(floor);

  const normalTex = waterNormalTexture();
  const geo = new THREE.PlaneGeometry(halfW * 2, len, 1, 1);
  geo.rotateX(-Math.PI / 2);
  let water;
  if (reflector) {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      tReflect: { value: null }, tNormal: { value: normalTex }, uTexMat: { value: new THREE.Matrix4() },
      uTime: shared.uTime, uRain: shared.uRain, uDeep: { value: new THREE.Color('#0b1a1a') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSkyTint: { value: new THREE.Color('#8fa4b0') },
    }]);
    uniforms.uTime = shared.uTime;
    uniforms.uRain = shared.uRain;
    const mat = new THREE.ShaderMaterial({
      uniforms, fog: true, transparent: true, depthWrite: true,
      vertexShader: /* glsl */`
        #include <fog_pars_vertex>
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <fog_pars_fragment>
        uniform sampler2D tReflect, tNormal; uniform mat4 uTexMat; uniform float uTime, uRain;
        uniform vec3 uDeep, uSunDir, uSunColor, uSkyTint;
        varying vec3 vWorld;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        vec2 rainRipples(vec2 p) {
          vec2 g = floor(p), f = fract(p), acc = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j));
            float r = h21(g + o);
            vec2 c = o + vec2(h21(g + o + 3.1), h21(g + o + 7.7)) - f;
            float t = fract(uTime * 0.9 + r);
            float d = length(c);
            float ring = sin((d - t * 1.2) * 28.0) * smoothstep(0.0, 0.08, t * 1.2 - d + 0.05) * (1.0 - t) * smoothstep(0.55, 0.0, d);
            acc += normalize(c + 1e-4) * ring;
          }
          return acc;
        }
        void main() {
          vec2 uv = vWorld.xz * 0.11;
          vec3 n1 = texture2D(tNormal, uv + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(tNormal, uv * 1.9 - vec2(uTime * 0.009, -uTime * 0.013)).xyz * 2.0 - 1.0;
          vec2 slope = (n1.xy + n2.xy) * 0.5 * 0.35;
          if (uRain > 0.01) slope += rainRipples(vWorld.xz * 2.2) * 0.35 * uRain;
          vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec4 c = uTexMat * vec4(vWorld + vec3(slope.x, 0.0, slope.y) * 0.6, 1.0);
          vec3 refl = texture2DProj(tReflect, c).rgb;
          vec3 col = mix(uDeep, refl, clamp(0.35 + fres, 0.0, 1.0));
          vec3 R = reflect(-V, N);
          col += uSunColor * pow(max(dot(R, normalize(uSunDir)), 0.0), 400.0) * 4.0;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    water = new THREE.Mesh(geo, mat);
    // Sample the plaza mirror after it has rendered this frame; keep the
    // water out of that mirror render (it would read the texture it writes).
    const invReflWorld = new THREE.Matrix4();
    water.onBeforeRender = () => {
      invReflWorld.copy(reflector.matrixWorld).invert();
      mat.uniforms.uTexMat.value.multiplyMatrices(reflector.material.uniforms.textureMatrix.value, invReflWorld);
      mat.uniforms.tReflect.value = reflector.getRenderTarget().texture;
    };
    const orig = reflector.onBeforeRender;
    reflector.onBeforeRender = function (...args) { const v = group.visible; group.visible = false; orig.apply(this, args); group.visible = v; };
    water.renderOrder = 2;
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: '#0e1a1b', roughness: 0.06, metalness: 0, normalMap: normalTex, normalScale: new THREE.Vector2(0.35, 0.35) });
    normalTex.repeat.set(1.5, 3);
    water = new THREE.Mesh(geo, mat);
    water.userData.scroll = normalTex;
  }
  water.position.set(0, y, zc);
  group.add(water);

  // floating diyas: clay lamps drifting in two loose rows, flames lit at night
  const diyaGeo = new THREE.LatheGeometry([[0, 0], [0.07, 0.005], [0.1, 0.03], [0.11, 0.055], [0.1, 0.06], [0.06, 0.035], [0, 0.03]].map(([r, h]) => new THREE.Vector2(r, h)), 14);
  const diyas = [];
  for (let i = 0; i < 14; i++) {
    const x = (i % 2 ? 1 : -1) * (0.8 + hash(i) * 1.6), z = z0 + 1 + (i / 13) * (len - 2) + (hash(i + 5) - 0.5) * 0.8;
    diyas.push([x, z]);
    addFlame(x, y + 0.075, z);
    addGlow(x, y + 0.09, z);
    addPool(x, y + 0.002, z);
  }
  const diyaMesh = new THREE.InstancedMesh(diyaGeo, new THREE.MeshStandardMaterial({ color: '#9a5a36', roughness: 0.8 }), diyas.length);
  diyas.forEach(([x, z], i) => diyaMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y - 0.01, z)));
  group.add(diyaMesh);

  scene.add(group);
  return {
    group,
    update(cur, sunDir, sunColor, time) {
      if (water.material.uniforms) {
        water.material.uniforms.uSunDir.value.copy(sunDir);
        water.material.uniforms.uSunColor.value.copy(sunColor).multiplyScalar(Math.min(1, cur.sunIntensity / 3));
      } else if (water.userData.scroll) {
        water.userData.scroll.offset.set(time * 0.01, time * 0.006);
      }
    },
  };
}

function mergeBoxes(list) {
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const b of list) {
    const p = b.attributes.position, n = b.attributes.normal, u = b.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    for (let i = 0; i < b.index.count; i++) idx.push(b.index.getX(i) + off);
    off += p.count;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ------------------------------------------------------------------ */
/* Rain                                                                */
/* ------------------------------------------------------------------ */

// Streaks falling around the camera: a fixed set of line segments whose
// positions wrap in a box that follows the camera, so the rain is world-
// anchored (it doesn't slide when the camera moves) yet always surrounds it.
export function buildRain({ scene, shared, count }) {
  const pos = new Float32Array(count * 6), end = new Float32Array(count * 2), seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = hash(i) * 44 - 22, y = hash(i + 0.37) * 18, z = hash(i + 0.71) * 44 - 22;
    pos.set([x, y, z, x, y, z], i * 6);
    end.set([0, 1], i * 2);
    const s = hash(i + 0.13);
    seed.set([s, s], i * 2); // both ends of a streak share speed and length
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: shared.uTime, uRain: shared.uRain, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color('#c9d3dc') }, uRoofMin: { value: new THREE.Vector3(1, 1, 1) }, uRoofMax: { value: new THREE.Vector3(0, 0, 0) } },
    vertexShader: /* glsl */`
      attribute float aEnd, aSeed;
      uniform float uTime, uRain; uniform vec3 uCam, uRoofMin, uRoofMax;
      varying float vA;
      void main() {
        vec3 p = position;
        float speed = 9.0 + aSeed * 4.0;
        p.y = mod(p.y - uTime * speed, 18.0);
        p.xz = mod(p.xz - uCam.xz + 22.0, 44.0) + uCam.xz - 22.0;
        p.y += uCam.y - 6.0;
        vec3 dir = normalize(vec3(0.12, -1.0, 0.04));
        p -= dir * aEnd * (0.35 + aSeed * 0.25);
        float dist = distance(p, uCam);
        vA = uRain * smoothstep(22.0, 6.0, dist) * step(aSeed, uRain + 0.05) * (0.35 + 0.65 * aEnd);
        // no rain under a roof (the bar canopy)
        if (all(greaterThan(p, uRoofMin)) && all(lessThan(p, uRoofMax))) vA = 0.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; varying float vA; void main() { gl_FragColor = vec4(uColor, vA * 0.32); }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 3;
  scene.add(lines);
  return {
    setRoof(min, max) { mat.uniforms.uRoofMin.value.copy(min); mat.uniforms.uRoofMax.value.copy(max); },
    update(camPos, amount) {
      mat.uniforms.uCam.value.copy(camPos);
      lines.visible = amount > 0.01;
    },
  };
}

/* ------------------------------------------------------------------ */
/* The hall, dressed for an occasion                                    */
/* ------------------------------------------------------------------ */

// Marigold garlands between the arches and hanging from the chandelier ring,
// a stage with a draped backdrop, and traditional brass standing lamps
// (tall, many-wicked) on the stage and along the path to the hall.
export function buildHallDecor({ scene, low, cx, cz, radius, tops, chandelier, marble, brass, addFlame, addGlow }) {
  const group = new THREE.Group();
  const flower = new THREE.IcosahedronGeometry(0.05, low ? 0 : 1);
  const marigold = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
  const tones = ['#f7a51c', '#f58f0f', '#ffc21a', '#e8700a', '#ffb000'].map((c) => new THREE.Color(c));
  const spots = [];
  const strand = (a, b, sag, spacing) => {
    const n = Math.max(2, Math.floor(a.distanceTo(b) / spacing));
    for (let i = 0; i <= n; i++) {
      const f = i / n, p = a.clone().lerp(b, f);
      p.y -= Math.sin(f * Math.PI) * sag;
      spots.push(p);
    }
  };
  const step = low ? 0.16 : 0.09;
  // swags between neighbouring arch tops (the entrance gap stays open)
  for (let k = 0; k < tops.length - 1; k++) {
    const a = tops[k].clone().setY(tops[k].y - 0.6), b = tops[k + 1].clone().setY(tops[k + 1].y - 0.6);
    strand(a, b, 0.9, step);
    strand(a.clone().setY(a.y - 0.5), b.clone().setY(b.y - 0.5), 0.6, step);
  }
  // vertical strands hanging from the chandelier ring
  for (let i = 0; i < (low ? 12 : 24); i++) {
    const ang = (i / (low ? 12 : 24)) * Math.PI * 2;
    const top = new THREE.Vector3(cx + Math.cos(ang) * chandelier.r, chandelier.y - 0.1, cz + Math.sin(ang) * chandelier.r);
    const len = 1.2 + hash(i) * 1.4;
    for (let d = 0; d < len; d += step) spots.push(top.clone().setY(top.y - d));
  }

  // stage at the back of the rotunda, facing the entrance
  const sz = cz - radius + 3.2;
  const stageParts = [];
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  stageParts.push(box(7, 0.55, 3.2, cx, 0.42, sz), box(7.4, 0.12, 3.5, cx, 0.2, sz));
  const stage = new THREE.Mesh(mergeBoxes(stageParts), marble);
  stage.castShadow = true; stage.receiveShadow = true;
  group.add(stage);
  // backdrop: cream drapes gathered in soft folds, framed in bronze
  const drapeGeo = new THREE.PlaneGeometry(6.4, 4.2, 96, 1);
  const dp = drapeGeo.attributes.position;
  for (let i = 0; i < dp.count; i++) dp.setZ(i, Math.sin(dp.getX(i) * 7.5) * 0.06 + Math.sin(dp.getX(i) * 2.1) * 0.04);
  drapeGeo.computeVertexNormals();
  const drape = new THREE.Mesh(drapeGeo, new THREE.MeshStandardMaterial({ color: '#f2e6d4', roughness: 0.92, side: THREE.DoubleSide }));
  drape.position.set(cx, 2.8, sz - 1.4);
  drape.receiveShadow = true;
  group.add(drape);
  const frame = new THREE.Mesh(mergeBoxes([box(6.8, 0.14, 0.14, cx, 4.95, sz - 1.35), box(0.14, 4.4, 0.14, cx - 3.35, 2.75, sz - 1.35), box(0.14, 4.4, 0.14, cx + 3.35, 2.75, sz - 1.35)]), brass);
  frame.castShadow = true;
  group.add(frame);
  // marigold border around the backdrop
  strand(new THREE.Vector3(cx - 3.3, 4.85, sz - 1.25), new THREE.Vector3(cx + 3.3, 4.85, sz - 1.25), 0.5, step);
  for (const x of [cx - 3.3, cx + 3.3]) for (let y = 4.8; y > 0.8; y -= step) spots.push(new THREE.Vector3(x, y, sz - 1.25));

  const fl = new THREE.InstancedMesh(flower, marigold, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  spots.forEach((p, i) => {
    const s = 0.8 + hash(i * 1.7) * 0.5;
    sc.set(s, s * 0.8, s);
    q.setFromEuler(new THREE.Euler(hash(i) * 3, hash(i + 1) * 3, 0));
    fl.setMatrixAt(i, m.compose(p, q, sc));
    fl.setColorAt(i, tones[i % tones.length]);
  });
  group.add(fl);

  // traditional brass standing lamps: a tall stem on a stepped base with a
  // wide dish of five flames at the top
  const lampGeo = new THREE.LatheGeometry([
    [0, 0], [0.32, 0], [0.32, 0.05], [0.24, 0.09], [0.24, 0.13], [0.12, 0.2], [0.07, 0.28], [0.05, 0.9], [0.09, 0.96], [0.05, 1.02],
    [0.045, 1.55], [0.08, 1.6], [0.2, 1.64], [0.22, 1.69], [0.08, 1.7], [0.04, 1.78], [0.06, 1.95], [0.03, 2.05], [0, 2.1],
  ].map(([r, h]) => new THREE.Vector2(r, h)), low ? 14 : 28);
  const lampSpots = [[cx - 2.7, 0.7, sz + 0.6], [cx + 2.7, 0.7, sz + 0.6]];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) lampSpots.push([s * 2.3, 0, cz + radius + 3 + i * 3.4]);
  const lamps = new THREE.InstancedMesh(lampGeo, brass, lampSpots.length);
  lampSpots.forEach(([x, y, z], i) => {
    lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      addFlame(x + Math.cos(a) * 0.19, y + 1.72, z + Math.sin(a) * 0.19);
    }
    addGlow(x, y + 1.78, z);
  });
  lamps.castShadow = true;
  group.add(lamps);

  scene.add(group);
  return { group, stage, lamps };
}
