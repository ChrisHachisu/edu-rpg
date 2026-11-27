'use strict';
// Words check (day 4, track T). Guards the text fixes of the words audit (autoloop/day4/words/REPORT.md):
//   (a) every text key the game and the overrides can show resolves to real text (never "[key]", "" or the key)
//   (b) kana mode shows no kanji
//   (c) Japanese modes show no leftover English in the strings fixed: the loading veil and the town hint
//   (d) each fixed P1 string (W1-W13, W17) reads as fixed, in the mode it concerns
//   (e) each glossary term has ONE name per mode, in the text tables and on the way to the screen
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5565/ node scripts/auto/checks/words.cjs [group ...]
// groups: en ja-kana ja-kanji (each its own Chromium, one at a time).
//
// Real: boot from a seeded save, Z() as the overlay and the dungeon modules call it, the real
// WorldMapScene.handlePitFall(), a Phaser Text made the way the bundle makes its message boxes (setText),
// the loading veil and the town frame as the game builds them. Direct (said on the line): the bundle's
// own "[key]" lines for the lava, the pit treasure and a Frostfall plaque are shown through showMessage()
// with the exact text the bundle passes (the bundle only reaches them on a pit, a lava tile, a plaque tile);
// the failure line of the veil is written the way dq-tiles.js writes it.
// Source reads (said on the line): the defeat note lives in ui-overhaul.js's renderDefeat, which needs a
// lost fight; the Magma barrier rule is read from the bundle's boss rewards.
const fs = require('fs'), path = require('path'), http = require('http');
const U = require('./_uilib.cjs');
const { L, rec, tap, boot } = U;
const ROOT = U.ROOT;
const GROUP = U.runGroups(__filename, ['en', 'ja-kana', 'ja-kanji'], 'words');
const LG = U.LANGS[GROUP];
const KANJI = /[㐀-䶿一-鿿]/;

function get(url) { return new Promise((res, rej) => http.get(url, r => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c).toString('utf8'))); }).on('error', rej)); }
const base = L.URL_.replace(/\/?$/, '/');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', rel), 'utf8'));

