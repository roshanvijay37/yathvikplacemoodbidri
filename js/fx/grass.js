// A real lawn around the camera (desktop only): tens of thousands of small
// clumps of grass blades, drawn in one call. The field is a grid that follows
// the camera, but every clump is placed from its *world* cell, so nothing
// swims as the camera moves. Blades shrink away with distance into the flat
// lawn texture, are cut out of the paved plaza and approach path, and lean in
// the same wind as the palms.

import * as THREE from 'three';

// One clump: a few tapering blades, each two segments tall. `aH` is 0 at the
// root and 1 at the tip; `aTone` varies colour from blade to blade.
function clumpGeometry(blades, rand) {
  const pos = [], nor = [], h = [], tone = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const r = 0.2 * Math.sqrt(rand()), a = rand() * Math.PI * 2;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const face = rand() * Math.PI, fx = Math.cos(face), fz = Math.sin(face);
    const height = 0.08 + rand() * 0.12, width = 0.02 + rand() * 0.016;
    const lean = (rand() - 0.5) * 0.12, leanDir = rand() * Math.PI * 2;
    const t0 = pos.length / 3, t = rand();
    const rows = [[0, 1], [0.55, 0.7], [1, 0]]; // height fraction, width fraction
    rows.forEach(([f, wf], row) => {
      const ox = Math.cos(leanDir) * lean * f * f, oz = Math.sin(leanDir) * lean * f * f;
      const sides = row === 2 ? [0] : [-1, 1];
      for (const s of sides) {
        pos.push(cx + ox + fx * s * width * wf, f * height, cz + oz + fz * s * width * wf);
        nor.push(-fz, 0.6, fx);
        h.push(f); tone.push(t);
      }
    });
    idx.push(t0, t0 + 1, t0 + 2, t0 + 1, t0 + 3, t0 + 2, t0 + 2, t0 + 3, t0 + 4);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(h, 1));
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1));
  g.setIndex(idx);
  return g;
}

// paved: list of [xMin, xMax, zMin, zMax] rectangles where no grass grows.
export function buildGrass({ scene, shared, rand, paved, cells = 210, spacing = 0.44, far = 46 }) {
  const geo = clumpGeometry(8, rand);
  const cell = new Float32Array(cells * cells * 2);
  for (let j = 0, k = 0; j < cells; j++) for (let i = 0; i < cells; i++) { cell[k++] = i; cell[k++] = j; }
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
  geo.instanceCount = cells * cells;

  const uniforms = {
    uOrigin: { value: new THREE.Vector2() }, uSpacing: { value: spacing }, uFar: { value: far },
    uPaved: { value: paved.map(([a, b, c, d]) => new THREE.Vector4(a, b, c, d)) },
    uRoot: { value: new THREE.Color('#3d4c20') }, uTip: { value: new THREE.Color('#93a653') }, uDry: { value: new THREE.Color('#9a8c52') },
  };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, { uTime: shared.uTime, uWind: shared.uWind });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec2 uOrigin; uniform float uSpacing, uFar, uTime, uWind; uniform vec4 uPaved[${paved.length}];
        attribute vec2 aCell; attribute float aH, aTone;
        varying float vH, vTone, vDry;
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), 0.75));')
      .replace('#include <begin_vertex>', `
        vec2 key = floor(uOrigin / uSpacing + 0.5) + aCell;
        vec2 base = (key + vec2(gHash(key), gHash(key + 17.3)) - 0.5) * uSpacing;
        float keep = 1.0;
        for (int i = 0; i < ${paved.length}; i++) {
          vec4 r = uPaved[i];
          if (base.x > r.x && base.x < r.y && base.y > r.z && base.y < r.w) keep = 0.0;
        }
        float dist = distance(cameraPosition.xz, base) + max(cameraPosition.y - 2.0, 0.0) * 0.8;
        float fade = keep * (1.0 - smoothstep(uFar * 0.3, uFar, dist));
        float patchy = 0.55 + 0.45 * sin(base.x * 0.23 + 1.3) * sin(base.y * 0.19 + 0.4);
        vDry = smoothstep(0.35, 0.05, patchy) * 0.8;
        vec3 p = position;
        p.y *= fade * (0.7 + 0.6 * gHash(key + 3.1)) * (0.75 + 0.5 * patchy);
        p.xz *= fade;
        float ang = gHash(key + 41.7) * 6.2831853;
        p.xz = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * p.xz;
        float gust = 0.5 + 0.5 * sin(uTime * 1.2 - base.x * 0.21 - base.y * 0.13);
        float bend = aH * aH * (0.015 + 0.035 * gust) * uWind * fade;
        p.x += bend; p.z += bend * 0.5;
        vH = aH; vTone = aTone;
        vec3 transformed = vec3(base.x + p.x, p.y, base.y + p.z);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRoot, uTip, uDry; varying float vH, vTone, vDry;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec3 blade = mix(uRoot, uTip, smoothstep(0.0, 1.0, vH) * (0.75 + 0.5 * vTone));
        blade = mix(blade, uDry * (0.8 + 0.4 * vTone), vDry * smoothstep(0.2, 1.0, vH));
        vec4 diffuseColor = vec4(blade * (0.7 + 0.3 * vH), opacity);`);
  };
  material.customProgramCacheKey = () => 'grass';

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  // no shadow lookups: the contact-shadow filter per blade costs more than it shows
  mesh.receiveShadow = false;
  scene.add(mesh);
  const half = (cells / 2) * spacing;
  return {
    mesh,
    update(camPos) { uniforms.uOrigin.value.set(camPos.x - half, camPos.z - half); },
  };
}
