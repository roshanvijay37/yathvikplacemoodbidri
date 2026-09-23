# yathvikplacemoodbidri.com

The website for Yathvik Place, Moodbidri. Plain static files served by GitHub
Pages from the root of `main` — there is no build step. Every push to `main`
is live within a minute or two.

`PROJECT.md` is the source of truth for the business details, brand, domain
and hosting. Read it before changing anything on the site.

## Files

| Path | What it is |
|---|---|
| `index.html` | Page shell: `<head>` (SEO, Open Graph, JSON-LD), header, call bar |
| `content.js` | **All text, phone numbers, address, map links and photo lists** |
| `styles.css` | Layout, palette and type |
| `js/main.js` | Start-up: builds the page, then loads the 3D scene if the device supports it |
| `js/ui.js` | Builds the sections from `content.js`; tracks scroll position |
| `js/scene.js` | The 3D world (Three.js). Knows nothing about the text |
| `js/chapters.js` | Camera stops, time-of-day moods and the scene layout per chapter |
| `brand/` | Logo files — `mark.svg` is also the source of the 3D gateway and the favicon |
| `images/<slot>/` | Photos for each section: `restaurant`, `rooms`, `bar`, `hall` |
| `images/og/` | Social-sharing preview (`og.jpg`) and home-screen icon |
| `CNAME`, `.nojekyll` | Needed by GitHub Pages — do not delete |

## Changing text

Edit `content.js` and push. Each chapter has `title`, `body`, `note` and
`action` (the call button label). The phone numbers and address are at the top
of the file and are used everywhere on the page.

Search engines and link previews do not run JavaScript, so a few facts are
also written directly into `index.html`. **If a phone number, the address or
the business description changes, update both files** — in `index.html` that
means the `<title>`, `description`, the `og:` tags, the JSON-LD block and the
`<noscript>` section.

Only publish facts recorded in `PROJECT.md`. Its "not yet provided" list
(menu, prices, hours, room details, hall capacity, email, WhatsApp, social
links) must not appear on the site until it has been supplied and written
there.

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
4. Push. A chapter with an empty `images` list shows no photo strip at all, so
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

- Everything is generated in code; the only asset is `brand/mark.svg`, which
  is extruded into the bronze gateway, the colonnade and the hall's rotunda.
- Three.js r170 is loaded from jsDelivr through the import map in
  `index.html`. It is only downloaded if the device supports WebGL.
- Phones get a lower pixel ratio (max 1.5), fewer curve segments and fewer
  particles. If the first frames are slow, the scene drops to 1× pixel ratio.
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
