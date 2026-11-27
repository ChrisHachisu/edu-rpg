'use strict';
// Before/after pictures of the battle screen for the owner (day 4 battle fixes). The same scene list is
// run against two builds; every picture is a 780 px wide JPEG named <scene>-<tag>.jpg.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5570/ node scripts/auto/battle/pairs.cjs before <outdir> [scene ...]
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5566/ node scripts/auto/battle/pairs.cjs after  <outdir> [scene ...]
// One Chromium, closed at the end. Scenes: see SCENES below (default: all).
const fs = require('fs'), path = require('path');
const B = require('./blib.cjs');
const { L } = B;
const TAG = process.argv[2], OUT = process.argv[3], WANT = process.argv.slice(4);
if (!TAG || !OUT) { console.error('usage: pairs.cjs <before|after> <outdir> [scene ...]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const KANA = { locale: 'ja', kanji: false }, KANJI = { locale: 'ja', kanji: true };
let page;
async function snap(name) { const f = path.join(OUT, `${name}-${TAG}.jpg`); await page.screenshot({ path: f, type: 'jpeg', quality: 86 }); console.log('shot', f); }
const hold = () => page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); try { b._autoAdvanceTimer && b._autoAdvanceTimer.remove(); } catch (e) {} });   // keep the box up for the camera
const waitSel = (sel, ms = 8000) => page.waitForSelector(sel, { timeout: ms }).then(() => true).catch(() => false);
async function menuShot(name, bootFn, mon, zone) { await bootFn(); await B.launch(page, mon, zone); await B.toMenu(page); await B.sleep(900); await snap(name); await B.leave(page); }
// Win a fight with one right answer and photograph the victory box / beats.
async function win(name, bootFn, mon, { level = false, both = false } = {}) {
  await bootFn({ atk: 9999, level: 4, exp: level ? 99 : 0, expToNext: 100 });
  await B.launch(page, mon); await B.toQuiz(page); await B.sleep(300);
  await B.answer(page, true);
  const t0 = Date.now(); let s;
  while (Date.now() - t0 < 8000) { s = await B.st(page); if (/Victory|かった|勝った/.test(s.msg)) break; await B.sleep(60); }
  await hold();
  if (level && !both) { if (!(await waitSel('#qok-ui .bvic.lvl', 2500))) await B.sleep(200); await B.sleep(750); await snap(name); }
  else { await B.sleep(800); await snap(name); if (both) { if (await waitSel('#qok-ui .bvic.lvl', 2500)) { await B.sleep(750); await snap(name.replace('victory', 'levelup')); } } }
  await B.leave(page);
}
const ow = (o = {}) => p => B.boot(page, { mapId: 'overworld', x: 72, y: 270, ...o, player: { quizDifficulty: '2', ...(p || {}), ...(o.player || {}) } });
const map = (id, o = {}) => p => B.bootMap(page, id, { ...o, player: { quizDifficulty: '2', ...(p || {}), ...(o.player || {}) } });
const zone = (z, o = {}) => p => B.bootZone(page, z, { ...o, player: { quizDifficulty: '2', ...(p || {}), ...(o.player || {}) } });
// A hit, a critical hit or a hit on the player, photographed while the number floats.
async function number(name, kind) {
  await ow({ player: { atk: kind === 'crit' ? 2 : 12, def: 0, level: 4, timerEnabled: kind === 'crit' } })();
  await B.launch(page, kind === 'player' ? 'wolf' : 'bug'); await B.toQuiz(page); await B.sleep(kind === 'crit' ? 100 : 400);
  // For the camera only: the number lives 0.95 s, less than a screenshot can take on a busy box. Freeze it 0.3 s into its float and keep it.
  await page.evaluate(() => { const st = window.setTimeout; window.setTimeout = function (f, ms) { return (ms === 950 || ms === 1100) ? 0 : st.apply(window, arguments); };
    const css = document.createElement('style'); css.textContent = '#qok-ui .dmgnum, #qok-ui .critlabel, #qok-ui .critlabel::before{ animation-delay:-.3s!important; animation-play-state:paused!important; }'; document.head.appendChild(css); });
  if (kind === 'player') { await B.answer(page, true); await B.until(page, s => s.phase === 'enemyQuiz' && (s.kp || s.choices > 0)); await B.sleep(300);
    await page.evaluate(() => document.querySelectorAll('#qok-ui .dmgnum, #qok-ui .critlabel').forEach(e => e.remove()));   // the frozen number of the player's own hit
    await B.answer(page, false); }
  else await B.answer(page, true);
  const ok = await waitSel('#qok-ui .dmgnum' + (kind === 'player' ? '.playerhit' : ''), 9000); await B.sleep(150); await snap(name); if (!ok) console.log('NO NUMBER for', name);
  await B.leave(page);
}
async function quiz(name, bootFn, mon, who = 'player') {
  await bootFn({ def: 0 }); await B.launch(page, mon); await B.toQuiz(page);
  if (who === 'enemy') { await B.answer(page, true); await B.until(page, s => s.phase === 'enemyQuiz' && (s.kp || s.choices > 0)); }
  await B.sleep(700); await snap(name); await B.leave(page);
}
// A battle message in Japanese: fight on until the text matches, then photograph the box.
async function message(name, bootFn, mon, re, right = true) {
  await bootFn({ atk: 3, def: 0 }); await B.launch(page, mon);
  const t0 = Date.now(); let hit = false;
  while (Date.now() - t0 < 60000 && !hit) {
    const s = await B.st(page); if (!s.on) { if (Date.now() - t0 < 6000) { await B.sleep(150); continue; } break; }
    if (re.test(s.msg)) { await hold(); await B.sleep(500); await snap(name); hit = true; break; }
    if (s.phase === 'message' || s.phase === 'intro') await B.advance(page);
    else if (s.phase === 'playerMenu') await B.U.tap(page, '[data-act="battleMenu"][data-i="0"]', 1500);
    else if ((s.phase === 'playerQuiz' || s.phase === 'enemyQuiz') && (s.kp || s.choices)) { await B.answer(page, s.phase === 'playerQuiz' ? true : right); }
    await B.sleep(180);
  }
  if (!hit) console.log('NO MESSAGE for', name); await B.leave(page);
}
const NOKP = { ls: { 'qok-keypad': '0' } };
const SCENES = {
  // B2: regular fights in the portal dungeons
  'bg-sunken-temple': () => menuShot('bg-sunken-temple', map('sunkenTempleDungeon'), 'templeGuard'),
  'bg-frostfall-cavern': () => menuShot('bg-frostfall-cavern', map('frostfallCavern'), 'glacialGolem'),
  'bg-stormreach-spire': () => menuShot('bg-stormreach-spire', map('stormreachSpire'), 'stormRaptor'),
  'bg-twilight-dungeon': () => menuShot('bg-twilight-dungeon', map('twilightDungeon'), 'voidShade'),
  // B3: overworld fights by zone
  'zone-starter-plains': () => menuShot('zone-starter-plains', ow(), 'bug'),
  'zone-crystal-coast': () => menuShot('zone-crystal-coast', zone('crystal-coast'), 'crab'),
  'zone-iron-mountains': () => menuShot('zone-iron-mountains', zone('iron-mountains'), 'harpy'),
  'zone-scorched-wastes-act3': () => menuShot('zone-scorched-wastes-act3', zone('scorched-wastes'), 'knight'),
  'zone-scorched-wastes-act4': () => menuShot('zone-scorched-wastes-act4', zone('scorched-wastes@act4'), 'lizard'),
  'zone-demons-threshold': () => menuShot('zone-demons-threshold', zone('demons-threshold'), 'chimera'),
  // UE-01
  'victory-en': () => win('victory-en', ow(), 'slime'),
  'victory-ja-kana': () => win('victory-ja-kana', ow(KANA), 'slime'),
  'victory-ja-kanji': () => win('victory-ja-kanji', ow(KANJI), 'slime'),
  'levelup-en': () => win('levelup-en', ow(), 'slime', { level: true }),
  'levelup-ja-kana': () => win('levelup-ja-kana', ow(KANA), 'slime', { level: true }),
  'bosswin-en': () => win('bosswin-en', map('stormNest'), 'stormHarpy'),
  'bosswin-ja-kana': () => win('bosswin-ja-kana', map('stormNest', KANA), 'stormHarpy'),
  'bosswin-levelup-en': () => win('bosswin-levelup-en', map('stormNest'), 'stormHarpy', { level: true }),
  // B7 / B9 / B14: size, shadow, command bar (the command menu)
  'size-rabbit': () => menuShot('size-rabbit', ow(), 'rabbit'),
  'size-blizzard-bear': () => menuShot('size-blizzard-bear', map('frozenLake'), 'blizzardBear'),
  'size-flame-bat': () => menuShot('size-flame-bat', map('magmaTunnels'), 'flameBat'),
  'size-lava-wyrm-boss': () => menuShot('size-lava-wyrm-boss', map('magmaTunnels'), 'lavaWyrm'),
  'size-sea-serpent-boss': () => menuShot('size-sea-serpent-boss', map('crystalCave'), 'serpent'),
  'shadow-frost-wolf': () => menuShot('shadow-frost-wolf', map('frozenLake'), 'frostWolf'),
  'shadow-bat-flyer': () => menuShot('shadow-bat-flyer', map('mistyGrotto'), 'bat'),
  'shadow-jellyfish-flyer': () => menuShot('shadow-jellyfish-flyer', map('coastalReef'), 'jellyfish'),
  // B11: arena bosses on their dais
  'arena-frost-monarch': () => menuShot('arena-frost-monarch', map('frostfallCavern'), 'frostMonarch'),
  'arena-sword-wraith': () => menuShot('arena-sword-wraith', map('sunkenTempleDungeon'), 'swordWraith'),
  'arena-celestial-guardian': () => menuShot('arena-celestial-guardian', map('twilightDungeon'), 'celestialGuardian'),
  'arena-demon-king': () => menuShot('arena-demon-king', map('demonCastle'), 'demonKing'),
  'arena-storm-sentinel': () => menuShot('arena-storm-sentinel', map('stormreachSpire'), 'stormSentinel'),
  // UE-15
  'number-hit': () => number('number-hit', 'hit'),
  'number-critical': () => number('number-critical', 'crit'),
  'number-player-hit': () => number('number-player-hit', 'player'),
  // UE-12 / UE-13 / UJ-05
  'quiz-keypad-en': () => quiz('quiz-keypad-en', ow(), 'slime'),
  'quiz-keypad-defend-en': () => quiz('quiz-keypad-defend-en', ow({ player: { atk: 1 } }), 'slime', 'enemy'),
  'quiz-keypad-ja-kana': () => quiz('quiz-keypad-ja-kana', ow(KANA), 'slime'),
  'quiz-buttons-en': () => quiz('quiz-buttons-en', ow(NOKP), 'bug'),
  'quiz-buttons-ja-kana': () => quiz('quiz-buttons-ja-kana', ow({ ...KANA, ...NOKP }), 'bug'),
  // UJ-06 / UJ-03
  'msg-enemy-attack-ja-kanji': () => message('msg-enemy-attack-ja-kanji', ow(KANJI), 'rabbit', /ダメージが/),
  'msg-enemy-attack-ja-kana': () => message('msg-enemy-attack-ja-kana', ow(KANA), 'rabbit', /ダメージが/),
  'msg-enemy-attack-en': () => message('msg-enemy-attack-en', ow(), 'wolf', /attacks!/, false),
  'msg-boss-skill-ja-kanji': () => message('msg-boss-skill-ja-kanji', map('demonCastle', KANJI), 'demonKing', /毒の霧|放った/),
  // UE-19: the defeated sprite 0.3 s into its 0.6 s collapse. The real thing is over before a screenshot can be taken on a busy box, so the
  // game's own defeat class is put on the sprite at the command menu and its animation is frozen at 0.3 s (for the camera only).
  'defeat-mid-en': async () => {
    await map('frozenLake')(); await B.launch(page, 'frostWolf'); await B.toMenu(page); await B.sleep(900);
    const ok = await page.evaluate(() => { const m = document.querySelector('#qok-ui .bmon'); if (!m) return false; m.style.animationDelay = '-300ms'; m.style.animationPlayState = 'paused'; m.classList.add('qok-defeated'); const f = m.closest('.bfit'); if (f) f.classList.add('down'); return true; });   // .down: the ground shadow goes with it, as in play
    await B.sleep(250); await snap('defeat-mid-en'); if (!ok) console.log('NO SPRITE for defeat-mid-en'); await B.leave(page); },
};
(async () => {
  const list = WANT.length ? WANT : Object.keys(SCENES);
  const o = await L.launch({ dpr: 2 }); page = o.page;
  for (const n of list) { const f = SCENES[n]; if (!f) { console.log('unknown scene', n); continue; } try { await f(); } catch (e) { console.log('ERR', n, String(e).slice(0, 300)); try { await B.leave(page); } catch (e2) {} } }
  if (o.errors.length) console.log('page errors:', JSON.stringify(o.errors.slice(0, 6)));
  await o.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
