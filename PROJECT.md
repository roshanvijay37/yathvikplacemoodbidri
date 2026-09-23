# Yathvik Place, Moodbidri — project notes

## Location

- **Google Maps:** https://maps.app.goo.gl/iWJNBYz5UcRricFZ9
- **Coordinates:** 13.064638, 75.004501 (a dropped pin, not a named Maps listing)
- **Full link:** https://www.google.com/maps/place/13.064638,75.004501
- **Area:** Moodbidri, Dakshina Kannada, Karnataka

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

## Current state

Holding page only: "Yathvik Place, Moodbidri — coming soon". What the site
should contain has not been decided yet.

## Editing the site

Change files in the repo root (`index.html` etc.), commit, push to `main`.
The live site updates within a minute or two.
