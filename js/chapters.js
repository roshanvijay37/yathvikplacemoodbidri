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

// Colours are hex strings; numbers are interpolated linearly between chapters.
// sun.elev / sun.azim are degrees.
export const MOODS = [
  { // 0 — arrival, dawn
    skyTop: '#b8c1cc', skyHorizon: '#f5dcc2', skyBottom: '#e9d8c4',
    sunColor: '#ffd3a3', sunIntensity: 2.4, sunElev: 9, sunAzim: 35,
    hemiSky: '#f4e7d7', hemiGround: '#8a6a4a', hemiIntensity: 0.9,
    fog: '#f1dcc5', fogNear: 30, fogFar: 180, exposure: 1.0, env: 1.0,
    lamps: 0.1, windows: 0, stars: 0, festive: 0,
  },
  { // 1 — restaurant, bright day
    skyTop: '#9db6cc', skyHorizon: '#f4ece1', skyBottom: '#ebe2d6',
    sunColor: '#fff3e0', sunIntensity: 3.0, sunElev: 52, sunAzim: 20,
    hemiSky: '#f6efe6', hemiGround: '#9a7a58', hemiIntensity: 1.1,
    fog: '#efe7dc', fogNear: 40, fogFar: 220, exposure: 1.0, env: 1.0,
    lamps: 0, windows: 0, stars: 0, festive: 0,
  },
  { // 2 — stay, golden hour into dusk
    skyTop: '#565a78', skyHorizon: '#f0a466', skyBottom: '#c98b5c',
    sunColor: '#ff9d52', sunIntensity: 2.3, sunElev: 5, sunAzim: -60,
    hemiSky: '#e9b07c', hemiGround: '#3b2a1c', hemiIntensity: 0.6,
    fog: '#d8976a', fogNear: 25, fogFar: 170, exposure: 1.05, env: 0.7,
    lamps: 0.45, windows: 0.5, stars: 0.1, festive: 0,
  },
  { // 3 — bar, night
    skyTop: '#07060a', skyHorizon: '#2a1c12', skyBottom: '#120d09',
    sunColor: '#9fb2d6', sunIntensity: 0.35, sunElev: 40, sunAzim: 120,
    hemiSky: '#3a3040', hemiGround: '#16110c', hemiIntensity: 0.2,
    fog: '#16110c', fogNear: 12, fogFar: 95, exposure: 1.1, env: 0.1,
    lamps: 1, windows: 1, stars: 1, festive: 0,
  },
  { // 4 — hall, lit for an event
    skyTop: '#120b08', skyHorizon: '#4a2a14', skyBottom: '#1a120b',
    sunColor: '#9fb2d6', sunIntensity: 0.3, sunElev: 40, sunAzim: 120,
    hemiSky: '#5a3a20', hemiGround: '#16110c', hemiIntensity: 0.28,
    fog: '#1d130b', fogNear: 14, fogFar: 105, exposure: 1.15, env: 0.12,
    lamps: 1, windows: 1, stars: 0.8, festive: 1,
  },
  { // 5 — visit, the whole place lit at night
    skyTop: '#0a0808', skyHorizon: '#2d1d11', skyBottom: '#16110c',
    sunColor: '#9fb2d6', sunIntensity: 0.18, sunElev: 45, sunAzim: 120,
    hemiSky: '#4a3424', hemiGround: '#16110c', hemiIntensity: 0.16,
    fog: '#16110c', fogNear: 60, fogFar: 260, exposure: 1.15, env: 0.1,
    lamps: 1, windows: 1, stars: 1, festive: 0.6,
  },
];
