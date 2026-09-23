// Camera path and lighting mood for each scroll chapter.
//
// `p` is the scroll position in chapter units: 0 = arrival, 1 = restaurant,
// 2 = stay, 3 = bar, 4 = hall, 5 = visit. Whole numbers line up with the
// middle of each section on the page; fractional keys are waypoints between.
// Units are metres. The path runs from the gateway (z = 0) towards -z.

// Measured from brand/mark.svg: the mark is 363.6 units tall, and the two
// openings between its pillars are 27.4 units wide, centred 30.2 units either
// side of the middle.
export const MARK = { svgHeight: 363.6, slotOffset: 30.2, slotWidth: 27.4 };

export const LAYOUT = {
  gateHeight: 16,
  colonnade: { height: 5, x: 7.5, zStart: -10, zEnd: -106, step: 8 },
  restaurant: { xs: [-4.5, -1.5, 1.5, 4.5], zs: [-19, -23.5, -28], lampY: 3.1 },
  stay: { x: 12, zFrom: -45, zTo: -67, floors: 4, cols: 6, floorHeight: 3 },
  bar: { x: -3, zFrom: -76, zTo: -94 },
  hall: { x: 0, z: -124, radius: 11, marks: 8, markHeight: 6.5 },
};

const slotX = -(MARK.slotOffset / MARK.svgHeight) * LAYOUT.gateHeight; // ≈ -1.33 m

export const CAMERA_KEYS = [
  { p: 0,    pos: [0, 3.2, 36],        look: [0, 7.2, 0] },
  { p: 0.45, pos: [slotX, 2.3, 9],     look: [slotX, 2.4, -6] },
  { p: 0.7,  pos: [slotX, 2.1, 0],     look: [slotX + 1, 2.0, -14] },
  { p: 1,    pos: [5.2, 2.5, -12],     look: [-1.5, 1.2, -25] },
  { p: 1.5,  pos: [4.5, 4.2, -34],     look: [11, 5, -50] },
  { p: 2,    pos: [-5, 1.8, -36],      look: [12, 9, -58] },
  { p: 2.5,  pos: [-2, 7.5, -56],      look: [12, 7, -66] },
  { p: 3,    pos: [1.6, 1.75, -77],    look: [-3.2, 1.2, -86] },
  { p: 3.5,  pos: [1.4, 1.7, -91],     look: [-3.5, 1.4, -97] },
  { p: 4,    pos: [0, 3.2, -107],      look: [0, 4.2, -124] },
  { p: 4.5,  pos: [5.2, 3.0, -121],    look: [-4, 4.6, -127] },
  { p: 5,    pos: [-34, 46, -24],      look: [0, 0, -66] },
];

// Lighting per chapter, interpolated while scrolling. Colours are hex strings.
//
// sky*   — the physically based sky (three/addons Sky): sun elevation/azimuth in
//          degrees (azimuth 0 = +z, towards the arrival camera; 180 = behind
//          the gateway), turbidity (haze), rayleigh (blue scattering), mie.
// light* — direction of the directional light that casts shadows. By day it
//          is the sun; at night it stands in for moonlight.
// env    — which pre-computed reflection environment to use (see scene.js):
//          'dawn' | 'day' | 'dusk' | 'night'. Switches halfway between chapters.
// bloom  — glow strength around bright lights. exposure — overall brightness.
export const MOODS = [
  { // 0 — arrival, early morning: low sun from the front-left, warm on the bronze
    skyElev: 6, skyAzim: 35, turbidity: 6, rayleigh: 2.4, mie: 0.006, mieG: 0.86,
    lightElev: 8, lightAzim: 35, sunColor: '#ffc690', sunIntensity: 3,
    hemiSky: '#f3dcc4', hemiGround: '#5c4533', hemiIntensity: 0.45,
    fog: '#e7c7a6', fogNear: 70, fogFar: 380, exposure: 0.62, env: 'dawn', envIntensity: 1.0,
    bloom: 0.22, lamps: 0.2, windows: 0.05, stars: 0, festive: 0,
  },
  { // 1 — restaurant, bright midday
    skyElev: 58, skyAzim: 35, turbidity: 3, rayleigh: 1.1, mie: 0.004, mieG: 0.8,
    lightElev: 58, lightAzim: 35, sunColor: '#fff4e4', sunIntensity: 4.6,
    hemiSky: '#dfe8f2', hemiGround: '#8a7560', hemiIntensity: 0.35,
    fog: '#cfdbe6', fogNear: 90, fogFar: 460, exposure: 0.5, env: 'day', envIntensity: 0.65,
    bloom: 0.1, lamps: 0, windows: 0, stars: 0, festive: 0,
  },
  { // 2 — stay, golden hour into blue hour
    skyElev: 1.2, skyAzim: -100, turbidity: 8, rayleigh: 3, mie: 0.008, mieG: 0.9,
    lightElev: 6, lightAzim: -100, sunColor: '#ff9a52', sunIntensity: 2.8,
    hemiSky: '#8d8fb5', hemiGround: '#3a2a1e', hemiIntensity: 0.3,
    fog: '#b7948a', fogNear: 60, fogFar: 330, exposure: 0.72, env: 'dusk', envIntensity: 0.85,
    bloom: 0.35, lamps: 0.55, windows: 0.5, stars: 0.05, festive: 0,
  },
  { // 3 — bar, night
    skyElev: -14, skyAzim: 60, turbidity: 2, rayleigh: 0.6, mie: 0.004, mieG: 0.8,
    lightElev: 38, lightAzim: 120, sunColor: '#9fb4dc', sunIntensity: 0.22,
    hemiSky: '#2b3550', hemiGround: '#120c08', hemiIntensity: 0.1,
    fog: '#0e0b0b', fogNear: 25, fogFar: 150, exposure: 0.95, env: 'night', envIntensity: 0.5,
    bloom: 0.75, lamps: 1, windows: 1, stars: 1, festive: 0,
  },
  { // 4 — hall, lit for an event
    skyElev: -14, skyAzim: 60, turbidity: 2, rayleigh: 0.6, mie: 0.004, mieG: 0.8,
    lightElev: 38, lightAzim: 120, sunColor: '#9fb4dc', sunIntensity: 0.18,
    hemiSky: '#3a2c2a', hemiGround: '#120c08', hemiIntensity: 0.22,
    fog: '#150e0a', fogNear: 25, fogFar: 160, exposure: 1.12, env: 'night', envIntensity: 0.45,
    bloom: 0.7, lamps: 1, windows: 1, stars: 0.8, festive: 1,
  },
  { // 5 — visit, the whole place lit at night
    skyElev: -14, skyAzim: 60, turbidity: 2, rayleigh: 0.6, mie: 0.004, mieG: 0.8,
    lightElev: 42, lightAzim: 120, sunColor: '#a9bde3', sunIntensity: 0.45,
    hemiSky: '#34405e', hemiGround: '#1a120c', hemiIntensity: 0.3,
    fog: '#0e0b0b', fogNear: 80, fogFar: 380, exposure: 1.35, env: 'night', envIntensity: 0.8,
    bloom: 0.7, lamps: 1, windows: 1, stars: 1, festive: 0.6,
  },
];
