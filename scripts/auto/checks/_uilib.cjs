'use strict';
// Shared helpers for the ui-*.cjs checks (track F1, 2026-11-23). Not a check itself.
// Phone viewport 390x844 (probe lib), real taps on the overlay's own buttons, [PASS]/[FAIL] lines.
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = process.env.UI_CHECK_OUT || path.join(os.tmpdir(), 'qok-ui-checks');
fs.mkdirSync(OUT, { recursive: true });
process.env.PROBE_OUT = process.env.PROBE_OUT || path.join(OUT, 'probe-out');
process.env.PT_DIR = process.env.PT_DIR || path.join(OUT, 'pt');
process.env.PT_SHOTS = process.env.PT_SHOTS || path.join(OUT, 'pt-shots') + '/';
const L = require('../../acts/probe/lib.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const SHOTS = process.env.UI_SHOTS || '';           // optional: where to write named JPEG screenshots

let pass = 0, fail = 0;
function rec(name, ok, note) {
  const n = note === undefined ? '' : (typeof note === 'string' ? note : JSON.stringify(note)).slice(0, 700);
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${n ? ' -- ' + n : ''}`);
  return ok;
}
function finish(label) {
  console.log(`${label}: ${pass + fail} checks, ${fail} FAIL -- against ${L.URL_}`);
  if (!pass && !fail) { console.log('[FAIL] checked nothing'); process.exit(1); }
  process.exit(fail ? 1 : 0);
}
async function shot(page, name) {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 82 }); } catch (e) { console.log('[INFO] shot failed', name, e.message); }
}
// A real tap on the first VISIBLE element matching sel (a backdrop sharing a data-act is skipped:
// its centre is the card, which is exactly how the census's NG+ and Sell taps went astray).
async function tap(page, sel, timeout = 5000) {
  const loc = page.locator(sel);
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const tag = await el.evaluate(e => e.tagName).catch(() => '');
      if (n > 1 && tag === 'DIV' && i === 0) { const b = await loc.evaluateAll(es => es.some(e => e.tagName === 'BUTTON')); if (b) continue; }
      try { await el.tap({ timeout: 3000 }); return true; } catch (e) { /* retry */ }
    }
    await page.waitForTimeout(200);
  }
  return false;
}
const active = (page, k) => page.evaluate(k => window.__PHASER_GAME__.scene.isActive(k), k).catch(() => false);
// Line breaks inside an element: every place where a visible character starts a new line, with the
// characters on either side. A break is "good" at a space, after sentence punctuation, or before an
// opening bracket. Only lines with Japanese on them are judged.
const BREAKS_FN = (el) => {
  const chars = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, space = false;
  while ((n = w.nextNode())) {
    for (let i = 0; i < n.data.length; i++) {
      const c = n.data[i];
      if (/\s/.test(c)) { space = true; continue; }
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const rs = r.getClientRects();
      if (!rs.length) continue; const b = rs[rs.length - 1];
      chars.push({ c, top: b.top, h: b.height, space }); space = false;
    }
  }
  const out = [];
  for (let i = 1; i < chars.length; i++) {
    const a = chars[i - 1], b = chars[i];
    if (b.top > a.top + Math.max(4, a.h * 0.5)) {
      const ctx = chars.slice(Math.max(0, i - 4), i).map(x => x.c).join('') + '/' + chars.slice(i, i + 4).map(x => x.c).join('');
      const ja = /[぀-ヿ一-鿿]/.test(ctx);
      const good = b.space || /[。、！？!?…」』）)・：:,.]/.test(a.c) || /[「『（(]/.test(b.c);
      out.push({ ctx, ja, good: !ja || good });
    }
  }
  return out;
};
async function breaks(page, sel) {
  return page.evaluate(([sel, fn]) => { const f = eval('(' + fn + ')'); return [...document.querySelectorAll(sel)].filter(e => e.offsetParent || e.getClientRects().length).map(e => ({ sel, text: e.innerText.slice(0, 120), breaks: f(e) })); }, [sel, BREAKS_FN.toString()]);
}
// Elements in the overlay that overflow their box sideways (a layout regression guard for the
// line-break rule: keep-all makes phrases unbreakable).
async function hOverflow(page, rootSel = '#qok-ui') {
  return page.evaluate(rs => { const out = []; for (const r of document.querySelectorAll(rs)) for (const e of r.querySelectorAll('*')) {
    if (!e.getClientRects().length) continue; const cs = getComputedStyle(e); if (cs.overflowX !== 'visible' && cs.overflowX !== 'clip') continue;
    if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && /[぀-ヿ一-鿿]/.test(e.textContent || '') && e.children.length === 0) out.push((e.className || e.tagName) + ': ' + e.textContent.slice(0, 40)); }
    return out; }, rootSel);
}
function seed(o = {}) {
  const { locale = 'en', kanji = false, all = true, flags = {}, mutate = null, ...rest } = o;
  const s = L.save({ ...rest, locale, kanjiMode: kanji, flags: { ...(all ? L.allFlags() : {}), ...flags } });
  s.player.name = locale === 'ja' ? 'ミカ' : 'Mika';
  if (mutate) mutate(s);
  return s;
}
async function boot(page, o = {}, bootOpts = {}) { const s = seed(o); await L.bootSave(page, s, bootOpts); await L.noEncounters(page); return s; }
const LANGS = { en: { locale: 'en', kanji: false }, 'ja-kana': { locale: 'ja', kanji: false }, 'ja-kanji': { locale: 'ja', kanji: true } };
// Run each named group in its own process (one Chromium at a time, each well under 8 minutes).
function runGroups(file, groups, label) {
  if (process.argv.includes('--group')) return process.argv[process.argv.indexOf('--group') + 1];
  const { spawnSync } = require('child_process');
  const want = process.argv.slice(2).filter(a => !a.startsWith('-')); const list = want.length ? want : groups;
  let p = 0, f = 0;
  for (const g of list) {
    const r = spawnSync(process.execPath, [file, '--group', g], { env: process.env, encoding: 'utf8', timeout: 470000, maxBuffer: 64 << 20, killSignal: 'SIGKILL' });
    const out = (r.stdout || '') + (r.stderr ? '\n' + r.stderr : ''); fs.writeFileSync(path.join(OUT, `${label}-${g}.log`), out);
    const lines = out.split('\n').filter(l => /^\[(PASS|FAIL|INFO)\]/.test(l)); lines.forEach(l => console.log(l));
    const gp = lines.filter(l => l.startsWith('[PASS]')).length; let gf = lines.filter(l => l.startsWith('[FAIL]')).length;
    if (r.status !== 0 && !gf) { console.log(`[FAIL] ${g}: group did not finish (${r.error ? r.error.code || r.error.message : 'exit ' + r.status}); log ${path.join(OUT, `${label}-${g}.log`)}`); gf++; }
    if (!gp && !gf) { console.log(`[FAIL] ${g}: checked nothing`); gf++; }
    p += gp; f += gf;
  }
  console.log(`${label}: ${p + f} checks, ${f} FAIL -- ${list.length} group(s) against ${L.URL_}`);
  process.exit(f ? 1 : 0);
}
const quizTaps = (page, idx) => L.quizTaps(page, idx);   // see scripts/acts/probe/lib.cjs
// True while a quiz is waiting for an answer (keypad or choices).
const quizUp = page => page.evaluate(sel => !!document.querySelector(sel), L.QUIZ_UP).catch(() => false);
module.exports = { L, ROOT, OUT, rec, finish, shot, tap, active, breaks, hOverflow, seed, boot, LANGS, runGroups, quizTaps, quizUp };
