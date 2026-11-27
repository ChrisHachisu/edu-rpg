'use strict';
// Battle stage check (day 4 design review: battles B2 B3 B7 B9 B11 B14, ui-en UE-01 UE-12 UE-13 UE-15 UE-18 UE-19,
// ui-ja UJ-03 UJ-05 UJ-06). Guards:
//   bg    one regular fight in every dungeon stands on that dungeon's backdrop (never the meadow), and its boss is
//         drawn larger than that regular enemy
//   zone  one fight in every overworld encounter zone stands on the zone's backdrop (zone first, latitude as fallback)
//   fit   every one of the 75 enemies, at the command menu and in the quiz, in the keypad and the four-button layout,
//         on 390x844 and 375x667: the painted figure is clear of the name bar and of the box below it; small creatures
//         are drawn smaller than a regular one; the size table in ui-overhaul.js matches the sprite files
//   vic   victory is a celebration (stars, gold headline, EXP and gold tiles), a level up is its own beat, a boss win is
//         the larger version, in EN, kana and kanji; it ends by itself as fast as the plain box did; qok-victory-grand=0
//         brings the plain box back
//   quiz  a short mode tag (icon + Attack / Defend) instead of the story header, the question is the largest text in the
//         four-button card and its answer digits are at least as large; qok-quiz-tag=0 brings the header back
//   hud   command bar without the stray hairline, labels / HP figure / enemy name at a reading size, a ground shadow at
//         the feet (smaller under a flyer) and no sticker glow, floating numbers outlined and above the sprite, the
//         defeated sprite does not rotate
//   ja    Japanese battle messages: one sentence per line, "Nの ダメージ" never parted, a phrase with no spaces still
//         inside the box padding (kana and kanji); with qok-quiz-tag=0 the kana header breaks between its sentences
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5502/ node scripts/auto/checks/battle-stage.cjs [group ...]
// groups: table bg1 bg2 bg3 zone fit-kp-844a fit-kp-844b fit-kp-667a fit-kp-667b fit-4b-844a fit-4b-844b fit-4b-667a fit-4b-667b vic vic-ja quiz hud ja
// UI_SHOTS=<dir> writes JPEG screenshots. Battles are launched as the bundle's startBattle does, from a seeded save.
const { spawnSync } = require('child_process');
const path = require('path');
const B = require('../battle/blib.cjs');
const { U, L } = B;
const { rec, shot } = U;
const FIT_GROUPS = []; for (const lay of ['kp', '4b']) for (const vp of ['844', '667']) for (const half of ['a', 'b']) FIT_GROUPS.push(`fit-${lay}-${vp}${half}`);
// U2 groups (follow-ups from the review of the day 4 changes): kpq d4off tablet-p tablet-l u2
const GROUP = U.runGroups(__filename, ['table', 'bg1', 'bg2', 'bg3', 'zone', ...FIT_GROUPS, 'vic', 'vic-ja', 'quiz', 'hud', 'ja', 'kpq', 'd4off', 'tablet-p', 'tablet-l', 'u2'], 'battle-stage');

// dungeon -> [its backdrop, one regular enemy of its table, its boss]
const DUNGEON = {
  sunkenCellar: ['coast', 'crab', 'giantCrab'], whisperingWoodsCave: ['forest', 'wolf', 'mosswarden'], coastalReef: ['coast', 'crab', 'coralTitan'],
  mistyGrotto: ['cave_misty', 'bandit', 'giantToad'], crystalCave: ['cave_misty', 'spider', 'serpent'], ironMine: ['mountains', 'golem', 'oreColossus'],
  stormNest: ['storm_peak', 'harpy', 'stormHarpy'], hauntedForest: ['haunted_wood', 'thornvineLurker', 'phantomStag'], frozenLake: ['frozen', 'frostWolf', 'iceWyrm'],
  shadowCave: ['cave_misty', 'wyvern', 'dragon'], oasisDepths: ['desert', 'merfolk', 'sandSerpentQueen'], desertTomb: ['tomb_ruins', 'mummy', 'sandGolem'],
  banditHideout: ['canyon', 'bandit', 'banditLord'], scorchedRuins: ['desert', 'skeleton', 'ashenGuardian'], emberMines: ['magma', 'lizard', 'magmaBeetleKing'],
  magmaTunnels: ['magma', 'flameBat', 'lavaWyrm'], obsidianCavern: ['obsidian', 'demon', 'crystalHydra'], volcanicForge: ['magma', 'lavaGolem', 'flameTitan'],
  demonBarracks: ['demon_castle', 'darkKnight', 'warGeneralMalachar'], voidRift: ['void', 'voidShade', 'nullDevourer'], demonCastle: ['demon_castle', 'chimera', 'demonKing'],
  stormreachSpire: ['storm_peak', 'stormRaptor', 'stormSentinel'], frostfallCavern: ['frozen', 'glacialGolem', 'frostMonarch'],
  sunkenTempleDungeon: ['tomb_ruins', 'templeGuard', 'swordWraith'], twilightDungeon: ['void', 'voidShade', 'celestialGuardian'],
};
// overworld zone -> [backdrop, one enemy of the zone]. Act 5's open ground is dead thorn wood, Act 4's is ash and lava.
const ZONE = { 'greenhollow-plains': ['grass_plains', 'slime'], 'whispering-woods': ['forest', 'wolf'], 'crystal-coast': ['coast', 'crab'], 'iron-mountains': ['mountains', 'harpy'],
  'scorched-wastes': ['desert', 'knight'], 'scorched-wastes@act4': ['magma', 'lizard'], 'demons-threshold': ['haunted_wood', 'chimera'] };
const MONSTERS = ['ancientSphinx', 'ashenGuardian', 'bandit', 'banditArcher', 'banditLord', 'bat', 'blizzardBear', 'bruiser', 'bug', 'celestialGuardian', 'chimera', 'cloudWraith', 'coralTitan', 'crab',
  'crystalHydra', 'darkKnight', 'darkSorcerer', 'demon', 'demonKing', 'dragon', 'fireElemental', 'flameBat', 'flameTitan', 'frostMonarch', 'frostStalker', 'frostWolf', 'frozenSkeleton', 'giantCrab',
  'giantToad', 'glacialGolem', 'golem', 'harpy', 'iceSprite', 'iceWyrm', 'jellyfish', 'knifeSneak', 'knight', 'kraken', 'lavaGolem', 'lavaWyrm', 'lich', 'lizard', 'magmaBeetleKing', 'magmaSlime',
  'merfolk', 'mimic', 'mosswarden', 'mummy', 'mushroom', 'nullDevourer', 'oreColossus', 'phantomStag', 'piranha', 'rabbit', 'sandGolem', 'sandSerpentQueen', 'sandWraith', 'seaStar', 'serpent',
  'shadow', 'shadowWisp', 'skeleton', 'slime', 'spider', 'stormHarpy', 'stormRaptor', 'stormSentinel', 'swordWraith', 'templeGuard', 'thornvineLurker', 'voidShade', 'warGeneralMalachar', 'wolf',
  'wraith', 'wyvern'];

// The enemy as DRAWN: the alpha box of the bitmap on screen, in CSS px (measured here, in the check, from the pixels:
// it does not trust the game's own size table). Waits for the HD sprite.
async function drawn(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) { if (await page.evaluate(() => { const i = document.querySelector('#qok-ui img.bmon.hd'); return !!(i && i.complete && i.naturalWidth); })) break; await B.sleep(150); }
  return page.evaluate(() => {
    const img = document.querySelector('#qok-ui img.bmon'); if (!img || !img.naturalWidth) return null;
    const nw = img.naturalWidth, nh = img.naturalHeight, W = 256, H = Math.max(1, Math.round(256 * nh / nw)), c = document.createElement('canvas'); c.width = W; c.height = H;
    const cx = c.getContext('2d'); cx.drawImage(img, 0, 0, W, H); const d = cx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const r = img.getBoundingClientRect(), s = Math.min(r.width / nw, r.height / nh), dw = nw * s, dh = nh * s, ox = r.left + (r.width - dw) / 2, oy = r.bottom - dh;   // contain, bottom centre
    const o = { x: ox + x0 / W * dw, y: oy + y0 / H * dh, r: ox + (x1 + 1) / W * dw, b: oy + (y1 + 1) / H * dh, hd: /\bhd\b/.test(img.className) };
    o.w = o.r - o.x; o.h = o.b - o.y; for (const k in o) if (typeof o[k] === 'number') o[k] = Math.round(o[k] * 10) / 10; return o;
  });
}
const rnd = o => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]));

