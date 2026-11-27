'use strict';
// UI language check (track F1, census 2026-11-23). Guards:
//   M12  the town's talk / shop / save pill speaks the player's language (was "Talk to Elder Rowan" in Japanese)
//   m7   kanji mode shows kanji: the save-slot screens on a cold launch, the shop's stat suffixes
//        (was +3ATK/+2DEF), the field tab bar (flipped between 道具 and どうぐ), the ending band
//   m6   Japanese text in the overlay's boxes breaks only at the phrase spaces and after punctuation
//        (was き/ょうい, 脅/威, 26/の ダメージ), with no box overflowing sideways
//   nit  the healer card labels the cost as the price, not "Gold" (reads like the wallet)
//   8b   the shop's Sell tab, tapped with a finger, switches the list (census report UNVERIFIED)
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5502/ node scripts/auto/checks/ui-japanese.cjs [group ...]
// groups: title field layout town-en town-ja-kana town-ja-kanji     (each its own Chromium, one at a time)
// UI_SHOTS=<dir> also writes JPEG screenshots of what was judged.
//
// Real: Continue from a seeded save, taps on the overlay's buttons, the walk into Greenhollow, the walk
// to each person, the town's own talk key. Direct (said on the line): the long message box text in
// "field" is shown through WorldMapScene.showMessage(), and the ending is VictoryScene started from
// the console (reaching it for real takes a whole game).
const U = require('./_uilib.cjs');
const { L, rec, tap, breaks, hOverflow, shot, seed } = U;
const GROUP = U.runGroups(__filename, ['title', 'field', 'layout', 'town-en', 'town-ja-kana', 'town-ja-kanji'], 'ui-japanese');
const JA = /[぀-ヿ一-鿿]/;
const badBreaks = rows => rows.flatMap(r => r.breaks.filter(b => !b.good).map(b => b.ctx));

async function title(page) {
  // A kanji-mode adventure in slot 1 and a cleared kanji-mode adventure in slot 2; cold launch.
  for (const kj of [true, false]) {
    const tag = kj ? 'kanji' : 'kana';
    const base = seed({ locale: 'ja', kanji: kj, mapId: 'overworld', x: 69, y: 256 }); base.playtime = 4000;
    const s2 = JSON.parse(JSON.stringify(base)); s2.player.name = 'ソラ';
    const clear = { t: Date.now(), count: 1, ng: { inventory: [{ itemId: 'herb', quantity: 3 }], equipment: {}, gold: 900, heroName: 'ソラ', heroColor: 'gray' } };
    await page.goto(L.URL_, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([a, b, c]) => { localStorage.clear(); localStorage.setItem('edu-rpg-locale', 'ja'); localStorage.setItem('qok-slots-v1', '1'); localStorage.setItem('qok-active-slot', '1');
      localStorage.setItem('edu-rpg-save', a); localStorage.setItem('qok-slot-1-save', a); localStorage.setItem('qok-slot-2-save', b); localStorage.setItem('qok-slot-2-clear', c); },
    [JSON.stringify(base), JSON.stringify(s2), JSON.stringify(clear)]);
    await page.reload({ waitUntil: 'load' }); await L.toTitle(page); await page.waitForTimeout(1200);
    await tap(page, '[data-act="titleSlots"]'); await page.waitForTimeout(700);
    const list = await page.evaluate(() => document.getElementById('qok-ui').innerText);
    await tap(page, '[data-act="slotPick"][data-i="2"]'); await page.waitForTimeout(800);
    const t = await page.evaluate(() => document.getElementById('qok-ui').innerText.replace(/\s+/g, ' '));
    await shot(page, `m7-slot-cleared-ja-${tag}`);
    if (kj) {
      const kanaLeft = ['さいごの', 'きょう ', 'つよくて', 'もって さいしょから', 'けす', 'もどる'].filter(w => t.includes(w));
      rec('m7 cold launch, kanji-mode slot: the cleared-slot screen is in kanji', kanaLeft.length === 0 && t.includes('最後の') && t.includes('強くてニューゲーム'), { kanaLeft, shown: t.slice(0, 160) });
      rec('m7 cold launch, kanji-mode slot: the slot list is in kanji', list.includes('記録') && !list.includes('きろく'), list.replace(/\s+/g, ' ').slice(0, 120));
    } else {
      rec('m7 kana-mode slot stays kana (no kanji leak)', t.includes('さいごの') && t.includes('つよくてニューゲーム') && !t.includes('最後の'), t.slice(0, 160));
    }
  }
}

