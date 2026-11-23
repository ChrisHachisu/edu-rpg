'use strict';
// Field HUD check (track F1, census 2026-11-23). Guards:
//   M15  the Quests panel folds to its icon when there is no active quest, opens when a quest becomes
//        active, keeps the player's own tap after that, and the old always-open behaviour returns
//        with localStorage['qok-quests-autocollapse']='0'
//   m18  the "Saved" pill never covers the compass or the HP bar
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5502/ node scripts/auto/checks/ui-hud.cjs [group ...]
// groups: quests quests-off saved. UI_SHOTS=<dir> writes JPEG screenshots.
// Real: Continue from a seeded save, finger taps on the panel's header. Direct (said on the line): a
// quest is started with the bundle's own questManager.startQuest(), and the Saved pill is flashed
// with __QOK_SAVES__.flashSaved() (the call every auto save makes).
const U = require('./_uilib.cjs');
const { L, rec, shot } = U;
const GROUP = U.runGroups(__filename, ['quests', 'quests-off', 'saved'], 'ui-hud');

const panel = page => page.evaluate(() => { const q = document.getElementById('qfh-quest'), c = document.getElementById('qfh-quest-content');
  if (!q) return null; const r = q.getBoundingClientRect(); return { collapsed: q.classList.contains('collapsed'), contentHidden: !!(c && c.hidden), w: Math.round(r.width), h: Math.round(r.height), text: (c && c.innerText || '').slice(0, 60) }; });
const startQuest = (page, id) => page.evaluate(id => { const gs = window.__GAME_STATE__, st = gs.player.state; try { gs.questManager.startQuest(id, st); } catch (e) {} if (!st.activeQuests.includes(id)) st.activeQuests.push(id); return st.activeQuests.slice(); }, id);
const finishQuest = (page, id) => page.evaluate(id => { const st = window.__GAME_STATE__.player.state; st.activeQuests = st.activeQuests.filter(q => q !== id); return st.activeQuests.slice(); }, id);

async function quests(page, off) {
  await U.boot(page, { locale: 'en', all: false, mapId: 'overworld', x: 69, y: 258, activeQuests: [] }, { extra: off ? { 'qok-quests-autocollapse': '0' } : {} });
  await page.waitForTimeout(1200);
  const p0 = await panel(page);
  if (off) {
    rec('M15 kill switch (qok-quests-autocollapse=0): "No active quests" panel stays open as before', !!p0 && !p0.collapsed && !p0.contentHidden, p0);
    return;
  }
  await shot(page, 'M15-field-no-quests');
  rec('M15 no active quests: the panel is folded to its icon', !!p0 && p0.collapsed && p0.contentHidden && p0.w <= 60, p0);
  await startQuest(page, 'owlsLesson'); await page.waitForTimeout(800);
  const p1 = await panel(page);
  rec('M15 a quest becomes active (direct: questManager.startQuest): the panel opens', !!p1 && !p1.collapsed && !p1.contentHidden, p1);
  await shot(page, 'M15-field-quest-started');
  await page.locator('#qfh-quest-toggle').tap(); await page.waitForTimeout(700);
  const p2 = await panel(page);
  rec('M15 a finger tap on the header folds it', !!p2 && p2.collapsed, p2);
  await page.waitForTimeout(1500);
  const p3 = await panel(page);
  rec('M15 ...and it stays folded (the player\'s choice holds)', !!p3 && p3.collapsed, p3);
  await page.locator('#qfh-quest-toggle').tap(); await page.waitForTimeout(700);
  await finishQuest(page, 'owlsLesson'); await page.waitForTimeout(800);
  const p4 = await panel(page);
  rec('M15 player opened it by hand; the last quest ending does not fold it against that choice', !!p4 && !p4.collapsed, p4);
  await page.locator('#qfh-quest-toggle').tap(); await page.waitForTimeout(600);
  await startQuest(page, 'kikisChallenge'); await page.waitForTimeout(800);
  const p5 = await panel(page);
  rec('M15 a new quest re-opens a folded panel', !!p5 && !p5.collapsed, p5);
}

async function saved(page) {
  for (const [lang, LG] of [['en', U.LANGS.en], ['ja-kana', U.LANGS['ja-kana']]]) {
    await U.boot(page, { ...LG, all: false, mapId: 'overworld', x: 69, y: 258 });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__QOK_SAVES__.flashSaved()); await page.waitForTimeout(350);
    const r = await page.evaluate(() => { const R = e => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
      const badge = document.getElementById('qok-saved-badge'); return { badge: R(badge), op: badge && getComputedStyle(badge).opacity, compass: R(document.getElementById('qfh-compass')), hp: R(document.querySelector('#qok-field-hud .qfhp')), map: R(document.getElementById('qfh-map')) }; });
    const hit = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    await shot(page, `m18-saved-${lang}`);
    rec(`m18 ${lang}: the Saved pill (direct flashSaved) shows and covers neither the compass nor the HP bar`, !!r.badge && +r.op > 0.5 && !!r.compass && !hit(r.badge, r.compass) && !hit(r.badge, r.hp) && !hit(r.badge, r.map), r);
  }
}

(async () => {
  const o = await L.launch({ dpr: 2 }); const page = o.page;
  try {
    if (GROUP === 'quests') await quests(page, false);
    else if (GROUP === 'quests-off') await quests(page, true);
    else if (GROUP === 'saved') await saved(page);
    else rec('group ' + GROUP, false, 'unknown');
  } catch (e) { rec(`${GROUP}: ran to the end`, false, String(e && e.stack || e).slice(0, 400)); }
  await o.browser.close();
  U.finish('ui-hud ' + GROUP);
})();