async function table() {
  // the size table in the served ui-overhaul.js is the one scripts/auto/battle/monster_bounds.py measures from the sprite files
  const js = await (await fetch(L.URL_ + 'ui-overhaul.js')).text();
  const m = /  var MON_BOX = \{\n[\s\S]*?\n  \};/.exec(js);
  const py = spawnSync('python3', [path.join(U.ROOT, 'scripts/auto/battle/monster_bounds.py')], { encoding: 'utf8' });
  if (py.status !== 0) return rec('table: monster_bounds.py runs (python3 + Pillow)', false, (py.stderr || '').slice(-200));
  rec('table: the enemy size table in the served ui-overhaul.js matches the 75 sprite files', !!m && m[0].trim() === py.stdout.trim(), m ? { rows: (m[0].match(/\[/g) || []).length } : 'no MON_BOX in the served file');
}

async function bg(page, ids) {
  for (const id of ids) {
    const [want, reg, boss] = DUNGEON[id];
    try {
      await B.bootMap(page, id);
      await B.launch(page, reg); let s = await B.toMenu(page); await B.sleep(500); s = await B.st(page);
      rec(`bg ${id}: a regular fight (${reg}) stands on ${want}`, s.mon === reg && s.bg === want, { bg: s.bg, mon: s.mon, phase: s.phase });
      const a = await drawn(page); if (id === 'frostfallCavern' || id === 'sunkenTempleDungeon') await shot(page, `bg-${id}`);
      await B.leave(page);
      await B.launch(page, boss); await B.toMenu(page); await B.sleep(500);
      const b = await drawn(page), bx = await B.boxes(page); await B.leave(page);
      const ok = a && b && b.h >= a.h * 1.25 && b.w * b.h >= a.w * a.h * 1.3;
      rec(`bg ${id}: the boss (${boss}) is drawn larger than the regular enemy (${reg})`, !!ok, { regular: a && [Math.round(a.w), Math.round(a.h)], boss: b && [Math.round(b.w), Math.round(b.h)] });
      rec(`bg ${id}: the boss is clear of the name bar and the command bar`, !!(b && bx.name && bx.hud && b.y >= bx.name.b + 4 && b.b <= bx.hud.y + 1), { top: b && Math.round(b.y), nameBottom: bx.name && Math.round(bx.name.b), feet: b && Math.round(b.b), barTop: bx.hud && Math.round(bx.hud.y) });
    } catch (e) { rec(`bg ${id}: reached`, false, String(e).slice(0, 200)); try { await B.leave(page); } catch (e2) {} }
  }
}
async function zone(page) {
  for (const [z, [want, mon]] of Object.entries(ZONE)) {
    try {
      await B.bootZone(page, z);
      const real = await B.zoneHere(page);
      await B.launch(page, mon, real); await B.toMenu(page); await B.sleep(400); const s = await B.st(page);
      rec(`zone ${z}: an overworld fight (${mon}) stands on ${want}`, real === z.split('@')[0] && s.bg === want, { zoneHere: real, bg: s.bg, cell: B.OW[z] });
      if (z === 'demons-threshold') await shot(page, 'zone-demons-threshold');
      await B.leave(page);
    } catch (e) { rec(`zone ${z}: reached`, false, String(e).slice(0, 200)); try { await B.leave(page); } catch (e2) {} }
  }
  // the starter plains around Greenhollow roll the plains table (balance), so they are a meadow, not the deep forest
  await B.boot(page, { mapId: 'overworld', x: 72, y: 270 }); const z0 = await B.zoneHere(page);
  await B.launch(page, 'bug', z0); await B.toMenu(page); await B.sleep(400); const s0 = await B.st(page); await B.leave(page);
  rec('zone starter plains (72,270): the plains table fights on the meadow', z0 === 'greenhollow-plains' && s0.bg === 'grass_plains', { zone: z0, bg: s0.bg });
  // fallback: a zone the table does not know falls back to the latitude band, and the switch restores latitude only
  await B.launch(page, 'bug', 'no-such-zone'); await B.toMenu(page); await B.sleep(400); const s1 = await B.st(page); await B.leave(page);
  rec('zone fallback: an unknown zone uses the latitude band (forest at row 270)', s1.bg === 'forest', { bg: s1.bg });
}

async function fit(page, lay, vp, half) {
  const size = vp === '667' ? { width: 375, height: 667 } : { width: 390, height: 844 };
  await page.setViewportSize(size);
  await B.boot(page, { mapId: 'overworld', x: 72, y: 270, ls: lay === '4b' ? { 'qok-keypad': '0' } : {}, player: { quizDifficulty: '3', def: 9999, atk: 1 } });
  const list = MONSTERS.filter((m, i) => (half === 'a') === (i < 38)), tag = `fit ${lay} ${size.width}x${size.height}`;
  const bad = { menu: [], quiz: [], miss: [] }, sizes = {}; let n = 0;
  for (const id of list) {
    try {
      await B.launch(page, id); await B.toMenu(page);
      const m = await drawn(page), mb = await B.boxes(page);
      if (!m || !mb.name || !mb.hud) { bad.miss.push(id + ':menu'); await B.leave(page); continue; }
      if (!(m.y >= mb.name.b + 4 && m.b <= mb.hud.y + 1 && m.x >= 2 && m.r <= mb.vw - 2)) bad.menu.push(`${id} top ${Math.round(m.y)} (bar ${Math.round(mb.name.b)}) feet ${Math.round(m.b)} (box ${Math.round(mb.hud.y)})`);
      await B.toQuiz(page); await B.sleep(250);
      const q = await drawn(page), qb = await B.boxes(page), s = await B.st(page);
      if (!q || !qb.hud || !(s.kp || s.choices) || (lay === 'kp') !== !!s.kp) { bad.miss.push(id + ':quiz'); await B.leave(page); continue; }
      if (!(q.y >= qb.name.b + 4 && q.b <= qb.hud.y + 1 && q.x >= 2 && q.r <= qb.vw - 2)) bad.quiz.push(`${id} top ${Math.round(q.y)} (bar ${Math.round(qb.name.b)}) feet ${Math.round(q.b)} (box ${Math.round(qb.hud.y)})`);
      sizes[id] = { menu: [Math.round(m.w), Math.round(m.h)], quiz: [Math.round(q.w), Math.round(q.h)] }; n++;
      if (id === 'banditLord' || id === 'rabbit') await shot(page, `fit-${lay}-${vp}-${id}`);
      await B.leave(page);
    } catch (e) { bad.miss.push(id + ':' + String(e).slice(0, 60)); try { await B.leave(page); } catch (e2) {} }
  }
  rec(`${tag} (${half}): all ${list.length} enemies were measured at the menu and in the quiz`, bad.miss.length === 0 && n === list.length, bad.miss.length ? bad.miss.slice(0, 8) : { measured: n });
  rec(`${tag} (${half}): at the command menu every enemy is clear of the name bar, the command bar and the screen edges`, bad.menu.length === 0, bad.menu.length ? bad.menu.slice(0, 6) : undefined);
  rec(`${tag} (${half}): in the quiz every enemy is clear of the name bar and the quiz box`, bad.quiz.length === 0, bad.quiz.length ? bad.quiz.slice(0, 6) : undefined);
  if (half === 'a') {   // both in the first half of the list
    const bear = sizes.blizzardBear, bug = sizes.bug, bat = sizes.bat, golem = sizes.golem;
    rec(`${tag}: small creatures are drawn smaller than a regular one (bug and bat at most 80% of the bear's height)`, !!(bear && bug && bat && bug.menu[1] <= bear.menu[1] * 0.8 && bat.menu[1] <= bear.menu[1] * 0.8), { bear, bug, bat });
    rec(`${tag}: regular enemies share one height band (golem within 8% of the bear)`, !!(bear && golem && Math.abs(golem.menu[1] - bear.menu[1]) <= bear.menu[1] * 0.08), { bear, golem });
  }
}

const vicDom = page => page.evaluate(() => {
  const q = s => document.querySelector('#qok-ui ' + s), R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), h: Math.round(r.height) }; };
  // the headline pops in with a scale animation: its layout box (offsets) is what counts, not the frame the picture happened to catch
  const O = e => { if (!e) return null; let x = 0, y = 0, n = e; while (n) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x: Math.round(x), y: Math.round(y), r: Math.round(x + e.offsetWidth), b: Math.round(y + e.offsetHeight), h: e.offsetHeight }; };
  const v = q('.bvic'), head = q('.bvhead'), msg = q('.msg');
  return { grand: !!v, cls: v ? v.className : '', head: head ? head.textContent : '', headBox: O(head), headSize: head ? parseFloat(getComputedStyle(head).fontSize) : 0, headLines: head ? Math.round(head.offsetHeight / (parseFloat(getComputedStyle(head).lineHeight) || 1)) : 0,
    stars: document.querySelectorAll('#qok-ui .bvstars b').length, rays: !!q('.bvrays'), kick: (q('.bvkick span') || {}).textContent || '', hero: !!q('.bvhero img, .bvhero .qok-spin'), fx: document.querySelectorAll('#qok-ui .bvfx span').length,
    tiles: [...document.querySelectorAll('#qok-ui .bvtile')].map(t => t.textContent), notes: [...document.querySelectorAll('#qok-ui .bvnote')].map(t => t.textContent),
    msg: msg ? msg.innerText : null, vw: innerWidth, monGone: (() => { const m = q('.bmon'); if (!m) return true; const cs = getComputedStyle(m); return cs.visibility === 'hidden' || cs.opacity === '0' || /qok-defeated/.test(m.className) || !!m.closest('.gone'); })() };
});
// Win a fight with one right answer; returns what each beat showed and how long the box stayed up when nobody taps.
async function win(page, mon, { tapAt = 0 } = {}) {
  await B.launch(page, mon); await B.toQuiz(page); await B.sleep(250); await B.answer(page, true);
  let t0 = 0, first = null, level = null, timer = null; const tStart = Date.now();
  while (Date.now() - tStart < 12000) {
    const s = await B.st(page); if (!s.on) break;
    if (!t0 && /Victory!|かった！|勝った！/.test(s.msg)) { t0 = Date.now(); timer = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'), t = b && b._autoAdvanceTimer; window.__btTimer = t || null; return t ? t.delay : null; });
      if (tapAt) {   // tap as soon as the victory beat is painted; `pre` says which beat the tap landed on (a busy box can be late)
        await page.waitForSelector('#qok-ui .bvic', { timeout: 3000 }).catch(() => {});
        const pre = await page.evaluate(() => { const a = window.__QOK_BATTLE_STAGE__, v = a && a.victory && a.victory(); return v ? v.beat : null; });
        if (pre) { level = { late: true }; break; }   // the level beat came up by itself before the tap could be sent: nothing to learn from this try
        await U.tap(page, '[data-act="battleAdvance"]', 1000);
        await B.sleep(350); level = await vicDom(page); level.tapped = true; break; }
      await B.sleep(350); first = await vicDom(page); first.raw = s.msg; }
    if (t0 && !level) { const d = await vicDom(page); if (/\blvl\b/.test(d.cls)) { level = d; level.at = Date.now() - t0; } }
    await B.sleep(70);
  }
  let ended = null;
  if (!tapAt) { while (Date.now() - tStart < 16000) { if (!(await B.st(page)).on) { ended = Date.now() - t0; break; } await B.sleep(60); } }
  else await B.leave(page);
  await B.sleep(400);
  const fired = await page.evaluate(() => { const t = window.__btTimer; return t ? !!t.hasDispatched : null; });   // the scene's own close timer ran out by itself
  return { first, level, ended, timer, fired };
}
async function vic(page, langs) {
  let grand = null;
  for (const lang of langs) {
    const LG = U.LANGS[lang], W = { en: 'Victory!', 'ja-kana': 'たたかいに かった！', 'ja-kanji': '戦いに 勝った！' }[lang];
    const LV = lang === 'en' ? 'Level 5!' : 'レベル5！', EXP = { en: 'EXP', 'ja-kana': 'けいけんち', 'ja-kanji': '経験値' }[lang], GOLD = lang === 'en' ? 'Gold' : 'ゴールド';
    await B.boot(page, { ...LG, mapId: 'overworld', x: 72, y: 270, player: { atk: 9999, level: 4, exp: 99, expToNext: 100, quizDifficulty: '1' } });
    const a = await win(page, 'slime'); const f = a.first || {}, l = a.level || {};
    await shot(page, `vic-end-${lang}`);
    rec(`vic ${lang}: victory is a celebration: three stars, rays, the gold headline "${W}", no plain text box`, !!(f.grand && f.stars === 3 && f.rays && f.head === W && f.msg === null && f.headSize >= 32), { head: f.head, stars: f.stars, rays: f.rays, size: f.headSize, msg: f.msg });
    rec(`vic ${lang}: EXP and gold are two result tiles (+2 ${EXP}, +1 ${GOLD})`, !!(f.tiles && f.tiles.length === 2 && f.tiles[0] === '+2' + EXP && f.tiles[1] === '+1' + GOLD), f.tiles);
    rec(`vic ${lang}: the headline is one line inside the screen`, !!(f.headBox && f.headLines === 1 && f.headBox.x >= 6 && f.headBox.r <= f.vw - 6), { box: f.headBox, lines: f.headLines });
    rec(`vic ${lang}: the level up is its own beat: "${LV}" with the hero in the rays, reached without a tap`, !!(l.grand && /\blvl\b/.test(l.cls || '') && l.head === LV && l.hero && l.at > 300 && l.at < 2200), { head: l.head, hero: l.hero, afterMs: l.at });
    rec(`vic ${lang}: the beaten enemy stays gone through both beats`, !!(f.monGone && l.monGone), { beat1: f.monGone, beat2: l.monGone });
    rec(`vic ${lang}: no added waiting: the scene's own close timer (3 s at most) runs out by itself under the celebration and the fight ends with no tap`, a.timer !== null && a.timer <= 3000 && a.fired === true && a.ended !== null, { timerMs: a.timer, fired: a.fired, endedMs: a.ended });
    if (lang === 'en') grand = a;
    if (lang !== 'ja-kanji') {
      // a tap during beat 1 of a level up turns to the level beat; it never waits
      let tl = {};
      for (let k = 0; k < 4; k++) {   // retried only when the box was too busy to send the tap within the first beat
        await page.evaluate(() => { const p = window.__GAME_STATE__.player.state; p.exp = p.expToNext - 1; });
        tl = (await win(page, 'slime', { tapAt: 1 })).level || {}; if (!tl.late) break; }
      rec(`vic ${lang}: a tap during the victory beat turns straight to the level-up beat`, !!(tl.grand && /\blvl\b/.test(tl.cls || '') && tl.hero), tl.late ? 'the tap could not be sent within the first beat in 4 tries' : { cls: tl.cls, head: tl.head });
      // boss win: the larger version with the boss's name as the kicker and confetti
      const name = await page.evaluate(() => window.__QOK.Z('monster.stormHarpy'));
      const b = await win(page, 'stormHarpy'); const bf = b.first || {};
      rec(`vic ${lang}: a boss win is the larger version (boss name "${name}", confetti, larger headline)`, !!(bf.grand && /\bboss\b/.test(bf.cls || '') && bf.kick === name && bf.fx >= 10 && bf.headSize > f.headSize && bf.headBox && bf.headBox.x >= 6 && bf.headBox.r <= bf.vw - 6), { cls: bf.cls, kick: bf.kick, fx: bf.fx, size: [f.headSize, bf.headSize], box: bf.headBox });
    }
  }
  if (langs.includes('en')) {
    await B.boot(page, { mapId: 'overworld', x: 72, y: 270, ls: { 'qok-victory-grand': '0' }, player: { atk: 9999, level: 4, exp: 99, expToNext: 100, quizDifficulty: '1' } });
    const p = await win(page, 'slime'); const pf = p.first || {};
    // wall-clock times on this box swing by a second with the load, so the comparison is the scene's own timer; the measured times are printed for the reader
    rec('vic: the celebration closes on the same timer as the plain box (same fight, same save)', !!(grand && p.timer !== null && grand.timer === p.timer && p.fired === true && grand.fired === true && p.ended !== null && grand.ended !== null), { grandTimerMs: grand && grand.timer, plainTimerMs: p.timer, measuredGrandMs: grand && grand.ended, measuredPlainMs: p.ended });
    rec('vic switch: qok-victory-grand=0 restores the plain box (Victory / EXP / G / level in one message)', !!(pf.grand === false && pf.msg && /Victory!/.test(pf.msg) && /Gained 2 EXP!/.test(pf.msg) && /Level 5/.test(pf.msg)), { grand: pf.grand, msg: pf.msg });
  }
}

