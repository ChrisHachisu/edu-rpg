'use strict';
// Day-4 explorer: kill-and-resume, save-slot / defeat / boss-retry / New Game+ / language / grade
// fuzz, and old-save repair. One Chromium. Saves are the testers' jump records (63 realistic hero
// records, scripts/auto/jump), booted through the real five-slot title.
//   node scripts/auto/explore/fuzz_d4.cjs [--seed N] scenario ...      (no scenario: list)
// Writes OUTX/d4.jsonl and OUTX/shots/d4/<scenario>-<tag>.jpg
const fs = require('fs'), path = require('path');
const D = require('./d4lib.cjs'); const { X, L, recSave, J, dig, diff, lsum, tap } = D;
const man = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
const SH = path.join(X.OUTX, 'shots/d4');
const SC = {};

// Boot slot 1 (auto) with `save` through the real title, optionally with extra slots.
async function bootSlot(c, save, { slots = {}, town = null, extra = {}, which = 0 } = {}) {
  const s1 = { auto: save, save: null, town };
  const ls = D.slotLS({ 1: s1, ...slots }, 1, extra);
  await D.freshLS(c.page, ls); await D.waitTitleSlots(c.page);
  const r = await D.loadSlotUI(c.page, 1, which); if (!r.ok) throw new Error('boot slot: ' + J(r));
  await L.noEncounters(c.page); return r;
}
const shot = (c, tag) => X.jpeg(c.page, SH, `${c.n}-${tag}`);

// ---- kill and resume ---------------------------------------------------------------------------------
// After the kill: where is she, is the state sane, can she move; `expect` = fn(pre, mid, post) -> failure list
async function killAndCheck(c, tag, pre, mid, { expect } = {}) {
  const ls0 = await lsum(c.page).catch(() => null);
  await D.kill(c.page);
  const how = await D.afterKill(c.page, 0, 1);
  let post = null, mv = null, toast = false;
  try { post = await dig(c.page); mv = await D.canMove(c.page); toast = await c.page.evaluate(() => /Recovered/i.test(document.body.innerText)); } catch (e) { post = { error: String(e).slice(0, 160) }; }
  const probs = [];
  if (!post || post.error || post.noState) probs.push('no game state after resume ' + J(post));
  else {
    if (post.scenes.includes('BattleScene')) probs.push('resumed INTO a battle');
    if (post.scenes.includes('GameOverScene') || post.scenes.includes('VictoryScene')) probs.push('resumed on ' + post.scenes.join('+'));
    if (post.dead) probs.push('resumed dead (hp ' + post.hp + ')');
    if (mv && !mv.ok) probs.push('cannot move: ' + J(mv).slice(0, 160));
    if (expect) probs.push(...expect(pre, mid, post));
  }
  if (probs.length) await shot(c, tag + '-after');
  c.R.check(c.n, `kill at "${tag}": resumes sane (${how.how}${toast ? ', toast' : ''})`, probs.length === 0, { probs, how, pre: brief(pre), mid: mid && brief(mid), post: post && brief(post), diffPre: pre && post && !post.error ? diff(pre, post) : null, ls0 });
  return { post, how, probs, mv };
}
const brief = d => d && { map: d.map, fl: d.floor, hero: d.hero, hp: d.hp + '/' + d.maxHp, lv: d.level, xp: d.exp, g: d.gold, scenes: d.scenes && d.scenes.join('+'), nflags: d.flags && d.flags.length, inv: d.inv };
// "nothing lost or duplicated": gold/exp/level/inventory/flags must equal the pre state OR the mid state exactly
const sameOrMid = (pre, mid, post, what = 'state') => { const a = diff(pre, post), b = mid ? diff(mid, post) : null; return (a.length === 0 || (b && b.length === 0)) ? [] : [`${what} matches neither before (${a.join(', ')}) nor mid (${b ? b.join(', ') : 'n/a'})`]; };