async function field(page) {
  await U.boot(page, { locale: 'ja', kanji: true, all: false, mapId: 'overworld', x: 69, y: 258, activeQuests: ['kikisChallenge', 'owlsLesson'] });
  await page.waitForTimeout(1500);
  const want = await page.evaluate(() => ['menu.status', 'menu.items', 'menu.equip', 'menu.settings'].map(k => window.__QOK.Z(k)));
  const bar = async () => page.evaluate(() => [...document.querySelectorAll('#fieldTabs .ft span')].map(e => e.textContent));
  const b1 = await bar();
  rec('m7 field tab bar in kanji mode shows the kanji labels', JSON.stringify(b1) === JSON.stringify(want) && want[1] === '道具', { bar: b1, want });
  await tap(page, '#fieldTabs [data-fi="1"]'); await page.waitForTimeout(1500);
  await tap(page, '[data-act="close"]', 3000); await page.waitForTimeout(1200);
  const b2 = await bar();
  rec('m7 field tab bar still kanji after the menu opens and closes', JSON.stringify(b2) === JSON.stringify(want), { bar: b2 });
  await shot(page, 'm7-field-tabs-ja-kanji');

  // m6: the quest tracker, opened (its objectives are the census's "モスワーデンの き/ょうい")
  for (const kj of [false, true]) {
    await page.evaluate(k => { window.__GAME_STATE__.player.state.kanjiMode = k; }, kj); await page.waitForTimeout(600);
    const q = await page.evaluate(() => { const wm = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); wm.questTrackerCollapsed = false; return true; });
    await page.waitForTimeout(500);
    const r = await breaks(page, '#qfh-quest-content .qfq-objective, #qfh-quest-content .qfq-title span');
    rec(`m6 quest tracker (player kanjiMode=${kj}; text as the bundle gives it): Japanese breaks only at spaces/punctuation`, r.length > 0 && badBreaks(r).length === 0, { bad: badBreaks(r), n: r.length });
  }
  // m6: the field message box. Direct: showMessage() with the census's long lines.
  const LINES = {
    kana: 'モスワーデンの きょういが ひろがって いる。もりの おくに すむ ふるい まものが めを さました らしい。ゆうしゃよ、むらの みんなを たのんだぞ。ほかは なにも いらぬ。',
    kanji: '上の 光る バーが 見えるかの？あれが おぬしの 地図と コンパスじゃ。地図は この世界で おぬしが どこに いるかを 示し、コンパスは 常に 北を 指す。モスワーデンの 脅威に 気をつけるのじゃ。'
  };
  for (const kj of [false, true]) {
    await page.evaluate(k => { window.__GAME_STATE__.player.state.kanjiMode = k; }, kj);
    await page.evaluate(t => { const wm = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); wm.showMessage(t, '長老'); }, kj ? LINES.kanji : LINES.kana);
    await page.waitForTimeout(700);
    const r = await breaks(page, '#qfh-dialog-text');
    await shot(page, `m6-field-message-ja-${kj ? 'kanji' : 'kana'}`);
    rec(`m6 field message box (${kj ? 'kanji' : 'kana'}, direct showMessage): breaks only at spaces/punctuation`, r.length > 0 && r[0].breaks.length > 0 && badBreaks(r).length === 0, { bad: badBreaks(r), lines: r[0] && r[0].breaks.length + 1 });
    await page.keyboard.press('z'); await page.waitForTimeout(500);
    for (let i = 0; i < 5 && await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').showingMessage); i++) { await page.keyboard.press('z'); await page.waitForTimeout(400); }
  }
  // ending band (direct: VictoryScene started from the console)
  await page.evaluate(() => { window.__GAME_STATE__.player.state.kanjiMode = true; const g = window.__PHASER_GAME__; g.scene.start('VictoryScene'); g.scene.stop('WorldMapScene'); });
  await page.waitForTimeout(2500);
  const v = await page.evaluate(() => { const k = document.querySelector('#qok-ui .vic .title-kicker'); return { kicker: k && k.textContent, ui: document.getElementById('qok-ui').innerText.replace(/\s+/g, ' ').slice(0, 200) }; });
  await shot(page, 'm7-ending-ja-kanji');
  rec('m7 ending band in kanji mode is kanji (direct: VictoryScene from the console)', !!v.kicker && v.kicker.includes('達成') && !v.kicker.includes('クリア'), v);
}

