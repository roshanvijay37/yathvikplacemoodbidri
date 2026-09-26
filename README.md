# yathvikplacemoodbidri.com

The website for Yathvik Place, Moodbidri. Plain static files served by GitHub
Pages from the root of `main` — nothing is built on the server. The one local
step is `node tools/build.mjs` after editing `content.js` (see "Changing
text"). Every push to `main` is live within a minute or two.

`PROJECT.md` is the source of truth for the business details, brand, domain
and hosting. Read it before changing anything on the site.

## Files

| Path | What it is |
|---|---|
| `content.js` | **All text, phone numbers, address, map links, search-engine text and photo lists** |
| `tools/build.mjs` | Writes `content.js` into `index.html`, `404.html`, `sitemap.xml`, `robots.txt` |
| `index.html` | Page template; the regions marked `build:…` are generated — do not hand-edit them |
| `styles.css` | Layout, palette and type |
| `fonts/` | Cormorant Garamond and Jost, served from this site (SIL Open Font Licence, see `fonts/OFL-*.txt`) |
| `js/main.js` | Start-up: wires the page up, starts analytics if configured, loads the 3D scene if supported |
| `js/ui.js` | Markup builders (used by the build and the browser); scroll tracking |
| `js/scene.js` | The 3D world (Three.js). Knows nothing about the text |
| `js/chapters.js` | Camera stops, time-of-day moods and the scene layout per chapter |
| `js/fx/life.js` | Wind in the palms, lamp flicker, the reflecting pool with floating diyas, rain, the hall's marigolds, stage and brass lamps |
| `js/fx/passes.js` | Desktop post-processing: ambient occlusion, dawn light shafts, depth of field, temporal anti-aliasing |
| `js/fx/interaction.js` | Phone tilt to look around; the tap points in each chapter |
| `js/fx/grass.js` | Blades of grass around the camera (desktop) |
| `js/fx/shadows.js` | Contact-hardening sun shadows (desktop) |
| `js/sound.js` | Ambient sound: the speaker button and the per-chapter mix |
| `sounds/` | The five ambient loops; credits in `sounds/credits.html` (linked from the footer) and `sounds/README.md` |
| `textures/` | CC0 PBR textures for the 3D scene, desktop (`1k`) and phone (`512`) sizes |
| `models/` | CC0 scanned furniture, lamps, plants and bottles (desktop only), credits in `models/README.md` |
| `brand/` | Logo files — `mark.svg` is also the source of the 3D gateway and the favicon |
| `images/<slot>/` | Photos for each section: `restaurant`, `rooms`, `bar`, `hall` |
| `images/og/` | Social-sharing preview (`og.jpg`) and icons |
| `.github/workflows/check.yml` | Fails the commit's check if `content.js` was changed without rebuilding |
| `CNAME`, `.nojekyll` | Needed by GitHub Pages — do not delete |

## Changing text

1. Edit `content.js`. Each chapter has `title`, `body`, `note` and `action`
   (the call button label); phone numbers, address and the search-engine
   title/description (`site`) are at the top.
2. Run `node tools/build.mjs` (Node 18 or newer, no install needed).
3. Commit `content.js` **and** the files it rewrote, then push.

Step 2 matters: it puts the text into the HTML itself, which is what search
engines, WhatsApp/Facebook link previews and visitors without JavaScript see.
If it is skipped, the "Check generated files" action on GitHub turns red.

Only publish facts recorded in `PROJECT.md`. Its "not yet provided" list
(menu, prices, hours, room details, hall capacity, email, WhatsApp, social
links) must not appear on the site until it has been supplied and written
there.

## Analytics

Off until `analytics.ga4` in `content.js` holds a Google Analytics 4
measurement ID (`G-…`). Once set, it counts visits plus `call_click` and
`directions_click` events, each tagged with where on the page the tap
happened (`header`, `callbar`, `restaurant`, `visit`, …).

## Adding photos

1. Resize to at most 1600 px on the long side and save as JPEG (quality ~80)
   or WebP. Aim for under 250 KB each — most visitors are on phones.
2. Put them in the section's folder with a clear name, e.g.
   `images/restaurant/restaurant-01.jpg`.
3. List them in that chapter's `images` array in `content.js`:

   ```js
   images: [
     { src: 'images/restaurant/restaurant-01.jpg', alt: 'The dining room set for dinner', width: 1600, height: 1200 },
   ],
   ```

   `alt` describes the photo for screen readers; `width`/`height` are the
   file's pixel size and stop the page jumping while it loads.
4. Run `node tools/build.mjs` (it also adds the photos to `sitemap.xml`),
   then push. A chapter with an empty `images` list shows no photo strip at all, so
   sections without photos never look broken.

Photos appear as a swipeable strip inside the chapter's panel, on top of the
3D scene. The 3D does not need to change.

## Adding a section or page

- **A new chapter** (e.g. a gallery): add an entry to `chapters` in
  `content.js`, then add a matching camera stop and mood in `js/chapters.js`
  (keep the order the same — stop *n* belongs to section *n*).
- **A separate page** (e.g. `/menu/`): create `menu/index.html` that links
  `../styles.css`; it can reuse `content.js` and `js/ui.js` helpers or be plain
  HTML. Add it to the header navigation in `js/ui.js`.

## The 3D scene

- Generated in code, with one geometry asset: `brand/mark.svg`, extruded into
  the bronze gateway, the colonnade and the hall's rotunda. Palms, furniture,
  lamps and the building are also procedural.
- Realism: a physically based sky (Three.js `Sky`) whose light is pre-computed
  into reflection maps for dawn, day, dusk and night; CC0 PBR textures from
  Poly Haven in `textures/` (marble, plaster, cherry wood — credits in
  `textures/README.md`); soft sun shadows; HDR glow on lamps; ACES tone
  mapping; light film grain and vignette.
- Also: a facade with real window openings and balconies, the brand sign on
  the roof, procedural clouds, dawn mist, marble reflections (desktop), and
  weathering (tile variation, rain streaks, bronze patina).
- On desktop, scanned CC0 models from Poly Haven (1.3 MB, loaded after the
  scene is showing) replace the procedural chairs, tables, lamps, bar stools and
  bottles, and add potted plants. Phones keep the procedural versions.
- Life: palms sway in the wind (harder in the rain), lamp and diya flames
  flicker, a reflecting pool runs from the gateway to the plaza with clay diyas
  floating on it, and a monsoon shower falls at dusk and at the bar, leaving the
  marble wet and reflective. The hall is dressed for an event: marigold swags
  and strands, a stage with drapes, and tall brass lamps.
- Desktop only: ambient occlusion, light shafts through the gateway at dawn,
  depth of field focused on what the camera looks at, temporal anti-aliasing
  (no shimmer on fronds and railings), shadows that are sharp where an object
  meets the ground and softer further off (PCSS), and real blades of grass
  near the camera.
- Palms have V-folded fronds, a few dead ones, coconuts and a flared base.
  Beyond the lawn: a belt of coconut and areca plantations and broadleaf
  trees, and low wooded hills fading into the haze (generic Dakshina Kannada
  country, not the real skyline).
- The camera moves like it is carried: slow breathing, small corrections, and
  a lean into turns.
- Sound, off until the speaker button in the header is tapped (nothing
  downloads before that): birds at dawn, a dining room, rain and crickets in the
  evening, rain at the bar, nadaswaram and thavil in the hall. The mix follows
  the scroll; see `js/sound.js`.
- Each chapter has a tap point (a pulsing dot) that opens a card with its call
  button. On phones, tilting the phone looks around (iOS asks permission on
  the first tap).
- Each chapter pays only for what it shows: glow is off in daylight, and the
  shadow map stops updating at night when the moonlight is too faint to matter.
- Three.js r170 is loaded from jsDelivr through the import map in
  `index.html`, only if the device supports WebGL.
- Two versions. The full one (scanned furniture, grass, mirror marble and the
  desktop-only effects above) goes only to large screens whose browser names a
  discrete or high-end GPU (NVIDIA, Radeon RX/Pro, Intel Arc, Apple M-series
  Pro/Max/Ultra). Everything else — phones, and laptops on integrated
  graphics — gets the lighter one: 512 px textures (marble stays 1k), a 1024
  shadow map, pixel ratio up to 1.5, fewer palms and particles. Measured on an
  Intel Iris Xe laptop at 1440x900: the full version ran near 10 frames a
  second before stepping down, the lighter one about 55.
- If frames are slow after start-up, quality steps down, judged every second
  (several steps at once when very slow): grass, ambient occlusion, marble
  reflections, light shafts, depth of field, anti-aliasing, pixel ratio,
  shadow-map size, glow, pixel ratio 1, shadows, then 80% and 67% render scale.
  `?debug` shows frame times and each step; `?debug&fixed` turns the steps off
  for measuring; `?debug&tier=high|low` forces a version; `?debug&cam=x,y,z,lx,ly,lz`
  pins the camera; `?debug&tm=agx|neutral` and `?debug&pcf` compare tone
  mapping and the older shadow filter.
- Without WebGL, a CSS gradient with the bronze mark stands in, changing colour
  per chapter. With "reduce motion" switched on, the camera cuts between
  chapters instead of gliding, nothing drifts, the rain is hidden, tilt and
  the carried-camera motion are off.
- Not used, on purpose: GPU-compressed (KTX2) textures. The phone textures are
  about 130 KB as JPEG; the Basis transcoder KTX2 needs is about 500 KB, so it
  would slow the phone load to save GPU memory the phones are not short of.
  No scanned people either — there are no CC0 scans good enough to not look
  uncanny. Tone mapping stays ACES: AgX and Neutral were compared on every
  chapter; AgX turned the bar muddy, Neutral blew out its lamps.

## Running locally

Any static server from the repo root, e.g.

```bash
python -m http.server 8765
```

then open http://127.0.0.1:8765/. Opening `index.html` directly from disk will
not work, because browsers block ES modules on `file://`.