SC['kill-battle'] = async c => {
  for (const [tag, depth] of [['battle menu', 0], ['quiz shown', 1], ['quiz, one wrong answer taken (enemy hit her)', 2], ['item used in battle', 3]]) {
    await bootSlot(c, recSave('ironkeep:gate', s => { s.player.position = { mapId: 'overworld', x: 172, y: 335, floor: 1 }; s.player.inventory.push({ itemId: 'herb', quantity: 6 }); }));
    const pre = await dig(c.page);
    if (!(await D.startFight(c.page, 'bandit'))) { c.R.check(c.n, tag, 'SKIP', 'no monster'); continue; }
    let s = await D.untilPhase(c.page, ['playerMenu'], 20000);
    if (depth >= 1) { await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); s = await D.untilPhase(c.page, ['playerQuiz'], 15000); }
    if (depth === 2) { await D.answer(c.page, false); await c.page.waitForTimeout(500); s = await D.untilPhase(c.page, ['enemyQuiz', 'playerMenu'], 20000); if (s.phase === 'enemyQuiz') { await D.answer(c.page, false); await D.untilPhase(c.page, ['playerMenu', 'playerQuiz'], 20000); } }
    if (depth === 3) { await c.page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); window.__GAME_STATE__.player.state.hp = Math.max(1, Math.floor(window.__GAME_STATE__.player.state.hp / 2)); b.showItemMenu(); const i = b.itemMenuItems.findIndex(t => t.getData('itemId') === 'herb'); if (i >= 0) { b.itemMenuIndex = i; b.confirmItemSelection(); } }); await c.page.waitForTimeout(1500); }
    const mid = await dig(c.page);
    await killAndCheck(c, tag, pre, mid, { expect: (pre, mid, post) => {
      const out = [];
      if (depth === 3) { const lost = (pre.inv.herb || 0) - (post.inv.herb || 0); if (lost > 0 && post.hp <= mid.hp) out.push(`herb consumed (-${lost}) in battle but hp not restored (mid ${mid.hp}, post ${post.hp})`); }
      if (post.gold !== pre.gold || post.exp !== pre.exp || post.level !== pre.level) out.push('gold/exp/level changed by a battle she never finished: ' + diff(pre, post).join(','));
      if (depth !== 3 && post.hp < pre.hp) out.push(`hp ${pre.hp} -> ${post.hp} (lost to an unfinished battle)`);
      return out; } });
  }
};
SC['kill-quiz-typed'] = async c => {
  await bootSlot(c, recSave('ironkeep:gate', s => { s.player.position = { mapId: 'overworld', x: 172, y: 335, floor: 1 }; }));
  const pre = await dig(c.page); await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000);
  await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000);
  await tap(c.page, '[data-act="kpKey"][data-k="1"]'); await tap(c.page, '[data-act="kpKey"][data-k="2"]');
  const typed = await c.page.evaluate(() => (document.querySelector('#qok-kpdisp') || {}).textContent);
  const r = await killAndCheck(c, 'half-typed "12" on the keypad', pre, null, { expect: () => [] });
  // a fresh quiz afterwards starts empty and the keypad is not stuck on screen
  const leftover = await c.page.evaluate(() => ({ kpad: !!document.querySelector('#qok-ui .kpad'), np: !!(document.getElementById('qok-notepad') && document.getElementById('qok-notepad').style.display !== 'none') }));
  await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000); await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000);
  const fresh = await c.page.evaluate(() => (document.querySelector('#qok-kpdisp') || {}).textContent);
  c.R.check(c.n, 'after the kill a new quiz opens with an empty keypad (no stale "12"), no keypad left over on the field', !leftover.kpad && !/12/.test(String(fresh || '')), { typed, fresh, leftover });
};
SC['kill-victory'] = async c => {
  for (const [tag, wait] of [['victory message up (reward text shown)', 0], ['300 ms after the battle scene ended', 1], ['2 s after the battle (autosave done)', 2]]) {
    await bootSlot(c, recSave('ironkeep:gate', s => { s.player.position = { mapId: 'overworld', x: 172, y: 335, floor: 1 }; }));
    const pre = await dig(c.page); await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000);
    await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000);
    const w = await D.winBattle(c.page);
    let mid = await dig(c.page);
    if (wait >= 1) { for (let i = 0; i < 20; i++) { const s = await D.bst(c.page); if (!s.on) break; await c.page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); try { b.advanceMessage(); } catch (e) {} }); await c.page.waitForTimeout(200); } await c.page.waitForTimeout(wait === 1 ? 300 : 2000); mid = await dig(c.page); }
    await killAndCheck(c, tag + ` (win=${w})`, pre, mid, { expect: (pre, mid, post) => sameOrMid(pre, mid, post, 'reward state') });
  }
};
SC['kill-dialog'] = async c => {
  await bootSlot(c, recSave('ironMine:entrance'));
  const pre = await dig(c.page);
  await c.page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); w.showMessage('Test dialogue line one. Line two goes on a while so it wraps.'); });
  await c.page.waitForTimeout(700); const mid = await dig(c.page);
  await killAndCheck(c, 'dialog box open on the overworld', pre, mid, { expect: (pre, mid, post) => sameOrMid(pre, mid, post) });
  // sealed Crystal Cave door message, by walking into it
  await bootSlot(c, recSave('crystalCave:entrance', s => { for (const k of Object.keys(s.player.storyFlags)) if (/^boss\./.test(k)) delete s.player.storyFlags[k]; }));
  await c.page.evaluate(() => {});
};
SC['kill-shop'] = async c => {
  await bootSlot(c, recSave('ironkeep:gate'));
  await c.page.waitForTimeout(3500);
  const pre = await dig(c.page);
  const opened = await c.page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); if (!f) return 'no town frame'; try { f.contentWindow.parent.postMessage({ type: 'act1-town-service', kind: 'shop', shopId: 'ironkeep', town: 'ironkeep' }, '*'); } catch (e) { return String(e); } return 'posted'; });
  await c.page.waitForTimeout(2000); let shopOn = await c.page.evaluate(() => window.__PHASER_GAME__.scene.isActive('ShopScene'));
  if (!shopOn) { await c.page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); w.scene.launch('ShopScene', { shopId: 'ironkeep' }); w.scene.pause(); }); await c.page.waitForTimeout(2000); shopOn = await c.page.evaluate(() => window.__PHASER_GAME__.scene.isActive('ShopScene')); }
  c.R.check(c.n, 'shop opens in Ironkeep', shopOn, { opened });
  if (!shopOn) return;
  await shot(c, 'shop-open');
  // 1: kill with the shop open, nothing bought
  const mid0 = await dig(c.page);
  await killAndCheck(c, 'shop open, nothing bought', pre, mid0, { expect: (p, m, post) => sameOrMid(p, m, post) });
  // 2: buy something, then kill straight away
  await bootSlot(c, recSave('ironkeep:gate')); await c.page.waitForTimeout(3500);
  const pre2 = await dig(c.page);
  await c.page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); w.scene.launch('ShopScene', { shopId: 'ironkeep' }); w.scene.pause(); }); await c.page.waitForTimeout(2000);
  const b1 = await tap(c.page, '[data-act="shopBuy"]', 4000); await c.page.waitForTimeout(600); const b2 = await tap(c.page, '[data-act="shopConfirmBuy"]', 4000); await c.page.waitForTimeout(800);
  const mid = await dig(c.page);
  c.R.check(c.n, 'a purchase went through (gold fell, an item arrived)', mid.gold < pre2.gold, { b1, b2, pre: brief(pre2), mid: brief(mid) });
  await killAndCheck(c, 'right after buying an item', pre2, mid, { expect: (p, m, post) => {
    const out = sameOrMid(p, m, post, 'shop state'); const dG = p.gold - post.gold, dI = Object.keys(post.inv).reduce((a, k) => a + (post.inv[k] - (p.inv[k] || 0)), 0);
    if ((dG > 0) !== (dI > 0)) out.push(`gold and items disagree: gold spent ${dG}, items gained ${dI}`); return out; } });
};
SC['kill-floor'] = async c => {
  const FL = man.floors['ironMine-f1'], dn = FL.assets.find(a => a.kind === 'stairsDown'), ld = FL.land.fromNext;
  for (const ms of [120, 400, 800, 1400]) {
    await bootSlot(c, recSave('ironMine:f1', s => { s.player.position = { mapId: 'ironMine', x: ld.x, y: ld.y, floor: 1 }; }));
    await c.page.waitForFunction(() => { const d = window.__QOK_DNG2__, st = d && d.state(); return !st || !st.key || (st.mask !== 'loading' && st.art !== 'loading'); }, null, { timeout: 40000 }).catch(() => {});
    const pre = await dig(c.page);
    const dx = (dn.x + 0.5) * 48 - pre.hero[0], dy = (dn.y + 0.5) * 48 - pre.hero[1];
    await c.page.evaluate(v => { window.__DQ_STICK__ = { x: v[0], y: v[1], m: 1 }; }, [Math.sign(dx) * Math.min(1, Math.abs(dx) / 48), Math.sign(dy)]);
    await c.page.waitForTimeout(ms); const mid = await dig(c.page);
    await killAndCheck(c, `pushing into the stairs, kill at +${ms} ms (f${mid.floor})`, pre, mid, { expect: (p, m, post) => { const o = [];
      if (post.map !== 'ironMine' && post.map !== 'overworld') o.push('map ' + post.map);
      if (post.map === 'ironMine' && !(post.floor >= 1 && post.floor <= 4)) o.push('floor ' + post.floor);
      return o; } });
  }
};
SC['kill-boss'] = async c => {
  const tests = [['ironMine:boss', 'oreColossus', 'boss.oreColossus.defeated']];
  for (const [pt, boss, flag] of tests) for (const [tag, wait] of [['boss victory message', 0], ['boss battle just ended', 1], ['1 s after (autosave pending)', 3], ['3 s after (autosave done)', 2]]) {
    await bootSlot(c, recSave(pt, s => { delete s.player.storyFlags[flag]; }));
    const pre = await dig(c.page);
    await D.startFight(c.page, boss, true); await D.untilPhase(c.page, ['playerMenu'], 25000);
    await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000);
    const w = await D.winBattle(c.page); let mid = await dig(c.page);
    if (wait >= 1) { for (let i = 0; i < 30; i++) { const s = await D.bst(c.page); if (!s.on) break; await c.page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); try { b.advanceMessage(); } catch (e) {} }); await c.page.waitForTimeout(250); }
      await c.page.waitForTimeout(wait === 1 ? 100 : wait === 3 ? 1000 : 3000); mid = await dig(c.page); }
    const r = await killAndCheck(c, `${boss} ${tag} (win=${w})`, pre, mid, { expect: (p, m, post) => { const o = sameOrMid(p, m, post, 'boss reward state');
      const f = post.flags.includes(flag); if (f !== m.flags.includes(flag) && !diff(p, post).length) { /* wholly pre state is allowed */ }
      if (f && (post.exp === p.exp)) o.push('boss flag set but no exp: partial state');
      if (!f && post.exp > p.exp) o.push('exp rewarded but boss flag missing: boss would be fought again and pay twice'); return o; } });
    // fight it again if undefeated: must work from the resumed state
  }
};
SC['kill-ending'] = async c => {
  for (const [tag, wait] of [['victory scene up', 0], ['credits/ending a few seconds in', 1]]) {
    await bootSlot(c, recSave('demonCastle:boss', s => { delete s.player.storyFlags['boss.demonKing.defeated']; }));
    const pre = await dig(c.page);
    await D.startFight(c.page, 'demonKing', true); await D.untilPhase(c.page, ['playerMenu'], 25000);
    await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000);
    const w = await D.winBattle(c.page);
    for (let i = 0; i < 30; i++) { const s = await D.bst(c.page); if (s.vic || !s.on) break; await c.page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); try { b.advanceMessage(); } catch (e) {} }); await c.page.waitForTimeout(250); }
    await c.page.waitForTimeout(wait ? 5000 : 800); const mid = await dig(c.page); const ls = await lsum(c.page);
    c.R.check(c.n, 'ending reached (VictoryScene)', mid.scenes.includes('VictoryScene'), { scenes: mid.scenes, w });
    await shot(c, 'ending-' + wait);
    const r = await killAndCheck(c, 'during the ending: ' + tag, pre, mid, { expect: () => [] });
    const after = await lsum(c.page);
    c.R.check(c.n, 'after killing the ending: slot 1 still loads (not blank/corrupt) and has a clear record or the pre-boss save', Object.keys(after).some(k => /qok-slot-1-(auto|save)/.test(k)), { ls: after, before: ls });
  }
};

