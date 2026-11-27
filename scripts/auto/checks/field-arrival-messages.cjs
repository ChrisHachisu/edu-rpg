'use strict';
// Finding m10 / desert tomb (census 2026-11-23): no authored dungeon may greet the player with a
// message about an OLD mechanic. Desert Tomb floors opened with the bundle's glyph-trial banner
// "Hieroglyphs cover the floor ahead. The sign warns: tread only the Eye of Horus glyph." -- the
// rule of the retired trial; the floor is now the glyph-ORDER puzzle read from the entrance tablet.
// Fix: public/dq-tiles.js a2dWrapGlyphIntro (the old trial is never drawn on an authored floor).
//
// Every floor of every authored Acts 2-5 dungeon: a save seeded at the floor's landing cell (census
// path), Continue, and every message box that opens in the first ~4 s is recorded. Any arrival
// message FAILS (the owner's rule: cues, not banners); the stale glyph banner is named as such.
// Also lists each floor's readable signs and what they say (the audit table), in FIELD_OUT/arrivals.json.
//   node scripts/auto/checks/field-arrival-messages.cjs [dungeonId ...]   (no id: all, 4 dungeons per process)
const path = require('path'), fs = require('fs');
const F = require('./field-lib.cjs');
const IDS = Object.keys(F.DMAN.dungeons).filter(id => F.DMAN.dungeons[id].enabled !== false);
const STALE = [/Hieroglyphs cover the floor/i, /tread only the/i, /ヒエログリフ/, /グリフだけを/];

if (!process.argv.includes('--child')) {
  const { spawnSync } = require('child_process');
  const want = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const ids = want.length ? want : IDS, chunks = [];
  for (let i = 0; i < ids.length; i += 4) chunks.push(ids.slice(i, i + 4));
  let p = 0, f = 0;
  for (const c of chunks) {
    const r = spawnSync(process.execPath, [__filename, '--child', ...c], { env: process.env, encoding: 'utf8', timeout: 470000, killSignal: 'SIGKILL', maxBuffer: 32 << 20 });
    const out = (r.stdout || '') + (r.stderr || ''); fs.appendFileSync(path.join(F.OUT, 'arrivals.log'), out);
    const lines = out.split('\n').filter(l => /^\[(PASS|FAIL|INFO)\]/.test(l)); lines.forEach(l => console.log(l));
    const cp = lines.filter(l => l.startsWith('[PASS]')).length; let cf = lines.filter(l => l.startsWith('[FAIL]')).length;
    if (r.status !== 0 && !cf) { console.log(`[FAIL] ${c.join(',')}: did not finish (${r.error ? r.error.code : 'exit ' + r.status})`); cf++; }
    p += cp; f += cf;
  }
  console.log(`field-arrival-messages: ${p + f} checks, ${f} FAIL -- against ${F.URL_}`);
  process.exit(f ? 1 : 0);
}

(async () => {
  const ids = process.argv.slice(process.argv.indexOf('--child') + 1);
  const { browser, page } = await F.L.launch({ dpr: 1 });
  const rows = [];
  for (const id of ids) {
    const d = F.DMAN.dungeons[id];
    for (const n of d.authoredFloors) {
      const fl = F.floorOf(id, n), land = F.landing(fl);
      const row = { id, floor: n, mechanic: d.mechanic, signs: (fl.assets || []).filter(a => a.kind === 'sign').map(a => [a.x, a.y]), msgs: [] };
      try {
        const p = await F.seedDungeon(page, id, n, land);
        await page.waitForTimeout(2500);
        row.at = [p.map, p.floor];
        row.msgs = (await F.messages(page)).filter(m => m.map === id).map(m => m.t);
        if (row.signs.length) row.signText = await page.evaluate(id => { const q = window.__QOK; const k = `dungeon.${id}.plaque`; const t = q.Z(k); return t && t !== k ? t : q.Z('dungeon.plaqueDefault'); }, id);
        const stale = row.msgs.filter(t => STALE.some(r => r.test(t)));
        F.ok(p.map === id && !row.msgs.length, `${id} floor ${n}: no arrival banner`, row.msgs.length ? (stale.length ? 'STALE old-mechanic banner: ' : 'banner: ') + JSON.stringify(row.msgs).slice(0, 300) : `quiet (at ${p.map} ${p.floor}F)`);
        if (row.signText) F.info(`${id} floor ${n} sign text`, JSON.stringify(row.signText));
      } catch (e) { F.ok(false, `${id} floor ${n}`, String(e).slice(0, 200)); }
      rows.push(row);
    }
  }
  fs.appendFileSync(path.join(F.OUT, 'arrivals.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
