# Yathvik Place, Moodbidri — project notes

Everything known about the business, brand, domain and hosting, in one place.
The site built from it is described under "Current state".

## The business

**Yathvik Place** has four parts under one roof:

1. Multi-cuisine restaurant
2. Modern stay rooms
3. Bar
4. Function / banquet hall

Not yet provided, and so must not be invented on any page: menu or cuisines,
prices, opening hours, number or type of rooms, room amenities, hall capacity,
parking, photos, social media accounts, email address, GST or licence details,
and whether either phone number is on WhatsApp.

## Contact

| | |
|---|---|
| Phone 1 | +91 63646 26664 (`tel:+916364626664`) |
| Phone 2 | +91 90086 26663 (`tel:+919008626663`) |

## Address and location

> Yathvik Place, Near Maruti Suzuki Showroom, Bantwala Road,
> Moodbidri - 574227

Structured form (for schema.org / Google Business Profile):

| Field | Value |
|---|---|
| Street | Near Maruti Suzuki Showroom, Bantwala Road |
| Town | Moodbidri |
| District | Dakshina Kannada |
| State | Karnataka |
| PIN | 574227 |
| Country | India |

- **Google Maps:** https://maps.app.goo.gl/iWJNBYz5UcRricFZ9
- **Coordinates:** 13.064638, 75.004501 — a dropped pin, not a named Maps
  listing. There is no Google Business Profile for it yet as far as this link
  shows.
- **Full link:** https://www.google.com/maps/place/13.064638,75.004501
- **Embeddable map (no API key):**
  `https://maps.google.com/maps?q=13.064638,75.004501&z=16&output=embed`

## Brand

### Logo

Source: `brand/logo-source.pdf` — Adobe Illustrator 26.2 export, 1080 × 1080 pt,
all lettering converted to outlines (no fonts embedded). Three pages:

| Page | Version |
|---|---|
| 1 | Black on white |
| 2 | Bronze on white (primary) |
| 3 | White on bronze |

The lockup is a mark — three pairs of arcs meeting over three pillars,
reading as a stylised **Y** and an archway — above **YATHVIK** in a classical
serif and **PLACE** in a wide-tracked geometric sans.

SVGs extracted from the PDF vectors (exact paths, not traced):

| File | Use |
|---|---|
| `brand/logo.svg` | Full lockup, bronze `#986633` — on white/light backgrounds |
| `brand/logo-white.svg` | Full lockup, white — on bronze or dark backgrounds |
| `brand/logo-current.svg` | Full lockup, `fill="currentColor"` — takes the CSS text colour |
| `brand/mark.svg` | Mark only, bronze — favicon, app icon, small spaces |

### Colour

The brand colour is defined in the PDF as CMYK, so print should use the CMYK
value and screens the hex.

| Role | Value |
|---|---|
| **Brand bronze — print** | **C 32 M 58 Y 90 K 18** |
| **Brand bronze — screen** | **`#986633`** (rgb 152 102 51) |
| Black version — print | C 70.7 M 66.4 Y 66 K 78.5 (rich black) |
| Black version — screen | `#1B1A17` approx. |
| Reverse | White `#FFFFFF` on bronze |

The screen hex was measured from the rendered logo (median of solid pixels);
it may differ from a designer's own RGB swatch by a shade. If the designer has
an official RGB/hex, it overrides this one.

### Suggested palette for screen

Built around the bronze. Contrast checked against WCAG 2.1 (AA needs 4.5:1 for
body text).

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `bronze` | `#986633` | Brand, buttons, links | 4.90 on white, 4.59 on cream — AA |
| `bronze-deep` | `#7A4F24` | Hover, small text in bronze | 6.62 on cream — AA |
| `bronze-light` | `#C99A66` | Accent on dark backgrounds | 7.41 on night — AA |
| `cream` | `#FBF7F1` | Page background | — |
| `sand` | `#F1E8DB` | Alternate section background | — |
| `ink` | `#2B2016` | Body text | 14.90 on cream |
| `muted` | `#6E6254` | Secondary text | 5.56 on cream — AA |
| `night` | `#16110C` | Dark sections / dark mode background | — |
| `ivory` | `#F3ECE2` | Text on dark | 15.99 on night |
| — | `#FFFFFF` on `#986633` | White text on bronze buttons | 4.90 — AA |