// ---- slots, defeat, boss retry, NG+, language, grade --------------------------------------------------
SC['slots'] = async c => {
  const sv = (id, mod) => recSave(id, mod);
  const t0 = Date.now();
  const A1 = sv('greenhollow:gate'), M1 = sv('millbrook:gate'), D2 = sv('ironMine:f2'), T3 = sv('oasisHaven:gate'), CL = sv('demonCastle:boss');
  M1.timestamp = t0 - 20000; A1.timestamp = t0 - 10000; D2.timestamp = t0 - 8000; T3.timestamp = t0 - 5000; CL.timestamp = t0 - 3000;
  const slots = { 1: { auto: A1, save: M1, town: { mapId: 'millbrook', x: 31.6, y: 57.5 } }, 2: { auto: D2, town: { mapId: 'ironkeep', x: 32.5, y: 56.5 } }, 3: { save: T3 },
    5: { auto: CL, save: CL, clear: { t: t0, count: 1, ng: { inventory: [{ itemId: 'herb', quantity: 5 }], equipment: { weapon: 'frostbrand' }, gold: 777, heroName: 'Mika', heroColor: 'gray' } } } };
  await D.freshLS(c.page, D.slotLS(slots, 1, { 'edu-rpg-locale': 'en' })); await D.waitTitleSlots(c.page);
  await tap(c.page, '[data-act="titleSlots"]'); await c.page.waitForTimeout(600); await shot(c, 'titleslots');
  const cards = await c.page.$$eval('[data-act="slotPick"]', es => es.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  c.R.check(c.n, 'title lists five slots, 4 filled, slot 4 empty, slot 5 Cleared', cards.length === 5 && /New adventure/i.test(cards[3]) && /Cleared/i.test(cards[4]), cards);
  const raw = await D.rawKeys(c.page); c.R.check(c.n, 'no raw keys on the slot screen', raw.length === 0, raw);
  await c.page.reload({ waitUntil: 'load' }); await D.waitTitleSlots(c.page);
  // load each record of each filled slot, check where she lands, return to title through the menu
  const plan = [[1, 0, 'greenhollow'], [1, 1, 'millbrook'], [2, 0, 'ironMine'], [3, 1, 'oasisHaven']];
  for (const [n, which, wantMap] of plan) {
    const base = await lsum(c.page);
    const r = await D.loadSlotUI(c.page, n, which);
    if (!r.ok) { c.R.check(c.n, `slot ${n} ${which ? 'last save' : 'auto'} loads`, false, r); await c.page.reload({ waitUntil: 'load' }); await D.waitTitleSlots(c.page); continue; }
    await c.page.waitForTimeout(2500); const d = await dig(c.page), mv = await D.canMove(c.page);
    c.R.check(c.n, `slot ${n} ${which ? 'last save' : 'auto'} loads into ${wantMap} and she can move`, d.map === wantMap && mv.ok, { d: brief(d), mv, labels: r.labels });
    // manual save outside a town must refuse; in a town it must write only this slot's save
    const before = await lsum(c.page);
    const inTown = await c.page.evaluate(() => window.__QOK_SAVES__.inTown());
    const ms = await c.page.evaluate(() => window.__QOK_SAVES__.manualSave());
    const after = await lsum(c.page);
    if (!inTown) c.R.check(c.n, `slot ${n}: manual save is refused outside a town`, ms === false && J(before[`qok-slot-${n}-save`]) === J(after[`qok-slot-${n}-save`]), { ms, b: before[`qok-slot-${n}-save`], a: after[`qok-slot-${n}-save`] });
    else c.R.check(c.n, `slot ${n}: manual save in a town writes this slot's save only`, ms === true && after[`qok-slot-${n}-save`] && after[`qok-slot-${n}-save`].ts >= (before[`qok-slot-${n}-save`] || { ts: 0 }).ts, { ms, b: before[`qok-slot-${n}-save`], a: after[`qok-slot-${n}-save`] });
    await c.page.evaluate(() => window.__QOK_SAVES__.autoSaveNow(true)); await c.page.waitForTimeout(300);
    // cross contamination: every OTHER slot's keys unchanged
    const fin = await lsum(c.page); const bad = [];
    for (const k of Object.keys(base)) { const m = /^qok-slot-(\d)-/.exec(k); if (m && +m[1] !== n && J(base[k]) !== J(fin[k])) bad.push(k); }
    c.R.check(c.n, `playing in slot ${n} leaves the other slots' records untouched`, bad.length === 0, bad);
    // back to the title through the menu (quit confirm)
    await c.page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('MenuScene'); }); 
    await tap(c.page, '#fieldTabs [data-fi="3"]'); await c.page.waitForTimeout(1200);
    const q1 = await tap(c.page, '[data-act="quitAsk"]'); const q2 = await tap(c.page, '[data-act="quitConfirm"]'); await c.page.waitForTimeout(2500);
    const onTitle = await c.page.evaluate(() => window.__PHASER_GAME__.scene.isActive('TitleScene'));
    c.R.check(c.n, `slot ${n}: quit to title from Settings returns to the title`, onTitle, { q1, q2 });
    if (!onTitle) { await c.page.reload({ waitUntil: 'load' }); } await D.waitTitleSlots(c.page);
  }
  // delete slot 3 through the UI (confirm), cancel on slot 2
  await tap(c.page, '[data-act="titleSlots"]'); await tap(c.page, '[data-act="slotPick"][data-i="3"]'); await tap(c.page, '[data-act="slotDelAsk"]'); await tap(c.page, '[data-act="slotDelCancel"]', 2500);
  let l3 = await lsum(c.page); c.R.check(c.n, 'delete cancelled keeps slot 3', !!l3['qok-slot-3-save'], null);
  await tap(c.page, '[data-act="slotDelAsk"]'); await tap(c.page, '[data-act="slotDelConfirm"]'); await c.page.waitForTimeout(500);
  l3 = await lsum(c.page); c.R.check(c.n, 'delete confirmed removes slot 3 only', !l3['qok-slot-3-save'] && !!l3['qok-slot-1-auto'] && !!l3['qok-slot-5-auto'], Object.keys(l3));
  // new game in the now empty slot 3 and slot 4: the name screen opens, other slots unharmed
  await tap(c.page, '[data-act="slotPick"][data-i="4"]'); await c.page.waitForTimeout(1500);
  const intro = await c.page.evaluate(() => ({ ts: window.__PHASER_GAME__.scene.isActive('TitleScene'), mode: window.__PHASER_GAME__.scene.getScene('TitleScene').mode, intro: !!document.querySelector('[data-act="introStart"], [data-act="introGrade"]') }));
  c.R.check(c.n, 'a new adventure in empty slot 4 opens the creation screen', intro.intro, intro); await shot(c, 'newgame-slot4');
};
SC['defeat'] = async c => {
  for (const [tag, id, mod, townRec] of [
    ['town record on file, ordinary battle, in a dungeon', 'ironMine:f2', s => { s.player.gold = 1001; }, { mapId: 'ironkeep', x: 32.5, y: 56.5 }],
    ['no town record (fresh slot from a tester jump)', 'ironMine:f2', s => { s.player.gold = 777; }, null],
    ['overworld Act 5 with a Act 5 town on file', 'stormreachSpire:entrance', s => { s.player.gold = 99; }, { mapId: 'lastBastion', x: 32.5, y: 56.5 }]]) {
    await bootSlot(c, recSave(id, mod), { town: townRec });
    await c.page.evaluate(() => { const s = window.__GAME_STATE__.player.state; s.hp = 1; });
    const pre = await dig(c.page);
    await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000);
    const died = await D.dieInBattle(c.page); await c.page.waitForTimeout(2500);
    c.R.check(c.n, `[${tag}] defeat screen appears`, died, null); if (!died) continue;
    await shot(c, 'defeat-' + tag.split(' ')[0]);
    const btns = await c.page.$$eval('[data-act="defeatTown"], [data-act="defeatBoss"], [data-act="defeatTitle"], [data-act="gameOverOpt"]', es => es.map(e => e.getAttribute('data-act') + ':' + e.innerText.replace(/\s+/g, ' ').trim().slice(0, 40)));
    c.R.check(c.n, `[${tag}] defeat offers Return to town + Title (no boss retry on an ordinary fight)`, btns.some(b => /defeatTown/.test(b)) && !btns.some(b => /defeatBoss/.test(b)), btns);
    const raw = await D.rawKeys(c.page); c.R.check(c.n, `[${tag}] no raw keys on the defeat screen`, raw.length === 0, raw);
    await tap(c.page, '[data-act="defeatTown"]'); try { await D.waitField(c.page, 60000); } catch (e) {}
    const post = await dig(c.page), mv = await D.canMove(c.page);
    const goldOk = post.gold === pre.gold - Math.floor(pre.gold / 2);
    const wantTown = townRec ? townRec.mapId : null;
    c.R.check(c.n, `[${tag}] wakes in a town at full HP, half gold lost, items kept, can move`, post.hp === post.maxHp && goldOk && J(post.inv) === J(pre.inv) && mv.ok && /^(greenhollow|millbrook|portSapphire|ironkeep|frostwatch|hauntedVillage|oasisHaven|ruinsCamp|embersRest|lastBastion|havensEdge|stormreachVillage|frostfallVillage|sunkenTempleVillage|twilightVillage|cinderwatch)$/.test(post.map) ? true : (!townRec && post.map === pre.map && post.hp === post.maxHp), { pre: brief(pre), post: brief(post), mv, wantTown, goldOk });
  }
};
SC['boss-retry'] = async c => {
  for (const [boss, pt, flag] of [['oreColossus', 'ironMine:boss', 'boss.oreColossus.defeated'], ['mosswarden', 'whisperingWoodsCave:boss', 'boss.mosswarden.defeated']]) {
    await bootSlot(c, recSave(pt, s => { delete s.player.storyFlags[flag]; s.player.inventory.push({ itemId: 'herb', quantity: 5 }); }), { town: { mapId: 'ironkeep', x: 32.5, y: 56.5 } });
    const pre = await dig(c.page);
    await D.startFight(c.page, boss, true); await D.untilPhase(c.page, ['playerMenu'], 25000);
    // use one herb at half hp so the retry must restore items/hp EXACTLY as at fight start
    const died = await D.dieInBattle(c.page, 120000); await c.page.waitForTimeout(2500);
    c.R.check(c.n, `${boss}: defeat screen`, died, null); if (!died) continue;
    const btns = await c.page.$$eval('[data-act="defeatTown"], [data-act="defeatBoss"], [data-act="defeatTitle"]', es => es.map(e => e.getAttribute('data-act') + ':' + e.innerText.replace(/\s+/g, ' ').trim().slice(0, 40)));
    c.R.check(c.n, `${boss}: boss defeat offers "try again"`, btns.some(b => /defeatBoss/.test(b)), btns); await shot(c, 'bossdefeat-' + boss);
    await tap(c.page, '[data-act="defeatBoss"]');
    let s = null; for (let i = 0; i < 40; i++) { s = await D.bst(c.page); if (s.on) break; await c.page.waitForTimeout(500); }
    c.R.check(c.n, `${boss}: retry starts the same boss fight`, s && s.on, s);
    const mid = await dig(c.page);
    c.R.check(c.n, `${boss}: retry restores hp, gold, items exactly as at fight start`, mid.hp === pre.hp && mid.gold === pre.gold && J(mid.inv) === J(pre.inv) && !mid.flags.includes(flag), { pre: brief(pre), mid: brief(mid) });
    // lose again, then take "Return to town" this time: half gold, full hp
    const died2 = await D.dieInBattle(c.page, 120000); await c.page.waitForTimeout(2500);
    if (died2) { await tap(c.page, '[data-act="defeatTown"]'); try { await D.waitField(c.page, 60000); } catch (e) {} const post = await dig(c.page);
      c.R.check(c.n, `${boss}: second defeat then Return to town: full hp, half gold, not in the boss room`, post.hp === post.maxHp && post.gold === pre.gold - Math.floor(pre.gold / 2) && post.map !== pt.split(':')[0], { pre: brief(pre), post: brief(post) }); }
  }
};
SC['ngplus'] = async c => {
  const CL = recSave('demonCastle:boss'); CL.player.storyFlags['boss.demonKing.defeated'] = true; CL.timestamp = Date.now() - 5000;
  const clear = { t: Date.now(), count: 1, ng: { inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'frostbrand', quantity: 1 }], equipment: { weapon: 'frostbrand', armor: null, shield: null, helmet: null, accessory: null }, gold: 777, heroName: 'Mika', heroColor: 'gray' } };
  await D.freshLS(c.page, D.slotLS({ 1: { auto: CL, save: CL, clear } }, 1)); await D.waitTitleSlots(c.page);
  await tap(c.page, '[data-act="titleSlots"]'); await tap(c.page, '[data-act="slotPick"][data-i="1"]'); await c.page.waitForTimeout(500); await shot(c, 'slot-cleared');
  const ok = await tap(c.page, '[data-act="slotNgPlus"]'); await c.page.waitForTimeout(2000); await shot(c, 'ng-intro');
  c.R.check(c.n, 'New Game+ button exists on a cleared slot', ok, null); if (!ok) return;
  // intro screens: name, grade, start
  const st0 = await c.page.evaluate(() => ({ btn: [...document.querySelectorAll('[data-act^="intro"]')].map(b => b.getAttribute('data-act')), nm: !!document.querySelector('[data-act="name"]') }));
  c.R.check(c.n, 'New Game+ opens the creation screen', st0.btn.length > 0, st0);
  await tap(c.page, '[data-act="introStart"]', 6000); await c.page.waitForTimeout(1500);
  for (let i = 0; i < 25; i++) { const on = await c.page.evaluate(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene')); if (on) break; await c.page.evaluate(() => { for (const t of ['keydown', 'keyup']) { const ev = new KeyboardEvent(t, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }); Object.defineProperty(ev, 'keyCode', { get: () => 13 }); Object.defineProperty(ev, 'which', { get: () => 13 }); window.dispatchEvent(ev); } }); await tap(c.page, '[data-act="introStart"], [data-act="battleAdvance"]', 400); await c.page.waitForTimeout(700); }
  try { await D.waitField(c.page, 60000); } catch (e) {}
  const d = await dig(c.page); await shot(c, 'ng-field');
  c.R.check(c.n, 'NG+: level 1, items+gear+gold carried, story flags reset, starts in Act 1', d.level === 1 && d.gold >= 777 && (d.inv.frostbrand || d.eq.weapon === 'frostbrand') && !d.flags.some(f => /^boss\./.test(f)), brief(d));
  const mv = await D.canMove(c.page); c.R.check(c.n, 'NG+ hero can move', mv.ok, mv);
  const l = await lsum(c.page); c.R.check(c.n, 'NG+ keeps the slot (clear record still there, new progress saved in that slot)', !!l['qok-slot-1-clear'] || !!l['qok-slot-1-auto'], Object.keys(l));
  // kill during NG+ intro: resume
};
SC['lang-grade'] = async c => {
  await bootSlot(c, recSave('ironkeep:gate', s => { s.player.quizDifficulty = '3'; }));
  const rowOf = async key => c.page.evaluate(key => { const m = window.__PHASER_GAME__.scene.getScene('MenuScene'); return m && m.settingsList ? m.settingsList.indexOf(key) : -2; }, key);
  const openSettings = async () => { await tap(c.page, '#fieldTabs [data-fi="3"]'); await c.page.waitForTimeout(1200); };
  const closeM = async () => { await tap(c.page, '[data-act="close"]'); await c.page.waitForTimeout(800); };
  const row = async key => { const i = await rowOf(key); if (i < 0) return false; return tap(c.page, `[data-act="setting"][data-i="${i}"]`, 2500); };
  await openSettings();
  const keys = await c.page.evaluate(() => window.__PHASER_GAME__.scene.getScene('MenuScene').settingsList);
  c.R.check(c.n, 'settings rows present', keys && keys.length >= 5, keys);
  const seq = [['en', false]];
  // en -> ja kana -> ja kanji -> en
  const states = [];
  for (let step = 0; step < 4; step++) {
    const d = await dig(c.page); states.push({ loc: d.loc, kanji: d.kanji });
    const raw = await D.rawKeys(c.page); await shot(c, `settings-${d.loc}-${d.kanji ? 'kanji' : 'kana'}`);
    c.R.check(c.n, `settings in ${d.loc}${d.kanji ? ' kanji' : ''}: no raw keys`, raw.length === 0, raw);
    if (step === 0) await row('language'); else if (step === 1) await row('kanji'); else if (step === 2) { await row('kanji'); await row('language'); }
    await c.page.waitForTimeout(700);
  }
  c.R.check(c.n, 'language row cycles en -> ja -> ja kanji -> en', states[0].loc === 'en' && states[1].loc === 'ja' && !states[1].kanji && states[2].loc === 'ja' && states[2].kanji, states);
  // grade change via the row, then a battle: the quiz grade follows
  const grades = [];
  for (let i = 0; i < 8; i++) { const d = await dig(c.page); grades.push(d.grade); await row('difficulty'); await c.page.waitForTimeout(400); }
  c.R.check(c.n, 'Settings grade row (shows a chevron) changes nothing: grade is fixed after New Game (design, polish: row looks tappable)', new Set(grades).size === 1, grades);
  await closeM();
  // set to grade 6 then fight: keypad has the +/- key; set K: no
  for (const g of ['6', 'K']) {
    await c.page.evaluate(g => { window.__GAME_STATE__.player.state.quizDifficulty = g; window.__GAME_STATE__.quizManager.difficulty = g; }, g);
    await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000); await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000);
    const k = await c.page.evaluate(() => ({ pm: !!document.querySelector('[data-k="pm"]'), q: (window.__PHASER_GAME__.scene.getScene('BattleScene').quizQuestion || {}).gradeLevel, text: (document.querySelector('#qok-ui') || { innerText: '' }).innerText.slice(0, 200) }));
    c.R.check(c.n, `grade ${g}: question grade follows the setting, ± key only at grade 6`, (g === '6') === k.pm, k);
    await shot(c, 'quiz-grade-' + g);
    // leave the battle by winning
    await D.winBattle(c.page); for (let i = 0; i < 30; i++) { const s = await D.bst(c.page); if (!s.on) break; await c.page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); try { b.advanceMessage(); } catch (e) {} }); await c.page.waitForTimeout(250); }
    await c.page.waitForTimeout(1200);
  }
  // keypad off then on: choices vs keypad, mid-game
  for (const kp of ['0', '1']) {
    await c.page.evaluate(kp => localStorage.setItem('qok-keypad', kp), kp);
    await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000); await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000);
    await c.page.waitForTimeout(3500);
    const k = await c.page.evaluate(() => ({ kpad: !!document.querySelector('#qok-ui .kpad'), ch: document.querySelectorAll('[data-act="quizAns"]').length }));
    c.R.check(c.n, `keypad switch ${kp}: ${kp === '0' ? 'four choice buttons' : 'keypad'}`, kp === '0' ? (k.ch === 4 && !k.kpad) : (k.kpad && k.ch === 0), k);
    await D.winBattle(c.page); for (let i = 0; i < 30; i++) { const s = await D.bst(c.page); if (!s.on) break; await c.page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); try { b.advanceMessage(); } catch (e) {} }); await c.page.waitForTimeout(250); }
    await c.page.waitForTimeout(1200);
  }
  await c.page.evaluate(() => localStorage.removeItem('qok-keypad'));
};

