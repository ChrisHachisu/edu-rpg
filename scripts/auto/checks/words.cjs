'use strict';
// Words check (day 4, track T). Guards the text fixes of the words audit (autoloop/day4/words/REPORT.md):
//   (a) every text key the game and the overrides can show resolves to real text (never "[key]", "" or the key)
//   (b) kana mode shows no kanji
//   (c) Japanese modes show no leftover English in the strings fixed: the loading veil and the town hint
//   (d) each fixed P1 string (W1-W13, W17) reads as fixed, in the mode it concerns
//   (e) each glossary term has ONE name per mode, in the text tables and on the way to the screen
// Second pass (autoloop/day4/words/REPORT-T2.md):
//   (f) phrase spaces in BOTH Japanese modes: the labels of ui-ja UJ-02, the layer's phrase list (W_SPACE, read from
//       this tree's acts-runtime.js), no long kana run outside a name, as many spaces in kanji mode as in kana mode
//   (e2) one word per meaning: Guard and Defend, the two knights, place names in one piece, plain kanji-mode words
//   (g) on the screen: compass letters, the Japanese literals of ui-overhaul.js, the quit question by real taps, the two
//       knights and the Guard line in battles launched as startBattle does, the Desert Tomb rule from a seeded save in
//       its entrance chamber, the gust lines of the dungeon kit, the hero creation screen from an empty title (kana)
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