const quizDom = page => page.evaluate(() => {
  const q = s => document.querySelector('#qok-ui ' + s), fs = e => e ? parseFloat(getComputedStyle(e).fontSize) : 0;
  const tag = q('.qtag'), qq = q('.qq'), card = q('.qcard');
  const texts = card ? [...card.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent || '').trim() && !e.closest('.kpdisp')).map(e => ({ c: e.className || e.tagName, s: fs(e) })) : [];
  return { tag: tag ? tag.textContent : null, tagCls: tag ? tag.className : '', tagIcon: tag ? (tag.querySelector('.battleic') || {}).dataset : null, prompt: (q('.qprompt') || {}).textContent || null,
    qSize: fs(qq), qText: qq ? qq.textContent : '', tagBottom: tag ? tag.getBoundingClientRect().bottom : 0, qTop: qq ? qq.getBoundingClientRect().top : 0,
    biggestOther: Math.max(0, ...texts.filter(t => !/\bqq\b/.test(t.c)).map(t => t.s)), answers: [...document.querySelectorAll('#qok-ui .qbtn')].map(b => ({ t: b.textContent, s: fs(b), h: Math.round(b.getBoundingClientRect().height), over: b.scrollWidth > b.clientWidth + 1 })),
    promptLines: [...document.querySelectorAll('#qok-ui .qprompt .ml')].map(e => ({ t: e.textContent, lines: new Set([...e.getClientRects()].map(r => Math.round(r.top))).size })) };
});
async function quiz(page) {
  // keypad layout
  await B.boot(page, { mapId: 'overworld', x: 72, y: 270, player: { atk: 1, def: 0, quizDifficulty: '2' } });
  await B.launch(page, 'slime'); await B.toQuiz(page); await B.sleep(400); let d = await quizDom(page); await shot(page, 'quiz-keypad');
  rec('quiz keypad: a short mode tag (sword icon + "Attack") replaces the story header', d.tag === 'Attack' && /\batk\b/.test(d.tagCls) && d.tagIcon && d.tagIcon.bi === '0' && d.prompt === null && d.tagBottom <= d.qTop + 1, { tag: d.tag, icon: d.tagIcon, prompt: d.prompt });
  rec('quiz keypad: the question is the largest text of the card (the typed answer aside), at least 24 px', d.qSize >= 24 && d.qSize >= d.biggestOther, { q: d.qText, size: d.qSize, other: d.biggestOther });
  await B.answer(page, true); await B.until(page, s => s.phase === 'enemyQuiz' && (s.kp || s.choices > 0)); await B.sleep(400); d = await quizDom(page);
  rec('quiz keypad: on the enemy\'s turn the tag reads "Defend" with the shield', d.tag === 'Defend' && /\bdef\b/.test(d.tagCls) && d.tagIcon && d.tagIcon.bi === '1', { tag: d.tag, icon: d.tagIcon });
  await B.leave(page);
  // four buttons
  await B.boot(page, { mapId: 'overworld', x: 72, y: 270, ls: { 'qok-keypad': '0' }, player: { atk: 1, def: 0, quizDifficulty: '2' } });
  await B.launch(page, 'bug'); await B.toQuiz(page); await B.sleep(400); d = await quizDom(page); await shot(page, 'quiz-buttons');
  rec('quiz buttons: the mode tag is there too', d.tag === 'Attack' && d.prompt === null, { tag: d.tag, prompt: d.prompt });
  rec('quiz buttons: the question is the largest text of the card', d.qSize >= 24 && d.qSize >= d.biggestOther, { q: d.qText, size: d.qSize, other: d.biggestOther });
  rec('quiz buttons: answer digits are at least as large as the question and at least 26 px, inside their buttons', d.answers.length === 4 && d.answers.every(a => a.s >= 26 && a.s >= d.qSize && !a.over && a.h >= 52), { q: d.qSize, answers: d.answers });
  await B.leave(page);
  // switch off: the header returns; in kana it breaks between its two sentences, never inside one (UJ-05)
  await B.boot(page, { ...U.LANGS['ja-kana'], mapId: 'overworld', x: 72, y: 270, ls: { 'qok-quiz-tag': '0' }, player: { atk: 1, def: 0, quizDifficulty: '2' } });
  await B.launch(page, 'slime'); await B.toQuiz(page); await B.sleep(400); d = await quizDom(page); await shot(page, 'quiz-tag-off-kana');
  rec('quiz switch: qok-quiz-tag=0 restores the story header', d.tag === null && !!d.prompt && /ちしきの/.test(d.prompt), { prompt: d.prompt });
  rec('ja kana header (switch off): two sentences, each unbroken on its own line (UJ-05)', d.promptLines.length === 2 && d.promptLines.every(l => l.lines === 1), d.promptLines);
  await B.leave(page);
}

