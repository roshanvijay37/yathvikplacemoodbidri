// Air and weather details: soft beams of light under the hall chandelier and
// the bar pendants, dust drifting in the dawn sun and the hall's light, a
// flock of birds crossing the sky, fireflies over the lawn at night, and rain
// puddles on the marble. Everything is procedural and cheap; each returns an
// update() the frame loop calls with the current mood.

import * as THREE from 'three';

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ------------------------------------------------------------------ */
/* Light beams                                                         */
/* ------------------------------------------------------------------ */

// cones: [{ x, y, z, rTop, rBottom, bottom }] — each a soft, open cone from a
// light down to the surface it lights. Brightest where the cone faces the
// camera and near its source, fading at its silhouette, towards the floor and
// close to the camera (so walking through one never washes out the view).
export function buildBeams({ scene, shared, cones, color, strength = 1, segments = 32 }) {
  const parts = cones.map(({ x, y, z, rTop, rBottom, bottom }) => {
    const h = y - bottom;
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, true);
    const pos = g.attributes.position, t = [];
    for (let i = 0; i < pos.count; i++) t.push(pos.getY(i) / h + 0.5); // 1 at the light, 0 at the floor
    g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
    g.translate(x, bottom + h / 2, z);
    return g;
  });
  const merged = mergeSimple(parts);
  const uniforms = { uAmount: { value: 0 }, uColor: { value: new THREE.Color(color).multiplyScalar(strength) }, uTime: shared.uTime };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      attribute float aT; varying float vT; varying vec3 vN, vView, vWorld;
      void main() {
        vT = aT;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vView = -mv.xyz;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmount, uTime; uniform vec3 uColor;
      varying float vT; varying vec3 vN, vView, vWorld;
      float n3(vec3 p) { return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      float vnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(n3(i), n3(i + vec3(1,0,0)), f.x), mix(n3(i + vec3(0,1,0)), n3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(n3(i + vec3(0,0,1)), n3(i + vec3(1,0,1)), f.x), mix(n3(i + vec3(0,1,1)), n3(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        float dist = length(vView);
        float facing = abs(dot(normalize(vN), vView / dist));
        float haze = 0.7 + 0.3 * vnoise(vWorld * 1.3 + vec3(0.0, -uTime * 0.15, uTime * 0.05));
        float t = clamp(vT, 0.0, 1.0); // pow() of a hair below zero is NaN on some GPUs
        float a = uAmount * pow(facing, 1.6) * pow(t, 0.7) * smoothstep(0.0, 0.25, t)
          * smoothstep(0.6, 3.0, dist) * exp(-dist * 0.012) * haze;
        gl_FragColor = vec4(uColor * clamp(a, 0.0, 4.0), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, update(amount) { uniforms.uAmount.value = amount; mesh.visible = amount > 0.005; } };
}

/* ------------------------------------------------------------------ */
/* Dust motes                                                          */
/* ------------------------------------------------------------------ */

// Specks drifting slowly in a box; brighter when seen against the light
// (forward scattering), so at dawn they sparkle looking towards the sun.
// `phase` 0 = lit evenly (inside the hall's beams).
export function buildMotes({ scene, shared, count, box, color, size = 1.6, phase = 1 }) {
  const [x0, x1, y0, y1, z0, z1] = box;
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = x0 + hash(i) * (x1 - x0);
    pos[i * 3 + 1] = y0 + hash(i + 0.37) * (y1 - y0);
    pos[i * 3 + 2] = z0 + hash(i + 0.71) * (z1 - z0);
    seed[i] = hash(i + 0.13);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = {
    uTime: shared.uTime, uAmount: { value: 0 }, uColor: { value: new THREE.Color(color) }, uSize: { value: size },
    uScale: { value: 500 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uPhase: { value: phase },
    uBox0: { value: new THREE.Vector3(x0, y0, z0) }, uBox1: { value: new THREE.Vector3(x1, y1, z1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      uniform float uTime, uSize, uScale, uPhase; uniform vec3 uSunDir, uBox0, uBox1;
      attribute float aSeed; varying float vB;
      void main() {
        vec3 span = uBox1 - uBox0;
        vec3 p = position + vec3(sin(uTime * 0.21 + aSeed * 40.0) * 0.4, uTime * (0.03 + aSeed * 0.05), cos(uTime * 0.17 + aSeed * 23.0) * 0.4);
        p = uBox0 + mod(p - uBox0, span);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vec3 toP = normalize(p - cameraPosition);
        float fwd = pow(max(dot(toP, normalize(uSunDir)), 0.0), 8.0);
        vB = mix(1.0, 0.25 + 3.0 * fwd, uPhase) * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + aSeed * 60.0));
        vB *= smoothstep(0.4, 1.5, d) * (1.0 - smoothstep(18.0, 30.0, d));
        gl_PointSize = clamp(uSize * uScale * 0.004 / max(d, 0.5), 1.0, 5.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmount; uniform vec3 uColor; varying float vB;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, r) * vB * uAmount;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  scene.add(pts);
  return {
    points: pts, uniforms,
    update(amount, sunDir) { uniforms.uAmount.value = amount; pts.visible = amount > 0.005; if (sunDir) uniforms.uSunDir.value.copy(sunDir); },
  };
}

/* ------------------------------------------------------------------ */
/* Birds                                                               */
/* ------------------------------------------------------------------ */

// A loose V of birds crossing high over the grounds, wings flapping (each at
// its own rate), gliding now and then. Silhouettes: at 40-60 m against the sky
// that is all the eye reads.
export function buildBirds({ scene, shared, count = 18 }) {
  // one bird: a small body and two wings; aTip is 0 at the body, 1 at a wingtip
  const pos = [0, 0, 0.18, 0.05, 0, -0.2, -0.05, 0, -0.2,           // body
    0.04, 0, 0.1, 0.04, 0, -0.12, 0.62, 0.02, -0.06,                    // right wing
    -0.04, 0, -0.12, -0.04, 0, 0.1, -0.62, 0.02, -0.06];                // left wing
  const tip = [0, 0, 0, 0, 0, 1, 0, 0, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: '#2b2622', side: THREE.DoubleSide, fog: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aTip;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;
          float glide = smoothstep(0.2, 0.6, sin(uTime * 0.3 + ph));
          float flap = sin(uTime * (7.5 + fract(ph) * 2.0) + ph * 6.0) * (1.0 - glide * 0.85);
          transformed.y += flap * 0.38 * aTip;
          transformed.x *= 1.0 - 0.18 * aTip * max(flap, 0.0);
        }`);
  };
  mat.customProgramCacheKey = () => 'birds';
  const mesh = new THREE.InstancedMesh(g, mat, count);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const offsets = Array.from({ length: count }, (_, i) => {
    const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    return new THREE.Vector3(k * 1.5 + (hash(i) - 0.5) * 1.2, (hash(i + 4) - 0.5) * 1.6, Math.abs(k) * 1.9 + (hash(i + 9) - 0.5) * 1.5);
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const LENGTH = 320, SPEED = 9;
  return {
    mesh,
    update(time, amount) {
      mesh.visible = amount > 0.02;
      if (!mesh.visible) return;
      // the flock loops across the sky from west to east, well above the grounds
      const u = ((time * SPEED) % LENGTH) / LENGTH;
      const cx = -LENGTH / 2 + u * LENGTH, cy = 26 + Math.sin(u * 6.28) * 3, cz = -42 + Math.sin(u * 12.56) * 6;
      const heading = Math.PI / 2 + Math.cos(u * 12.56) * 0.25; // +x, with a gentle weave
      const s = 2.2 * Math.min(1, amount * 1.5);
      offsets.forEach((o, i) => {
        const wob = Math.sin(time * 0.7 + i) * 0.5;
        p.set(cx - o.z + wob * 0.3, cy + o.y + wob * 0.4, cz + o.x);
        q.setFromEuler(e.set(0, heading, Math.sin(time * 0.5 + i) * 0.15));
        m.compose(p, q, one.set(s, s, s));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Fireflies                                                           */
/* ------------------------------------------------------------------ */

// Small green-gold lights low over the lawn, each blinking in its own rhythm
// and wandering slowly. regions: [[x0, x1, z0, z1], ...].
export function buildFireflies({ scene, shared, count, regions }) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const [x0, x1, z0, z1] = regions[i % regions.length];
    pos[i * 3] = x0 + hash(i * 1.3) * (x1 - x0);
    pos[i * 3 + 1] = 0.3 + hash(i * 2.1) * 2.2;
    pos[i * 3 + 2] = z0 + hash(i * 3.7) * (z1 - z0);
    seed[i] = hash(i * 5.9);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: shared.uTime, uAmount: { value: 0 }, uScale: { value: 500 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      uniform float uTime, uScale; attribute float aSeed; varying float vB;
      void main() {
        float t = uTime * (0.25 + aSeed * 0.2) + aSeed * 50.0;
        vec3 p = position + vec3(sin(t) * 0.9, sin(t * 1.7) * 0.35, cos(t * 0.8) * 0.9);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        // a slow pulse: dark most of the time, a soft glow for about a second
        float blink = pow(max(sin(uTime * (0.5 + aSeed * 0.6) + aSeed * 31.0), 0.0), 10.0);
        vB = blink * (1.0 - smoothstep(40.0, 90.0, d));
        gl_PointSize = clamp(uScale * 0.012 / max(d, 1.0), 2.0, 9.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmount; varying float vB;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vec3(0.75, 1.0, 0.35) * (core * core * 2.2 + core * 0.4) * vB * uAmount, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  scene.add(pts);
  return { points: pts, uniforms, update(amount) { uniforms.uAmount.value = amount; pts.visible = amount > 0.01; } };
}

/* ------------------------------------------------------------------ */
/* Puddles                                                             */
/* ------------------------------------------------------------------ */

// Shallow rainwater on the marble, in irregular patches (world-space noise),
// with raindrop rings. Desktop: they mirror the scene, reusing the plaza
// mirror's picture; phones: a glossy dark film that reflects the sky light.
// rects: [[x0, x1, z0, z1], ...]
export function buildPuddles({ scene, shared, reflector, rects, y = 0.006 }) {
  const group = new THREE.Group();
  const uniforms = {
    uTime: shared.uTime, uRain: shared.uRain, uWet: { value: 0 },
    tReflect: { value: null }, uTexMat: { value: new THREE.Matrix4() }, uHasReflect: { value: reflector ? 1 : 0 },
    uTint: { value: new THREE.Color('#2a2a2c') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    fog: true, transparent: true, depthWrite: false,
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
      uniform sampler2D tReflect; uniform mat4 uTexMat; uniform float uTime, uRain, uWet, uHasReflect; uniform vec3 uTint;
      varying vec3 vWorld;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { return vn(p) * 0.55 + vn(p * 2.1 + 3.7) * 0.3 + vn(p * 4.3 + 9.1) * 0.15; }
      vec2 ripples(vec2 p) {
        vec2 g = floor(p), f = fract(p), acc = vec2(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 o = vec2(float(i), float(j));
          float r = h21(g + o);
          vec2 c = o + vec2(h21(g + o + 3.1), h21(g + o + 7.7)) - f;
          float t = fract(uTime * 1.1 + r);
          float d = length(c);
          acc += normalize(c + 1e-4) * sin((d - t) * 30.0) * smoothstep(0.0, 0.06, t - d + 0.04) * (1.0 - t) * smoothstep(0.5, 0.0, d);
        }
        return acc;
      }
      void main() {
        // patches: fbm thresholded; a more-wet world has bigger puddles
        float m = fbm(vWorld.xz * 0.22);
        float edge = smoothstep(0.66 - 0.12 * uWet, 0.6 - 0.12 * uWet, 1.0 - m);
        if (edge * uWet < 0.01) discard;
        vec2 slope = ripples(vWorld.xz * 3.0) * 0.25 * uRain;
        vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 refl = uTint * 0.4;
        if (uHasReflect > 0.5) refl = texture2DProj(tReflect, uTexMat * vec4(vWorld + vec3(slope.x, 0.0, slope.y) * 0.4, 1.0)).rgb;
        vec3 col = mix(uTint * 0.25, refl, clamp(0.3 + fres, 0.0, 1.0));
        gl_FragColor = vec4(col, edge * uWet * 0.92);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, uniforms);
  for (const [x0, x1, z0, z1] of rects) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    plane.renderOrder = 2;
    group.add(plane);
  }
  scene.add(group);
  if (reflector) {
    const inv = new THREE.Matrix4();
    const sync = () => {
      inv.copy(reflector.matrixWorld).invert();
      uniforms.uTexMat.value.multiplyMatrices(reflector.material.uniforms.textureMatrix.value, inv);
      uniforms.tReflect.value = reflector.getRenderTarget().texture;
    };
    for (const c of group.children) c.onBeforeRender = sync;
    // keep the puddles out of the mirror picture they read
    const orig = reflector.onBeforeRender;
    reflector.onBeforeRender = function (...args) { const v = group.visible; group.visible = false; orig.apply(this, args); group.visible = v; };
  }
  return { group, update(wet) { uniforms.uWet.value = wet; group.visible = wet > 0.02; } };
}

// merge geometries that share the same attributes (position, normal, uv, aT)
function mergeSimple(list) {
  const out = new THREE.BufferGeometry();
  const names = Object.keys(list[0].attributes);
  const idx = [];
  let off = 0;
  for (const n of names) {
    const size = list[0].attributes[n].itemSize;
    const arr = [];
    for (const g of list) arr.push(...g.attributes[n].array);
    out.setAttribute(n, new THREE.Float32BufferAttribute(arr, size));
  }
  for (const g of list) { for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); off += g.attributes.position.count; }
  out.setIndex(idx);
  return out;
}