SC['lang-slots'] = async c => {
  const en = recSave('ironkeep:gate'), jaK = recSave('oasisHaven:gate', s => { s.player.locale = 'ja'; s.player.kanjiMode = true; s.player.name = 'ミカ'; }), jaH = recSave('greenhollow:gate', s => { s.player.locale = 'ja'; s.player.kanjiMode = false; });
  const slots = { 1: { auto: en }, 2: { auto: jaK }, 3: { auto: jaH } };
  await D.freshLS(c.page, D.slotLS(slots, 1)); await D.waitTitleSlots(c.page);
  for (const [n, loc, kj] of [[1, 'en', false], [2, 'ja', true], [3, 'ja', false], [1, 'en', false]]) {
    const r = await D.loadSlotUI(c.page, n, 0); if (!r.ok) { c.R.check(c.n, `slot ${n} loads`, false, r); break; }
    await c.page.waitForTimeout(2500); const d = await dig(c.page); const raw = await D.rawKeys(c.page);
    const hud = await c.page.evaluate(() => document.body.innerText.slice(0, 200)); await shot(c, `slot${n}-${loc}${kj ? 'K' : ''}`);
    const hasJa = /[぀-ヿ一-鿿]/.test(hud);
    c.R.check(c.n, `slot ${n} (${loc}${kj ? ' kanji' : ''}) loads in its own language: game locale/kanji follow the record, HUD ${loc === 'ja' ? 'Japanese' : 'English'}, no raw keys`, d.loc === loc && d.kanji === kj && hasJa === (loc === 'ja') && raw.length === 0, { loc: d.loc, kanji: d.kanji, hud: hud.slice(0, 120), raw });
    // switch language in the settings mid-game, then go back to the title: the title follows
    await tap(c.page, '#fieldTabs [data-fi="3"]'); await c.page.waitForTimeout(1200);
    const i = await c.page.evaluate(() => window.__PHASER_GAME__.scene.getScene('MenuScene').settingsList.indexOf('language'));
    await tap(c.page, `[data-act="setting"][data-i="${i}"]`); await c.page.waitForTimeout(800);
    const d2 = await dig(c.page); const raw2 = await D.rawKeys(c.page);
    c.R.check(c.n, `slot ${n}: language row flips the game language at once, no raw keys`, d2.loc !== loc && raw2.length === 0, { before: loc, after: d2.loc, raw2 });
    await tap(c.page, '[data-act="quitAsk"]'); await tap(c.page, '[data-act="quitConfirm"]'); await c.page.waitForTimeout(2500);
    const t = await c.page.evaluate(() => ({ on: window.__PHASER_GAME__.scene.isActive('TitleScene'), txt: document.body.innerText.slice(0, 80) }));
    await D.waitTitleSlots(c.page);
    c.R.check(c.n, `slot ${n}: after the switch, quit to title works`, t.on, t);
  }
};
SC['lang-battle'] = async c => {
  for (const [loc, kj] of [['ja', false], ['ja', true], ['en', false]]) {
    await bootSlot(c, recSave('ironkeep:gate', s => { s.player.locale = loc; s.player.kanjiMode = kj; s.player.position = { mapId: 'overworld', x: 172, y: 335, floor: 1 }; }));
    await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000); await shot(c, `battle-menu-${loc}${kj ? 'K' : ''}`);
    await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000); await shot(c, `battle-quiz-${loc}${kj ? 'K' : ''}`);
    const raw = await D.rawKeys(c.page); const txt = await c.page.evaluate(() => document.querySelector('#qok-ui').innerText.replace(/\s+/g, ' ').slice(0, 200));
    c.R.check(c.n, `${loc}${kj ? ' kanji' : ''}: battle menu + keypad quiz show no raw keys${loc === 'ja' ? ' and no English chrome' : ''}`, raw.length === 0 && (loc !== 'ja' || !/Attack|Answer to attack|Type your answer/.test(txt)), { raw, txt });
    await D.answer(c.page, false); await D.untilPhase(c.page, ['enemyQuiz', 'playerMenu', 'playerQuiz'], 20000); await shot(c, `battle-after-${loc}${kj ? 'K' : ''}`);
    const t2 = await c.page.evaluate(() => document.querySelector('#qok-ui').innerText.replace(/\s+/g, ' ').slice(0, 200));
    c.R.check(c.n, `${loc}${kj ? ' kanji' : ''}: after a wrong answer the result text is in the right language`, loc !== 'ja' || !/Wrong|Correct|damage/i.test(t2), t2);
    await D.winBattle(c.page); for (let i = 0; i < 30; i++) { const s = await D.bst(c.page); if (!s.on) break; await c.page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); try { b.advanceMessage(); } catch (e) {} }); await c.page.waitForTimeout(250); }
  }
};
SC['kill-warp'] = async c => {
  await bootSlot(c, recSave('ironMine:f3'));
  await c.page.waitForFunction(() => { const d = window.__QOK_DNG2__, st = d && d.state(); return !st || !st.key || (st.mask !== 'loading' && st.art !== 'loading'); }, null, { timeout: 40000 }).catch(() => {});
  const pre = await dig(c.page);
  const open = await c.page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); try { w.showMidFloorCrystalMenu(); } catch (e) { return String(e); } return !!(w.midCrystalOverlayOpen || w.warpOverlayOpen); });
  await c.page.waitForTimeout(800); await shot(c, 'crystal-menu');
  const mid = await dig(c.page);
  c.R.check(c.n, 'crystal warp overlay opens', open === true, open);
  await killAndCheck(c, 'crystal warp overlay open', pre, mid, { expect: (p, m, post) => sameOrMid(p, m, post) });
};

