'use strict';
// Quest and story-flag probe (track Q). Fails if a quest of the bundle's table can no longer be
// started, finished or paid out in this world, or if the compass points the wrong way for one.
// Audit this probe guards: /mnt/project-files/edu-rpg/autoloop/quests/AUDIT.md
// Fixes it guards:        public/acts-hifi/acts-runtime.js ("quests"), public/battle-recovery.js (amulet).
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5501/ \
//     node scripts/auto/checks/quests.cjs [group ...]
//
// With no group every group runs, one after another, each in its own process (one Chromium at a
// time, each under ~8 minutes). Output: [PASS]/[FAIL]/[INFO] lines, one summary line, exit 1 on a FAIL.
// QUESTS_OUT (default <tmp>/qok-quests): rows.jsonl, logs, failure screenshots.
//
// What is real and what is not:
//   real       Continue from a seeded save; the walk into a town at its door; the walk to a person;
//              the town's own talk button; the walk out; the compass the overworld draws from
//              (getCompassTarget); two boss fights from the boss's own interact handler, won by
//              answering the quiz, with the bundle's victory and its drop.
//   simulated  the other boss falls (the flag and the progress call the bundle's victory makes, and
//              the drop its wake() gives), monster kills, ore drops and dungeon visits. Each such
//              line says "(simulated)". The dungeons themselves are the mechanic probes' job.
//   direct     the "words" group calls the scene's talk handler (the function the talk button
//              ends in) so that three languages fit in one run.
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = process.env.QUESTS_OUT || path.join(os.tmpdir(), 'qok-quests');
fs.mkdirSync(OUT, { recursive: true });
process.env.PT_DIR = process.env.PT_DIR || OUT;
process.env.PT_SHOTS = process.env.PT_SHOTS || path.join(OUT, 'shots') + '/';
process.env.PROBE_OUT = process.env.PROBE_OUT || path.join(OUT, 'probe-out');
const GROUPS = ['graph', 'act1', 'act2', 'act3', 'drake2', 'act4a', 'act4b', 'act5a', 'act5b', 'oldsave', 'words'];
const GROUP_MS = 470000;