async function hud(page) {
  await B.boot(page, { mapId: 'overworld', x: 72, y: 270, player: { atk: 12, def: 0, level: 4, quizDifficulty: '1', timerEnabled: false } });
  await B.launch(page, 'wolf'); await B.toMenu(page); await B.sleep(500); await shot(page, 'hud-menu');
  const m = await page.evaluate(() => { const q = s => document.querySelector('#qok-ui ' + s), fs = e => e ? parseFloat(getComputedStyle(e).fontSize) : 0, rail = q('.rail');
    const lab = q('.railcmd .lab'), ic = q('.railcmd .ic'), sh = q('.bshadow'), mon = q('.bmon'), fitBox = q('.bfit');
    return { hair: rail ? getComputedStyle(rail, '::after').display : null, lab: fs(lab), labColor: lab ? getComputedStyle(lab).color : '', icon: ic ? ic.getBoundingClientRect().width : 0,
      hp: fs(q('.pbar .bhp')), pname: fs(q('.pbar .bpname')), ename: fs(q('.enemy-card div div')), cmdH: (q('.railcmd') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height,
      shadow: sh ? (r => ({ w: Math.round(r.width), y: Math.round(r.top + r.height / 2) }))(sh.getBoundingClientRect()) : null, feet: fitBox ? Math.round(fitBox.getBoundingClientRect().bottom) : null,
      fitW: fitBox ? Math.round(fitBox.getBoundingClientRect().width) : 0, glow: mon ? getComputedStyle(mon).filter : '' }; });
  rec('hud command bar: no stray hairline under the commands', m.hair === 'none', { after: m.hair });
  rec('hud command bar: labels at least 15 px and bright, glyphs at least 26 px, each command at least 60 px high', m.lab >= 15 && m.icon >= 26 && m.cmdH >= 60 && /rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)/.test(m.labColor), { label: m.lab, color: m.labColor, icon: m.icon, h: m.cmdH });
  rec('hud: the HP figure, the hero line and the enemy name are at least 15 px', m.hp >= 15 && m.pname >= 15 && m.ename >= 15, { hp: m.hp, hero: m.pname, enemy: m.ename });
  rec('hud shadow: a ground shadow lies at the feet line, about 70% of the sprite wide, and the sticker glow is gone', !!(m.shadow && m.feet && Math.abs(m.shadow.y - m.feet) <= 8 && m.shadow.w >= m.fitW * 0.6 && m.shadow.w <= m.fitW * 0.85 && m.glow === 'none'), { shadow: m.shadow, feet: m.feet, sprite: m.fitW, filter: m.glow });
  // a hit on the enemy: the number is outlined and starts above the sprite, under the name bar
  await B.toQuiz(page); await B.sleep(300); await B.answer(page, true);
  let num = null; const t0 = Date.now();
  while (Date.now() - t0 < 6000 && !num) { num = await page.evaluate(() => { const d = document.querySelector('#qok-ui .dmgnum'); if (!d) return null; const r = d.getBoundingClientRect(), cs = getComputedStyle(d), nb = document.querySelector('#qok-ui .enemy-card').getBoundingClientRect();
    // how long the number stays solid: the last keyframe of its float that still has opacity 1 (the old float faded from 18% on)
    let solidTo = 0; const an = cs.animationName; for (const sh of document.styleSheets) { let rules = []; try { rules = sh.cssRules; } catch (e) {} for (const k of rules) if (k instanceof CSSKeyframesRule && k.name === an) for (const f of k.cssRules) if (f.style.opacity === '1') solidTo = Math.max(solidTo, ...f.keyText.split(',').map(parseFloat)); }
    return { t: d.textContent, top: Math.round(parseFloat(d.style.top)), bottom: Math.round(r.bottom), y: Math.round(r.top), size: parseFloat(cs.fontSize), outline: (cs.textShadow.match(/px/g) || []).length, nameBottom: Math.round(nb.bottom), solidTo }; }); if (!num) await B.sleep(40); }
  const during = await drawn(page);   // the sprite as it stands while the number floats (the stage is back at its message height)
  await shot(page, 'hud-number');
  rec('hud number: a hit on the enemy is outlined, at least 32 px, anchored above the sprite and below the name bar', !!(num && during && num.size >= 32 && num.outline >= 16 && num.top <= during.y - 8 && num.y >= num.nameBottom - 2), { num, spriteTop: during && Math.round(during.y) });
  rec('hud number: the number stays solid for at least 60% of its float before it fades', !!(num && num.solidTo >= 60), { solidToPercent: num && num.solidTo });
  // a hit on the player: beside the HP figure, not on the name
  await B.until(page, s => s.phase === 'enemyQuiz' && (s.kp || s.choices > 0)); await B.sleep(300); await B.answer(page, false);
  let pn = null; const t1 = Date.now();
  while (Date.now() - t1 < 9000 && !pn) { pn = await page.evaluate(() => { const d = document.querySelector('#qok-ui .dmgnum.playerhit, #qok-ui .dmgnum.miss'); const hp = document.querySelector('#qok-ui .pbar .bhp'), pb = document.querySelector('#qok-ui .pbar'); if (!d || !pb) return null;
    const h = hp ? hp.getBoundingClientRect() : null, p = pb.getBoundingClientRect(); return { t: d.textContent, x: Math.round(parseFloat(d.style.left)), top: Math.round(parseFloat(d.style.top)), hpX: h ? Math.round(h.left + h.width / 2) : null, barTop: Math.round(p.top) }; }); if (!pn) await B.sleep(40); }
  const em = await msgDom(page);   // "Shadow Wolf attacks! 12 damage!": the English twin of UJ-06
  await shot(page, 'hud-number-player');
  const er = em ? em.rows.map(r => r.t) : [];
  rec('hud message: the English enemy-attack message gives each sentence its own line and keeps the number with "damage!"', !!(em && er.length >= 2 && er.some(t => /^\d+damage!$/.test(t)) && !er.some(t => /[!?][^!?]/.test(t)) && em.rows.every(r => r.pad >= 14)), er.length ? er : (em && em.text));
  rec('hud number: a hit on the player starts over the HP figure, above the player bar', !!(pn && pn.hpX !== null && Math.abs(pn.x - pn.hpX) <= 30 && pn.top < pn.barTop), pn);
  await B.leave(page);
  // a flyer hovers: lifted off the feet line, with a smaller shadow
  await B.launch(page, 'bat'); await B.toMenu(page); await B.sleep(500); await shot(page, 'hud-flyer');
  const f = await page.evaluate(() => { const b = document.querySelector('#qok-ui .bfit'), s = document.querySelector('#qok-ui .bshadow'); if (!b || !s) return null; return { fly: b.classList.contains('fly'), boxBottom: b.getBoundingClientRect().bottom, sw: s.getBoundingClientRect().width / b.getBoundingClientRect().width, op: parseFloat(getComputedStyle(s).opacity) }; });
  const fd = await drawn(page);
  rec('hud flyer: the bat hovers above the feet line over a smaller, fainter shadow', !!(f && fd && f.fly && f.boxBottom - fd.b >= 10 && f.sw <= 0.55 && f.op < 0.8), { f, spriteBottom: fd && fd.b });
  await B.leave(page);
  // the defeated sprite sinks and fades without rotating (UE-19)
  await page.evaluate(() => { window.__GAME_STATE__.player.state.atk = 9999; });
  await B.launch(page, 'slime'); await B.toQuiz(page); await B.sleep(250); await B.answer(page, true);
  let rot = null; const t2 = Date.now(), seen = [];
  while (Date.now() - t2 < 7000) { const s = await page.evaluate(() => { const m = document.querySelector('#qok-ui .bmon.qok-defeated'); if (!m) return null; const t = getComputedStyle(m).transform, k = /matrix\(([^)]+)\)/.exec(t); if (!k) return { b: 0, t }; const p = k[1].split(',').map(Number); return { b: Math.abs(p[1]) + Math.abs(p[2]), t }; });
    if (s) { seen.push(s.b); if (seen.length >= 5) break; } await B.sleep(60); }
  if (seen.length) rot = Math.max(...seen);
  rec('hud defeat: the beaten sprite does not rotate while it falls', seen.length >= 2 && rot < 0.005, { samples: seen.length, skew: rot });
  await B.leave(page);
}