// ---- day-4 second pass: new quiz bank, keypad, timer ------------------------------------------------
SC['quiz-grades'] = async c => {
  for (const [g, pt] of [['k', 'ironkeep:gate'], ['3', 'ironkeep:gate'], ['6', 'stormreachSpire:entrance']]) {
    await bootSlot(c, recSave(pt, s => { s.player.quizDifficulty = g; s.player.timerEnabled = true; s.player.hp = 9999; s.player.maxHp = 9999; s.player.def = 9999; if (pt === 'ironkeep:gate') s.player.position = { mapId: 'overworld', x: 172, y: 335, floor: 1 }; }));
    await c.page.evaluate(g => { window.__GAME_STATE__.quizManager.difficulty = g; window.__GAME_STATE__.player.state.quizDifficulty = g; }, g);
    const seen = [], bad = []; let neg = null, timedOut = 0, rounds = 0, wrongOk = 0, rightOk = 0;
    await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000);
    for (let i = 0; i < 40 && rounds < 14; i++) {
      const s = await D.bst(c.page); if (!s.on) { await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000); continue; }
      if (s.phase === 'playerMenu') { await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000); continue; }
      if (s.phase === 'message') { await c.page.evaluate(() => { try { window.__PHASER_GAME__.scene.getScene('BattleScene').advanceMessage(); } catch (e) {} }); await c.page.waitForTimeout(250); continue; }
      if (!/Quiz/.test(s.phase) || !s.kp) { await c.page.waitForTimeout(250); continue; }
      const q = await c.page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'), q = b.quizQuestion; return { text: (document.querySelector('#qok-ui').innerText.match(/[^\n]*[=?][^\n]*/) || [''])[0], right: String(((q.answers.find(a => a.isCorrect) || {}).text || {}).en), n: q.answers.length, secs: b.quizTimerSeconds, grade: q.gradeLevel, uniq: new Set(q.answers.map(a => a.text.en)).size }; });
      rounds++; seen.push(q);
      if (!/^-?\d+$/.test(q.right)) bad.push({ why: 'keypad cannot type', ...q });
      if (q.uniq < q.n) bad.push({ why: 'duplicate choices', ...q });
      if (!(q.secs > 0)) bad.push({ why: 'no timer with timerEnabled', ...q });
      const wrong = rounds % 3 === 1, tmo = rounds === 5;
      if (tmo) { await c.page.evaluate(() => window.__PHASER_GAME__.scene.getScene('BattleScene').onQuizTimeout()); timedOut++; await c.page.waitForTimeout(600); continue; }
      let val = q.right; if (wrong) val = String(Math.abs(+q.right) + 7);
      if (q.right.startsWith('-') && !wrong) neg = neg || q;
      for (const sel of await L.quizTaps(c.page, 0).then(() => [])) {}
      const taps = []; for (const ch of val.replace('-', '')) taps.push(`[data-act="kpKey"][data-k="${ch}"]`); if (val.startsWith('-')) taps.push('[data-act="kpKey"][data-k="pm"]'); taps.push('[data-act="kpKey"][data-k="go"]');
      for (const t of taps) await tap(c.page, t, 2000);
      await c.page.waitForTimeout(500);
      const res = await c.page.evaluate(() => document.querySelector('#qok-ui').innerText.replace(/\s+/g, ' ').slice(0, 160));
      const ok = wrong ? !/Correct|Great|Nice/i.test(res) || /Wrong|not|Incorrect/i.test(res) : /Correct|Great|Nice|damage|Victory|!/i.test(res);
      if (wrong) wrongOk += ok ? 1 : 0; else rightOk += ok ? 1 : 0; if (!ok) bad.push({ why: (wrong ? 'wrong answer treated as ok' : 'right typed answer not accepted') + ': ' + res, ...q });
    }
    c.R.check(c.n, `grade ${g}: ${rounds} questions on the keypad: every right answer is a typeable integer, choices distinct, timer present, typed right/wrong answers judged right`, bad.length === 0 && rounds >= 6, { g, rounds, bad: bad.slice(0, 4), sample: seen.slice(0, 5).map(q => q.text + ' = ' + q.right), grades: [...new Set(seen.map(q => q.grade))], neg, timedOut });
    if (g === '6') c.R.check(c.n, 'grade 6 Act 5: the ± key is present', await c.page.evaluate(() => !!document.querySelector('[data-k="pm"]')), null);
    await shot(c, 'quiz-g' + g);
  }
  // grade 6: hunt a negative answer through the real engine's questions and enter it with ±
  await bootSlot(c, recSave('stormreachSpire:entrance', s => { s.player.quizDifficulty = '6'; s.player.hp = 9999; s.player.maxHp = 9999; s.player.def = 9999; }));
  await c.page.evaluate(() => { window.__GAME_STATE__.quizManager.difficulty = '6'; });
  let found = null; await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000);
  for (let i = 0; i < 90 && !found; i++) {
    const s = await D.bst(c.page); if (!s.on) { await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000); continue; }
    if (s.phase === 'playerMenu') { await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000); continue; }
    if (s.phase === 'message') { await c.page.evaluate(() => { try { window.__PHASER_GAME__.scene.getScene('BattleScene').advanceMessage(); } catch (e) {} }); await c.page.waitForTimeout(200); continue; }
    if (!/Quiz/.test(s.phase) || !s.kp) { await c.page.waitForTimeout(200); continue; }
    const right = s.right;
    if (right && right.startsWith('-')) { found = right; await tap(c.page, '[data-act="kpKey"][data-k="pm"]'); for (const ch of right.replace('-', '')) await tap(c.page, `[data-act="kpKey"][data-k="${ch}"]`); const disp = await c.page.evaluate(() => (document.querySelector('#qok-kpdisp') || {}).textContent); await tap(c.page, '[data-act="kpKey"][data-k="go"]'); await c.page.waitForTimeout(700);
      const res = await c.page.evaluate(() => document.querySelector('#qok-ui').innerText.replace(/\s+/g, ' ').slice(0, 140)); c.R.check(c.n, 'grade 6 negative answer typed with ± is accepted as correct', /Correct|damage|!/i.test(res) && !/Wrong/i.test(res), { right, disp, res }); }
    else await D.answer(c.page, true);
    await c.page.waitForTimeout(300);
  }
  if (!found) c.R.check(c.n, 'grade 6: a negative-answer question came up in 90 questions', 'UNVERIFIED', null);
};
SC['kill-quiz-bank'] = async c => {
  for (const g of ['k', '3', '6']) {
    await bootSlot(c, recSave('ironkeep:gate', s => { s.player.quizDifficulty = g; s.player.timerEnabled = true; s.player.position = { mapId: 'overworld', x: 172, y: 335, floor: 1 }; }));
    await c.page.evaluate(g => { window.__GAME_STATE__.quizManager.difficulty = g; }, g);
    const pre = await dig(c.page); await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000);
    await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000);
    await tap(c.page, '[data-act="kpKey"][data-k="1"]'); await c.page.waitForTimeout(1500);
    await killAndCheck(c, `grade ${g}: timer running, "1" typed`, pre, null, { expect: () => [] });
    await D.startFight(c.page, 'bandit'); await D.untilPhase(c.page, ['playerMenu'], 20000); await tap(c.page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(c.page, ['playerQuiz'], 15000);
    const q = await c.page.evaluate(() => ({ disp: (document.querySelector('#qok-kpdisp') || {}).textContent, secs: window.__PHASER_GAME__.scene.getScene('BattleScene').quizTimerSeconds, grade: window.__GAME_STATE__.player.state.quizDifficulty }));
    c.R.check(c.n, `grade ${g}: after the kill the next quiz is fresh (empty display, timer set, grade kept)`, !/1/.test(String(q.disp || '')) && q.secs > 0 && String(q.grade).toLowerCase() === g, q);
  }
};
SC['resume-f3'] = async c => {
  for (let k = 0; k < 2; k++) {
    const pt = man.floors['emberMines-f3'].land.fromPrev;
    await bootSlot(c, recSave('emberMines:f3', s => { s.player.position = { mapId: 'emberMines', x: pt.x, y: pt.y, floor: 3 }; }));
    for (let i = 0; i < 4; i++) { const a = i * 1.7; await L.stick(c.page, Math.cos(a), Math.sin(a), 250); }
    const before = await dig(c.page); await X.hide(c.page, true); await c.page.waitForTimeout(800); await X.hide(c.page, false);
    await D.kill(c.page); const how = await D.afterKill(c.page, 0, 1); const after = await dig(c.page).catch(e => ({ error: String(e) })); const mv = after.error ? null : await D.canMove(c.page);
    const ok = !after.error && after.map === before.map && after.floor === before.floor && Math.abs(after.cell[0] - before.cell[0]) + Math.abs(after.cell[1] - before.cell[1]) <= 1 && mv && mv.ok;
    c.R.check(c.n, `try ${k + 1}: hide then reload on Ember Mines f${before.floor}: same floor/cell, can move`, !!ok, { how, before: brief(before), after: brief(after), mv });
  }
};
SC['kill-town-dialog'] = async c => {
  await bootSlot(c, recSave('ironkeep:gate')); await c.page.waitForTimeout(3500);
  const pre = await dig(c.page);
  const talk = await c.page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); const w = f && f.contentWindow; if (!w || !w.__ACT1_TOWN__) return 'no town'; const t = w.__ACT1_TOWN__; try { return Object.keys(t).slice(0, 25).join(','); } catch (e) { return String(e); } });
  c.note = talk; await c.page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); w.showMessage('Welcome to Ironkeep, traveller. The smith is to the east.'); });
  await c.page.waitForTimeout(800); const mid = await dig(c.page);
  await killAndCheck(c, 'town dialog box open inside Ironkeep', pre, mid, { expect: (p, m, post) => { const o = sameOrMid(p, m, post); if (post.map !== 'ironkeep') o.push('left the town: ' + post.map); return o; } });
};
SC['kill-fall'] = async c => {
  // Storm Nest walkway: put her on a lane edge in a gust and kill the page while she is blown off
  await bootSlot(c, recSave('stormNest:f2'));
  await c.page.waitForFunction(() => { const d = window.__QOK_DNG2__, st = d && d.state(); return !st || !st.key || (st.mask !== 'loading' && st.art !== 'loading'); }, null, { timeout: 40000 }).catch(() => {});
  const pre = await dig(c.page);
  const got = await c.page.evaluate(async () => { const A = window.__QOK_D2KIT_A__; return !!A; });
  c.R.check(c.n, 'gust fall kill: needs the probe injection harness (mech/gust-walkways.cjs inject)', 'UNVERIFIED', { kitPresent: got, pre: brief(pre) });
};

