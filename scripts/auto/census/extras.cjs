'use strict';
// Day 4 extras, run against today's tree (PROBE_URL=http://127.0.0.1:5570/), indexed with tree "day4":
//   * the battle quiz screen (keypad) at grades K, 2, 4, 6 in en, ja-kana, ja-kanji, each with the LONGEST question the bank
//     produced in 600 draws for that grade (to see whether long questions fit the box);
//   * the title screen on a first launch (empty storage), in each language.
//   node scripts/auto/census/extras.cjs
const C = require('./clib.cjs');
const { L } = C;
const page0 = {};
async function title(page, lang) {
  await page.goto(L.URL_, { waitUntil: 'domcontentloaded' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
  await L.toTitle(page); await page.waitForTimeout(1800);
  if (lang.locale === 'ja') { await page.locator('[data-act="titleLang"]').first().tap().catch(() => {}); await page.waitForTimeout(800);
    if (lang.kanji) { await page.evaluate(() => { try { window.__GAME_STATE__.player.state.kanjiMode = true; } catch (e) {} }); await page.locator('[data-act="titleLang"]').first().tap().catch(() => {}); await page.locator('[data-act="titleLang"]').first().tap().catch(() => {}); await page.waitForTimeout(800); } }
  await C.snap(page, `day4-title-first-launch-${lang.tag}`, { area: 'ui', tree: 'day4', lang: lang.tag, shows: 'title screen on a first launch (empty storage), tree day4', how: 'localStorage cleared, boot' });
}
async function quiz(page, lang, g) {
  await C.boot(page, { locale: lang.locale, kanji: lang.kanji, mapId: 'overworld', x: 72, y: 270, mutate: s => { Object.assign(s.player, { quizDifficulty: g, level: 50, hp: 9999, maxHp: 9999, timerEnabled: false }); } });
  const q = await page.evaluate(g => { const m = window.__GAME_STATE__.quizManager; m.setDifficulty(g); const zones = ['greenhollow-plains', 'iron-mountains', 'scorched-wastes', 'magma-tunnels', 'demon-castle']; let best = null, bl = -1;
    for (let i = 0; i < 600; i++) { const x = m.getQuestion(zones[i % 5], i % 7 === 0), l = (x.questionText.en || '').length + (x.questionText.ja || '').length; if (l > bl) { bl = l; best = x; } }
    window.__LONGQ = best; m.getQuestion = () => JSON.parse(JSON.stringify(window.__LONGQ)); return { en: best.questionText.en, ja: best.questionText.ja, grade: best.gradeLevel }; }, g);
  await page.evaluate(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });
  const t0 = Date.now(); let dir = 1; while (Date.now() - t0 < 45000 && !(await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene')))) { await L.stick(page, dir, 0, 900); dir = -dir; }
  const t1 = Date.now();
  while (Date.now() - t1 < 40000) {
    const s = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); return { on: window.__PHASER_GAME__.scene.isActive('BattleScene'), ph: b && b.phase, q: !!document.querySelector('#qok-ui .kpad') }; });
    if (!s.on) break;
    if (s.ph === 'playerMenu') { await page.locator('[data-act="battleMenu"][data-i="0"]').first().tap().catch(() => {}); await page.waitForTimeout(700); continue; }
    if (s.q) { await page.waitForTimeout(600); await C.snap(page, `day4-quiz-keypad-grade${g}-${lang.tag}`, { area: 'ui', tree: 'day4', lang: lang.tag, shows: `battle quiz with the keypad, grade ${g.toUpperCase()}, the longest of 600 drawn questions: "${q.en}" / "${q.ja}"`, how: 'getQuestion replaced by the longest draw, real encounter' }); return; }
    await page.waitForTimeout(300);
  }
  C.log('no quiz', g, lang.tag);
}
(async () => {
  const { browser, page } = await C.open();
  for (const lang of C.LANGS) { try { await title(page, lang); } catch (e) { C.log('title err', lang.tag, String(e).slice(0, 100)); } }
  for (const lang of C.LANGS) for (const g of ['k', '2', '4', '6']) { try { await quiz(page, lang, g); } catch (e) { C.log('quiz err', g, lang.tag, String(e).slice(0, 100)); } }
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