// m6 layout guard: the phrase-keeping line-break rule must not push Japanese text off its box or off
// the screen. Every menu tab and the create screen, in kana and kanji.
async function layout(page) {
  const offScreen = () => page.evaluate(() => { const W = innerWidth, out = []; for (const e of document.querySelectorAll('#qok-ui *')) {
    if (e.children.length || !/[\u3040-\u30ff\u4e00-\u9fff]/.test(e.textContent || '')) continue; const r = e.getBoundingClientRect(); if (!r.width) continue;
    if (r.right > W + 1 || r.left < -1) out.push(e.textContent.slice(0, 30) + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + ']'); } return out; });
  for (const kj of [false, true]) {
    const tag = kj ? 'kanji' : 'kana';
    await U.boot(page, { locale: 'ja', kanji: kj, all: false, mapId: 'overworld', x: 69, y: 258, inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'ironSword', quantity: 1 }, { itemId: 'smokeBomb', quantity: 2 }] });
    await page.waitForTimeout(800);
    const bad = [];
    for (let i = 0; i < 4; i++) {
      await tap(page, `#fieldTabs [data-fi="${i}"]`); await page.waitForTimeout(1200);
      if (!(await U.active(page, 'MenuScene'))) { await tap(page, `#fieldTabs [data-fi="${i}"]`); await page.waitForTimeout(1200); }
      await tap(page, `[data-act="tab"][data-i="${i}"]`, 1500); await page.waitForTimeout(600);
      const o = (await offScreen()).concat(await hOverflow(page)); if (o.length) bad.push({ tab: i, o });
      await shot(page, `m6-layout-tab${i}-ja-${tag}`);
      await tap(page, '[data-act="close"]', 2000); await page.waitForTimeout(800);
    }
    rec(`m6 layout ja-${tag}: no Japanese text leaves its box or the screen on the four menu tabs`, bad.length === 0, bad);
  }
}

