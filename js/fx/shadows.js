// Contact-hardening sun shadows (PCSS, desktop only): sharp where an object
// meets the ground, softer the further the shadow falls from it, as real
// sunlight does. Replaces the body of Three.js's plain PCF filter, so the
// renderer must use THREE.PCFShadowMap; phones keep PCFSoftShadowMap and are
// untouched.
//
// Units: the sun's shadow camera spans near 1 .. far 220 m, so one unit of
// shadow depth is ~219 m. PENUMBRA is texels of blur per metre between the
// blocker and the receiver (~0.033 m per texel at 2048 over 68 m); the real
// sun is sharper than this, but sky light softens real shadows further.

import * as THREE from 'three';

const PCSS = /* glsl */`
		#if defined( SHADOWMAP_TYPE_PCF )

			const float DEPTH_M = 219.0;
			const float PENUMBRA = 0.9;    // texels per metre of blocker distance
			const float SEARCH = 12.0;     // texels searched for blockers
			const float MAX_R = 11.0;
			vec2 texel = 1.0 / shadowMapSize;
			float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
			mat2 rot = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));

			float blockers = 0.0, sum = 0.0;
			for (int i = 0; i < 12; i++) {
				float r = sqrt((float(i) + 0.5) / 12.0), a = float(i) * 2.39996;
				vec2 o = rot * vec2(cos(a), sin(a)) * r * SEARCH * texel;
				float d = unpackRGBAToDepth(texture2D(shadowMap, shadowCoord.xy + o));
				if (d < shadowCoord.z) { sum += d; blockers += 1.0; }
			}
			if (blockers > 0.0) {
				float gap = (shadowCoord.z - sum / blockers) * DEPTH_M;
				float radius = clamp(gap * PENUMBRA, 1.0, MAX_R);
				float lit = 0.0;
				for (int i = 0; i < 16; i++) {
					float r = sqrt((float(i) + 0.5) / 16.0), a = float(i) * 2.39996;
					vec2 o = rot * vec2(cos(a), sin(a)) * r * radius * texel;
					lit += texture2DCompare(shadowMap, shadowCoord.xy + o, shadowCoord.z);
				}
				shadow = lit / 16.0;
			}

		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )`;

export function useContactShadows(renderer) {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const start = chunk.indexOf('#if defined( SHADOWMAP_TYPE_PCF )');
  const end = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )');
  if (start < 0 || end < start) return false; // a Three.js version with another layout: keep the default
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.slice(0, start) + PCSS.trim() + chunk.slice(end + '#elif defined( SHADOWMAP_TYPE_PCF_SOFT )'.length);
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return true;
}
