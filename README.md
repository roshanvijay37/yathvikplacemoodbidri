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
| `textures/` | CC0 PBR textures for the 3D scene, desktop (`1k`) and phone (`512`) sizes |
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
- Each chapter pays only for what it shows: glow is off in daylight, and the
  shadow map stops updating at night when the moonlight is too faint to matter.
- Three.js r170 is loaded from jsDelivr through the import map in
  `index.html`, only if the device supports WebGL.
- Phones get 512 px textures (marble stays 1k), a 1024 shadow map, pixel ratio
  up to 1.5 and fewer palms and particles. If frames stay slow after start-up,
  quality steps down in this order: pixel ratio, shadow-map size, glow, pixel
  ratio 1, shadows. Add `?debug` to the URL to log frame times and each step.
- Without WebGL, a CSS gradient with the bronze mark stands in, changing colour
  per chapter. With "reduce motion" switched on, the camera cuts between
  chapters instead of gliding, and nothing drifts.

## Running locally

Any static server from the repo root, e.g.

```bash
python -m http.server 8765
```

then open http://127.0.0.1:8765/. Opening `index.html` directly from disk will
not work, because browsers block ES modules on `file://`.