async function town(page, lang) {
  const LG = U.LANGS[lang], ja = LG.locale === 'ja';
  const { Session, door } = require('../../acts/probe/playthrough/ptlib.cjs');
  const S = new Session('ui-' + lang); S.page = page; S.errors = []; S.ev = (f, a) => page.evaluate(f, a); S.st = () => page.evaluate(() => window.__PTH.state());
  const d = door('greenhollow');
  await U.boot(page, { ...LG, all: false, mapId: 'overworld', x: d.exit[0], y: d.exit[1], activeQuests: ['kikisChallenge'], inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'potion', quantity: 2 }, { itemId: 'leatherCap', quantity: 1 }] });
  await S.inject();
  const inTown = await S.enterTown('greenhollow');
  if (!inTown) return rec(`${lang}: reached Greenhollow`, false);
  const pill = async () => page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); const p = f && f.contentDocument.querySelector('#prompt'); return p ? { text: p.textContent, show: p.dataset.show } : null; });
  // M12: talk pill next to the elder
  const g = await page.evaluate(() => window.__PTH.walkToNpc('elder')); await page.waitForTimeout(700);
  const p = await pill();
  await shot(page, `M12-talk-pill-${lang}`);
  if (ja) rec(`M12 ${lang}: the talk pill is Japanese`, !!p && p.show === 'true' && JA.test(p.text) && !/[A-Za-z]/.test(p.text), { walk: g.why, pill: p });
  else rec(`M12 ${lang}: the talk pill is English`, !!p && p.show === 'true' && /^Talk to /.test(p.text), { walk: g.why, pill: p });
  if (LG.kanji) {
    const tb = await page.evaluate(() => [...document.querySelectorAll('#fieldTabs .ft span')].map(e => e.textContent));
    rec('m7 kanji town: tab bar is kanji', tb.includes('道具') && !tb.includes('どうぐ'), tb);
  }
  // m6: the elder's own words in the box
  if (ja) {
    await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1400);
    const r = await breaks(page, '#qfh-dialog-text');
    await shot(page, `m6-elder-${lang}`);
    rec(`m6 ${lang}: the elder's message breaks only at spaces/punctuation`, r.length > 0 && badBreaks(r).length === 0, { bad: badBreaks(r), text: r[0] && r[0].text });
  }
  await S.dismissAll();
  // shop: stat suffix (m7), Sell tab by finger (8b)
  await page.evaluate(() => window.__PTH.walkToNpc('shopkeeper')); await page.waitForTimeout(600);
  for (let i = 0; i < 4 && !(await U.active(page, 'ShopScene')); i++) { await S.dismissAll(); await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1200); }
  if (!(await U.active(page, 'ShopScene'))) rec(`${lang}: the shop opens`, false);
  else {
    const buy = await page.evaluate(() => [...document.querySelectorAll('#qok-ui [data-act="shopBuy"] .d')].map(e => e.textContent));
    await shot(page, `m7-shop-buy-${lang}`);
    if (ja) rec(`m7 ${lang}: shop stat lines have no English ATK/DEF`, buy.length > 0 && !buy.some(t => /ATK|DEF|SPD/.test(t)), buy);
    const ov = await hOverflow(page); if (ja) rec(`m6 ${lang}: no shop text overflows its box`, ov.length === 0, ov);
    // open and cancel a buy card first, like the census did, with the card's own Cancel button
    await tap(page, '[data-act="shopBuy"][data-i="0"]'); await page.waitForTimeout(600);
    await tap(page, 'button[data-act="shopCancel"]'); await page.waitForTimeout(500);
    const ok = await tap(page, '[data-act="shopMode"][data-mode="sell"]'); await page.waitForTimeout(700);
    const s = await page.evaluate(() => ({ mode: window.__PHASER_GAME__.scene.getScene('ShopScene').mode, on: (document.querySelector('#qok-ui [data-act="shopMode"].on') || {}).dataset, rows: document.querySelectorAll('#qok-ui [data-act="shopSell"]').length }));
    await shot(page, `8b-shop-sell-${lang}`);
    rec(`8b ${lang}: a finger tap on Sell switches to the sell list`, ok && s.mode === 'sell' && s.on && s.on.mode === 'sell' && s.rows > 0, { tapped: ok, ...s });
    await tap(page, 'button[data-act="shopLeave"]'); await page.waitForTimeout(1200);
  }
  await S.dismissAll();
  // healer: price label (nit)
  await page.evaluate(() => { const s = window.__GAME_STATE__.player.state; s.hp = Math.floor(s.maxHp / 3); });
  await page.evaluate(() => window.__PTH.walkToNpc('healer')); await page.waitForTimeout(600);
  await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1500);
  const h = await page.evaluate(() => { const wm = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); const ui = document.getElementById('qok-ui'); const line = [...ui.querySelectorAll('div')].map(e => e.textContent).filter(t => /: ?\d+ G$/.test(t)).sort((a, b) => a.length - b.length)[0]; return { open: !!wm.healerOverlayOpen, line, gold: window.__QOK.Z('menu.gold') }; });
  await shot(page, `nit-healer-${lang}`);
  const want = { en: 'Price', 'ja-kana': 'ねだん', 'ja-kanji': '値段' }[lang];
  rec(`nit ${lang}: the healer card labels the cost as the price`, h.open && !!h.line && h.line.startsWith(want) && !h.line.startsWith(h.gold), h);
  if (h.open) { await tap(page, '[data-act="healCancel"]'); await page.waitForTimeout(800); }
}

(async () => {
  const o = await L.launch({ dpr: 2 }); const page = o.page;
  try {
    if (GROUP === 'title') await title(page);
    else if (GROUP === 'field') await field(page);
    else if (GROUP === 'layout') await layout(page);
    else if (GROUP.startsWith('town-')) await town(page, GROUP.slice(5));
    else rec('group ' + GROUP, false, 'unknown');
  } catch (e) { rec(`${GROUP}: ran to the end`, false, String(e && e.stack || e).slice(0, 400)); }
  await o.browser.close();
  U.finish('ui-japanese ' + GROUP);
})();
