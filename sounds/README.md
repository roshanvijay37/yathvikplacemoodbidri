# Sounds

Ambient loops for `js/sound.js`. Nothing here is downloaded until a visitor
taps the speaker button. Full credits, shown on the site: `credits.html`
(linked from the footer). Keep that page in step with this folder — three of
the five sources are CC BY-SA and one is CC BY, so the credit is required.

| File | Source (Wikimedia Commons) | Licence | Section used |
|---|---|---|---|
| `dawn.m4a` | Dawn calls, Sakleshpur — Shyamal | CC BY-SA 4.0 | 0:00–0:58 |
| `restaurant.m4a` | Restaurant ambience — stephan | Public domain | 0:05–0:50 |
| `rain.m4a` | Heavy rain in Glenshaw, PA — Sage Ross | CC BY-SA 3.0 | 4:00–4:48 |
| `night.m4a` | Night original format (crickets) — Fortunamarco2003 | CC BY-SA 4.0 | 0:00–0:30 |
| `hall.m4a` | Thakil & Nadaswaram during temple Deeparadhana — Vis M | CC BY 4.0 | 1:50–2:48 |

How each loop was made (ffmpeg): cut the section plus 3 s, crossfade those
last 3 s into the start (so the loop has no seam), mono, loudness-normalised
to −23 LUFS, AAC 64 kb/s in `.m4a` (plays on every current browser,
including iPhones). The mix per chapter is the `MIX` table in `js/sound.js`.

On iPhones, Web Audio normally follows the ring/silent switch: with the phone on
silent, the button turns on but nothing is heard.
