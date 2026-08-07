#!/usr/bin/env node
/* Capture design/ui-overhaul/battle-icons/proof.html at phone size and phone pixel density.
 *
 * WHY A SCRIPT AND NOT "OPEN IT AND SCREENSHOT"
 *   The proof page decides whether an icon sheet ships, and 96px contact sheets do not decide it
 *   -- art that reads at 4x and mushes at 22px has passed a review it should have failed. So the
 *   capture has to be at 390 CSS px and deviceScaleFactor 3, every time, by arithmetic rather
 *   than by whatever window happened to be open. The recipe used to live in an HTML comment
 *   telling you to copy the page into public/ and start a server by hand, which is how a proof
 *   quietly gets taken at the wrong size.
 *
 * NOTHING IS COPIED INTO public/
 *   Requests are served off disk by route interception, so the page loads the REAL shipped
 *   public/ui-overhaul.css and public/ui-icons/*.png. A proof built from copies can pass while
 *   the shipped files are broken.
 *
 * THE "BEFORE" ROW IS BUILT, NOT ARCHIVED
 *   /prev/battle-icons.png is the SUPERSEDED line-drawn sheet. It is not committed anywhere --
 *   it is rebuilt into a temp directory from its own tracked raw generations by the shipping
 *   pipeline itself, so the before/after cannot drift into two copies of the same file, and no
 *   second binary enters the repo to go stale.
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// playwright-core lives in .eduharness, which is gitignored and therefore exists only in the
// main checkout -- an agent worktree under .claude/worktrees/ does not have one. The other
// capture scripts hardcode `../../edu-rpg/.eduharness`, which resolves to nothing from a
// worktree, so this walks UP from the repo root until it finds one instead of guessing a depth.
function findPlaywright() {
  try { return require('playwright-core'); } catch (_) { /* not installed here */ }
  for (let dir = ROOT; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, '.eduharness/node_modules/playwright-core');
    if (fs.existsSync(candidate)) return require(candidate);
    if (path.dirname(dir) === dir) break;
  }
  throw new Error('playwright-core not found: no .eduharness/node_modules above ' + ROOT);
}
const { chromium } = findPlaywright();

// .eduharness's playwright-core wants a browser build the cache does not have (it pins 1228, the
// cache holds up to 1223), and `npx playwright install` would pull ~150 MB to render one still
// page. The newest headless shell already on this machine renders it identically -- this is a
// static screenshot of flexbox, CSS masks and system text, not a browser-behaviour test -- so the
// launcher falls back to that, and only then to the installed Chrome. It never silently uses a
// DIFFERENT engine without saying which one it used.
function launchOptions() {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!fs.existsSync(cache)) return {};
  const shells = fs.readdirSync(cache)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .map((d) => ({ dir: d, build: Number(d.split('-')[1]) }))
    .sort((a, b) => b.build - a.build);
  for (const { dir } of shells) {
    const exe = path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (fs.existsSync(exe)) return { executablePath: exe };
  }
  return { channel: 'chrome' };
}
const ICONS = path.join(ROOT, 'design/ui-overhaul/battle-icons');
const PAGE = path.join(ICONS, 'proof.html');
const OUT = path.join(ICONS, 'proof-truesize-dpr3.png');

const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.png': 'image/png',
  '.js': 'text/javascript', '.woff2': 'font/woff2',
};

// The four sources of the superseded sheet, all tracked, all raw codex output.
function buildPreviousSheet(tmp) {
  const out = path.join(tmp, 'prev-battle-icons.png');
  execFileSync('python3', [
    path.join(ROOT, 'scripts/build_battle_icons.py'),
    '--src', path.join(ICONS, 'source-generated.png'),
    '--replace', `attack=${path.join(ICONS, 'source-generated-attack.png')}`,
    '--out', out,
    '--contact', path.join(tmp, 'prev-contact.png'),
  ], { cwd: ROOT, stdio: 'pipe' });
  return out;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'battle-icon-proof-'));
  const previous = buildPreviousSheet(tmp);

  // Everything the page may ask for, resolved to a real file. Anything not on this map is a
  // request the proof should not be making, and it is failed rather than silently 404'd --
  // a missing mask renders as an EMPTY cell, which looks like art with a hole in it.
  const resolve = (url) => {
    const p = new URL(url).pathname;
    if (p === '/proof.html') return PAGE;
    if (p === '/prev/battle-icons.png') return previous;
    if (p === '/ui-overhaul.css') return path.join(ROOT, 'public/ui-overhaul.css');
    // The shipped stylesheet @font-faces the UI font; without it the labels fall back to
    // system-ui and every cell measures a different width than it does on a phone.
    if (p.startsWith('/ui-icons/') || p.startsWith('/fonts/')) return path.join(ROOT, 'public', p);
    return null;
  };

  const opts = launchOptions();
  console.log(`engine: ${opts.executablePath || opts.channel || 'playwright default'}`);
  const browser = await chromium.launch(opts);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    reducedMotion: 'reduce',   // the plate's transition must not smear a still capture
  });
  const page = await context.newPage();

  const unresolved = [];
  await page.route('**/*', (route) => {
    const file = resolve(route.request().url());
    if (!file) { unresolved.push(route.request().url()); return route.abort(); }
    route.fulfill({
      status: 200,
      contentType: TYPES[path.extname(file)] || 'application/octet-stream',
      body: fs.readFileSync(file),
    });
  });

  await page.goto('http://proof.local/proof.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, fullPage: true });
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  if (unresolved.length) {
    console.error(`REFUSED ${unresolved.length} request(s) the proof should not make:`);
    unresolved.forEach((u) => console.error(`  ${u}`));
    process.exit(1);
  }
  const { size } = fs.statSync(OUT);
  console.log(`WROTE ${path.relative(ROOT, OUT)}  ${size.toLocaleString()} B  (390 CSS px @ dpr 3)`);
})().catch((err) => { console.error(err); process.exit(1); });
