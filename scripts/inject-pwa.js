/**
 * Post-build PWA injection.
 *
 * Expo's web export generates dist/index.html without PWA wiring; this
 * script (run automatically by `npm run build`) adds the manifest link,
 * iOS meta tags, and the service-worker registration, verifies the static
 * PWA assets landed in dist/, and makes everything base-path-aware so the
 * same build works at the domain root (Vercel) or under a sub-path
 * (GitHub Pages, EXPO_BASE_URL=/A2Z).
 */

const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const htmlPath = path.join(dist, 'index.html');
// "/A2Z" on GitHub Pages, "" everywhere else. Normalize: no trailing slash.
const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');

let html = fs.readFileSync(htmlPath, 'utf8');
if (html.includes('rel="manifest"')) {
  console.log('PWA tags already present — skipping.');
  process.exit(0);
}

const headTags = [
  `<link rel="manifest" href="${base}/manifest.json" />`,
  '<meta name="theme-color" content="#101A3D" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="A2Z" />',
  `<link rel="apple-touch-icon" href="${base}/icon-192.png" />`,
  `<link rel="icon" type="image/png" sizes="192x192" href="${base}/icon-192.png" />`,
].join('');

const swScript =
  '<script>' +
  "if ('serviceWorker' in navigator) {" +
  "window.addEventListener('load', function () {" +
  `navigator.serviceWorker.register('${base}/sw.js', { scope: '${base}/' }).catch(function (e) {` +
  "console.warn('SW registration failed', e);" +
  '});' +
  '});' +
  '}' +
  '</script>';

html = html.replace('</head>', `${headTags}</head>`);
html = html.replace('</body>', `${swScript}</body>`);
fs.writeFileSync(htmlPath, html);

// SPA fallback for static hosts without rewrites (GitHub Pages).
fs.writeFileSync(path.join(dist, '404.html'), html);

// Manifest: absolute URLs must carry the base path too.
const manifestPath = path.join(dist, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.start_url = `${base}/`;
manifest.scope = `${base}/`;
manifest.icons = (manifest.icons ?? []).map((icon) => ({
  ...icon,
  src: `${base}${icon.src.startsWith('/') ? icon.src : `/${icon.src}`}`,
}));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Precache the hashed JS bundles: list them into the service worker so the
// app opens offline after a single visit — with the base path stamped in.
const bundleDir = path.join(dist, '_expo', 'static', 'js', 'web');
const bundles = fs.existsSync(bundleDir)
  ? fs.readdirSync(bundleDir).map((f) => `${base}/_expo/static/js/web/${f}`)
  : [];
const swPath = path.join(dist, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace("const BASE = '';", `const BASE = '${base}';`);
sw = sw.replace('const BUNDLES = [];', `const BUNDLES = ${JSON.stringify(bundles)};`);
// New bundle hashes → new cache, so updates replace stale shells.
const hash = bundles.join('|').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);
sw = sw.replace("const CACHE = 'a2z-v1';", `const CACHE = 'a2z-${hash.toString(36)}';`);
fs.writeFileSync(swPath, sw);

// Sanity: the PWA assets must have been copied from public/ into dist/.
for (const f of ['manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png']) {
  if (!fs.existsSync(path.join(dist, f))) {
    console.error(`Missing dist/${f} — is the public/ folder intact?`);
    process.exit(1);
  }
}
console.log(`PWA tags injected into dist/index.html ✓ (base: "${base || '/'}")`);