// ---------------------------------------------------------------- T2 (second text pass, autoloop/day4/words/REPORT-T2.md)
// (f) labels that were written without phrase spaces (ui-ja UJ-02): [kana, kanji], exact
const T2_LABELS = {
  'title.pressStart': ['エンターキーで スタート', 'エンターキーで スタート'], 'create.title': ['ゆうしゃを つくろう', '勇者を つくろう'],
  'create.namePlaceholder': ['なまえを いれてね…', '名前を 入れてね…'], 'create.startGame': ['ぼうけんに でる', '冒険に 出る'],
  'create.nameRequired': ['なまえを いれてね！', '名前を 入れてね！'], 'settings.difficulty': ['もんだいの むずかしさ', '問題の 難しさ'],
  'settings.timerOff': ['なし（じかん むせいげん）', null], 'menu.noItems': ['どうぐが ない', '道具が ない'],
  'menu.activeQuests': ['すすめている クエスト', '進行中の クエスト'], 'menu.noQuests': ['クエストが ありません', 'クエストが ありません'],
  'quest.objectivesComplete': ['クエストの もくひょう たっせい！', 'クエストの 目標 達成！'], 'quest.offerTitle': ['クエストが あります', 'クエストが あります'],
  'shop.noItemsToSell': ['うる ものが ない', '売る ものが ない'], 'victory.titleScreen': ['タイトルに もどる', 'タイトルに 戻る'],
  'victory.pressEnter': ['エンターキーで もどる', 'エンターキーで 戻る'], 'quest.stolenBook.title': ['ぬすまれた ほん', '盗まれた 本'],
  'npc.frostElder.name': ['しものちょうろう', '霜の長老'], 'npc.oasisElder.name': ['オアシスのちょうろう', 'オアシスの長老'],
  'equip.sandstormCloak.desc': [null, '砂漠の 風で 織られた マント。炎も 氷も 風も 防ぐ。'],
  'victory.ngplus': ['つよくてニューゲーム', '強くてニューゲーム']       // the mode's name: one piece, as ui-japanese.cjs reads it on the slot card
};
// (e2) one word per meaning, second pass. canon must be shown by some key, ban by none.
const T2_TERMS = [
  { term: 'Guard (the menu command) has its own line', en: { canon: ' guards!', ban: / defends!/ }, ja: { canon: 'は みがまえた！', ban: /みをまもっている/ }, kj: { canon: 'は 身構えた！', ban: /身を守っている/ } },
  { term: 'Defend (Enter on the enemy quiz): the prompt says defend', en: { canon: 'Answer to defend!', ban: /Answer to dodge/ }, ja: { canon: 'こたえて みを まもれ！', ban: /みをまもれ/ }, kj: { canon: '答えて 身を 守れ！', ban: /身を守れ/ } },
  { term: 'crystal shard / fragment (kanji mode writes かけら)', en: { canon: null, ban: null }, ja: { canon: 'かけら', ban: null }, kj: { canon: 'かけら', ban: /欠片/ } },
  { term: 'Iron Mine', en: { canon: 'Iron Mine', ban: null }, ja: { canon: 'てつのこうざん', ban: /てつこうざん/ }, kj: { canon: '鉄の鉱山', ban: /鉄鉱山/ } },
  { term: 'Frostfall Cavern', en: { canon: 'Frostfall Cavern', ban: null }, ja: { canon: 'フロストフォールの どうくつ', ban: /フロストフォールどうくつ/ }, kj: { canon: 'フロストフォールの 洞窟', ban: /フロストフォール洞窟/ } },
  { term: 'Desert Tomb (a name is one piece)', en: { canon: 'Desert Tomb', ban: null }, ja: { canon: 'さばくのはか', ban: /さばくの はか/ }, kj: { canon: '砂漠の墓', ban: /砂漠の 墓/ } },
  { term: 'Volcanic Forge (a name is one piece)', en: { canon: 'Volcanic Forge', ban: null }, ja: { canon: 'かざんのかじば', ban: /かざんの かじば/ }, kj: { canon: '火山の鍛冶場', ban: /火山の 鍛冶場/ } },
  { term: 'glyph (the Desert Tomb rule of today)', en: { canon: 'glyph', ban: /Hieroglyph|false glyph|only on the|sandstorm sweeps|stone islands/ }, ja: { canon: 'もよう', ban: /グリフ|すなあらしに おしもど|いしの しま/ }, kj: { canon: '模様', ban: /グリフ|砂嵐に 押し戻|石の 島/ } },
  { term: 'dig (発掘) is read はっくつ', en: { canon: null, ban: null }, ja: { canon: 'はっくつちゅう', ban: /ほっかいちゅう/ }, kj: { canon: null, ban: null } },
  { term: 'する-verbs and counters in one piece, a number on its own', en: { canon: null, ban: null }, ja: { canon: 'かいふくしますか', ban: /かいふく し(ますか|ました)|ていさつ している|たんけんして くれる|G で |HPを\d|かくし つうろ/ }, kj: { canon: '回復しますか', ban: /回復 し(ますか|ました)|G で |HPを\d/ } },
  { term: 'directions: "X に ある"', en: { canon: null, ban: null }, ja: { canon: 'なんせいに ある', ban: /(にし|ひがし|きた|みなみ|せい|とう)にある/ }, kj: { canon: '西に ある', ban: /[西東北南]にある/ } },
  { term: 'enemy skill lines (kanji) are spaced and plain', en: { canon: null, ban: null }, ja: { canon: 'は どくの きりを はなった', ban: null }, kj: { canon: 'は 毒の 霧を 放った', ban: /は毒|はバリア|のバリアが消|力を溜め|激怒|HP回復した/ } },
  { term: '南西 and 南東 are read なんせい and なんとう', en: { canon: null, ban: null }, ja: { canon: 'なんせい', ban: /みなみにし|みなみひがし/ }, kj: { canon: null, ban: null } },
  { term: 'kanji mode writes そびえ立つ and きらめく one way', en: { canon: null, ban: null }, ja: { canon: null, ban: null }, kj: { canon: 'そびえ立つ', ban: /聳|煌/ } },
  { term: 'a crystal colour takes の', en: { canon: null, ban: null }, ja: { canon: '{color}の すいしょうが', ban: /\}すいしょうが/ }, kj: { canon: '{color}の 水晶が', ban: null } }
];
// (g) the Desert Tomb rule of today (glyph-plates.js), in the bundle's old rows
const T2_TOMB = {
  must: { en: /order[\s\S]*tablet|tablet[\s\S]*order/, ja: /せきばん[\s\S]*じゅんばん/, kj: /石板[\s\S]*順番/ },
  not: { en: /only on the|sandstorm|stone islands|Hieroglyph/, ja: /グリフ|すなあらし|いしの しま/, kj: /グリフ|砂嵐|石の 島/ }
};
// (g) Japanese literals of ui-overhaul.js, covered at run time (old -> new)
const T2_UI = {
  'タイトルへもどりますか？': 'タイトルへ もどりますか？', 'タイトルへ戻りますか？': 'タイトルへ 戻りますか？', 'クエストかんりょう': 'クエスト かんりょう', 'クエスト完了': 'クエスト 完了',
  '報酬を受け取りました': '報酬を 受け取った', '冒険を続ける': '冒険を 続ける', 'クエストを読み込んでいます…': 'クエストを 読み込んでいます…', 'クエスト情報を表示できません': 'クエストを 表示できません',
  'はじめから はじめる？': 'さいしょから はじめる？', '最初から始める？': '最初から 始める？', 'セーブした冒険は消えます。': 'セーブした 冒険は 消えます。'
};
const T2_KNIGHT = { en: ['Rogue Knight', 'Dark Knight'], ja: ['はぐれきし', 'ダークナイト'], kj: ['はぐれ騎士', '暗黒騎士'] };
const T2_GUARD = { en: ['Guard', ' guards!'], ja: ['みがまえる', 'は みがまえた！'], kj: ['身構える', 'は 身構えた！'] };
const T2_COMPASS = { en: ['N', 'S', 'E', 'W'], ja: ['きた', '', '', ''], kj: ['北', '南', '東', '西'] };
// kana runs of 10 or more with no space that are ONE word (everything else that long is two phrases glued together)
const T2_LONG_OK = ['とりもどしてくれんかのう', 'クリスタルエネルギーを', 'たりなくなってきおった', 'たちむかおうとしている', 'モンスターだらけでな', 'ポータルダンジョンの', 'わすれてないだろうな',
  'ひきあげてほしいんだ', 'とおれるかもしれんが', 'ていさつしているんだ', 'つよくてニューゲーム', 'いきづいているようだ', 'ぜんかいふくしますか', 'ぜんかいふくしました'];