### Type (suggestion)

The logo's fonts are not named in the file (text is outlined). Close free
matches: **Cormorant Garamond** or **EB Garamond** for headings (like
"YATHVIK"), **Jost** or **Montserrat** with wide letter-spacing for labels
(like "PLACE"). To match exactly, ask the logo designer which typefaces they
used.

## Domain

| | |
|---|---|
| Domain | `yathvikplacemoodbidri.com` |
| Registrar | Hostinger |
| Registered | 23 Sep 2026 |
| Expires | 23 Sep 2027 — renew before then |
| Transfer lock | Registrar transfer blocked until 22 Nov 2026 (60-day new-domain lock) |
| Privacy protection | On |
| Nameservers | Hostinger (`horizon.dns-parking.com`, `orbit.dns-parking.com`) |

## DNS (managed at Hostinger)

| Name | Type | Value |
|---|---|---|
| `@` | A | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| `@` | AAAA | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| `www` | CNAME | `roshanvijay37.github.io.` |

These are GitHub Pages' published addresses. The original parking record
(`@` A `2.57.91.91`) was replaced.

## Hosting

- **Repo:** https://github.com/roshanvijay37/yathvikplacemoodbidri (public —
  GitHub Pages on a private repo needs a paid plan)
- **Pages source:** branch `main`, folder `/` — no build step; every push to
  `main` publishes
- **Custom domain:** set by the `CNAME` file in this repo; `.nojekyll` disables
  Jekyll processing
- **HTTPS:** on and enforced. Certificate covers the apex and `www`, issued
  23 Sep 2026, expires 22 Dec 2026 — GitHub renews it automatically. (It only
  issued after the custom domain was cleared and set again.) `http://`
  redirects to `https://`.

Because the repo is public, everything in it — this file included — is
publicly readable.

## Current state

**v1 website — built 23 Sep 2026.** A scroll-driven 3D site (Three.js r170, no
build step). Scrolling walks the camera through one continuous scene built
from the logo mark, from dawn to night:

| Chapter | Time of day | Scene |
|---|---|---|
| Arrival | Dawn | The mark as a 16 m bronze gateway; the camera passes through a gap between its pillars |
| 01 Restaurant | Midday | Tables under a bronze pergola, beside a colonnade of smaller marks |
| 02 Stay rooms | Dusk | A building whose windows light up one by one |
| 03 Bar | Night | Counter, back bar and pendant lamps under a canopy |
| 04 Hall | Event night | A rotunda of eight marks, a chandelier ring and rising lights |
| Visit | Night | Overhead view of the whole place; address, both numbers, directions, map |

- All copy uses only the facts above. Where details are missing the page says
  so and offers a call (e.g. "Call us to book a table or ask about the menu").
- No photos yet. Each section has a slot in `images/` and an empty `images`
  list in `content.js`; see `README.md` for how to add them.
- Checked in desktop Chrome at 390×844 (phone emulation) and 1440×900, with
  WebGL disabled (CSS fallback) and with reduced motion. **Not yet tested on a
  real phone** — performance on low-end Android handsets is unverified.
- Brand assets: `brand/`. Social preview: `images/og/og.jpg`.

### Realism upgrade (23 Sep 2026)

The scene was moved from a stylised look towards photoreal rendering: a
physically based sky with matching reflections per time of day, CC0 PBR
textures (Poly Haven marble, plaster, cherry wood), soft sun shadows, HDR glow
on lamps, film grain; a marble plaza with lawn and coconut palms around it;
chairs, turned lamps and stools, glazed windows with lit rooms. It is still a
3D render of an invented layout, not the real building — real photos or
footage remain the only way to show the actual place.

Checked in desktop Chrome (1440×900, Intel Iris Xe) and 390×844 phone
emulation: all effects hold full frame rate on that laptop once start-up has
settled. **Not yet tested on a real phone.**

