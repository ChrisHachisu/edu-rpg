'use strict';
// Screen size matrix check (day 4, track VP; release bar G8: right on iPhone SE up to iPad Pro).
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5578/ node scripts/auto/checks/viewport.cjs [group ...]
//
// One group per size and language: se i13 promax mini ipad ipadL pro proL (English), and se:ja-kana se:ja-kanji
// i13:ja-kana i13:ja-kanji ipad:ja-kana ipad:ja-kanji. No argument runs all 14, one Chromium at a time, each
// group in its own process (about 5 to 8 minutes a group on the cloud box; "en" runs the eight English ones).
// UI_SHOTS=<dir> also writes a JPEG of every screen. VP_SAFE=0 runs without the simulated safe areas.
//
// What a group does: it walks the game through 49 screens at that size (title, Create Your Hero, first arrival,
// overworld HUD, menu tabs, a regular battle on the keypad with the notepad, floating numbers, victory, level up,
// the longest question, the four-button quiz, defeat, town talk, shop, healer, save, three dungeons with a
// mechanic prompt, a boss, the last boss and the ending: scripts/auto/viewport/vplib.cjs) and measures each in
// the page (scripts/auto/viewport/measure.js): text clipped by its box or the screen, text or buttons covered by
// another piece, HUD pieces / joystick / hero overlapping, tap targets under 44 x 44, text under 12 px, page
// scroll, forms that need scrolling, art that is stretched or missing, black bars, the map not filling the view,
// and text or buttons inside the device's safe-area insets (simulated: Emulation.setSafeAreaInsetsOverride).
//
// Known failures: scripts/auto/viewport/known-fails.json lists every failure measured on 2026-11-27, by size,
// language, screen and rule, each with the id of its finding in autoloop/day4/viewport/REPORT.md. The check
//   [PASS]es a screen only on the rules that are right there,
//   [FAIL]s on any failure that is not in the list (a new defect), and
//   [FAIL]s on any listed failure that is no longer measured: the finding is fixed there, so remove the entry
//          (VP_KNOWN_PRUNE=1 prints the entries to delete; the list is not rewritten for you).
// "unstable" entries (a measurement that comes and goes between runs) may fail or pass.
// Chromium only: WebKit differences (CSS zoom, font metrics, real safe areas) are not covered by this check.
const fs = require('fs'), path = require('path');
const V = require('../viewport/vplib.cjs');
const KNOWN_FILE = path.join(__dirname, '../viewport/known-fails.json');
const KNOWN = fs.existsSync(KNOWN_FILE) ? JSON.parse(fs.readFileSync(KNOWN_FILE, 'utf8')) : { fails: {}, unstable: {}, unreached: {} };
const ALL = [];
for (const s of V.SIZES) ALL.push(s.id);
for (const s of V.SIZES) for (const l of s.langs) if (l !== 'en') ALL.push(s.id + ':' + l);
const RULES = ['page-scroll', 'scrolls', 'text-clipped', 'text-off-screen', 'text-covered', 'text-small', 'tap-small', 'tap-covered', 'tap-off-screen', 'tap-unreachable', 'overlap',
  'safe-top', 'safe-bottom', 'safe-left', 'safe-right', 'img-broken', 'img-stretched', 'bg-stretched', 'black-bar', 'inset-band', 'map-smaller-than-view', 'debug-ui', 'measure-error'];

function runner() {
  const { spawnSync } = require('child_process');
  let want = process.argv.slice(2).filter(a => !a.startsWith('-'));
  if (want.length === 1 && want[0] === 'en') want = V.SIZES.map(s => s.id);
  const list = want.length ? want : ALL; let p = 0, f = 0;
  for (const g of list) {
    const r = spawnSync(process.execPath, [__filename, '--group', g], { env: process.env, encoding: 'utf8', timeout: 900000, maxBuffer: 64 << 20, killSignal: 'SIGKILL' });
    const out = (r.stdout || '') + (r.stderr ? '\n' + r.stderr : '');
    try { fs.writeFileSync(path.join(V.U.OUT, `viewport-${g.replace(':', '-')}.log`), out); } catch (e) {}
    const lines = out.split('\n').filter(l => /^\[(PASS|FAIL|KNOWN)\]/.test(l) || /^\[INFO\] (known|note)/.test(l)); lines.forEach(l => console.log(l));
    const gp = lines.filter(l => l.startsWith('[PASS]')).length; let gf = lines.filter(l => l.startsWith('[FAIL]')).length;
    if (r.status !== 0 && !gf) { console.log(`[FAIL] ${g}: group did not finish (${r.error ? r.error.code || r.error.message : 'exit ' + r.status})`); gf++; }
    if (!gp && !gf) { console.log(`[FAIL] ${g}: checked nothing`); gf++; }
    p += gp; f += gf;
  }
  console.log(`viewport: ${p + f} checks, ${f} FAIL -- ${list.length} group(s) against ${V.L.URL_}`);
  process.exit(f ? 1 : 0);
}

