// Screen-space effects that need the scene's depth (desktop only):
//   ScenePass  — renders the scene into its own target with a depth texture,
//                then copies the colour into the composer's chain.
//   DepthFxPass — ambient occlusion (half resolution, blurred) and volumetric
//                light shafts (ray-marched against a sun-view depth map).
//   DofPass    — gentle depth of field around the chapter's subject.
// Kept apart from scene.js; they only need the renderer, scene and camera.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const common = /* glsl */`
  uniform mat4 uProjInv;
  uniform float uNear, uFar;
  float viewZAt(sampler2D depthTex, vec2 uv) {
    float d = textureLod(depthTex, uv, 0.0).x;
    return perspectiveDepthToViewZ(d, uNear, uFar);
  }
  vec3 viewPosAt(sampler2D depthTex, vec2 uv) {
    float d = texture2D(depthTex, uv).x;
    vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 v = uProjInv * ndc;
    return v.xyz / v.w;
  }
`;

const quadVertex = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/* ------------------------------------------------------------------ */

export class ScenePass extends Pass {
  constructor(scene, camera, samples) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    });
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: quadVertex,
      fragmentShader: /* glsl */`uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`,
      depthTest: false, depthWrite: false,
    }));
  }
  get depthTexture() { return this.target.depthTexture; }
  setSize(w, h) { this.target.setSize(w, h); }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.copy.material.uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
  }
}

/* ------------------------------------------------------------------ */

const KERNEL = (() => {
  const k = [];
  for (let i = 0; i < 12; i++) {
    // points in a unit hemisphere (z up), denser near the centre
    const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 12);
    const v = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(Math.max(0, 1 - r * r)));
    v.multiplyScalar(0.25 + 0.75 * ((i + 1) / 12) ** 2);
    k.push(v);
  }
  return k;
})();

export class DepthFxPass extends Pass {
  constructor(camera, scenePass, sunMask) {
    super();
    this.camera = camera;
    this.scenePass = scenePass;
    this.sunMask = sunMask;
    this.needsSwap = true;
    this.aoEnabled = true;
    this.raysEnabled = true;
    this.aoTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.aoBlur = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });

    this.aoQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      defines: { KERNEL_SIZE: KERNEL.length },
      uniforms: {
        tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
        uNear: { value: 0.1 }, uFar: { value: 100 }, uKernel: { value: KERNEL }, uRadius: { value: 0.9 }, uTexel: { value: new THREE.Vector2() },
      },
      vertexShader: quadVertex,
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tDepth; uniform mat4 uProj; uniform vec3 uKernel[KERNEL_SIZE]; uniform float uRadius; uniform vec2 uTexel;
        ${common}
        varying vec2 vUv;
        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        void main() {
          float d = texture2D(tDepth, vUv).x;
          if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
          vec3 p = viewPosAt(tDepth, vUv);
          vec3 px = viewPosAt(tDepth, vUv + vec2(uTexel.x, 0.0)) - p;
          vec3 py = viewPosAt(tDepth, vUv + vec2(0.0, uTexel.y)) - p;
          vec3 n = normalize(cross(px, py));
          float rot = ign(gl_FragCoord.xy) * 6.2831853;
          vec3 rv = vec3(cos(rot), sin(rot), 0.0);
          vec3 t = normalize(rv - n * dot(rv, n));
          mat3 tbn = mat3(t, cross(n, t), n);
          float occ = 0.0;
          for (int i = 0; i < KERNEL_SIZE; i++) {
            vec3 s = p + tbn * uKernel[i] * uRadius;
            vec4 c = uProj * vec4(s, 1.0);
            vec2 suv = c.xy / c.w * 0.5 + 0.5;
            float sz = viewZAt(tDepth, suv);
            float range = smoothstep(0.0, 1.0, uRadius / abs(p.z - sz));
            occ += (sz >= s.z + 0.03 ? 1.0 : 0.0) * range;
          }
          float ao = 1.0 - occ / float(KERNEL_SIZE);
          gl_FragColor = vec4(vec3(ao), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.blurQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tAO: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: quadVertex,
      fragmentShader: /* glsl */`
        uniform sampler2D tAO; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          float s = 0.0;
          for (int x = -2; x <= 1; x++) for (int y = -2; y <= 1; y++) s += texture2D(tAO, vUv + (vec2(float(x), float(y)) + 0.5) * uTexel).r;
          gl_FragColor = vec4(vec3(s / 16.0), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.mainQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, tAO: { value: null }, tMask: { value: null },
        uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uMaskMat: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uColor: { value: new THREE.Color() },
        uNear: { value: 0.1 }, uFar: { value: 100 }, uAO: { value: 0.0 }, uRays: { value: 0.0 }, uMaxDist: { value: 70 },
      },
      vertexShader: quadVertex,
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tDiffuse, tDepth, tAO, tMask;
        uniform mat4 uCamWorld, uMaskMat; uniform vec3 uCamPos, uSunDir, uColor;
        uniform float uAO, uRays, uMaxDist;
        ${common}
        varying vec2 vUv;
        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec3 col = base.rgb;
          if (uAO > 0.0) col *= mix(1.0, texture2D(tAO, vUv).r, uAO);
          if (uRays > 0.0) {
            vec3 wp = (uCamWorld * vec4(viewPosAt(tDepth, vUv), 1.0)).xyz;
            vec3 rd = wp - uCamPos;
            float len = min(length(rd), uMaxDist);
            rd = normalize(rd);
            const int N = 28;
            float stepLen = len / float(N);
            float j = ign(gl_FragCoord.xy);
            float acc = 0.0;
            for (int i = 0; i < N; i++) {
              vec3 p = uCamPos + rd * (float(i) + j) * stepLen;
              vec4 m = uMaskMat * vec4(p, 1.0);
              vec3 mc = m.xyz / m.w * 0.5 + 0.5;
              float lit = 1.0;
              if (mc.x > 0.0 && mc.x < 1.0 && mc.y > 0.0 && mc.y < 1.0) {
                float occ = unpackRGBAToDepth(textureLod(tMask, mc.xy, 0.0));
                lit = mc.z - 0.003 > occ ? 0.0 : 1.0;
              }
              acc += lit * exp(-max(p.y, 0.0) * 0.16);
            }
            acc *= stepLen / uMaxDist;
            float g = 0.62, c = dot(rd, uSunDir);
            float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
            col += uColor * acc * phase * uRays;
          }
          gl_FragColor = vec4(col, base.a);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }

  setSize(w, h) {
    this.aoTarget.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.aoBlur.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.aoQuad.material.uniforms.uTexel.value.set(2 / w, 2 / h);
    this.blurQuad.material.uniforms.uTexel.value.set(2 / w, 2 / h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera, depth = this.scenePass.depthTexture;
    const main = this.mainQuad.material.uniforms;
    const aoOn = this.aoEnabled && main.uAO.value > 0.001;
    if (aoOn) {
      const u = this.aoQuad.material.uniforms;
      u.tDepth.value = depth;
      u.uProj.value.copy(cam.projectionMatrix);
      u.uProjInv.value.copy(cam.projectionMatrixInverse);
      u.uNear.value = cam.near; u.uFar.value = cam.far;
      renderer.setRenderTarget(this.aoTarget);
      this.aoQuad.render(renderer);
      this.blurQuad.material.uniforms.tAO.value = this.aoTarget.texture;
      renderer.setRenderTarget(this.aoBlur);
      this.blurQuad.render(renderer);
    }
    const raysOn = this.raysEnabled && main.uRays.value > 0.001;
    if (raysOn) this.sunMask.render(renderer);
    main.tDiffuse.value = readBuffer.texture;
    main.tDepth.value = depth;
    main.tAO.value = this.aoBlur.texture;
    main.tMask.value = this.sunMask.target.texture;
    main.uMaskMat.value.copy(this.sunMask.matrix);
    main.uProjInv.value.copy(cam.projectionMatrixInverse);
    main.uCamWorld.value.copy(cam.matrixWorld);
    main.uCamPos.value.copy(cam.position);
    main.uNear.value = cam.near; main.uFar.value = cam.far;
    const aoSaved = main.uAO.value, raysSaved = main.uRays.value;
    if (!aoOn) main.uAO.value = 0;
    if (!raysOn) main.uRays.value = 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.mainQuad.render(renderer);
    main.uAO.value = aoSaved; main.uRays.value = raysSaved;
  }
}