### Scanned models (26 Sep 2026)

Desktop only: CC0 Poly Haven models (optimised to 1.3 MB total) replace the
procedural restaurant chairs (tufted leather dining chairs), tables (turned
dark wood), lamps (brass diya lanterns), bar stools and back-bar bottles, and
add terracotta and ceramic potted plants at the gateway, pergola corners,
building entrance, bar and hall. Loaded after the scene appears; if one fails,
its stand-in stays. Phones download none of them. Credits in `models/README.md`.

### Realism pass 2 (26 Sep 2026)

- **Building:** facade is a 35 cm slab with real window openings (reveals,
  recessed frames, stone sills), balconies with glass rails on upper floors,
  outdoor AC units, parapet, black water tanks on the roof, entrance canopy
  down-lights, and the brand lockup (from `brand/logo.svg`) in bronze on the
  roof line, glowing at night.
- **Sky:** drifting procedural clouds per time of day; low mist at dawn.
- **Marble:** faint reflections of the scene (desktop only, dropped first if
  frames are slow); tile-to-tile tone variation.
- **Wear:** rain streaks under sills and the parapet, rising damp on the
  facade base, patina on the bronze.
- Checked in headless desktop Chrome on this PC's Intel GPU, 1440×900 and
  412×741 phone emulation. Not yet tested on a real phone.

### Living scene (26 Sep 2026)

- Palms move in the wind; lamp, diya and brass-lamp flames flicker.
- A reflecting pool along the approach, with 14 floating clay diyas.
- Monsoon rain at dusk and at the bar, with wet, reflective marble (none under
  the bar canopy).
- Hall dressed for an event: marigold swags between the arches, strands from
  the chandelier ring, a stage with cream drapes, brass standing lamps.
- Desktop: ambient occlusion, light shafts through the gateway at dawn, depth
  of field.
- Tap points per chapter open a card with the call button; phones can look
  around by tilting.
- Skipped on purpose: people (no convincing CC0 scans), baked lighting (the
  scene is generated at load, so real-time ambient occlusion is used instead),
  KTX2 textures (the transcoder would outweigh the textures it compresses).
- Checked in headless Chrome on this PC's Intel GPU at 1440×900 and 390×844
  phone emulation (low tier), and with reduced motion; frame diffs confirm the
  wind and flicker move. **Tilt and all of this on a real phone are untested.**

### SEO (23 Sep 2026)

- All text, links and structured data are written into the HTML by
  `tools/build.mjs` from `content.js`, so crawlers and link previews that do not
  run JavaScript see the whole page. A GitHub Action fails if they drift.
- Title, description, canonical, Open Graph/Twitter cards, geo tags, and
  schema.org JSON-LD (`LocalBusiness` + `Hotel` + `Restaurant` + `BarOrPub` +
  `EventVenue` with address and coordinates, plus `WebSite`).
- `sitemap.xml`, `robots.txt`, branded `404.html`, 192 px icon.
- Fonts served from the site (no Google Fonts request).
- Lighthouse (mobile): Accessibility 100, Best Practices 100, SEO 100.
  Performance trace on a slow-4G / 4× CPU profile: LCP 1.0 s, CLS 0.
- Analytics: wired for Google Analytics 4 (visits + Call/Directions taps) but
  **off** — needs a measurement ID in `content.js`.

**Waiting on Roshan:**
1. **Google Search Console** — add a *Domain* property for
   `yathvikplacemoodbidri.com` and send the `google-site-verification=…` TXT
   value; it is then added at Hostinger. (Automatic verification through the
   Play service account was tried and is blocked: that account cannot enable
   the Site Verification API.) Then submit `sitemap.xml`, and import the
   property into Bing Webmaster Tools.
2. **Google Business Profile** — the largest single factor for local ranking.
3. **GA4 measurement ID**, if analytics is wanted.

## Editing the site

See `README.md`. In short: text and photos are in `content.js`; push to
`main` and the live site updates within a minute or two.