async function group(g) {
  const [sid, lang = 'en'] = g.split(':'), size = V.SIZES.find(s => s.id === sid);
  if (!size || !V.U.LANGS[lang]) { V.U.rec(`group ${g}`, false, 'unknown size or language; sizes: ' + V.SIZES.map(s => s.id).join(' ')); return V.U.finish('viewport ' + g); }
  const key = `${sid}/${lang}`, known = (KNOWN.fails || {})[key] || {}, unstable = (KNOWN.unstable || {})[key] || {}, unreachedOk = (KNOWN.unreached || {})[key] || [];
  const r = await V.run(size, lang, { shots: process.env.UI_SHOTS || '' });
  const tag = `${size.name} ${size.w}x${size.h} ${lang}`;
  if (process.env.VP_SAFE !== '0') V.U.rec(`${tag}: safe areas simulated (top ${size.safe.top}, bottom ${size.safe.bottom})`, r.safeSim, r.safeSim ? '' : 'Emulation.setSafeAreaInsetsOverride is not available in this Chromium: the safe-* rules measured nothing');
  for (const p of Object.keys(r.partErrors)) console.log(`[INFO] note ${tag}: part "${p}" stopped early: ${r.partErrors[p].split('\n')[0].slice(0, 160)}`);
  const prune = [];
  for (const scr of V.SCREENS) {
    const m = r.screens[scr];
    if (!m) { V.U.rec(`${tag} ${scr}: reached`, unreachedOk.includes(scr), unreachedOk.includes(scr) ? 'not reached (known)' : 'screen not reached: UNVERIFIED'); continue; }
    if (unreachedOk.includes(scr)) V.U.rec(`${tag} ${scr}: listed as unreached but reached`, false, 'remove it from "unreached" in known-fails.json');
    const got = {}; for (const i of m.issues) { const k = i.rule + '|' + i.sig; if (!got[k]) got[k] = i; }
    const kn = known[scr] || {}, un = unstable[scr] || {};
    const fresh = Object.keys(got).filter(k => !kn[k] && !un[k]), stale = Object.keys(kn).filter(k => !got[k]);
    const badRules = new Set(Object.keys(got).map(k => k.split('|')[0])), clean = RULES.filter(x => !badRules.has(x));
    const ids = [...new Set(Object.keys(got).filter(k => kn[k] || un[k]).map(k => kn[k] || un[k]))].sort();
    for (const k of fresh) V.U.rec(`${tag} ${scr}: ${k.replace('|', ' at ')}`, false, { ...got[k].n, text: got[k].text });
    for (const k of stale) { V.U.rec(`${tag} ${scr}: known failure ${kn[k]} is gone (${k.replace('|', ' at ')})`, false, 'fixed here: remove this entry from scripts/auto/viewport/known-fails.json'); prune.push([key, scr, k]); }
    if (ids.length) console.log(`[KNOWN] ${tag} ${scr}: ${Object.keys(got).filter(k => kn[k] || un[k]).length} known failure(s): ${ids.join(' ')}`);
    if (!fresh.length && !stale.length) V.U.rec(`${tag} ${scr}: ${clean.length} of ${RULES.length} rules clean${ids.length ? '' : ' (all)'}`, true);
  }
  if (process.env.VP_KNOWN_PRUNE && prune.length) console.log('[INFO] note entries to delete: ' + JSON.stringify(prune));
  if (process.env.VP_RESULT) fs.writeFileSync(process.env.VP_RESULT, JSON.stringify(r));
  V.U.finish('viewport ' + g);
}

if (process.argv.includes('--group')) group(process.argv[process.argv.indexOf('--group') + 1]).catch(e => { console.log('[FAIL] viewport: ran to the end -- ' + String(e && e.stack || e).slice(0, 400)); process.exit(1); });
else runner();