const msgDom = page => page.evaluate(() => {
  const m = document.querySelector('#qok-ui .msg'); if (!m) return null; const cs = getComputedStyle(m), r = m.getBoundingClientRect();
  const inner = { l: r.left + parseFloat(cs.paddingLeft), r: r.right - parseFloat(cs.paddingRight) };
  const lines = [...m.querySelectorAll('.ml')].map(e => ({ t: e.textContent, rows: new Set([...e.querySelectorAll('.mw')].map(w => Math.round(w.getBoundingClientRect().top))).size }));
  const words = [...m.querySelectorAll('.mw')].map(w => { const b = w.getBoundingClientRect(); return { t: w.textContent, l: b.left, r: b.right }; });
  // every text row of the box, to see where it broke (works on the plain box too)
  const rows = []; const tw = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); let n;
  while ((n = tw.nextNode())) for (let i = 0; i < n.data.length; i++) { if (/\s/.test(n.data[i])) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); const b = g.getBoundingClientRect(); const y = Math.round(b.top); let row = rows.find(x => Math.abs(x.y - y) < 6); if (!row) rows.push(row = { y, t: '', l: b.left, r: b.right }); row.t += n.data[i]; row.l = Math.min(row.l, b.left); row.r = Math.max(row.r, b.right); }
  return { text: m.innerText, size: parseFloat(cs.fontSize), lines, words, rows: rows.map(x => ({ t: x.t, pad: Math.round(Math.min(x.l - r.left, r.right - x.r)) })), over: words.filter(w => w.l < inner.l - 1 || w.r > inner.r + 1).map(w => w.t) };
});
// Fight on until a message matches; returns its box.
async function findMsg(page, re, { ms = 70000, right = true } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await B.st(page); if (!s.on) { if (Date.now() - t0 < 6000) { await B.sleep(150); continue; } return null; }   // scene.launch starts the scene a frame or more later
    if (s.phase === 'message' && re.test(s.msg)) { await B.sleep(150); const d = await msgDom(page); if (d && re.test(d.text.replace(/\n/g, ' '))) return d; }
    if (s.phase === 'message' || s.phase === 'intro') await B.advance(page);
    else if (s.phase === 'playerMenu') await U.tap(page, '[data-act="battleMenu"][data-i="0"]', 1500);
    else if ((s.phase === 'playerQuiz' || s.phase === 'enemyQuiz') && (s.kp || s.choices)) await B.answer(page, s.phase === 'playerQuiz' ? true : right);
    await B.sleep(160);
  }
  return null;
}
async function ja(page) {
  for (const lang of ['ja-kana', 'ja-kanji']) {
    await B.boot(page, { ...U.LANGS[lang], mapId: 'overworld', x: 72, y: 270, player: { atk: 2, def: 0, level: 4, quizDifficulty: '1' } });
    await B.launch(page, 'rabbit');
    const d = await findMsg(page, /ダメージが/); await shot(page, `ja-enemy-attack-${lang}`); await B.leave(page);
    // "<enemy>の こうげき！ こたえの ちからで ダメージが へった！ Nの ダメージ！": three sentences
    const rows = d ? d.rows.map(r => r.t) : [];
    // a row never holds the end of one sentence and the start of the next; a sentence too long for one row wraps at a phrase space and leaves no short orphan
    const two = rows.filter(t => /[！。？][^！。？]/.test(t)), orphan = rows.filter((t, i) => i > 0 && !/[！。？]$/.test(rows[i - 1]) && t.length < 5);
    rec(`ja ${lang}: the enemy-attack message starts each of its three sentences on a new line, with no orphan phrase (UJ-06)`, !!(d && rows.length >= 3 && rows.length <= 4 && two.length === 0 && orphan.length === 0 && /[！。？]$/.test(rows[rows.length - 1])), rows.length ? rows : (d && d.text));
    rec(`ja ${lang}: the number stays with ダメージ (UJ-06)`, !!(d && rows.some(t => /\d+のダメージ！$/.test(t)) && !rows.some(t => /\d+の$/.test(t))), rows);
    rec(`ja ${lang}: every phrase of the message is inside the box padding`, !!(d && d.over.length === 0 && d.rows.every(r => r.pad >= 14)), d && { over: d.over, pad: d.rows.map(r => r.pad) });
    // the last boss's skill line has no phrase spaces in kanji mode: it must not run edge to edge or split inside a word (UJ-03)
    await B.launch(page, 'demonKing');
    const k = await findMsg(page, /きりを|霧を|はなった|放った/, { ms: 45000 }); await shot(page, `ja-boss-skill-${lang}`); await B.leave(page);
    rec(`ja ${lang}: the boss skill line keeps at least 14 px of padding and never splits a phrase (UJ-03)`, !!(k && k.rows.every(r => r.pad >= 14) && k.over.length === 0 && k.lines.length >= 1 && k.size >= 15), k ? { text: k.text, size: k.size, rows: k.rows, over: k.over } : 'message not reached');
  }
}