// The bundle's tables and the keys its code asks for (read from the served bundle, so the check follows the build under test).
async function bundleInfo() {
  const html = await get(base);
  const m = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/); if (!m) throw new Error('no bundle in ' + base);
  const src = await get(base + 'assets/' + m[1]);
  const at = re => { const x = src.search(re); if (x < 0) throw new Error('table not found ' + re); return x; };
  const a = at(/^const ui = \{/m), b = at(/^\s+fs = \{/m), c = at(/^\s+Da = \{/m), d = at(/^\s+Ba = \{/m);
  const tab = (from, to, head) => new Function('return ({' + src.slice(from, to).replace(head, '').replace(/\}\s*,?\s*$/, '') + '})')();
  const en = tab(a, b, /^const ui = \{/), ja = tab(b, c, /^\s+fs = \{/), kj = tab(c, d, /^\s+Da = \{/);
  const code = new Set();
  for (const r of src.matchAll(/\bZ\(\s*"([A-Za-z0-9_.]+)"\s*[,)]/g)) code.add(r[1]);
  // an item or quest definition names its text keys; an item id that appears once in the whole bundle (its own
  // definition) is never given or sold, so its text can never be shown (redCrystalShard, blueCrystalShard, greenCrystalShard)
  const idUsed = id => (src.match(new RegExp('"' + id + '"', 'g')) || []).length > 1;
  for (const r of src.matchAll(/\b(?:nameKey|descriptionKey|titleKey|dialogueKey)\s*:\s*"([A-Za-z0-9_.]+)"/g)) { const m = r[1].match(/^item\.([A-Za-z0-9]+)(?:\.desc)?$/); if (!m || idUsed(m[1])) code.add(r[1]); }
  return { src, en, ja, kj, code: [...code] };
}
// Keys the overrides can show: the Acts 2-5 index's rows, the town frames' NPC keys, the dungeons' plaques.
function overrideKeys(info) {
  const keys = new Set();
  const man = readJson('acts-hifi/manifest.json');
  for (const k of Object.keys(man.strings || {})) keys.add(k);
  const dir = path.join(ROOT, 'public/act1-hifi/town');
  for (const f of fs.readdirSync(dir).filter(f => /-town\.json$/.test(f))) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (t.nameKey) keys.add(t.nameKey);
    for (const n of t.npcs || []) { if (n.nameKey) keys.add(n.nameKey); if (n.dialogueKey) keys.add(n.dialogueKey); }
  }
  const ids = new Set(Object.keys(readJson('acts-dungeons/manifest.json').dungeons || readJson('acts-dungeons/manifest.json')));
  for (const k of Object.keys(info.en)) { const m = k.match(/^dungeon\.([A-Za-z0-9]+)\.(?:enter|boss\.dialog1|victory)$/); if (m) ids.add(m[1]); }
  return { keys: [...keys], dungeons: [...ids].filter(i => /^[a-z][A-Za-z0-9]+$/.test(i)) };
}

// the glossary: ONE name per mode. canon = what a place or thing is now called; ban = the old names, which must not be shown.
const GLOSSARY = [
  { term: 'Misty Grotto (mistyGrotto)', en: { canon: 'Misty Grotto', ban: /Darkfang Grotto/ }, ja: { canon: 'きりのどうくつ', ban: /くらやみのどうくつ/ }, kj: { canon: '霧の洞窟', ban: /暗闇の洞窟/ } },
  { term: 'Coastal Reef', en: { canon: 'Coastal Reef', ban: null }, ja: { canon: 'さんごのいわば', ban: /さんごしょう|リーフ/ }, kj: { canon: '珊瑚の岩場', ban: /珊瑚礁|リーフ/ } },
  { term: 'Ironkeep', en: { canon: 'Ironkeep', ban: /Ironkeep Fortress/ }, ja: { canon: 'アイアンキープ', ban: /アイアンキープようさい/ }, kj: { canon: 'アイアンキープ', ban: /アイアンキープ要塞/ } },
  { term: 'Magma Cloak', en: { canon: 'Magma Cloak', ban: /Flame Cloak/ }, ja: { canon: 'マグマのマント', ban: /ほのおのマント/ }, kj: { canon: 'マグマのマント', ban: /炎のマント/ } },
  { term: 'Forgemaster', en: { canon: 'Forgemaster', ban: null }, ja: { canon: 'かじのおやかた', ban: /かじし/ }, kj: { canon: '鍛冶の親方', ban: /鍛冶師/ } },
  { term: 'Crystal of Math Knowledge', en: { canon: 'Crystal of Math Knowledge', ban: /Crystal of Wisdom/ }, ja: { canon: 'さんすうのクリスタル', ban: /ちえのクリスタル/ }, kj: { canon: '算数のクリスタル', ban: /知恵のクリスタル/ } },
  { term: 'tripwire', en: { canon: 'tripwire', ban: null }, ja: { canon: 'トリップワイヤー', ban: /トリップワイヤ(?!ー)/ }, kj: { canon: 'トリップワイヤー', ban: /トリップワイヤ(?!ー)/ } },
  { term: 'Bandit Hideout', en: { canon: 'Bandit Hideout', ban: null }, ja: { canon: 'さんぞくのアジト', ban: /あじと/ }, kj: { canon: '山賊のアジト', ban: /山賊の隠れ家/ } },
  { term: 'Sunken Temple', en: { canon: 'Sunken Temple', ban: null }, ja: { canon: 'こだいしんでん', ban: /こだい しんでん/ }, kj: { canon: '古代神殿', ban: /古代 神殿/ } },
  { term: 'Crown of Wisdom', en: { canon: 'Crown of Wisdom', ban: null }, ja: { canon: 'ちえのかんむり', ban: /えいちのかんむり/ }, kj: { canon: '知恵の冠', ban: /叡智の冠/ } },
  { term: 'Storm Sentinel', en: { canon: 'Storm Sentinel', ban: null }, ja: { canon: 'ストームセンチネル', ban: null }, kj: { canon: 'ストームセンチネル', ban: /嵐の番人/ } },
  { term: 'cellar', en: { canon: 'cellar', ban: /crabs in the basement/ }, ja: { canon: 'ちかしつ', ban: null }, kj: { canon: '地下室', ban: null } },
  { term: 'four lands', en: { canon: 'four lands', ban: /across 4 lands/ }, ja: { canon: '4つの くに', ban: /よんだいりく/ }, kj: { canon: '4つの 国', ban: /四大陸/ } },
  { term: 'monster', en: { canon: 'monsters', ban: null }, ja: { canon: 'モンスター', ban: /まものが てごわい/ }, kj: { canon: 'モンスター', ban: /魔物が 手ごわい/ } },
  { term: 'kanji readings (hard words)', en: { canon: null, ban: null }, ja: { canon: null, ban: /せいぶつ|さんじゅうの|じゅんぷうまんぱん|せんめつ|げんそ/ }, kj: { canon: null, ban: /大王烏賊|海月|飛竜|洞窟蜘蛛|嵐の猛禽|闇狼|氷狼|皮の鎧|皮の帽子|殲滅/ } }
];
const MODE = { en: 'en', 'ja-kana': 'ja', 'ja-kanji': 'kj' }[GROUP];

async function main(page) {
  const info = await bundleInfo();
  const ov = overrideKeys(info);
  await boot(page, { locale: LG.locale, kanji: LG.kanji, all: false, mapId: 'overworld', x: 69, y: 258 });
  await page.waitForTimeout(1500);
  const tableKeys = Object.keys(info.en);
  const codeKeys = info.code.filter(k => !tableKeys.includes(k));
  const dungeonPlaques = ov.dungeons.map(d => 'dungeon.' + d + '.plaque').filter(k => tableKeys.some(t => t.startsWith(k.replace(/plaque$/, ''))));
  const allKeys = [...new Set([...tableKeys, ...info.code, ...ov.keys, ...dungeonPlaques])];

  // everything Z answers for every key, as the overlay and modules read it (wrapped) and as the bundle itself would (base)
  const z = await page.evaluate(keys => { const Z = window.__QOK.Z, B = Z.__base || Z, out = {}; for (const k of keys) { let a = null, b = null, t = null; try { a = Z(k); } catch (e) { a = 'THROW ' + e.message; } try { b = B(k); } catch (e) {} try { t = window.__QOK_ACTS_TEXT__ ? window.__QOK_ACTS_TEXT__(k) : null; } catch (e) {} out[k] = [a, b, t]; } return out; }, allKeys);

  // (a) every key resolves
  const bad = k => { const v = z[k][0]; return typeof v !== 'string' || !v.trim() || v === k || /^\[[a-z][A-Za-z0-9]*\.[A-Za-z0-9_.]+\]/.test(v.trim()); };
  const unresolved = allKeys.filter(k => bad(k) && !(z[k][2] && !/^\[/.test(z[k][2])));
  const kinds = k => (tableKeys.includes(k) ? 'table' : ov.keys.includes(k) ? 'override' : dungeonPlaques.includes(k) ? 'plaque' : 'code');
  rec(`(a) ${GROUP}: all ${allKeys.length} text keys (${tableKeys.length} table, ${codeKeys.length} asked for by the code, ${ov.keys.length} from the overrides, ${dungeonPlaques.length} plaques) resolve to real text`,
    unresolved.length === 0, unresolved.map(k => `${k} (${kinds(k)}) -> ${JSON.stringify(z[k][0])}`).slice(0, 14));

  // (b) kana mode shows no kanji
  if (GROUP === 'ja-kana') {
    const leaks = tableKeys.filter(k => KANJI.test(z[k][0] || '')).concat(ov.keys.filter(k => k.indexOf('geo.') !== 0 && KANJI.test(z[k][0] || '') && !tableKeys.includes(k)));
    const man = readJson('acts-hifi/manifest.json').strings || {};
    const rowLeaks = Object.keys(man).filter(k => KANJI.test(man[k].ja || ''));
    rec('(b) ja-kana: no kanji in any of the table rows or the Acts 2-5 index rows read in kana mode', leaks.length === 0 && rowLeaks.length === 0,
      { tables: leaks.slice(0, 10).map(k => k + ': ' + z[k][0].slice(0, 40)), index: rowLeaks.slice(0, 10) });
  }

  // (c) no leftover English in the fixed strings of the Japanese modes: the loading veil and the town hint
  if (MODE !== 'en') {
    const veil = await page.evaluate(() => { const t = document.getElementById('a1a-veil-text'), r = document.getElementById('a1a-veil-retry');
      if (t) t.textContent = 'The world could not load.'; return new Promise(res => setTimeout(() => res({ has: !!t, text: t && t.textContent, retry: r && r.textContent, fail: t && t.textContent }), 150)); });
    const veil2 = await page.evaluate(() => { const t = document.getElementById('a1a-veil-text'); if (t) t.textContent = 'Loading the world...'; return new Promise(res => setTimeout(() => res(t && t.textContent), 150)); });
    const EN = /[A-Za-z]{3,}/;
    rec(`(c) ${GROUP}: the loading veil (line, failure line, Retry) has no English`, veil.has && !EN.test(veil.text || '') && !EN.test(veil.retry || '') && !EN.test(veil2 || ''), { fail: veil.text, retry: veil.retry, loading: veil2 });
    await U.boot(page, { locale: LG.locale, kanji: LG.kanji, all: false, mapId: 'greenhollow', x: 20, y: 30 }).catch(() => {});
    await page.waitForTimeout(5000);
    const hint = await page.evaluate(() => { for (const f of document.getElementsByTagName('iframe')) { try { const s = f.contentDocument.querySelector('#dialogue small'); if (s) return s.textContent; } catch (e) {} } return null; });
    rec(`(c) ${GROUP}: the town frame's dialogue hint has no English`, typeof hint === 'string' && !EN.test(hint), { hint });
    await boot(page, { locale: LG.locale, kanji: LG.kanji, all: false, mapId: 'overworld', x: 69, y: 258 }); await page.waitForTimeout(1200);
  }

  // (d) the fixed P1 strings read as fixed
  const Zv = k => z[k] ? z[k][0] : null;
  const has = (k, s) => (Zv(k) || '').includes(s), not = (k, s) => !(Zv(k) || '').includes(s);
  const D = [];
  const d = (id, ok, note) => D.push([id, ok, note]);
  if (GROUP === 'ja-kanji') d('W1 npc.mercenary kanji says cave, hidden rooms, traps (like EN and kana)', has('npc.mercenary', '洞窟') && has('npc.mercenary', '隠し部屋') && has('npc.mercenary', '罠') && not('npc.mercenary', '崖'), Zv('npc.mercenary'));
  if (GROUP === 'ja-kana') d('W2 npc.skyKeeper kana starts with the tower, not a stray の', /^とうの/.test(Zv('npc.skyKeeper')), Zv('npc.skyKeeper'));
  d('W4 sign.oasisHavenFork names the town once and as its map does', GROUP === 'en' ? has('sign.oasisHavenFork', '← Oasis Haven') : (has('sign.oasisHavenFork', '← ' + Zv('map.oasisHaven')) && not('sign.oasisHavenFork', 'オアシスのオアシス')), Zv('sign.oasisHavenFork'));
  d('W5 map.mistyGrotto and the Port Sapphire sign use the one name', Zv('map.mistyGrotto') === { en: 'Misty Grotto', ja: 'きりのどうくつ', kj: '霧の洞窟' }[MODE] && has('sign.portSapphireFork', Zv('map.mistyGrotto')), Zv('map.mistyGrotto') + ' | ' + Zv('sign.portSapphireFork'));
  d('W6 sign.portSapphireFork uses the Misty Grotto and Coastal Reef names', has('sign.portSapphireFork', { en: 'Coastal Reef', ja: 'さんごのいわば', kj: '珊瑚の岩場' }[MODE]), Zv('sign.portSapphireFork'));
  if (MODE !== 'en') d('W7 spike trap: the same plain line in both Japanese modes (a trodden trap, spikes from the floor)', has('dungeon.banditHideout.spikeTrap', 'トゲ') && (has('dungeon.banditHideout.spikeTrap', 'わなを ふんだ') || has('dungeon.banditHideout.spikeTrap', '罠を 踏んだ')), Zv('dungeon.banditHideout.spikeTrap'));
  for (const [id, k] of [['W8', 'mechanic.pitFall'], ['W9', 'mechanic.pitTreasure'], ['W10', 'mechanic.lavaDamage'], ['W11', 'dungeon.frostfallCavern.plaque']]) d(`${id} ${k} is real text`, !bad(k) && (MODE === 'en' ? /^[A-Z]/.test(Zv(k)) : !/[A-Za-z]{4,}/.test(Zv(k))), Zv(k));
  d('W12 npc.oasisElder.name is a name in this mode', !bad('npc.oasisElder.name') && (MODE === 'en' ? Zv('npc.oasisElder.name') === 'Oasis Elder' : /オアシス/.test(Zv('npc.oasisElder.name'))), Zv('npc.oasisElder.name'));
  if (GROUP === 'ja-kana') d('W17 gameover.restart_save is kana', !KANJI.test(Zv('gameover.restart_save')), Zv('gameover.restart_save'));
  d('W48 the Forgemaster quest names the cloak as the item does', has('quest.flameCloak.title', Zv('item.flameCloak')), Zv('quest.flameCloak.title') + ' / ' + Zv('item.flameCloak'));
  for (const [id, ok, note] of D) rec(`(d) ${GROUP}: ${id}`, !!ok, note);

  // (d) on the way to the screen: the real pit fall, and the bundle's own "[key]" lines through showMessage
  const shown = await page.evaluate(async () => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), out = {}, dom = () => (document.querySelector('#qfh-dialog-text') || {}).innerText || '';
    const say = async (name, fn) => { try { fn(); } catch (e) { out[name] = 'THROW ' + e.message; return; } await new Promise(r => setTimeout(r, 450)); out[name] = dom(); w.showingMessage = false; try { w.hideMessage && w.hideMessage(); } catch (e) {} await new Promise(r => setTimeout(r, 150)); };
    const rnd = Math.random; Math.random = () => 0.99;        // the fall shows its own line first; the random treasure or fight comes after
    await say('pitFall', () => w.handlePitFall());
    Math.random = rnd;
    await say('pitTreasure', () => w.showMessage('[mechanic.pitTreasure] +42G'));
    await say('lava', () => w.showMessage('[mechanic.lavaDamage]'));
    await say('plaque', () => w.showMessage('[dungeon.frostfallCavern.plaque]'));
    return out;
  });
  const isRaw = s => /\[[a-z]+\.[A-Za-z.]+\]/.test(s || '') || !(s || '').trim();
  rec(`(d) ${GROUP}: the real pit fall, the pit treasure line, the lava line and the Frostfall plaque show text, not a raw key`, ['pitFall', 'pitTreasure', 'lava', 'plaque'].every(n => !isRaw(shown[n])) && /\+42G/.test(shown.pitTreasure || ''), shown);

  // (e) one name per mode: no old name in any text the game can show, the new name where the rule says, and the bundle's own screens (Phaser text) agree with Z
  const G = GLOSSARY.map(g => ({ term: g.term, ...g[MODE] }));
  const alltext = allKeys.map(k => [k, z[k][0] || '']).filter(([k]) => k.indexOf('geo.') !== 0);
  const conflicts = [];
  for (const g of G) if (g.ban) for (const [k, t] of alltext) if (g.ban.test(t)) conflicts.push(`${g.term}: ${k} still says ${(t.match(g.ban) || [''])[0]}`);
  rec(`(e) ${GROUP}: no old name of a glossary term is shown by any of the ${alltext.length} text keys (${G.filter(g => g.ban).length} terms)`, conflicts.length === 0, conflicts.slice(0, 12));
  const used = G.filter(g => g.canon && !alltext.some(([, t]) => t.includes(g.canon))).map(g => g.term);
  rec(`(e) ${GROUP}: every glossary term is shown under its one name somewhere`, used.length === 0, used);
  // Phaser: the text the bundle draws for each key it changed is what Z gives (setText patch)
  const diff = Object.keys(z).filter(k => z[k][1] && z[k][0] !== z[k][1] && !/\{[a-z]+\}/i.test(z[k][1]) && !/^\[/.test(z[k][1]) && k.indexOf('geo.') !== 0);
  const phaser = await page.evaluate(([diff, raw]) => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), out = []; for (const k of diff) { const t = w.add.text(0, 0, raw[k]); out.push([k, t.text]); t.destroy(); } return out; }, [diff, Object.fromEntries(diff.map(k => [k, z[k][1]]))]);
  const mism = phaser.filter(([k, shownText]) => shownText !== z[k][0]);
  rec(`(e) ${GROUP}: a Phaser text made from the bundle's own text of each of the ${diff.length} changed keys shows the fixed text`, diff.length > 0 && mism.length === 0, mism.slice(0, 6).map(([k, t]) => `${k}: ${t.slice(0, 50)} <> ${z[k][0].slice(0, 50)}`));

  // sources (source reads, said on the line)
  if (GROUP === 'en') {
    const uo = await get(base + 'ui-overhaul.js');
    rec('(d) W13 defeat note (source of ui-overhaul.js renderDefeat) says the HP is full in words a child reads', !/HPは ぜんかい/.test(uo) && /HPは まんたんに/.test(uo), 'source read');
    const rule = /o === "sandGolem" && \(tt\.player\.addItem\("sandstormCloak", 1\), tt\.player\.addItem\("flameCloak", 1\)/.test(info.src) && /Defeat the Sand Golem in the Desert Tomb to claim the Magma Cloak/.test(Zv('overworld.magmaBlocked') || '');
    rec('(d) W3 the Magma barrier line names the rule that holds (the Sand Golem drops the cloak) and the bundle still does that', rule, 'source read of the bundle: sandGolem reward adds flameCloak');
  }
}

(async () => {
  const { browser, page, errors } = await L.launch();
  try { await main(page); }
  catch (e) { rec('words check ran to the end', false, e.stack || String(e)); }
  finally { await browser.close(); }
  U.finish(`words ${GROUP}`);
})();