function spaceLists() {
  const src = fs.readFileSync(path.join(ROOT, 'public/acts-hifi/acts-runtime.js'), 'utf8'), m = src.match(/var W_SPACE = \{([\s\S]*?)\n  \};/);
  return m ? new Function('return ({' + m[1] + '})')() : { ja: [], kj: [] };
}
const isName = k => /^(monster|map)\./.test(k) || /^(equip|item)\.[A-Za-z0-9]+$/.test(k) || /^npc\.[A-Za-z0-9]+\.name$/.test(k);

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
  // (monster.knight is left out: its old name is also the Dark Knight's, so it changes only in its own battle; see (g))
  const diff = Object.keys(z).filter(k => z[k][1] && z[k][0] !== z[k][1] && !/\{[a-z]+\}/i.test(z[k][1]) && !/^\[/.test(z[k][1]) && k.indexOf('geo.') !== 0 && k !== 'monster.knight');
  const phaser = await page.evaluate(([diff, raw]) => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), out = []; for (const k of diff) { const t = w.add.text(0, 0, raw[k]); out.push([k, t.text]); t.destroy(); } return out; }, [diff, Object.fromEntries(diff.map(k => [k, z[k][1]]))]);
  const mism = phaser.filter(([k, shownText]) => shownText !== z[k][0]);
  rec(`(e) ${GROUP}: a Phaser text made from the bundle's own text of each of the ${diff.length} changed keys shows the fixed text`, diff.length > 0 && mism.length === 0, mism.slice(0, 6).map(([k, t]) => `${k}: ${t.slice(0, 50)} <> ${z[k][0].slice(0, 50)}`));

  // ================================================================ T2 (second text pass)
  // (f) phrase spaces in both Japanese modes (ui-ja UJ-02): the labels, the layer's phrase list, long kana runs, kana = kanji
  if (MODE !== 'en') {
    const col = MODE === 'ja' ? 0 : 1, lab = Object.keys(T2_LABELS).filter(k => T2_LABELS[k][col] !== null);
    const wrongLab = lab.filter(k => Zv(k) !== T2_LABELS[k][col]);
    rec(`(f) ${GROUP}: the ${lab.length} labels of UJ-02 (hero creation, quest card, title, shop, settings) read with their phrase spaces`, wrongLab.length === 0, wrongLab.slice(0, 8).map(k => `${k}: ${Zv(k)}`));
    const SP = spaceLists(), own = MODE === 'ja' ? SP.ja : SP.kj, both = MODE === 'ja' ? SP.ja : SP.ja.concat(SP.kj);
    const glued = [], dead = own.filter(p => !alltext.some(([, t]) => t.includes(p)));
    for (const p of both) { const g = p.split(' ').join(''), h = alltext.find(([, t]) => t.includes(g)); if (h) glued.push(`${h[0]}: ${g}`); }
    rec(`(f) ${GROUP}: none of the layer's ${both.length} phrases is shown glued together by any text key`, both.length > 0 && glued.length === 0, glued.slice(0, 10));
    rec(`(f) ${GROUP}: each of the ${own.length} phrases of this mode is shown, spaced, by some text key`, own.length > 0 && dead.length === 0, dead.slice(0, 10));
  }
  if (GROUP === 'ja-kana') {
    // a name (place, person, monster, thing) is one piece; any other kana run of 10 or more is two phrases glued together
    const names = [...new Set(alltext.filter(([k, t]) => isName(k) && t.length >= 4).map(x => x[1]))].sort((a, b) => b.length - a.length), long = [];
    for (const [k, t0] of alltext) { if (isName(k)) continue; let t = t0; for (const n of names) t = t.split(n).join('◆'); for (const m of t.match(/[ぁ-ゖァ-ヺー]{10,}/g) || []) if (!T2_LONG_OK.includes(m)) long.push(`${k}: ${m}`); }
    rec(`(f) ja-kana: no sentence or label has 10 or more kana in a row without a space (names aside; ${T2_LONG_OK.length} single long words allowed)`, long.length === 0, [long.length + ' runs'].concat(long.slice(0, 10)));
  }
  // (e2) one word per meaning, second pass
  for (const g of T2_TERMS) {
    const r = g[MODE]; if (!r.ban) continue;                 // a row with no old form in this mode has nothing to prove here
    const banned = alltext.filter(([, t]) => r.ban.test(t)).map(([k, t]) => `${k}: ${t.match(r.ban)[0]}`);
    const shownOk = !r.canon || alltext.some(([, t]) => t.includes(r.canon));
    rec(`(e2) ${GROUP}: ${g.term}${r.canon ? ` -- "${r.canon}" is shown` : ''}, the old form by no text key`, banned.length === 0 && shownOk, shownOk ? banned.slice(0, 6) : 'not shown: ' + r.canon);
  }
  rec(`(e2) ${GROUP}: two monsters, two names: monster.knight is ${T2_KNIGHT[MODE][0]}, monster.darkKnight is ${T2_KNIGHT[MODE][1]}`, Zv('monster.knight') === T2_KNIGHT[MODE][0] && Zv('monster.darkKnight') === T2_KNIGHT[MODE][1], Zv('monster.knight') + ' / ' + Zv('monster.darkKnight'));

  // (g) on the screen
  const compass = await page.evaluate(() => [...document.querySelectorAll('#qfh-compass text')].map(t => t.textContent));
  rec(`(g) ${GROUP}: the compass dial's letters (top, bottom, right, left) read ${JSON.stringify(T2_COMPASS[MODE])} (UJ-10)`, JSON.stringify(compass) === JSON.stringify(T2_COMPASS[MODE]), compass);
  if (GROUP === 'ja-kanji') {
    // UJ-03: the enemy skill lines reach the screen with the monster's name already filled in, so no row can match them
    const sk = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), Z = window.__QOK.Z, B = Z.__base || Z, fill = s => s.split('{monster}').join('魔王マラカール').split('{name}').join('ミカ').split('{value}').join('120').split('{damage}').join('35');
      return ['ability.poisonStart', 'ability.poison', 'ability.regen', 'ability.shieldStart', 'ability.shieldFade', 'ability.chargeWarning', 'ability.rageActivate'].map(k => { const t = w.add.text(0, 0, fill(B(k))), got = t.text; t.destroy(); return [k, got, fill(Z(k))]; }); });
    const skBad = sk.filter(([, got, want]) => got !== want || !/ /.test(got));
    rec('(g) ja-kanji: direct: a Phaser text made from each of the bundle\'s 7 enemy skill lines with the names and numbers filled in reads with phrase spaces (UJ-03: "魔王マラカールは 毒の 霧を 放った！")', sk.length === 7 && skBad.length === 0, skBad.length ? skBad.slice(0, 4) : sk[0][1]);
  }
  if (MODE !== 'en') {
    const olds = Object.keys(T2_UI);
    const got = await page.evaluate(async olds => { const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-2000px;top:0;';
      for (const o of olds) { const d = document.createElement('div'); d.textContent = o; box.appendChild(d); }
      const p = document.createElement('span'); p.className = 'newpill'; p.textContent = 'NEW'; box.appendChild(p);
      document.body.appendChild(box); await new Promise(r => setTimeout(r, 250));
      const out = [...box.children].map(c => c.textContent); box.remove(); return out; }, olds);
    const pill = got.pop(), badUi = olds.filter((o, i) => got[i] !== T2_UI[o]), wantPill = { ja: 'あたらしい', kj: '新しい' }[MODE];
    rec(`(g) ${GROUP}: direct: the ${olds.length} Japanese literals of ui-overhaul.js (quit, quest card, start over), put in the page as that file writes them, read with phrase spaces, and a "NEW" pill reads ${wantPill} (UJ-09)`,
      badUi.length === 0 && pill === wantPill, { bad: badUi.map(o => o + ' -> ' + got[olds.indexOf(o)]).slice(0, 6), pill });
    // real taps: Settings > Title Screen
    const wantQuit = MODE === 'ja' ? 'タイトルへ もどりますか？' : 'タイトルへ 戻りますか？';
    await tap(page, '#fieldTabs [data-fi="3"]'); await page.waitForTimeout(1200);
    if (!(await U.active(page, 'MenuScene'))) { await tap(page, '#fieldTabs [data-fi="3"]'); await page.waitForTimeout(1200); }
    await tap(page, '#qok-ui [data-act="quitAsk"]', 4000); await page.waitForTimeout(600);
    const quitH = await page.evaluate(() => { const e = document.querySelector('#qok-ui .scene-h'); return e ? e.textContent : null; });
    rec(`(g) ${GROUP}: Settings > Title Screen asks "${wantQuit}" (real taps)`, quitH === wantQuit, quitH);
    await tap(page, '#qok-ui [data-act="quitCancel"]', 3000); await page.waitForTimeout(500);
    await tap(page, '[data-act="close"]', 2000); await page.waitForTimeout(900);
  }
  // the two knights and the Guard command, in battles launched as startBattle does (not met on this cell of the overworld)
  const fight = async id => {
    const launched = await page.evaluate(id => { const g = window.__PHASER_GAME__, wm = g.scene.getScene('WorldMapScene'), em = window.__GAME_STATE__.encounterManager, w = console.warn; console.warn = () => {};
      let m; try { m = em.rollEncounter({ monsters: [{ monsterId: id, weight: 1 }] }); } finally { console.warn = w; }
      if (!m) return false; wm.currentEncounterZone = 'greenhollow-plains'; wm.scene.launch('BattleScene', { monster: m, zone: 'greenhollow-plains' }); wm.scene.pause(); return true; }, id);
    const seen = [], dom = []; let name = null, ph = null; const t0 = Date.now();
    while (launched && Date.now() - t0 < 25000) {
      ph = await page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'), c = document.querySelector('#qok-ui .enemy-card'), m = document.querySelector('#qok-ui .msg');
        return { on: g.scene.isActive('BattleScene'), phase: b && b.phase, mon: b && b.monster && b.monster.id, msg: (b && b.messageText && b.messageText.text) || '', card: c ? c.innerText : '', dom: m ? m.innerText.replace(/\s+/g, ' ').trim() : '' }; });
      if (ph.on && ph.msg && !seen.includes(ph.msg)) seen.push(ph.msg);
      if (ph.on && ph.dom && !dom.includes(ph.dom)) dom.push(ph.dom);
      if (ph.on && ph.card) name = ph.card.split('\n')[0].trim();
      if (ph.on && ph.phase === 'playerMenu') break;
      if (ph.on && ph.phase === 'message') await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); if (b._messageCallback) b.advanceMessage(); });
      await page.waitForTimeout(350);
    }
    return { launched, mon: ph && ph.mon, phase: ph && ph.phase, name, seen, dom };
  };
  const leave = async () => { await page.evaluate(() => { const g = window.__PHASER_GAME__; g.scene.stop('BattleScene'); g.scene.resume('WorldMapScene'); }); await page.waitForTimeout(700); };
  const [kn, dk] = T2_KNIGHT[MODE];
  const b1 = await fight('darkKnight'); await leave();
  rec(`(g) ${GROUP}: the Dark Knight's battle still names it ${dk} (name bar and its lines)`, b1.mon === 'darkKnight' && b1.name === dk && b1.seen.some(s => s.includes(dk)) && !b1.seen.concat(b1.dom).some(s => s.includes(kn)), b1);
  const b2 = await fight('knight');
  rec(`(g) ${GROUP}: the other knight's battle names it ${kn}, on the name bar and in the lines the bundle writes with the old name`, b2.mon === 'knight' && b2.name === kn && b2.seen.some(s => s.includes(kn)) && b2.dom.some(s => s.includes(kn)) && !b2.seen.concat(b2.dom).some(s => s.includes(dk)), b2);
  const labels = await page.evaluate(() => [...document.querySelectorAll('[data-act="battleMenu"]')].map(b => b.getAttribute('aria-label')));
  await tap(page, '[data-act="battleMenu"][data-i="1"]', 3000);
  const said = []; { const t0 = Date.now(); while (Date.now() - t0 < 5000 && !said.some(s => s.includes(T2_GUARD[MODE][1]))) {
    const m = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); return (b && b.messageText && b.messageText.text) || ''; }); if (m && !said.includes(m)) said.push(m); await page.waitForTimeout(150); } }
  rec(`(g) ${GROUP}: the second battle command reads ${T2_GUARD[MODE][0]} and its line says the same word ("${T2_GUARD[MODE][1].trim()}"), by a real tap`, labels[1] === T2_GUARD[MODE][0] && said.some(s => s.includes(T2_GUARD[MODE][1])), { labels, said: said.slice(-3) });
  await leave();

  // the Desert Tomb rule of today (seeded save in the entrance chamber, Continue): the bundle's old rows say what glyph-plates.js does
  await boot(page, { locale: LG.locale, kanji: LG.kanji, all: false, mapId: 'desertTomb', floor: 1, x: 23, y: 32 });
  await page.waitForFunction(() => !!window.__QOK_D2KIT_A__, { timeout: 20000 }).catch(() => {});
  const tomb = await page.evaluate(async () => {
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), K = window.__QOK_D2KIT_A__, Z = window.__QOK.Z, B = Z.__base || Z, P = 'dungeon.desertTomb.', sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = { map: w.currentMapId, trial: w.glyphTrialActive === true, kit: !!K, z: {} };
    for (const k of ['plaque', 'glyphs.signRule', 'glyphs.intro', 'glyphs.success', 'glyphs.wrong', 'glyphs.sym.eye', 'glyphs.sym.falcon', 'glyphs.sym.ankh', 'glyphs.sym.water']) out.z[k] = Z(P + k);
    if (K) out.k = { wrong: K.S('tomb.wrong'), solved: K.S('tomb.solved'), eye: K.S('glyph.eye'), bird: K.S('glyph.bird'), ankh: K.S('glyph.ankh'), water: K.S('glyph.water'), gust: K.S('gust.blown'), gustDown: K.S('gust.blownDown') };
    try { w.showMessage(B(P + 'plaque')); await sleep(500); out.plaque = (document.querySelector('#qfh-dialog-text') || {}).innerText || ''; w.showingMessage = false; w.hideMessage && w.hideMessage(); } catch (e) { out.plaque = 'THROW ' + e.message; }
    const was = w.glyphTrialActive; w.glyphTrialActive = true; out.old = [Z(P + 'glyphs.signRule'), B(P + 'glyphs.signRule')]; w.glyphTrialActive = was;
    return out; });
  const tz = tomb.z, tk = tomb.k || {}, flat = s => (s || '').replace(/\s+/g, '');
  rec(`(g) ${GROUP}: Desert Tomb: the bundle's old corridor is off on the authored floor and the kit is loaded`, tomb.map === 'desertTomb' && !tomb.trial && tomb.kit, { map: tomb.map, trial: tomb.trial, kit: tomb.kit });
  rec(`(g) ${GROUP}: Desert Tomb: the old rows for a wrong step, the open door and the glyph names are the plate puzzle's own words (kit-a.js)`,
    !!tomb.k && tz['glyphs.wrong'] === tk.wrong && tz['glyphs.success'] === tk.solved && tz['glyphs.sym.eye'] === tk.eye && tz['glyphs.sym.falcon'] === tk.bird && tz['glyphs.sym.ankh'] === tk.ankh && tz['glyphs.sym.water'] === tk.water,
    { wrong: tz['glyphs.wrong'], success: tz['glyphs.success'], eye: tz['glyphs.sym.eye'], falcon: tz['glyphs.sym.falcon'] });
  rec(`(g) ${GROUP}: Desert Tomb: the rule sign, the intro and the plaque say the order is on the stone tablet, and none of the old rule (one safe glyph, sandstorm, stone islands)`,
    ['glyphs.signRule', 'glyphs.intro', 'plaque'].every(k => T2_TOMB.must[MODE].test(tz[k])) && ['glyphs.signRule', 'glyphs.intro', 'plaque', 'glyphs.wrong', 'glyphs.success'].every(k => !T2_TOMB.not[MODE].test(tz[k])),
    { signRule: tz['glyphs.signRule'], intro: tz['glyphs.intro'], plaque: tz.plaque });
  rec(`(g) ${GROUP}: Desert Tomb: direct: the bundle's own plaque text through showMessage() shows the plaque of today's rule`, flat(tomb.plaque) === flat(tz.plaque) && T2_TOMB.must[MODE].test(tomb.plaque) && !T2_TOMB.not[MODE].test(tomb.plaque), tomb.plaque);
  rec(`(g) ${GROUP}: Desert Tomb: direct: if the bundle's old corridor ever runs (glyphTrialActive set by hand), its own rule text comes back`, tomb.old[0] === tomb.old[1] && T2_TOMB.not[MODE].test(tomb.old[0] || ''), tomb.old[0]);
  if (MODE !== 'en') {
    const strong = MODE === 'ja' ? 'つよい かぜに' : '強い 風に';
    rec(`(g) ${GROUP}: the gust lines of the dungeon kit say "${strong}" (not とっぷう / 突風)`, !!tomb.k && [tk.gust, tk.gustDown].every(s => (s || '').includes(strong) && !/とっぷう|突風/.test(s)), [tk.gust, tk.gustDown]);
  }

  // ja-kanji: the same sentence is cut into the same phrases in both modes (a second boot of the same save, kanji off, gives the kana side)
  if (GROUP === 'ja-kanji') {
    const keys = alltext.map(x => x[0]);
    await boot(page, { locale: 'ja', kanji: false, all: false, mapId: 'overworld', x: 69, y: 258 }); await page.waitForTimeout(800);
    const kana = await page.evaluate(keys => { const Z = window.__QOK.Z, out = {}; for (const k of keys) { try { out[k] = Z(k); } catch (e) { out[k] = null; } } return out; }, keys);
    const cnt = s => ((s || '').match(/[ 　]/g) || []).length, EXC = ['settings.timerOff', 'ability.rageActivate'];
    const isKana = typeof kana['menu.items'] === 'string' && !KANJI.test(kana['menu.items']) && KANJI.test(Zv('menu.items') || '');
    const off = keys.filter(k => !EXC.includes(k) && typeof kana[k] === 'string' && cnt(kana[k]) !== cnt(Zv(k)));
    rec(`(f) ja-kanji: each of the ${keys.length} text keys has as many phrase spaces as it has in kana mode (${EXC.join(', ')} aside)`, isKana && off.length === 0,
      [off.length + ' keys'].concat(off.slice(0, 6).map(k => `${k}: ${cnt(kana[k])}/${cnt(Zv(k))} ${Zv(k).slice(0, 40)}`)));
  }

  // ja-kana: the hero creation screen itself, from an empty title (real taps)
  if (GROUP === 'ja-kana') {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' }); await L.toTitle(page); await page.waitForTimeout(1000);
    if (await page.evaluate(() => window.__QOK.loc() !== 'ja')) { await tap(page, '[data-act="titleLang"]'); await page.waitForTimeout(800); }   // English -> 日本語
    await tap(page, '[data-act="titleSlots"]', 2500); await page.waitForTimeout(900);                // はじめる
    const empty = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-act="slotPick"]')].find(e => /あたらしい/.test(e.innerText)); return b ? b.getAttribute('data-i') : null; });
    await tap(page, `[data-act="slotPick"][data-i="${empty}"]`, 2500); await page.waitForTimeout(1200);     // an empty record -> hero creation
    const cr = await page.evaluate(() => ({ text: (document.getElementById('qok-ui') || {}).innerText || '', ph: (document.getElementById('qok-name') || {}).placeholder || null }));
    const need = ['ゆうしゃを つくろう', 'もんだいの むずかしさ', 'ぼうけんに でる'];
    rec('(g) ja-kana: the hero creation screen, from an empty title by real taps (日本語, はじめる, an empty record), shows its heading, the difficulty label, the start button and the name hint with phrase spaces',
      need.every(s => cr.text.includes(s)) && cr.ph === 'なまえを いれてね…', { missing: need.filter(s => !cr.text.includes(s)), placeholder: cr.ph, text: cr.text.replace(/\s+/g, ' ').slice(0, 160) });
  }

  // sources (source reads, said on the line)
  if (GROUP === 'en') {
    const ad = await get(base + 'act1-hifi/adapter.js');
    rec('(g) the elder\'s two direction lines in adapter.js send the hero south to the Misty Grotto, not to a Darkfang Grotto', /"Head south to the Misty Grotto first\./.test(ad) && /Head south toward the Misty Grotto\./.test(ad) && !/Head south (to|toward) the Darkfang/.test(ad), 'source read');
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