// ---------------------------------------------------------------- U2: follow-ups from the review of the day 4 battle changes
// kpq: the question size steps of UE-12 hold on the keypad card (the default layout); a later rule of the same weight overrode them.
async function kpq(page) {
  for (const [w, h] of [[390, 844], [375, 667]]) {
    await page.setViewportSize({ width: w, height: h });
    await B.boot(page, { mapId: 'overworld', x: 72, y: 270, player: { atk: 1, def: 0, quizDifficulty: '2', timerEnabled: false } });
    await B.launch(page, 'wolf'); await B.toQuiz(page); await B.sleep(400);
    // the question on screen is replaced by a text of a known length (direct: BattleScene.quizQuestion.questionText); the card repaints by itself
    const ask = async text => {
      await page.evaluate(t => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); b.quizQuestion.questionText = { en: t, ja: t }; }, text); await B.sleep(600);
      return page.evaluate(() => { const q = document.querySelector('#qok-ui .qcard.kp .qq'), c = document.querySelector('#qok-ui .qcard.kp'); if (!q || !c) return null;
        const cs = getComputedStyle(q), cr = c.getBoundingClientRect(), g = document.createRange(); g.selectNodeContents(q); const ink = g.getBoundingClientRect();
        const en = document.querySelector('#qok-ui .bfit') || document.querySelector('#qok-ui .bmon'), nb = document.querySelector('#qok-ui .enemy-card');
        return { text: q.textContent, size: parseFloat(cs.fontSize), rows: new Set([...g.getClientRects()].map(x => Math.round(x.top))).size, inside: ink.left >= cr.left + 8 && ink.right <= cr.right - 8 && q.scrollWidth <= q.clientWidth + 1,
          cardBottom: Math.round(cr.bottom), vh: innerHeight, clear: en && nb ? Math.round(en.getBoundingClientRect().top - nb.getBoundingClientRect().bottom) : null }; });
    };
    const s = await ask('7 + 8 = ?') || {}; await shot(page, `kpq-short-${w}x${h}`);
    const m = await ask('25 + 17 + 8 = ?') || {};
    const l = await ask('What is 3 hundreds, 4 tens and 5 ones?') || {}; await shot(page, `kpq-long-${w}x${h}`);
    rec(`kpq ${w}x${h}: on the keypad card a short question keeps the large size (32 px, one line), a mid one is 28 px, a long one takes the smaller step (24 px, at most two lines), all inside the card`,
      s.size === 32 && s.rows === 1 && s.inside === true && m.size === 28 && m.rows === 1 && m.inside === true && l.size === 24 && l.rows >= 1 && l.rows <= 2 && l.inside === true,
      { short: [s.size, s.rows, s.inside], mid: [m.size, m.rows, m.inside], long: [l.size, l.rows, l.inside] });
    rec(`kpq ${w}x${h}: with either question the keypad card ends on the screen and the enemy is clear of the name bar`, s.cardBottom <= s.vh && l.cardBottom <= l.vh && s.clear >= 0 && l.clear >= 0, { short: [s.cardBottom, s.vh, s.clear], long: [l.cardBottom, l.vh, l.clear] });
    await B.leave(page);
  }
}