// ---- old saves ---------------------------------------------------------------------------------------
SC['oldsave'] = async c => {
  const base = () => recSave('ironMine:f2');
  const V = {
    'fields-removed: kanjiMode,quizDifficulty,timerEnabled,soundEnabled,masterVolume': s => { for (const k of ['kanjiMode', 'quizDifficulty', 'timerEnabled', 'soundEnabled', 'masterVolume']) delete s.player[k]; },
    'fields-removed: questProgress,activeQuests,completedQuests': s => { for (const k of ['questProgress', 'activeQuests', 'completedQuests']) delete s.player[k]; },
    'no quizStats, no playtime, no timestamp': s => { delete s.quizStats; delete s.playtime; delete s.timestamp; },
    'locale missing': s => { delete s.player.locale; },
    'equipment slots missing (helmet, accessory)': s => { s.player.equipment = { weapon: s.player.equipment.weapon, armor: s.player.equipment.armor }; },
    'equipment null': s => { s.player.equipment = null; },
    'inventory has an unknown item and a zero stack': s => { s.player.inventory.push({ itemId: 'ghostItemXYZ', quantity: 3 }, { itemId: 'herb', quantity: 0 }); },
    'position floor missing': s => { delete s.player.position.floor; },
    'position floor beyond the dungeon (f9 of 4)': s => { s.player.position.floor = 9; },
    'position map unknown': s => { s.player.position.mapId = 'noSuchPlace'; },
    'position off the map (x,y huge)': s => { s.player.position.x = 9999; s.player.position.y = -50; },
    'position missing entirely': s => { delete s.player.position; },
    'boss beaten but story item missing (old repair path)': s => { s.player.storyFlags['boss.sandGolem.defeated'] = true; s.player.inventory = s.player.inventory.filter(i => i.itemId !== 'flameCloak'); s.player.equipment = { weapon: null, armor: null, shield: null, helmet: null, accessory: null }; },
    'storyFlags missing intro.done / acts.geo2': s => { delete s.player.storyFlags['intro.done']; delete s.player.storyFlags['acts.geo2']; },
    'storyFlags missing (null)': s => { s.player.storyFlags = null; },
    'build-1 shape: version 3, no version-4 player fields': s => { s.version = 3; for (const k of ['kanjiMode', 'masterVolume', 'timerEnabled', 'questProgress']) delete s.player[k]; },
    'hp above maxHp, level 0': s => { s.player.hp = s.player.maxHp + 500; s.player.level = 0; },
    'hp zero (saved dead)': s => { s.player.hp = 0; },
    'NaN-ish numbers (gold string, exp null)': s => { s.player.gold = '120'; s.player.exp = null; },
    'extra unknown fields from a future build': s => { s.player.futureThing = { a: 1 }; s.extraTop = 'x'; },
  };
  for (const [name, mod] of Object.entries(V)) {
    const s = base(); mod(s);
    c.S.errors.splice(0);
    await D.freshLS(c.page, D.slotLS({ 1: { auto: s, save: null } }, 1)); await D.waitTitleSlots(c.page).catch(() => {});
    let r; try { r = await D.loadSlotUI(c.page, 1, 0); } catch (e) { r = { ok: false, why: String(e).slice(0, 100) }; }
    let d = null, mv = null, raw = [];
    if (r.ok) { try { await c.page.waitForTimeout(2000); d = await dig(c.page); mv = await D.canMove(c.page); raw = await D.rawKeys(c.page); } catch (e) { d = { error: String(e).slice(0, 100) }; } }
    const errs = c.S.errors.slice(0, 3), probs = [];
    if (!r.ok) probs.push('did not load: ' + J(r)); else {
      if (!d || d.error || d.noState) probs.push('no state ' + J(d));
      else { if (!mv.ok) probs.push('cannot move after load ' + J(mv).slice(0, 120)); if (d.dead) probs.push('loaded dead'); if (d.hp > d.maxHp) probs.push('hp > maxHp'); if (!(d.level >= 1)) probs.push('level ' + d.level); if (typeof d.gold !== 'number' || isNaN(d.gold)) probs.push('gold ' + d.gold);
        if (d.map === 'noSuchPlace') probs.push('stuck on unknown map'); }
    }
    if (raw.length) probs.push('raw keys ' + raw.join(','));
    if (errs.length) probs.push('page errors ' + J(errs).slice(0, 200));
    if (probs.length) await shot(c, 'old-' + Object.keys(V).indexOf(name));
    c.R.check(c.n, `old save "${name}": loads, sane, she can move`, probs.length === 0, { probs, d: brief(d), mv: mv && mv.ok });
  }
  // corrupt auto, good manual: the slot card must offer the manual one and not crash the title
  const good = base(); const ls = D.slotLS({ 1: { auto: good, save: good } }, 1); ls['qok-slot-1-auto'] = '{"version":4,"player":{"name":"Bro'; ls['edu-rpg-autosave'] = ls['qok-slot-1-auto'];
  await D.freshLS(c.page, ls); await D.waitTitleSlots(c.page).catch(() => {});
  await tap(c.page, '[data-act="titleSlots"]'); await tap(c.page, '[data-act="slotPick"][data-i="1"]'); const lab = await c.page.$$eval('[data-act="slotLoad"]', es => es.map(e => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 50)));
  c.R.check(c.n, 'truncated auto save (bad JSON) + good manual: the slot still opens and offers the manual save', lab.length >= 1 && lab.every(l => !/Auto/i.test(l)), lab);
  // a pre-slot install: only edu-rpg-save (no qok-slots-v1 marker): migrates into slot 1
  await D.freshLS(c.page, { 'edu-rpg-save': J(base()) }); await D.waitTitleSlots(c.page).catch(() => {});
  const l2 = await lsum(c.page); c.R.check(c.n, 'pre-slot install (only edu-rpg-save) migrates into slot 1 and the title Continue works', !!l2['qok-slot-1-save'] && l2['qok-active-slot'] === '1', Object.keys(l2));
  const r2 = await D.loadSlotUI(c.page, 1, 1); c.R.check(c.n, 'migrated slot loads', r2.ok, r2);
  // pre-slot install with an old autosave only
  await D.freshLS(c.page, { 'edu-rpg-autosave': J(base()) }); await D.waitTitleSlots(c.page).catch(() => {});
  const l3 = await lsum(c.page); c.R.check(c.n, 'pre-slot install with only an autosave migrates it into slot 1', !!l3['qok-slot-1-auto'], Object.keys(l3));
  // no saves at all
  await D.freshLS(c.page, {}); await D.waitTitleSlots(c.page).catch(() => {});
  const nos = await c.page.evaluate(() => ({ cont: !!document.querySelector('[data-act="titleContinue"]'), slots: !!document.querySelector('[data-act="titleSlots"]'), nw: !!document.querySelector('[data-act="titleNew"]') }));
  c.R.check(c.n, 'clean install: New Game shown, no Continue', nos.nw && !nos.cont, nos);
};

(async () => {
  const a = process.argv.slice(2); const si = a.indexOf('--seed'); if (si >= 0) a.splice(si, 2);
  const names = a.length ? a : null; if (!names) { console.log(Object.keys(SC).join('\n')); return; }
  const S = await X.launchX(); const R = D.makeReporter('d4.jsonl', S);
  for (const n of names) {
    const c = { S, page: S.page, n, R };
    console.log('=== ' + n);
    try { await SC[n](c); } catch (e) { const m = String(e && e.stack || e).slice(0, 600); console.log(n, 'ERROR', m); R.check(n, 'scenario ran to the end', false, m); await X.jpeg(S.page, SH, n + '-error').catch(() => {}); }
  }
  await S.browser.close();
})();