// ---------------------------------------------------------------- runner (no group named)
if (!process.argv.includes('--group')) {
  const { spawnSync } = require('child_process');
  const want = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const list = want.length ? want : GROUPS; let pass = 0, fail = 0; const bad = [];
  for (const g of list) {
    if (!GROUPS.includes(g)) { console.log(`[FAIL] ${g}: no such group (${GROUPS.join(', ')})`); fail++; bad.push(g); continue; }
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [__filename, '--group', g], { env: process.env, encoding: 'utf8', timeout: GROUP_MS, maxBuffer: 64 << 20, killSignal: 'SIGKILL' });
    const out = (r.stdout || '') + (r.stderr ? '\n' + r.stderr : '');
    fs.writeFileSync(path.join(OUT, `group-${g}.log`), out);
    const lines = out.split('\n').filter(l => /^\[(PASS|FAIL|INFO)\]/.test(l)); lines.forEach(l => console.log(l));
    const p = lines.filter(l => l.startsWith('[PASS]')).length; let f = lines.filter(l => l.startsWith('[FAIL]')).length;
    if (r.status !== 0 && !f) { console.log(`[FAIL] ${g}: the group did not finish (${r.error ? r.error.code || r.error.message : 'exit ' + r.status}); see ${path.join(OUT, `group-${g}.log`)}`); f++; }
    if (!p && !f) { console.log(`[FAIL] ${g}: the group checked nothing`); f++; }
    pass += p; fail += f; if (f) bad.push(g);
    console.log(`-- ${g}: ${p} pass, ${f} fail, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  console.log(`quests: ${pass + fail} checks, ${fail} FAIL` + (bad.length ? ` (groups: ${bad.join(', ')})` : '') + ` -- ${list.length} group(s) against ${process.env.PROBE_URL || 'the default PROBE_URL'}`);
  process.exit(fail ? 1 : 0);
}

// ---------------------------------------------------------------- one group
const GROUP = process.argv[process.argv.indexOf('--group') + 1];
const { Session, door, acts, L, ROOT } = require('../../acts/probe/playthrough/ptlib.cjs');
const D2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
const ROWS = acts.strings || {};
const TOWN_NPCS = {};
for (const f of fs.readdirSync(path.join(ROOT, 'public/act1-hifi/town'))) { if (!/-town\.json$/.test(f)) continue; const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/act1-hifi/town', f), 'utf8')); TOWN_NPCS[t.id] = (t.npcs || []).map(n => n.id); }
const QUEST_IDS = ['owlsLesson', 'drakeCargo', 'kikisChallenge', 'crystalCaveGate', 'gordosOre', 'stormPass', 'kikisRescue', 'frozenSupplies', 'shadowGate', 'lunasMap', 'desertGate',
  'drakesCargo2', 'ancientRelic', 'flameCloak', 'magmaPath', 'lunasProphecy', 'volcanicGate', 'demonBarracksQuest', 'kikisResolve', 'portalRelics', 'finalBattle'];
const ACT1_BOSSES = { mosswarden: 'Whispering Woods', serpent: 'Crystal Cave' };          // Act 1 dungeons are the bundle's own
const MOBS = { crab: 'Greenhollow cellar', demon: 'zone demons-threshold (Act 5 overworld, Demon Barracks, Void Rift)' };
const BOSS_OF = Object.assign({}, ACT1_BOSSES); for (const id in D2.dungeons) BOSS_OF[D2.dungeons[id].bossId] = id;
const norm = s => String(s || '').replace(/\s+/g, '');
const says = (shown, want) => { const w = norm(want).slice(0, 18); return !!w && shown.some(t => norm(t).includes(w)); };
const same = (c, d) => !!c && !!d && c.ox === d.at[0] && c.oy === d.at[1];
const at = name => door(name).at;
const A1_DOORS = acts.landmarks.filter(l => l.act1).map(l => l.at.join(','));

class QS extends Session {
  async inject() {
    await super.inject();
    await this.ev(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); if (w.__qh) return; w.__qh = 1; window.__QTOAST = []; window.__QSAY = [];
      const o = w.showQuestNotification; w.showQuestNotification = function (t) { window.__QTOAST.push(String(t)); return o.apply(this, arguments); };
      const m = w.showMessage; w.showMessage = function (t) { const r = m.apply(this, arguments); try { window.__QSAY.push(String((this.messageText && this.messageText.text) || t)); } catch (e) {} return r; }; });
  }
  // what was said (as the box showed it) and the toasts since the last call
  heard() { return this.ev(() => ({ say: window.__QSAY.splice(0), toast: window.__QTOAST.splice(0) })); }
  q() { return this.ev(() => { const p = window.__GAME_STATE__.player.state, own = id => { let n = 0; for (const i of p.inventory) if (i.itemId === id) n += i.quantity; for (const k in p.equipment) if (p.equipment[k] === id) n++; return n; };
    const own2 = {}; for (const id of ['steelSword', 'frostbrand', 'ironHelm', 'ancientAmulet', 'flameCloak', 'magmaBlade', 'holyBlade', 'galeShield', 'holyAmulet', 'smokeBomb', 'potion', 'hiPotion']) own2[id] = own(id);
    return { gold: p.gold, exp: p.exp, level: p.level, xp: p.level * 1e7 + p.exp, own: own2, active: [...p.activeQuests], done: [...p.completedQuests], prog: JSON.parse(JSON.stringify(p.questProgress || {})), rep: window.__QOK_MULTIACT__ && window.__QOK_MULTIACT__.quests ? window.__QOK_MULTIACT__.quests() : null }; }); }
  async compass() { return (await this.st()).compass; }
  // Until the auto quests have nothing more to do: cards and boxes read and closed.
  async settle(max = 14) { let last = null, n = 0; const lines = [];
    for (let i = 0; i < max && n < 2; i++) { await this.page.waitForTimeout(1100); lines.push(...await this.dismissAll()); const s = await this.q(); const k = s.active.join() + '|' + s.done.join(); n = k === last ? n + 1 : 0; last = k; }
    return lines; }
  // simulated story events: exactly what the bundle's victory / step / pickup code does to the record
  boss(id, drops = []) { return this.ev(([id, drops]) => { const gs = window.__GAME_STATE__; gs.player.state.storyFlags['boss.' + id + '.defeated'] = true; gs.questManager.updateProgress(gs.player.state, 'defeat', id, 1); for (const it of drops) gs.player.addItem(it, 1); }, [id, drops]); }
  progress(type, id, n = 1) { return this.ev(([type, id, n]) => { const gs = window.__GAME_STATE__; for (let i = 0; i < n; i++) gs.questManager.updateProgress(gs.player.state, type, id, 1); }, [type, id, n]); }
  give(id, n = 1) { return this.ev(([id, n]) => { window.__GAME_STATE__.player.addItem(id, n); }, [id, n]); }
  // the scene's own talk handler, as the town's talk button calls it
  async direct(id, key) { await this.heard(); await this.ev(([id, key]) => { window.__PHASER_GAME__.scene.getScene('WorldMapScene').handleNpcInteraction({ id, dialogueKey: key, nameKey: 'npc.' + id + '.name' }); }, [id, key]);
    await this.page.waitForTimeout(350); await this.dismissAll(); await this.page.waitForTimeout(250); await this.dismissAll(); return (await this.heard()).say; }
  // A boss fought for real: Continue on its floor, its own interact handler, the quiz, the bundle's victory and wake().
  async bossFight(mapId, sv) {
    const d = D2.dungeons[mapId], plan = D2.floors[`${mapId}-f${d.floors}`], land = plan.land.fromPrev;
    sv.player.position = { mapId, x: land.x, y: land.y, floor: d.floors };
    await this.boot(sv, { settle: 5000 });
    const cell = await this.ev(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), m = w.mapData; for (let y = 0; y < m.length; y++) for (let x = 0; x < m[y].length; x++) if (m[y][x] === 7) return [x, y]; return null; });
    const s0 = await this.st();
    if (!this.rec(`Continue on floor ${d.floors} of ${mapId}: the boss ${d.bossId} waits there`, s0.map === mapId && s0.floor === d.floors && !!cell, { at: [s0.map, s0.floor, s0.x, s0.y], cell })) return null;
    await this.heard();
    await this.ev(([x, y]) => { window.__PHASER_GAME__.scene.getScene('WorldMapScene').tryBossInteract(x, y); }, cell);
    for (let i = 0; i < 30; i++) { if (await this.ev(() => window.__PHASER_GAME__.scene.isActive('BattleScene'))) break; await this.ev(() => window.__P.tapKey('z')); await this.page.waitForTimeout(350); }
    const fr = await this.fight(); await this.page.waitForTimeout(3000); await this.inject();
    const lines = await this.settle(); const s = await this.st();
    this.rec(`the fight with ${d.bossId} is won by answering the quiz; boss.${d.bossId}.defeated is set`, !!(fr.entered && fr.won && s.bosses.includes(d.bossId)), fr);
    return { fr, lines, heard: await this.heard() };
  }
}
const S = new QS(GROUP);
const base = o => { const sv = L.save(o); sv.player.level = 20; sv.player.expToNext = 1e6;   // below the level cap (30), so quest experience shows
  if (o.progress) sv.player.questProgress = o.progress; if (o.gold !== undefined) sv.player.gold = o.gold; return sv; };
const exitOf = name => { const d = door(name); return { mapId: 'overworld', x: d.exit[0], y: d.exit[1] }; };
const flagsOf = (...ids) => Object.fromEntries(ids.map(b => [`boss.${b}.defeated`, true]));
const A1Q = ['owlsLesson', 'drakeCargo', 'crystalCaveGate'];
// A second visit to a town: Continue at its door first (walking straight back in from the exit cell does not re-open it).
const back = async name => { await S.travel(name); return S.enterTown(name); };
// talk until `id` is in started/finished (the first press sometimes only wakes the person)
async function talkFor(npc, kind, id, label) {
  let r = await S.talk(npc, { label: label || `${npc}` });
  if (!r[kind].includes(id)) { const r2 = await S.talk(npc, { label: (label || npc) + ' (again)' }); r2.lines = r.lines.concat(r2.lines); r2.started = r.started.concat(r2.started); r2.finished = r.finished.concat(r2.finished); r = r2; }
  return r;
}

const G = {};

// ---------------------------------------------------------------- graph: every quest of the table, statically
G.graph = async () => {
  await S.open(base({ mapId: 'millbrook', x: 32, y: 40 }));
  await S.page.waitForFunction(() => window.__QOK_MULTIACT__ && window.__QOK_MULTIACT__.quests && window.__QOK_MULTIACT__.quests().wrapped, { timeout: 20000 }).catch(() => {});
  const T = await S.ev(() => { const gs = window.__GAME_STATE__, m = gs.questManager, seen = {}, st = { activeQuests: [], completedQuests: [], storyFlags: new Proxy({}, { get: () => true }), questProgress: {} };
    for (let k = 0; k < 60; k++) { const l = m.getAvailableQuests(st); if (!l.length) break; for (const q of l) { seen[q.id] = JSON.parse(JSON.stringify(q)); st.completedQuests.push(q.id); } }
    const Z = window.__QOK.Z, z = k => { try { const t = (Z.__base || Z)(k); return typeof t === 'string' && t !== k && t.charAt(0) !== '['; } catch (e) { return false; } };
    for (const id in seen) { const q = seen[id]; q._title = z(q.titleKey); q._desc = z(q.descriptionKey); q._items = ((q.rewards || {}).items || []).map(i => [i.itemId, !!window.__QOK.db[i.itemId]]); q._collect = q.objectives.filter(o => o.type === 'collect').map(o => [o.targetId, !!window.__QOK.db[o.targetId]]); }
    return { seen, rep: window.__QOK_MULTIACT__.quests() }; });
  const ids = Object.keys(T.seen), auto = (T.rep && T.rep.auto) || [];
  S.rec('the runtime\'s quest repairs are on and wrapped round the quest manager', !!(T.rep && T.rep.on && T.rep.wrapped), T.rep);
  S.rec(`the quest table still holds the ${QUEST_IDS.length} quests this probe knows, each startable in some order of its prerequisites`, QUEST_IDS.every(q => ids.includes(q)) && ids.every(q => QUEST_IDS.includes(q)),
    { missing: QUEST_IDS.filter(q => !ids.includes(q)), unknown: ids.filter(q => !QUEST_IDS.includes(q)) });
  const mapsWithDoor = new Set(acts.landmarks.map(l => l.mapId)), givers = {};
  for (const id of ids) {
    const q = T.seen[id], bad = [], giver = q.giverNpcId || q.turnInNpcId || null, npcs = TOWN_NPCS[q.turnInMapId];
    if (!giver) {
      if (!auto.includes(id)) bad.push('nobody gives it and the runtime does not start it');
      if (!q.objectives.every(o => o.type === 'defeat' && (o.count || 1) === 1 && BOSS_OF[o.targetId])) bad.push('a quest that ends by itself needs boss objectives only');
    } else {
      (givers[giver] = givers[giver] || []).push(id);
      if (!npcs) bad.push(`its report town ${q.turnInMapId} has no town`); else if (!npcs.includes(giver)) bad.push(`${giver} does not live in ${q.turnInMapId}`);
      if (npcs && q.turnInNpcId && !npcs.includes(q.turnInNpcId)) bad.push(`${q.turnInNpcId} (report) does not live in ${q.turnInMapId}`);
    }
    for (const p of q.prerequisites || []) { const b = /^boss\.(\w+)\.defeated$/.exec(p); if (b ? !BOSS_OF[b[1]] : !ids.includes(p)) bad.push('prerequisite ' + p + ' does not exist'); }
    for (const o of q.objectives) {
      if (o.type === 'talk') { if (npcs && !npcs.includes(o.targetId)) bad.push(`talk target ${o.targetId} is not in ${q.turnInMapId}`); }
      else if (o.type === 'visit') { if (!mapsWithDoor.has(o.targetId)) bad.push(`visit target ${o.targetId} has no door`); }
      else if (o.type === 'defeat') { if ((o.count || 1) === 1 ? !BOSS_OF[o.targetId] : !MOBS[o.targetId]) bad.push(`defeat target ${o.targetId} is not a known boss or monster`); }
      else if (o.type === 'collect') { if (!q._collect.find(c => c[0] === o.targetId && c[1])) bad.push(`collect target ${o.targetId} is not an item`); }
      else bad.push('unknown objective type ' + o.type);
    }
    q._items.forEach(i => { if (!i[1]) bad.push('reward item ' + i[0] + ' does not exist'); });
    if (!q._title || !q._desc) bad.push('title or description text missing');
    S.rec(`quest ${id}: a giver or an automatic start, prerequisites, objectives, report and rewards all resolve`, bad.length === 0,
      bad.length ? bad : { giver: giver ? `${giver} in ${q.turnInMapId}` : 'starts and ends by itself', after: q.prerequisites, steps: q.objectives.map(o => `${o.type} ${o.targetId}${o.count > 1 ? ' x' + o.count : ''}`) });
  }
  // a second quest of one person needs its own asking line (the person's quest lines are for the first)
  const second = Object.values(givers).filter(l => l.length > 1).map(l => l.slice(1)).flat().filter(id => !auto.includes(id));
  const QASK_OK = { crystalCaveGate: 'the Sage\'s own line (checked in act1)', kikisChallenge: 'Kiki\'s first quest (her lines are for it); kikisRescue is automatic' };
  for (const id of second) { const r = ROWS[`quest.${id}.ask`]; S.rec(`second quest ${id}: it has its own asking line in three languages`, !!QASK_OK[id] || !!(r && r.en && r.ja && r.jaKanji), QASK_OK[id] || (r ? Object.keys(r) : 'no row quest.' + id + '.ask')); }
  const tw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/towns.json'), 'utf8')).strings || {};
  const mine = Object.keys(ROWS).filter(k => /^quest\..*\.ask$|^npc\.(sage|kiki|drake|luna)\.questReminder$/.test(k)), kan = /[一-鿿]/, bad = [];
  for (const k of mine) { const r = ROWS[k]; if (!r.en || !r.ja || !r.jaKanji) bad.push(k + ': a language is missing'); else { if (kan.test(r.ja)) bad.push(k + ': kanji in the kana line'); if (!kan.test(r.jaKanji)) bad.push(k + ': no kanji in the kanji line'); if (/[A-Za-z]{3}/.test(r.ja + r.jaKanji)) bad.push(k + ': English in a Japanese line'); }
    if (JSON.stringify(tw[k]) !== JSON.stringify(r)) bad.push(k + ': towns.json and manifest.json differ'); }
  S.rec(`the ${mine.length} quest text rows are complete in English, kana and kanji, and the two index files agree`, mine.length === 7 && bad.length === 0, bad.length ? bad : mine);
};

// ---------------------------------------------------------------- act1: the four Act 1 quests by the real town path
G.act1 = async () => {
  await S.open(base({ ...exitOf('millbrook'), flags: { 'compass.visited.millbrook': true } }));
  await S.enterTown('millbrook');
  let r = await talkFor('sage', 'started', 'owlsLesson', 'the Sage');
  S.rec('Millbrook: the Sage gives The Mosswarden Threat', r.started.includes('owlsLesson'), r.started);
  await S.boss('mosswarden');
  let q0 = await S.q(); r = await talkFor('sage', 'finished', 'owlsLesson', 'the Sage, Mosswarden beaten (simulated)'); let q = await S.q();
  S.rec('the Sage takes the report: The Mosswarden Threat done, 3 potions', q.done.includes('owlsLesson') && q.own.potion === q0.own.potion + 3, { done: q.done, potion: [q0.own.potion, q.own.potion] });
  await S.settle(4); await S.heard();
  r = await S.talk('sage', { label: 'the Sage before Drake\'s cargo is done' });
  S.rec('the Sage does not ask for the Crystal Cave before Drake\'s errand', !r.started.length && !(await S.q()).active.includes('crystalCaveGate'), r.started);
  await S.leaveTown();
  // Greenhollow: Kiki's crab hunt belongs here
  await S.travel('greenhollow'); await S.enterTown('greenhollow');
  r = await talkFor('kiki', 'started', 'kikisChallenge', 'Kiki in Greenhollow');
  S.rec('Greenhollow: Kiki gives her crab hunt (Kiki\'s Challenge)', r.started.includes('kikisChallenge'), r.started);
  await S.progress('defeat', 'crab', 5);
  q0 = await S.q(); r = await talkFor('kiki', 'finished', 'kikisChallenge', 'Kiki, 5 crabs beaten (simulated)'); q = await S.q();
  S.rec('Kiki takes the report: 3 smoke bombs', q.done.includes('kikisChallenge') && q.own.smokeBomb === q0.own.smokeBomb + 3, { done: q.done, smokeBomb: [q0.own.smokeBomb, q.own.smokeBomb] });
  await S.settle(4); await S.leaveTown();
  // Port Sapphire: Drake's first errand
  await S.travel('portSapphire'); await S.enterTown('portSapphire');
  r = await talkFor('drake', 'started', 'drakeCargo', 'Drake');
  S.rec('Port Sapphire: Drake gives Drake\'s Lost Cargo', r.started.includes('drakeCargo'), r.started);
  await S.progress('visit', 'coastalReef');
  q0 = await S.q(); r = await talkFor('drake', 'finished', 'drakeCargo', 'Drake, reef visited (simulated)'); q = await S.q();
  S.rec('Drake takes the report: 50 gold and a hi-potion', q.done.includes('drakeCargo') && q.gold === q0.gold + 50 && q.own.hiPotion === q0.own.hiPotion + 1, { gold: [q0.gold, q.gold], hiPotion: q.own.hiPotion });
  await S.settle(4); await S.heard();
  r = await S.talk('drake', { label: 'Drake before the Shadow Dragon' });
  S.rec('Drake does not ask for his second errand before Act 3', !r.started.length, r.started);
  await S.leaveTown();
  // back to the Sage: his second quest, in his own words
  await S.travel('millbrook'); await S.enterTown('millbrook');
  const lines = await S.ev(() => { const Z = window.__QOK.Z, z = Z.__base || Z; return { own: z('npc.sage.postQuest'), first: z('npc.sage.questOffer') }; });
  await S.heard(); r = await talkFor('sage', 'started', 'crystalCaveGate', 'the Sage, second quest'); let h = (await S.heard()).say.concat(r.lines);
  S.rec('the Sage gives The Crystal Passage in Millbrook, in his own line about the cave (not the stolen-book line of his first quest)', r.started.includes('crystalCaveGate') && says(h, lines.own) && !says(h, lines.first), { started: r.started, shown: h.map(t => t.slice(0, 80)) });
  await S.leaveTown();
  let c = await S.compass();
  S.rec('compass after the Sage asks: an Act 1 door (the Crystal Cave)', !!c && A1_DOORS.includes(c.ox + ',' + c.oy), c);
  await S.boss('serpent'); c = await S.compass();
  S.rec('compass with the Serpent beaten (simulated): back to Millbrook, where the Sage lives', same(c, door('millbrook')), c);
  await back('millbrook');
  q0 = await S.q(); r = await talkFor('sage', 'finished', 'crystalCaveGate', 'the Sage, Serpent beaten'); q = await S.q();
  S.rec('the Sage takes the report in Millbrook: The Crystal Passage done, 100 gold', q.done.includes('crystalCaveGate') && q.gold === q0.gold + 100, { done: q.done, gold: [q0.gold, q.gold] });
};

// ---------------------------------------------------------------- act2: Gordo, the soldier, The Mountain Pass, Kiki's Shadow
G.act2 = async () => {
  await S.open(base({ ...exitOf('ironkeep'), flags: flagsOf('mosswarden', 'serpent'), completedQuests: A1Q, activeQuests: ['kikisChallenge'], progress: { kikisChallenge: { kiki: 1, crab: 2 } } }));
  let c = await S.compass(), q = await S.q();
  S.rec('Act 2 with Kiki\'s crab hunt (Act 1) unfinished: the compass does not point back to Act 1', !!c && !A1_DOORS.includes(c.ox + ',' + c.oy), c);
  await S.enterTown('ironkeep');
  let r = await S.talk('soldier', { label: 'the Ironkeep soldier before Gordo\'s quest' });
  S.rec('the soldier asks nothing before Gordo\'s ore is done', !r.started.length, r.started);
  r = await talkFor('gordo', 'started', 'gordosOre', 'Gordo');
  S.rec('Ironkeep: Gordo gives Gordo\'s Ore Request', r.started.includes('gordosOre'), r.started);
  await S.heard(); r = await S.talk('gordo', { label: 'Gordo, reminder' }); let hg = (await S.heard()).say.concat(r.lines);
  S.rec('Gordo\'s reminder sends her west to the Iron Mine (the bundle\'s line said south)', says(hg, ROWS['geo.npc.gordo.questReminder'].en) && hg.some(t => /west/.test(t)) && !hg.some(t => /Head south/.test(t)), hg.map(t => t.slice(0, 90)));
  await S.leaveTown();
  c = await S.compass();
  S.rec('compass with Gordo\'s Ore Request taken: the Iron Mine (not Ironkeep)', same(c, door('ironMine')), { compass: c, ironMine: at('ironMine'), ironkeep: at('ironkeep') });
  await S.give('ironOre', 3); await S.progress('collect', 'ironOre', 3); c = await S.compass();
  S.rec('compass with 3 Iron Ore (simulated drops): back to Ironkeep', same(c, door('ironkeep')), c);
  await back('ironkeep');
  let q0 = await S.q(); await S.heard(); let r2 = await talkFor('gordo', 'finished', 'gordosOre', 'Gordo, with the ore');
  await S.settle(); q = await S.q(); let h = await S.heard();
  S.rec('Gordo takes the ore: Gordo\'s Ore Request done, a Steel Sword', q.done.includes('gordosOre') && q.own.steelSword === q0.own.steelSword + 1, { done: q.done, steelSword: q.own.steelSword });
  S.rec('The Mountain Pass (nobody gives it) starts by itself once Gordo\'s Ore Request is done, with the "new quest" notice', q.active.includes('stormPass') && h.toast.length > 0, { active: q.active, toast: h.toast });
  await S.leaveTown();
  c = await S.compass();
  S.rec('compass with The Mountain Pass active: the Storm Nest (not the Iron Mine she has just come from)', same(c, door('stormNest')), c);
  q0 = await S.q(); await S.heard(); await S.boss('stormHarpy', ['windbreakerStone', 'shadowCrystal']); const l2 = await S.settle(); q = await S.q(); h = await S.heard();
  S.rec('the Storm Harpy falls (simulated): The Mountain Pass ends by itself with its reward (80 gold, experience) on the quest card', q.done.includes('stormPass') && q.gold === q0.gold + 80 && q.xp > q0.xp && l2.some(t => /quest complete/.test(t)), { done: q.done, gold: [q0.gold, q.gold], xp: [q0.xp, q.xp], shown: l2 });
  S.rec('Kiki\'s Shadow starts by itself after The Mountain Pass', q.active.includes('kikisRescue') && h.toast.length > 0, { active: q.active, toast: h.toast });
  // the Ice Wyrm beaten before the soldier ever asks
  await S.boss('iceWyrm', ['frostbrand']);
  await back('ironkeep'); q0 = await S.q();
  r = await talkFor('soldier', 'started', 'frozenSupplies', 'the soldier, Ice Wyrm already beaten (simulated)'); q = await S.q();
  S.rec('the soldier gives Frozen Supply Route and the Ice Wyrm beaten earlier counts', (q.active.includes('frozenSupplies') && (q.prog.frozenSupplies || {}).iceWyrm >= 1) || q.done.includes('frozenSupplies'), { active: q.active, prog: q.prog.frozenSupplies });
  if (!q.done.includes('frozenSupplies')) r = await talkFor('soldier', 'finished', 'frozenSupplies', 'the soldier, report');
  await S.settle(4); q = await S.q();
  S.rec('Frozen Supply Route can be finished with the Wyrm beaten first; one Frostbrand only, the spare paid as 200 gold', q.done.includes('frozenSupplies') && q.own.frostbrand === 1 && q.gold === q0.gold + 200, { done: q.done, frostbrand: q.own.frostbrand, gold: [q0.gold, q.gold] });
  await S.heard(); r = await S.talk('soldier', { label: 'the soldier afterwards' }); h = (await S.heard()).say.concat(r.lines);
  S.rec('afterwards the soldier speaks a line of his own (not the stock "thank you" of people without quest lines)', h.length > 0 && !says(h, await S.ev(() => { const Z = window.__QOK.Z; return (Z.__base || Z)('npc.postQuestGeneric'); })), h.map(t => t.slice(0, 90)));
  await S.leaveTown();
  c = await S.compass();
  S.rec('compass with Kiki\'s Shadow active in Act 2: the story goes on (not Act 1, not Haven\'s Edge)', !!c && !A1_DOORS.includes(c.ox + ',' + c.oy) && !same(c, door('havensEdge')), c);
  // the forest, by its real door
  await S.travel('Haunted Forest'); const w = await S.walkInto('Haunted Forest'); await S.page.waitForTimeout(2500); await S.inject(); await S.dismissAll(); const s = await S.st(); q = await S.q();
  S.rec('walking into the Haunted Forest counts as searching it for Kiki', s.map === 'hauntedForest' && (q.prog.kikisRescue || {}).hauntedForest >= 1, { map: s.map, walk: w.why, prog: q.prog.kikisRescue });
};

// ---------------------------------------------------------------- act3: Luna's Map, The Desert Gate, The Ancient Relic
G.act3 = async () => {
  await S.open(base({ ...exitOf('oasisHaven'), gold: 1000, flags: flagsOf('mosswarden', 'serpent', 'stormHarpy', 'dragon'), completedQuests: [...A1Q, 'gordosOre', 'stormPass'], activeQuests: ['kikisRescue'], progress: { kikisRescue: { hauntedForest: 1 } },
    inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'windbreakerStone', quantity: 1 }, { itemId: 'shadowCrystal', quantity: 1 }] }));
  const l0 = await S.settle(); let q = await S.q(), c = await S.compass();
  S.rec('a record with the Shadow Dragon beaten but Kiki never found: Into the Shadow is caught up (started and ended, 150 gold)', q.done.includes('shadowGate') && q.gold === 1150 && l0.some(t => /quest complete/.test(t)), { done: q.done, gold: q.gold, shown: l0 });
  S.rec('compass in Act 3 with Kiki\'s Shadow still open: not Act 1, not Haven\'s Edge (the story chain leads on)', !!c && !A1_DOORS.includes(c.ox + ',' + c.oy) && !same(c, door('havensEdge')), c);
  await S.enterTown('oasisHaven');
  let r = await talkFor('luna', 'started', 'lunasMap', 'Luna');
  S.rec('Oasis Haven: Luna gives Luna\'s Star Map', r.started.includes('lunasMap'), r.started);
  r = await S.talk('archaeologist', { label: 'the archaeologist before the Sand Golem' });
  S.rec('the archaeologist asks nothing before the Sand Golem falls', !r.started.length, r.started);
  await S.leaveTown(); c = await S.compass();
  S.rec('compass with Luna\'s Star Map taken: the Oasis Depths', same(c, door('oasisDepths')), c);
  await S.boss('sandSerpentQueen'); c = await S.compass();
  S.rec('compass with the Sand Serpent Queen beaten (simulated): Oasis Haven', same(c, door('oasisHaven')), c);
  await back('oasisHaven');
  let q0 = await S.q(); await S.heard(); r = await talkFor('luna', 'finished', 'lunasMap', 'Luna, report'); await S.settle(); q = await S.q(); let h = await S.heard();
  S.rec('Luna takes the report: Luna\'s Star Map done, 100 gold', q.done.includes('lunasMap') && q.gold === q0.gold + 100, { gold: [q0.gold, q.gold] });
  S.rec('The Desert Tomb (quest) starts by itself after Luna\'s Star Map', q.active.includes('desertGate') && h.toast.length > 0, { active: q.active, toast: h.toast });
  q0 = q; await S.boss('sandGolem', ['sandstormCloak', 'flameCloak', 'shadowCrystal']); const l1 = await S.settle(); q = await S.q();
  S.rec('the Sand Golem falls (simulated): The Desert Tomb (quest) ends by itself, 120 gold', q.done.includes('desertGate') && q.gold === q0.gold + 120 && l1.some(t => /quest complete/.test(t)), { gold: [q0.gold, q.gold], shown: l1 });
  r = await talkFor('archaeologist', 'started', 'ancientRelic', 'the archaeologist');
  S.rec('the archaeologist gives The Ancient Relic once the Golem is down', r.started.includes('ancientRelic'), r.started);
  await S.leaveTown(); c = await S.compass();
  S.rec('compass with The Ancient Relic taken: the Scorched Ruins', same(c, door('scorchedRuins')), c);
  await S.progress('visit', 'scorchedRuins');
  await back('oasisHaven');
  r = await talkFor('archaeologist', 'finished', 'ancientRelic', 'the archaeologist, ruins visited (simulated)'); q = await S.q();
  S.rec('the archaeologist takes the report: the Ancient Amulet', q.done.includes('ancientRelic') && q.own.ancientAmulet === 1, { done: q.done, amulet: q.own.ancientAmulet });
};

// ---------------------------------------------------------------- drake2: Drake's second errand, from Port Sapphire
G.drake2 = async () => {
  await S.open(base({ ...exitOf('portSapphire'), flags: flagsOf('mosswarden', 'serpent', 'stormHarpy', 'dragon'), completedQuests: [...A1Q, 'gordosOre', 'stormPass', 'shadowGate'] }));
  await S.enterTown('portSapphire'); await S.heard();
  let r = await talkFor('drake', 'started', 'drakesCargo2', 'Drake, second errand'); let h = (await S.heard()).say.concat(r.lines);
  S.rec('Port Sapphire: Drake gives Drake\'s Stolen Supplies in its own line about the bandits (not the reef line of his first errand)', r.started.includes('drakesCargo2') && says(h, ROWS['quest.drakesCargo2.ask'].en), { started: r.started, shown: h.map(t => t.slice(0, 90)) });
  await S.heard(); r = await S.talk('drake', { label: 'Drake, reminder' }); h = (await S.heard()).say.concat(r.lines);
  S.rec('his reminder is about the bandits too', says(h, ROWS['quest.drakesCargo2.ask'].en), h.map(t => t.slice(0, 90)));
  await S.leaveTown(); let c = await S.compass();
  S.rec('compass with Drake\'s Stolen Supplies taken: the Bandit Hideout', same(c, door('banditHideout')), c);
  await S.boss('banditLord'); c = await S.compass();
  S.rec('compass with the Bandit Lord beaten (simulated): Port Sapphire', same(c, door('portSapphire')), c);
  await back('portSapphire');
  const q0 = await S.q(); r = await talkFor('drake', 'finished', 'drakesCargo2', 'Drake, report'); const q = await S.q();
  S.rec('Drake takes the report: Drake\'s Stolen Supplies done, 200 gold', q.done.includes('drakesCargo2') && q.gold === q0.gold + 200, { gold: [q0.gold, q.gold] });
};

// ---------------------------------------------------------------- act4a: the Forgemaster, the way north, the Lava Wyrm fought for real
G.act4a = async () => {
  const done = [...A1Q, 'gordosOre', 'stormPass', 'shadowGate', 'lunasMap', 'desertGate', 'ancientRelic'];
  await S.open(base({ ...exitOf('Ember\'s Rest'), gold: 1000, flags: flagsOf('mosswarden', 'serpent', 'stormHarpy', 'dragon', 'sandSerpentQueen', 'sandGolem'), completedQuests: done,
    inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'flameCloak', quantity: 1 }, { itemId: 'sandstormCloak', quantity: 1 }, { itemId: 'windbreakerStone', quantity: 1 }] }));
  await S.enterTown('Ember\'s Rest');
  let r = await talkFor('forgemaster', 'started', 'flameCloak', 'the Forgemaster');
  S.rec('Ember\'s Rest: the Forgemaster gives The Forgemaster\'s Flame Cloak', r.started.includes('flameCloak'), r.started);
  await S.leaveTown(); let c = await S.compass();
  S.rec('compass for the Ember Mines before the Lava Wyrm: the Magma Tunnels, the only way north', same(c, door('Magma Tunnels')), { compass: c, tunnels: at('Magma Tunnels'), mines: at('emberMines') });
  c = await S.ev(() => { const p = window.__GAME_STATE__.player.state, w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), inv = p.inventory; p.inventory = inv.filter(i => i.itemId !== 'flameCloak'); p.storyFlags['boss.sandGolem.defeated'] = false;
    try { const t = w.getCompassTarget(); return t && { ox: t.ox, oy: t.oy }; } finally { p.inventory = inv; p.storyFlags['boss.sandGolem.defeated'] = true; } });
  S.rec('the same without the Magma Cloak or the Sand Golem (record edited for the moment): the Desert Tomb first', same(c, door('desertTomb')), c);
  // the Lava Wyrm, for real: The Magma Path starts and ends at its fall, inside the dungeon
  const sv = await S.capture(); const q0 = await S.q();
  const f = await S.bossFight('magmaTunnels', sv); if (!f) return;
  let q = await S.q();
  S.rec('The Magma Path (nobody gives it; the Forgemaster\'s errand not done) starts and ends at the Lava Wyrm\'s fall', q.done.includes('magmaPath'), { done: q.done, active: q.active });
  S.rec('its reward inside the dungeon comes in the game\'s message box; one Magma Blade only (the Wyrm drops it), the spare paid as 400 gold (plus the fight\'s own gold)', q.own.magmaBlade === 1 && q.gold >= q0.gold + 400 && q.xp > q0.xp && f.lines.some(t => /\+300 EXP\s+\+400 G/.test(t)), { magmaBlade: q.own.magmaBlade, gold: [q0.gold, q.gold], shown: f.lines.map(t => t.slice(0, 120)) });
  // the Forgemaster's report
  await S.progress('visit', 'emberMines');
  await S.travel('Ember\'s Rest'); c = await S.compass();
  S.rec('compass with the Ember Mines visited (simulated): Ember\'s Rest', same(c, door('Ember\'s Rest')), c);
  await S.enterTown('Ember\'s Rest');
  r = await talkFor('forgemaster', 'finished', 'flameCloak', 'the Forgemaster, report'); q = await S.q();
  S.rec('the Forgemaster takes the report: The Forgemaster\'s Flame Cloak done, and she still has exactly one Magma Cloak', q.done.includes('flameCloak') && q.own.flameCloak === 1, { done: q.done, cloak: q.own.flameCloak });
};

// ---------------------------------------------------------------- act4b: Luna's Prophecy, The Volcanic Gate
G.act4b = async () => {
  const done = [...A1Q, 'gordosOre', 'stormPass', 'shadowGate', 'lunasMap', 'desertGate', 'ancientRelic', 'flameCloak', 'magmaPath'];
  await S.open(base({ ...exitOf('oasisHaven'), flags: flagsOf('mosswarden', 'serpent', 'stormHarpy', 'dragon', 'sandSerpentQueen', 'sandGolem', 'lavaWyrm'), completedQuests: done,
    inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'flameCloak', quantity: 1 }, { itemId: 'magmaBlade', quantity: 1 }] }));
  await S.enterTown('oasisHaven'); await S.heard();
  let r = await talkFor('luna', 'started', 'lunasProphecy', 'Luna, second quest'); let h = (await S.heard()).say.concat(r.lines);
  S.rec('Oasis Haven: Luna gives Luna\'s Prophecy in its own line about the Obsidian Cavern (not the star-map line of her first quest)', r.started.includes('lunasProphecy') && says(h, ROWS['quest.lunasProphecy.ask'].en), { started: r.started, shown: h.map(t => t.slice(0, 90)) });
  await S.leaveTown(); let c = await S.compass();
  S.rec('compass with Luna\'s Prophecy taken: the Obsidian Cavern', same(c, door('obsidianCavern')), c);
  await S.boss('crystalHydra'); c = await S.compass();
  S.rec('compass with the Crystal Hydra beaten (simulated): Oasis Haven', same(c, door('oasisHaven')), c);
  await back('oasisHaven');
  let q0 = await S.q(); await S.heard(); r = await talkFor('luna', 'finished', 'lunasProphecy', 'Luna, report'); await S.settle(); let q = await S.q(); h = await S.heard();
  S.rec('Luna takes the report: Luna\'s Prophecy done, 150 gold', q.done.includes('lunasProphecy') && q.gold === q0.gold + 150, { gold: [q0.gold, q.gold] });
  S.rec('The Volcanic Forge (quest) starts by itself after Luna\'s Prophecy', q.active.includes('volcanicGate') && h.toast.length > 0, { active: q.active, toast: h.toast });
  await S.leaveTown(); c = await S.compass();
  S.rec('compass with that quest active and the Wyrm down: the Volcanic Forge itself', same(c, door('volcanicForge')), c);
  q0 = await S.q(); await S.boss('flameTitan'); const l = await S.settle(); q = await S.q();
  S.rec('the Flame Titan falls (simulated): The Volcanic Forge (quest) ends by itself, 300 gold', q.done.includes('volcanicGate') && q.gold === q0.gold + 300 && q.xp > q0.xp, { gold: [q0.gold, q.gold], shown: l });
  const av = await S.ev(() => { const gs = window.__GAME_STATE__; return gs.questManager.getAvailableQuests(gs.player.state).map(x => x.id); });
  S.rec('the Last Bastion veteran\'s quest is open now (it waits on The Volcanic Forge quest)', av.includes('demonBarracksQuest'), av);
};

// ---------------------------------------------------------------- act5a: the veteran, and Kiki at Haven's Edge
G.act5a = async () => {
  const done = [...A1Q, 'gordosOre', 'stormPass', 'shadowGate', 'lunasMap', 'desertGate', 'ancientRelic', 'flameCloak', 'magmaPath', 'lunasProphecy', 'volcanicGate'];
  await S.open(base({ ...exitOf('lastBastion'), flags: flagsOf('mosswarden', 'serpent', 'stormHarpy', 'dragon', 'sandSerpentQueen', 'sandGolem', 'lavaWyrm', 'crystalHydra', 'flameTitan'), completedQuests: done,
    activeQuests: ['kikisChallenge', 'kikisRescue'], progress: { kikisChallenge: { kiki: 1, crab: 2 }, kikisRescue: { hauntedForest: 1 } } }));
  let c = await S.compass();
  S.rec('Act 5 with the Act 1 crab hunt and Kiki\'s Shadow both open: the compass points at Haven\'s Edge, where Kiki is (not back to Act 1)', same(c, door('havensEdge')), c);
  await S.enterTown('lastBastion');
  let r = await talkFor('veteran', 'started', 'demonBarracksQuest', 'the veteran');
  S.rec('Last Bastion: the veteran gives Thin the Ranks', r.started.includes('demonBarracksQuest'), r.started);
  await S.progress('defeat', 'demon', 10);
  r = await talkFor('veteran', 'finished', 'demonBarracksQuest', 'the veteran, 10 demons beaten (simulated)'); let q = await S.q();
  S.rec('the veteran takes the report: the Holy Blade', q.done.includes('demonBarracksQuest') && q.own.holyBlade === 1, { done: q.done, holyBlade: q.own.holyBlade });
  await S.settle(4); await S.leaveTown();
  await S.travel('havensEdge'); await S.enterTown('havensEdge');
  r = await talkFor('kiki', 'finished', 'kikisRescue', 'Kiki at Haven\'s Edge'); q = await S.q();
  S.rec('finding Kiki at Haven\'s Edge ends Kiki\'s Shadow: the Iron Helm', q.done.includes('kikisRescue') && q.own.ironHelm === 1, { done: q.done, finished: r.finished, ironHelm: q.own.ironHelm });
  await S.settle(4); await S.heard();
  r = await talkFor('kiki', 'started', 'kikisResolve', 'Kiki, her Act 5 quest'); let h = (await S.heard()).say.concat(r.lines); q = await S.q();
  S.rec('Haven\'s Edge Kiki gives Kiki\'s Resolve, in its own line about the Void Rift (not the crab line), though the crab hunt is still open', r.started.includes('kikisResolve') && says(h, ROWS['quest.kikisResolve.ask'].en) && q.active.includes('kikisChallenge') && (q.prog.kikisChallenge || {}).crab === 2,
    { started: r.started, active: q.active, shown: h.map(t => t.slice(0, 90)) });
  await S.leaveTown(); c = await S.compass();
  S.rec('compass with Kiki\'s Resolve taken: the Void Rift', same(c, door('voidRift')), c);
  await S.progress('visit', 'voidRift'); c = await S.compass();
  S.rec('compass with the Void Rift visited (simulated): Haven\'s Edge', same(c, door('havensEdge')), c);
  await back('havensEdge');
  await S.heard(); r = await talkFor('kiki', 'finished', 'kikisResolve', 'Kiki, report'); await S.settle(); q = await S.q(); h = await S.heard();
  S.rec('Kiki takes the report: Kiki\'s Resolve done, the Gale Shield', q.done.includes('kikisResolve') && q.own.galeShield === 1, { done: q.done, galeShield: q.own.galeShield });
  S.rec('The Four Relics starts by itself after Kiki\'s Resolve', q.active.includes('portalRelics') && h.toast.length > 0, { active: q.active, toast: h.toast });
};

// ---------------------------------------------------------------- act5b: The Four Relics, the Sentinel fought for real, The Final Battle
G.act5b = async () => {
  const done = [...A1Q, 'gordosOre', 'stormPass', 'kikisRescue', 'shadowGate', 'lunasMap', 'desertGate', 'ancientRelic', 'flameCloak', 'magmaPath', 'lunasProphecy', 'volcanicGate', 'demonBarracksQuest', 'kikisResolve'];
  // the Act 5 towns seen and its two dungeons cleared: the bundle's story chain names every dungeon boss in order before the portals
  const flags = { ...flagsOf('mosswarden', 'serpent', 'stormHarpy', 'dragon', 'sandSerpentQueen', 'sandGolem', 'lavaWyrm', 'crystalHydra', 'flameTitan', 'warGeneralMalachar', 'nullDevourer'), 'compass.visited.lastBastion': true, 'compass.visited.havensEdge': true };
  await S.open(base({ ...exitOf('havensEdge'), flags, completedQuests: done, inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'galeShield', quantity: 1 }] }));
  await S.settle(5); let q = await S.q(), c = await S.compass();
  S.rec('a record with Kiki\'s Resolve done: The Four Relics starts by itself', q.active.includes('portalRelics'), q.active);
  const portals = ['Portal - Stormreach Isles', 'Portal - Frostfall Peaks', 'Portal - Sunken Temple', 'Portal - Twilight Realm'];
  S.rec('compass with The Four Relics active (Demon Barracks and Void Rift cleared): one of the four portals', portals.some(p => same(c, door(p))), c);
  await S.progress('defeat', 'swordWraith'); await S.page.waitForTimeout(600); q = await S.q();
  S.rec('a win over the Sword Wraith\'s hunter (simulated; the Wraith itself not beaten) does not count as the Wraith for The Four Relics', !((q.prog.portalRelics || {}).swordWraith > 0), q.prog.portalRelics);
  const sv = await S.capture(); const f = await S.bossFight('stormreachSpire', sv); if (!f) return;
  q = await S.q();
  S.rec('the Storm Sentinel counts for The Four Relics, and its Gale Shield is not given a second time (Kiki gave one)', (q.prog.portalRelics || {}).stormSentinel === 1 && q.own.galeShield === 1, { prog: q.prog.portalRelics, galeShield: q.own.galeShield });
  const q0 = q; await S.boss('frostMonarch', ['crownOfWisdom']); await S.boss('celestialGuardian', ['aegisOfDawn']); await S.boss('swordWraith', ['excalibur']);
  const l = await S.settle(); q = await S.q(); const h = await S.heard();
  S.rec('the other three portal bosses fall (simulated): The Four Relics ends by itself with its reward (experience)', q.done.includes('portalRelics') && q.xp > q0.xp, { done: q.done, xp: [q0.xp, q.xp], shown: l.map(t => t.slice(0, 100)) });
  S.rec('The Final Battle starts by itself after The Four Relics', q.active.includes('finalBattle') && h.toast.length > 0, { active: q.active, toast: h.toast });
  await S.travel('demonCastle'); c = await S.compass();
  S.rec('compass with The Final Battle active: the Demon Castle', same(c, door('demonCastle')), c);
  await S.ev(() => { const gs = window.__GAME_STATE__; gs.player.state.storyFlags['boss.demonKing.defeated'] = true; gs.questManager.updateProgress(gs.player.state, 'defeat', 'demonKing', 1); });
  await S.page.waitForTimeout(1500); q = await S.q(); const s = await S.st();
  S.rec('the Demon King falls (simulated): The Final Battle is closed without a card or a box (the ending follows)', q.done.includes('finalBattle') && !s.msg && !(await S.ev(() => { const k = document.getElementById('qok-quest-completion'); return !!(k && !k.hidden); })), { done: q.done.slice(-3) });
  const left = QUEST_IDS.filter(id => !q.done.includes(id) && !['kikisChallenge', 'frozenSupplies', 'drakesCargo2'].includes(id));
  S.rec('nothing of the main line is left open on this record', left.length === 0, left);
};

// ---------------------------------------------------------------- oldsave: records made before the fixes
G.oldsave = async () => {
  // (a) everything beaten up to the Demon Castle, on the old build: no giver-less quest ever started
  const flags = flagsOf(...Object.keys(BOSS_OF).filter(b => b !== 'demonKing'));
  const done = [...A1Q, 'kikisChallenge', 'gordosOre', 'frozenSupplies', 'lunasMap', 'ancientRelic', 'flameCloak', 'lunasProphecy'];
  const inv = ['herb', 'frostbrand', 'magmaBlade', 'galeShield', 'flameCloak', 'steelSword', 'windbreakerStone', 'holyAmulet', 'excalibur'].map(itemId => ({ itemId, quantity: 1 }));
  await S.open(base({ ...exitOf('havensEdge'), gold: 1000, flags, completedQuests: done, inventory: inv }));
  const l = await S.settle(24); let q = await S.q(); const cards = l.filter(t => /quest complete/.test(t));
  const ends = ['stormPass', 'shadowGate', 'desertGate', 'magmaPath', 'volcanicGate', 'portalRelics'];
  S.rec('an old finished record is caught up on load: the six boss quests end one after another, each with its card', ends.every(e => q.done.includes(e)) && cards.length === 6, { done: q.done.filter(d => ends.includes(d)), cards });
  S.rec('their gold is paid once (80+150+120+300, and 400 for the Magma Blade she already owns): 1000 -> 2050; still one Magma Blade', q.gold === 2050 && q.own.magmaBlade === 1, { gold: q.gold, magmaBlade: q.own.magmaBlade });
  S.rec('Kiki\'s Shadow and The Final Battle are open, nothing else of theirs is missing', q.active.includes('kikisRescue') && q.active.includes('finalBattle'), q.active);
  let c = await S.compass();
  S.rec('compass on that record (Act 5): Haven\'s Edge, where Kiki waits', same(c, door('havensEdge')), c);
  await S.travel('greenhollow'); c = await S.compass();
  S.rec('the same record back in Act 1: the compass points at Greenhollow, where the other Kiki is', same(c, door('greenhollow')), c);
  const sv1 = await S.capture(); await S.boot(sv1); await S.settle(4); const q1 = await S.q();
  S.rec('Continue again: nothing is paid twice', q1.gold === q.gold && q1.done.length === q.done.length && q1.xp === q.xp, { gold: [q.gold, q1.gold], done: [q.done.length, q1.done.length] });
  // (b) the Sunken Temple golden chest opened before the Holy Amulet fix
  const f6 = D2.floors['sunkenTempleDungeon-f6'], chest = f6.assets.find(a => a.golden), land = f6.land.fromPrev;
  const t = (o) => base({ mapId: 'sunkenTempleDungeon', x: land.x, y: land.y, floor: 6, flags: { ...flagsOf('flameTitan'), ...o.flags }, completedQuests: done, inventory: o.inventory || [{ itemId: 'herb', quantity: 5 }] });
  await S.boot(t({ flags: { [`chest.sunkenTempleDungeon.f6.${chest.x}.${chest.y}`]: true } }), { settle: 4500 });
  let s = await S.st(); q = await S.q(); const said = (await S.heard()).say.concat(await S.dismissAll());
  S.rec('old record, golden chest already open, no Holy Amulet, Wraith not beaten: on the Wraith\'s floor she is handed the amulet, with the chest\'s own line', s.map === 'sunkenTempleDungeon' && s.floor === 6 && q.own.holyAmulet === 1 && said.length > 0, { at: [s.map, s.floor], amulet: q.own.holyAmulet, said: said.map(x => x.slice(0, 100)) });
  await S.page.waitForTimeout(2500); q = await S.q();
  S.rec('she is handed one amulet, not one every second', q.own.holyAmulet === 1, q.own.holyAmulet);
  await S.boot(t({ flags: {} }), { settle: 4500 }); await S.dismissAll(); q = await S.q();
  S.rec('chest still shut: no amulet is handed out (it is in the chest)', q.own.holyAmulet === 0, q.own.holyAmulet);
  await S.boot(t({ flags: { [`chest.sunkenTempleDungeon.f6.${chest.x}.${chest.y}`]: true, 'boss.swordWraith.defeated': true } }), { settle: 4500 }); await S.dismissAll(); q = await S.q();
  S.rec('chest open and the Wraith already beaten: no amulet is handed out (no longer needed)', q.own.holyAmulet === 0, q.own.holyAmulet);
  // (c) for the record: the same seed with the repairs switched off
  const sv = base({ ...exitOf('ironkeep'), flags: flagsOf('mosswarden', 'serpent'), completedQuests: [...A1Q, 'gordosOre'], activeQuests: ['kikisChallenge'], progress: { kikisChallenge: { kiki: 1, crab: 2 } } });
  await L.bootSave(S.page, sv, { extra: { 'qok-quest-repairs': '0' }, settle: 2500 }); await S.inject(); await S.page.waitForTimeout(3000); q = await S.q(); c = await S.compass();
  console.log(`[INFO] oldsave: with localStorage qok-quest-repairs=0 (the bundle alone) The Mountain Pass ${q.active.includes('stormPass') ? 'starts' : 'never starts'} and the compass points at ${JSON.stringify(c)} ${c && A1_DOORS.includes(c.ox + ',' + c.oy) ? '(an Act 1 door)' : ''}`);
};

// ---------------------------------------------------------------- words: the same lines in kana and in kanji
G.words = async () => {
  const done5 = [...A1Q, 'gordosOre', 'stormPass', 'kikisRescue', 'shadowGate', 'lunasMap', 'desertGate', 'ancientRelic', 'flameCloak', 'magmaPath', 'lunasProphecy', 'volcanicGate', 'demonBarracksQuest'];
  const cases = [
    { town: 'havensEdge', npc: 'kiki', quest: 'kikisResolve', row: 'quest.kikisResolve.ask', flags: flagsOf('flameTitan'), done: done5 },
    { town: 'oasisHaven', npc: 'luna', quest: 'lunasProphecy', row: 'quest.lunasProphecy.ask', flags: flagsOf('dragon', 'lavaWyrm'), done: ['lunasMap'] },
    { town: 'portSapphire', npc: 'drake', quest: 'drakesCargo2', row: 'quest.drakesCargo2.ask', flags: flagsOf('dragon'), done: ['drakeCargo', 'shadowGate'] },
    { town: 'millbrook', npc: 'sage', quest: 'crystalCaveGate', own: 'npc.sage.postQuest', flags: {}, done: ['owlsLesson', 'drakeCargo'] },
    { town: 'oasisHaven', npc: 'luna', quest: 'lunasMap', remind: 'npc.luna.questReminder', flags: flagsOf('dragon'), done: [] },
    { town: 'millbrook', npc: 'sage', quest: 'owlsLesson', remind: 'npc.sage.questReminder', flags: {}, done: [] },
  ];
  let first = true;
  for (const mode of [['ja', false, 'ja', 'kana'], ['ja', true, 'jaKanji', 'kanji']]) for (const k of cases) {
    const sv = base({ mapId: k.town, x: 32, y: 40, locale: mode[0], kanjiMode: mode[1], flags: k.flags, completedQuests: k.done });
    if (first) { await S.open(sv); first = false; } else await S.boot(sv);
    await S.settle(3); await S.heard();
    const offer = await S.direct(k.npc, `npc.${k.npc}.greeting`), q = await S.q(), remind = await S.direct(k.npc, `npc.${k.npc}.greeting`);
    const want = k.own ? await S.ev(key => { const Z = window.__QOK.Z; return (Z.__base || Z)(key); }, k.own) : ROWS[k.row || k.remind][mode[2]];
    const kan = /[一-鿿]/.test(remind.join('') + offer.join(''));
    if (k.remind) S.rec(`${mode[3]}: ${k.npc}'s reminder for ${k.quest} is shown in ${mode[3]}`, q.active.includes(k.quest) && says(remind, want) && kan === mode[1], { remind: remind.map(t => t.slice(0, 60)) });
    else S.rec(`${mode[3]}: ${k.npc} asks for ${k.quest} in its own line, and reminds with it`, q.active.includes(k.quest) && says(offer, want) && says(remind, want) && kan === mode[1], { offer: offer.map(t => t.slice(0, 60)), remind: remind.map(t => t.slice(0, 60)) });
  }
};

(async () => {
  const kill = setTimeout(() => { console.log(`[FAIL] ${GROUP}: ran out of time (${GROUP_MS / 1000} s)`); process.exit(1); }, GROUP_MS - 15000);
  try {
    if (!G[GROUP]) throw new Error('no group ' + GROUP);
    await G[GROUP]();
    if (S.page) await S.noErrors();
  } catch (e) {
    S.rec('the group ran to its end', false, String(e && e.stack || e).slice(0, 700));
    try { if (S.page) await S.shot('crash'); } catch (e2) {}
  }
  clearTimeout(kill);
  await S.close();
  const fail = S.rows.filter(r => r.status === 'FAIL').length;
  console.log(`${GROUP}: ${S.rows.length} checks, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