// d4off: localStorage qok-d4-ui=0 gives the battle looks of the tree before day 4 for the changes that had no switch (U2-2).
async function d4off(page) {
  await B.boot(page, { mapId: 'overworld', x: 72, y: 270, ls: { 'qok-d4-ui': '0', 'qok-keypad': '0' }, player: { atk: 12, def: 0, level: 4, quizDifficulty: '1', timerEnabled: false } });
  const root = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('qok-d4off'), flag: window.__QOK_D4_UI__ }));
  rec('d4off: qok-d4-ui=0 puts the root class on <html> and turns the JS flag off', root.cls === true && root.flag === false, root);
  await B.launch(page, 'wolf'); await B.toMenu(page); await B.sleep(500); await shot(page, 'd4off-menu');
  const m = await page.evaluate(() => { const q = s => document.querySelector('#qok-ui ' + s), fs = e => e ? parseFloat(getComputedStyle(e).fontSize) : 0, rail = q('.rail');
    return { hair: rail ? getComputedStyle(rail, '::after').display : null, lab: fs(q('.railcmd .lab')), cmdH: Math.round((q('.railcmd') || document.body).getBoundingClientRect().height), icon: Math.round((q('.railcmd .ic') || document.body).getBoundingClientRect().width),
      hp: fs(q('.pbar .bhp')), pname: fs(q('.pbar .bpname')), ename: fs(q('.enemy-card div div')), cmds: [...document.querySelectorAll('#qok-ui .railcmd .lab')].map(e => e.textContent), fit: !!q('.bfit') }; });
  rec('d4off command bar: the hairline is back, labels at most 12.5 px, glyphs 22 px (the bar before day 4)', m.hair !== 'none' && m.lab > 0 && m.lab <= 12.5 && m.icon === 22, { after: m.hair, label: m.lab, icon: m.icon, h: m.cmdH });
  rec('d4off hud: the HP figure is 11 px, the hero line 12 px, the enemy name 14 px', m.hp === 11 && m.pname === 12 && m.ename === 14, { hp: m.hp, hero: m.pname, enemy: m.ename });
  rec('d4off Guard label: with qok-keypad=0 as well the second command reads "Defend" again', m.cmds[1] === 'Defend', m.cmds);
  rec('d4off: a switch with its own key is untouched (qok-enemy-fit still on: the enemy is in its fitted box)', m.fit === true, { bfit: m.fit });
  await B.toQuiz(page); await B.sleep(400);
  const a = await page.evaluate(() => ({ tag: !!document.querySelector('#qok-ui .qtag'), answers: [...document.querySelectorAll('#qok-ui .qbtn')].map(b => ({ t: b.textContent, s: parseFloat(getComputedStyle(b).fontSize), cls: b.className, pad: getComputedStyle(b).paddingTop })) }));
  await shot(page, 'd4off-quiz-buttons');
  rec('d4off answer sizes: the four answers are 17 px with 13 px padding, no size class', a.answers.length === 4 && a.answers.every(x => x.s === 17 && x.pad === '13px' && !/\ba[123]\b/.test(x.cls)), a.answers);
  rec('d4off: qok-quiz-tag keeps working on its own (the mode tag is still there)', a.tag === true, { tag: a.tag });
  await B.answer(page, true);
  let num = null; const t0 = Date.now();
  while (Date.now() - t0 < 6000 && !num) { num = await page.evaluate(() => { const d = document.querySelector('#qok-ui .dmgnum'); if (!d) return null; const cs = getComputedStyle(d);
    return { t: d.textContent, top: Math.round(parseFloat(d.style.top)), size: parseFloat(cs.fontSize), anim: cs.animationName, outline: (cs.textShadow.match(/px/g) || []).length }; }); if (!num) await B.sleep(40); }
  const during = await drawn(page); await shot(page, 'd4off-number');
  rec('d4off floating number: 32 px, the old float and shadow, anchored ON the sprite (below its top edge) as before day 4', !!(num && during && num.size === 32 && num.anim !== 'qok-dmgfloat2' && num.outline < 16 && num.top > during.y + 8), { num, spriteTop: during && Math.round(during.y) });
  await B.leave(page);
  await page.evaluate(() => { window.__GAME_STATE__.player.state.atk = 9999; });
  await B.launch(page, 'slime'); await B.toQuiz(page); await B.sleep(250); await B.answer(page, true);
  const t2 = Date.now(), seen = [];
  while (Date.now() - t2 < 7000) { const s = await page.evaluate(() => { const mo = document.querySelector('#qok-ui .bmon.qok-defeated'); if (!mo) return null; const k = /matrix\(([^)]+)\)/.exec(getComputedStyle(mo).transform); if (!k) return 0; const p = k[1].split(',').map(Number); return Math.abs(p[1]) + Math.abs(p[2]); });
    if (s !== null) { seen.push(s); if (seen.length >= 6) break; } await B.sleep(50); }
  rec('d4off defeat fall: the beaten sprite rotates while it falls, as before day 4', seen.length >= 2 && Math.max(...seen) > 0.02, { samples: seen.length, skew: seen.length ? Math.max(...seen) : null });
  await B.leave(page);
  // the keypad on: Guard stays (it was the keypad's label before day 4 too)
  await B.boot(page, { mapId: 'overworld', x: 72, y: 270, ls: { 'qok-d4-ui': '0' }, player: { atk: 12, def: 0, level: 4, quizDifficulty: '1', timerEnabled: false } });
  await B.launch(page, 'wolf'); await B.toMenu(page); await B.sleep(400);
  const g = await page.evaluate(() => [...document.querySelectorAll('#qok-ui .railcmd .lab')].map(e => e.textContent));
  rec('d4off Guard label: with the keypad on it still reads "Guard"', g[1] === 'Guard', g);
  await B.leave(page);
}

// tablet: on an iPad size the name bar and the HUD carry CSS zoom, and engines disagree on getBoundingClientRect() there (viewport px, or the
// element's own zoomed px). The enemy fit and the number anchors must come out the same under both; the second model is laid over this
// Chromium by replacing getBoundingClientRect for elements under zoom (U2-5).
const ZMODEL = model => {
  const E = Element.prototype; if (!window.__u2Orig) window.__u2Orig = E.getBoundingClientRect; const orig = window.__u2Orig;
  const eff = el => { let z = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const v = parseFloat(getComputedStyle(n).zoom); if (v > 0) z *= v; } return z; };
  if (window.__u2K === undefined) { const p = document.createElement('div'); p.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100px;visibility:hidden;zoom:2'; document.body.appendChild(p); window.__u2K = orig.call(p).height / 200; p.remove(); }
  const ownPx = Math.abs(window.__u2K - 1) > 0.01;   // what this browser itself answers under zoom
  window.__u2True = el => { const r = orig.call(el), z = eff(el), k = (z !== 1 && ownPx) ? 1 / z : 1; return { left: r.left / k, top: r.top / k, right: r.right / k, bottom: r.bottom / k, width: r.width / k, height: r.height / k }; };
  E.getBoundingClientRect = model === 'native' ? orig : function () { const t = window.__u2True(this), z = eff(this), k = model === 'own-px' ? 1 / z : 1; return new DOMRect(t.left * k, t.top * k, t.width * k, t.height * k); };
  const a = window.__QOK_BATTLE_STAGE__; if (a && a.zoomReset) a.zoomReset();
  window.dispatchEvent(new Event('resize'));
  return { native: ownPx ? 'own-px' : 'viewport-px', model };
};
const zmeasure = page => page.evaluate(() => { const T = window.__u2True, q = s => document.querySelector('#qok-ui ' + s), f = q('.bfit'), c = q('.enemy-card'), st = q('.bstage'); if (!f || !c || !st) return null;
  const fr = T(f), cr = T(c), sr = T(st); return { h: Math.round(fr.height), w: Math.round(fr.width), top: Math.round(fr.top), cx: Math.round(fr.left + fr.width / 2), cardBottom: Math.round(cr.bottom), clear: Math.round(fr.top - cr.bottom), feet: Math.round(sr.bottom - fr.bottom), zoom: getComputedStyle(c).zoom }; });
async function tablet(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await B.boot(page, { mapId: 'overworld', x: 72, y: 270, player: { atk: 12, def: 0, level: 30, quizDifficulty: '1', timerEnabled: false } });
  const out = {}; let nat = null;
  for (const model of ['native', 'own-px', 'viewport-px']) {
    const info = await page.evaluate(`(${ZMODEL})(${JSON.stringify(model)})`); nat = info.native;
    await B.launch(page, 'frostMonarch'); await B.toMenu(page); await B.sleep(500); await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await B.sleep(250);
    const o = out[model] = { menu: await zmeasure(page) }; if (model === 'native') await shot(page, `tablet-${w}x${h}-menu`);
    await B.toQuiz(page); await B.sleep(500); await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await B.sleep(250);
    o.quiz = await zmeasure(page); if (model === 'native') await shot(page, `tablet-${w}x${h}-quiz`);
    await B.answer(page, true);
    const t0 = Date.now();
    while (Date.now() - t0 < 6000 && !o.num) { o.num = await page.evaluate(() => { const d = document.querySelector('#qok-ui .dmgnum'); if (!d) return null; const T = window.__u2True, f = document.querySelector('#qok-ui .bfit'), c = document.querySelector('#qok-ui .enemy-card'); if (!f || !c) return null; const fr = T(f), cr = T(c);
      return { x: Math.round(parseFloat(d.style.left)), y: Math.round(parseFloat(d.style.top)), fitCx: Math.round(fr.left + fr.width / 2), fitTop: Math.round(fr.top), cardBottom: Math.round(cr.bottom) }; }); if (!o.num) await B.sleep(40); }
    if (model === 'native') await shot(page, `tablet-${w}x${h}-number`);
    await B.until(page, s => s.phase === 'enemyQuiz' && (s.kp || s.choices > 0)); await B.sleep(300); await B.answer(page, false);
    const t1 = Date.now();
    while (Date.now() - t1 < 9000 && !o.pn) { o.pn = await page.evaluate(() => { const d = document.querySelector('#qok-ui .dmgnum.playerhit, #qok-ui .dmgnum.miss'), hp = document.querySelector('#qok-ui .pbar .bhp'), pb = document.querySelector('#qok-ui .pbar'); if (!d || !hp || !pb) return null; const T = window.__u2True, a = T(hp), p = T(pb);
      return { x: Math.round(parseFloat(d.style.left)), y: Math.round(parseFloat(d.style.top)), hpX: Math.round(a.left + a.width / 2), barTop: Math.round(p.top), vw: innerWidth }; }); if (!o.pn) await B.sleep(40); }
    await B.leave(page);
  }
  await page.evaluate(`(${ZMODEL})("native")`);
  const M = ['native', 'own-px', 'viewport-px'], ok = k => M.every(m => out[m] && out[m][k]), all = (k, fn) => ok(k) && M.every(m => fn(out[m][k], out.native[k]));
  const brief = k => M.map(m => out[m] && out[m][k]);
  rec(`tablet ${w}x${h}: the name bar is under CSS zoom here (so the two rect models differ); this browser's own model is "${nat}"`, ok('menu') && parseFloat(out.native.menu.zoom) > 1, { zoom: out.native.menu && out.native.menu.zoom });
  rec(`tablet ${w}x${h} menu: a tall boss (frostMonarch) is the same size under both rect models and stays below the name bar`, all('menu', (a, n) => Math.abs(a.h - n.h) <= 1 && a.clear >= 8 && a.feet >= -1 && a.h > 100), brief('menu'));
  rec(`tablet ${w}x${h} quiz (the stage is short, so the name bar decides the size): the same size under both rect models, below the name bar, feet on the line`, all('quiz', (a, n) => Math.abs(a.h - n.h) <= 1 && a.clear >= 8 && a.feet >= -1 && a.h > 60), brief('quiz'));
  rec(`tablet ${w}x${h} number: a hit on the enemy starts over the enemy's centre, at least 60 px below the name bar, under both rect models`, all('num', (a, n) => Math.abs(a.x - a.fitCx) <= 2 && a.y >= a.cardBottom + 60 && Math.abs(a.y - n.y) <= 2 && Math.abs(a.x - n.x) <= 2), brief('num'));
  rec(`tablet ${w}x${h} number: a hit on the player starts over the HP figure, above the player bar, under both rect models`, all('pn', (a, n) => Math.abs(a.x - Math.min(a.vw - 44, a.hpX)) <= 2 && a.y < a.barTop && Math.abs(a.y - n.y) <= 2), brief('pn'));
}