/* ------------------------------------------------------------------ */

// Depth of the scene as seen from the sun, for the light shafts: an
// orthographic camera looking down the light direction, rendering only
// objects on layer 2 (the ones that cast shafts) with packed depth.
export class SunMask {
  constructor(size) {
    this.target = new THREE.WebGLRenderTarget(size, size);
    this.camera = new THREE.OrthographicCamera(-55, 55, 55, -55, 1, 360);
    this.camera.layers.set(2);
    this.material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    this.matrix = new THREE.Matrix4();
    this.scene = null;
  }
  place(focus, lightDir) {
    this.camera.position.copy(focus).addScaledVector(lightDir, 180);
    this.camera.lookAt(focus);
    this.camera.updateMatrixWorld();
    this.matrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
  }
  render(renderer) {
    const s = this.scene, prevOverride = s.overrideMaterial, prevBg = s.background, prevFog = s.fog;
    const prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    s.overrideMaterial = this.material;
    s.background = null;
    s.fog = null;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0xffffff, 1); // packed depth 1 = nothing in the way
    renderer.clear();
    renderer.render(s, this.camera);
    renderer.setClearColor(prevColor, prevAlpha);
    s.overrideMaterial = prevOverride;
    s.background = prevBg;
    s.fog = prevFog;
  }
}

