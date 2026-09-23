// Writes the page's text, links and search-engine data into the static files,
// from content.js. The site still has no build step on the server: this runs
// on a computer, and its output is committed like any other file.
//
//   node tools/build.mjs          regenerate index.html, 404.html, sitemap.xml, robots.txt
//   node tools/build.mjs --check  exit 1 if any of them is out of date (used by CI)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { content as c } from '../content.js';
import { storyHTML, navHTML, headerActionsHTML, callbarHTML, footerHTML } from '../js/ui.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const abs = (path) => new URL(path, c.site.url).href;

function jsonLd() {
  const a = c.address;
  const business = {
    '@type': c.site.types,
    '@id': `${c.site.url}#business`,
    name: c.name,
    description: c.site.shareDescription,
    url: c.site.url,
    logo: abs('brand/logo.svg'),
    image: [abs(c.site.shareImage), ...c.chapters.flatMap((ch) => ch.images.map((im) => abs(im.src)))],
    telephone: c.phones.map((p) => p.tel),
    servesCuisine: c.site.servesCuisine,
    address: {
      '@type': 'PostalAddress',
      streetAddress: a.street,
      addressLocality: a.locality,
      addressRegion: a.region,
      postalCode: a.postalCode,
      addressCountry: a.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: c.geo.lat, longitude: c.geo.lng },
    hasMap: c.maps.link,
  };
  const website = {
    '@type': 'WebSite',
    '@id': `${c.site.url}#website`,
    name: c.name,
    url: c.site.url,
    publisher: { '@id': `${c.site.url}#business` },
  };
  // "<" is escaped so no value can close the script element.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [business, website] }, null, 2).replace(/</g, '\\u003c');
}

function headHTML() {
  const s = c.site;
  const img = abs(s.shareImage);
  return [
    `<title>${esc(s.title)}</title>`,
    `<meta name="description" content="${esc(s.description)}">`,
    `<link rel="canonical" href="${esc(s.url)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<meta name="geo.region" content="${esc(c.address.regionCode)}">`,
    `<meta name="geo.placename" content="${esc(c.address.locality)}">`,
    `<meta name="geo.position" content="${c.geo.lat};${c.geo.lng}">`,
    `<meta name="ICBM" content="${c.geo.lat}, ${c.geo.lng}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(c.name)}">`,
    `<meta property="og:title" content="${esc(s.shareTitle)}">`,
    `<meta property="og:description" content="${esc(s.shareDescription)}">`,
    `<meta property="og:url" content="${esc(s.url)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(c.name)} logo mark as a bronze gateway">`,
    `<meta property="og:locale" content="${esc(s.locale)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(s.shareTitle)}">`,
    `<meta name="twitter:description" content="${esc(s.shareDescription)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
    `<script type="application/ld+json">\n${jsonLd()}\n</script>`,
  ].join('\n');
}

function fillRegions(html, regions) {
  for (const [name, body] of Object.entries(regions)) {
    const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
    if (!re.test(html)) throw new Error(`index.html has no build:${name} region`);
    const block = name === 'head' ? `\n${body}\n` : body;
    html = html.replace(re, (_, open, close) => open + block + close);
  }
  return html;
}

function sitemap() {
  const images = [c.site.shareImage, ...c.chapters.flatMap((ch) => ch.images.map((im) => im.src))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${esc(c.site.url)}</loc>
${images.map((src) => `    <image:image><image:loc>${esc(abs(src))}</image:loc></image:image>`).join('\n')}
  </url>
</urlset>
`;
}

const robots = () => `User-agent: *
Allow: /

Sitemap: ${abs('sitemap.xml')}
`;

// GitHub Pages serves this for any missing address.
const notFound = () => `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | ${esc(c.name)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/brand/mark.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css">
</head>
<body class="notfound">
<main class="notfound-in">
  <img src="/brand/logo.svg" alt="${esc(c.name)}" width="240" height="208">
  <h1>This page does not exist</h1>
  <p>The link may be old or mistyped.</p>
  <p class="notfound-actions">
    <a class="btn" href="/">Go to the home page</a>
    <a class="btn btn-outline" href="tel:${esc(c.phones[0].tel)}">Call ${esc(c.phones[0].display)}</a>
  </p>
</main>
</body>
</html>
`;

const outputs = {
  'index.html': fillRegions(await readFile(`${root}index.html`, 'utf8'), {
    head: headHTML(),
    nav: navHTML(c),
    actions: headerActionsHTML(c),
    story: storyHTML(c),
    foot: footerHTML(c),
    callbar: callbarHTML(c),
  }),
  '404.html': notFound(),
  'sitemap.xml': sitemap(),
  'robots.txt': robots(),
};

let stale = [];
for (const [file, text] of Object.entries(outputs)) {
  let current = null;
  try { current = (await readFile(`${root}${file}`, 'utf8')).replace(/\r\n/g, '\n'); } catch {}
  if (current === text) continue;
  if (check) stale.push(file);
  else { await writeFile(`${root}${file}`, text); console.log(`wrote ${file}`); }
}
if (check && stale.length) {
  console.error(`Out of date: ${stale.join(', ')}. Run: node tools/build.mjs`);
  process.exit(1);
}
if (check) console.log('All generated files are up to date.');