// u2: Japanese victory labels without the English tracking (U2-6), the victory dim layer is one screen (U2-7), and the Safari 16.4
// fallback of text-wrap:balance, plain wrapping, cannot overflow the message box in kanji mode (U2-8).
async function u2(page) {
  await B.boot(page, { ...U.LANGS['ja-kanji'], mapId: 'overworld', x: 72, y: 270, player: { atk: 2, def: 0, level: 4, quizDifficulty: '1' } });
  await page.addStyleTag({ content: '#qok-ui .msg .ml{ text-wrap:wrap !important; }' });
  await B.launch(page, 'demonKing');
  const d = await findMsg(page, /ダメージが/, { ms: 60000 }); await shot(page, 'u2-wrap-off-enemy-attack-kanji');
  const tw = await page.evaluate(() => { const e = document.querySelector('#qok-ui .msg .ml'); if (!e) return null; const c = getComputedStyle(e); return c.textWrapStyle || c.textWrap || '?'; });
  const k = await findMsg(page, /きりを|霧を|はなった|放った/, { ms: 45000 }); await shot(page, 'u2-wrap-off-boss-skill-kanji'); await B.leave(page);
  const box = x => !!(x && x.over.length === 0 && x.rows.length >= 1 && x.rows.every(r => r.pad >= 14));
  rec('u2 wrap fallback (kanji, text-wrap:balance switched off): the long enemy-attack message of the last boss stays inside the box padding, no phrase split', box(d) && tw !== 'balance', d ? { textWrap: tw, rows: d.rows, over: d.over } : 'message not reached');
  rec('u2 wrap fallback (kanji, text-wrap:balance switched off): the boss skill line with no phrase spaces stays inside the box padding', box(k) && k.size >= 15, k ? { size: k.size, rows: k.rows, over: k.over } : 'message not reached');
  for (const lang of ['ja-kana', 'en']) {
    await B.boot(page, { ...U.LANGS[lang], mapId: 'overworld', x: 72, y: 270, player: { atk: 9999, level: 4, quizDifficulty: '1' } });
    await B.launch(page, 'stormHarpy'); await B.toQuiz(page); await B.sleep(250); await B.answer(page, true);
    await page.waitForSelector('#qok-ui .bvic .bvkick', { timeout: 12000 }).catch(() => {}); await B.sleep(450);
    const v = await page.evaluate(() => { const q = s => document.querySelector('#qok-ui ' + s), ls = e => e ? getComputedStyle(e).letterSpacing : null, sc = q('.bvscrim'), r = sc && sc.getBoundingClientRect();
      return { kick: (q('.bvkick span') || {}).textContent || null, kickLs: ls(q('.bvkick')), tile: (q('.bvtile span') || {}).textContent || null, tileLs: ls(q('.bvtile span')), ja: document.getElementById('qok-ui').classList.contains('ja'),
        scrim: r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), pos: getComputedStyle(sc).position } : null, vw: innerWidth, vh: innerHeight }; });
    await shot(page, `u2-bosswin-${lang}`); await B.leave(page);
    const s = v.scrim;
    if (lang === 'ja-kana') rec('u2 ja-kana boss win: the boss-name kicker and the tile labels have normal letter spacing (no English tracking on Japanese)', v.ja && !!v.kick && /[぀-ヿ]/.test(v.kick) && (v.kickLs === 'normal' || v.kickLs === '0px') && (v.tileLs === 'normal' || v.tileLs === '0px'), { kick: v.kick, kickLs: v.kickLs, tile: v.tile, tileLs: v.tileLs });
    else rec('u2 en boss win: English keeps its wide tracking on the kicker and the tile labels', !v.ja && parseFloat(v.kickLs) >= 2 && parseFloat(v.tileLs) >= 1, { kick: v.kick, kickLs: v.kickLs, tileLs: v.tileLs });
    rec(`u2 ${lang} victory dim layer: one screen (covers the viewport, at most 64 px beyond it on each side)`, !!s && s.x <= 0 && s.y <= 0 && s.x + s.w >= v.vw && s.y + s.h >= v.vh && s.w <= v.vw + 130 && s.h <= v.vh + 130, { scrim: s, vw: v.vw, vh: v.vh });
  }
}

(async () => {
  if (GROUP === 'table') { await table(); return U.finish('battle-stage table'); }
  const { browser, page, errors } = await L.launch({});
  try {
    const ids = Object.keys(DUNGEON), third = Math.ceil(ids.length / 3);
    if (GROUP === 'bg1') await bg(page, ids.slice(0, third));
    else if (GROUP === 'bg2') await bg(page, ids.slice(third, 2 * third));
    else if (GROUP === 'bg3') await bg(page, ids.slice(2 * third));
    else if (GROUP === 'zone') await zone(page);
    else if (/^fit-/.test(GROUP)) { const m = /^fit-(kp|4b)-(844|667)([ab])$/.exec(GROUP); await fit(page, m[1], m[2], m[3]); }
    else if (GROUP === 'vic') await vic(page, ['en']);
    else if (GROUP === 'vic-ja') await vic(page, ['ja-kana', 'ja-kanji']);
    else if (GROUP === 'quiz') await quiz(page);
    else if (GROUP === 'hud') await hud(page);
    else if (GROUP === 'ja') await ja(page);
    else if (GROUP === 'kpq') await kpq(page);
    else if (GROUP === 'd4off') await d4off(page);
    else if (GROUP === 'tablet-p') await tablet(page, 1024, 1366);
    else if (GROUP === 'tablet-l') await tablet(page, 1366, 1024);
    else if (GROUP === 'u2') await u2(page);
    else rec('unknown group ' + GROUP, false);
    const bad = errors.filter(e => e.t === 'pageerror');
    rec(`${GROUP}: no script errors on the page`, bad.length === 0, bad.slice(0, 3));
  } catch (e) { rec(`${GROUP}: ran to the end`, false, String(e && e.stack || e).slice(0, 400)); }
  await browser.close();
  U.finish('battle-stage ' + GROUP);
})();
