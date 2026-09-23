# Yathvik Place, Moodbidri — project notes

Everything known about the business, brand, domain and hosting, in one place.
No site has been built yet; the live domain shows a holding page.

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
- **HTTPS:** GitHub issues the certificate automatically. As of 23 Sep 2026
  it was still pending; once it exists, turn on "Enforce HTTPS" in repo
  Settings → Pages

Because the repo is public, everything in it — this file included — is
publicly readable.

## Current state

- Live: holding page, "Yathvik Place, Moodbidri — coming soon"
- Brand assets: saved in `brand/`
- Website: **not started** — waiting for the go-ahead

## Editing the site

Change files in the repo root (`index.html` etc.), commit, push to `main`.
The live site updates within a minute or two.