/* ------------------------------------------------------------------ */

export class DofPass extends Pass {
  constructor(camera, scenePass) {
    super();
    this.camera = camera;
    this.scenePass = scenePass;
    this.needsSwap = true;
    this.focus = 20;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() },
        uNear: { value: 0.1 }, uFar: { value: 100 }, uFocus: { value: 20 }, uAperture: { value: 0.35 }, uMaxBlur: { value: 5 }, uTexel: { value: new THREE.Vector2() },
      },
      vertexShader: quadVertex,
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tDiffuse, tDepth; uniform float uFocus, uAperture, uMaxBlur; uniform vec2 uTexel;
        ${common}
        varying vec2 vUv;
        float coc(vec2 uv) {
          float z = -viewZAt(tDepth, uv);
          return clamp(abs(z - uFocus) / max(z, 0.1) * uAperture, 0.0, 1.0);
        }
        void main() {
          float c0 = coc(vUv);
          vec3 sum = texture2D(tDiffuse, vUv).rgb; float w = 1.0;
          if (c0 > 0.02) {
            for (int i = 0; i < 16; i++) {
              float a = float(i) * 2.39996, r = sqrt((float(i) + 0.5) / 16.0);
              vec2 o = vec2(cos(a), sin(a)) * r * c0 * uMaxBlur * uTexel;
              float ci = coc(vUv + o);
              float wi = smoothstep(0.0, 1.0, ci / max(c0, 0.001) + 0.25);
              sum += textureLod(tDiffuse, vUv + o, 0.0).rgb * wi; w += wi;
            }
          }
          gl_FragColor = vec4(sum / w, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  setSize(w, h) { this.quad.material.uniforms.uTexel.value.set(1 / w, 1 / h); }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.quad.material.uniforms, cam = this.camera;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = this.scenePass.depthTexture;
    u.uProjInv.value.copy(cam.projectionMatrixInverse);
    u.uNear.value = cam.near; u.uFar.value = cam.far;
    u.uFocus.value = this.focus;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}
