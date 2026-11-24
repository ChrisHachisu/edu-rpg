// Honest player, part 2: the in-page driver (injected with page.evaluate).
//
// What is REAL here (the game's own code decides it):
//   * every fight runs in the shipped BattleScene, launched with the two calls the bundle's own
//     startBattle ends with (scene.launch('BattleScene', {monster, zone}) + pause), on the hero's live
//     record; damage, quiz timer, crit / speed bonus, boss abilities, XP, gold, drops, level-ups and
//     quest progress are the bundle's BattleEngine + ui-overhaul.js's "a wrong answer cannot finish"
//     patch (the driver waits until that patch is on the engine before the first answer);
//   * the menu, quiz and message steps are the scene's own methods, the same ones ui-overhaul.js's
//     buttons call (confirmMenuAction / confirmItemSelection / confirmQuizAnswer / advanceMessage);
//   * encounters: the bundle's EncounterManager.onStep(zone), one call per step walked;
//   * overworld zone: GameState.getOverworldZone (as wrapped by acts-runtime.js);
//   * chest loot: WorldMapScene.getTreasureReward for that dungeon; items: Player.addItem/equip/heal;
//   * quests: the bundle's QuestManager (start / progress / ready / complete).
// What is the HARNESS (stated in the report):
//   * no animation is waited for: a message is advanced at once, and the scene clock is stepped by
//     hand (Clock.preUpdate + update(+1001 ms)) to fire the 1 s "answer shown" delay; the child's
//     thinking time is written into the quiz timer bar (the value confirmQuizAnswer reads) instead of
//     being waited out, and a think time past the timer calls the scene's own onQuizTimeout;
//   * a lost fight is stopped before GameOverScene; the defeat rule is then applied as ui-overhaul.js
//     states it (boss: back to the record the fight started from; otherwise half the gold, full HP,
//     last town).
(function () {
  if (window.__HON) return;
  const G = () => window.__PHASER_GAME__, GS = () => window.__GAME_STATE__, WM = () => G().scene.getScene('WorldMapScene'), BS = () => G().scene.getScene('BattleScene');
  const P = () => GS().player, ST = () => P().state, DB = () => window.__QOK.db;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, ms = 15000, what = '') { const t0 = performance.now(); for (;;) { let v = false; try { v = fn(); } catch (e) { v = false; } if (v) return v; if (performance.now() - t0 > ms) throw new Error('waitFor timeout: ' + what); await sleep(4); } }

  // ---- the child (own seeded RNG; the game keeps Math.random)
  let seed = 1, prof = { p: 0.8, t: 4, sd: 0.35 }, pol = { healAt: 0.35, fleeAt: 0.2, bossHealAt: 0, defendCharge: false };
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function gauss() { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const think = () => Math.max(0.8, prof.t * Math.exp(gauss() * prof.sd - prof.sd * prof.sd / 2));   // log-normal, mean = prof.t
  function init(cfg) { seed = cfg.seed | 0; prof = Object.assign({ sd: 0.35 }, cfg.profile); pol = Object.assign(pol, cfg.policy || {}); return { seed, prof, pol }; }

  function monster(id) { const em = GS().encounterManager, w = console.warn; console.warn = () => {}; try { return em.rollEncounter({ monsters: [{ monsterId: id, weight: 1 }] }); } finally { console.warn = w; } }
  const healItems = () => ST().inventory.filter(s => s.quantity > 0 && DB()[s.itemId] && DB()[s.itemId].type === 'consumable' && DB()[s.itemId].effect && DB()[s.itemId].effect.type === 'heal');
  function pickHeal(list) { const miss = P().totalMaxHp - ST().hp; if (!list.length) return null; const ok = list.filter(s => DB()[s.itemId].effect.value >= miss * 0.7).sort((a, b) => DB()[a.itemId].effect.value - DB()[b.itemId].effect.value); return (ok[0] || list.slice().sort((a, b) => DB()[b.itemId].effect.value - DB()[a.itemId].effect.value)[0]).itemId; }
  function snapshot() { const q = GS().quizManager; return JSON.stringify({ s: ST(), stats: q.stats }); }
  function restore(j) { const o = JSON.parse(j), s = ST(), q = GS().quizManager; for (const k of Object.keys(s)) delete s[k]; Object.assign(s, o.s); q.stats = o.stats; q.consecutiveWrong = 0; q.consecutiveCorrect = 0; }   // = loadAutoSave(record): a new quiz manager
  function tickClock(bs, ms) { bs.time.preUpdate(); bs.time.update(bs.time.now + ms, ms); }

  // ---- one fight in the real BattleScene
  let fightNo = 0;
  async function fight(monsterId, zone, o = {}) {
    const g = G(), wm = WM(), mon = typeof monsterId === 'string' ? monster(monsterId) : monsterId, t0 = performance.now();
    if (!mon) throw new Error('no monster ' + monsterId);
    await waitFor(() => g.scene.isActive('WorldMapScene') && !g.scene.isPaused('WorldMapScene') && !g.scene.isActive('BattleScene') && !g.scene.isActive('GameOverScene'), 15000, 'field ready');
    const bs0 = BS(), prevEngine = bs0 && bs0.engine, s = ST(), p = P();
    const L = { n: ++fightNo, m: mon.id, boss: mon.aiPattern === 'boss', zone, lvl0: s.level, hp0: s.hp, maxHp: p.totalMaxHp, atk: p.totalAtk, def: p.totalDef, gold0: s.gold, exp0: s.exp, rounds: 0, q: 0, ok: 0, to: 0, crit: 0, fast: 0, items: 0, hidden: 0, flee: 0,
      taken: 0, maxHit: 0, hits: 0, dealt: 0, minHp: s.hp, sec: 2, res: null };
    wm.currentEncounterZone = zone;
    wm.scene.launch('BattleScene', { monster: mon, zone }); wm.scene.pause();       // the tail of the bundle's WorldMapScene.startBattle
    const bs = await waitFor(() => { const b = BS(); return g.scene.isActive('BattleScene') && b.engine && b.engine !== prevEngine && b.engine.__qokWrongFinishPatched && b.phase ? b : null; }, 15000, 'battle + ui-overhaul patch');
    const eng = bs.engine; L.mhp = bs.monster.baseHp; L.matk = bs.monster.baseAtk; L.mdef = bs.monster.baseDef; L.tier = bs.getEnemyTier();
    // passive trace of the engine's own results
    const rp = eng.resolvePlayerAttack, re = eng.resolveEnemyAttack, pt = eng.processTurnAbilities; let hpBefore = s.hp;
    const tr = o.trace ? (L.trace = []) : null, r3 = v => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
    eng.resolvePlayerAttack = function (c, ratio, el) { const m0 = this.monsterHp, r = rp.apply(this, arguments); L.dealt += Math.max(0, m0 - this.monsterHp);
      if (c && el !== void 0 && el <= 3) L.crit++; else if (c && ratio !== void 0 && ratio >= 0.5) L.fast++;          // the bundle's own two thresholds
      if (tr) tr.push(['P', !!c, r3(ratio), r3(el), m0 - this.monsterHp, r && r.state]); return r; };
    eng.resolveEnemyAttack = function (c, ratio) { const h0 = ST().hp, r = re.apply(this, arguments), d = h0 - ST().hp; L.taken += d; L.hits++; if (d > L.maxHit) L.maxHit = d; if (tr) tr.push(['E', !!c, r3(ratio), d, r && r.state]); return r; };
    eng.processTurnAbilities = function () { const h0 = ST().hp, m0 = this.monsterHp, r = pt.apply(this, arguments); L.taken += h0 - ST().hp; if (tr) tr.push(['T', h0 - ST().hp, this.monsterHp - m0, r.length]); return r; };
    let idle = 0, end = null;
    for (let guard = 0; guard < 20000 && !end; guard++) {
      if (ST().hp < L.minHp) L.minHp = ST().hp;
      if (!p.isAlive) { end = 'loss'; break; }
      if (eng.state === 'victory') { end = 'win'; break; }
      if (eng.state === 'fled') { end = 'fled'; break; }
      const ph = bs.phase;
      if (ph === 'playerMenu') { idle = 0;
        const heals = healItems(), low = s.hp < p.totalMaxHp * (L.boss && pol.bossHealAt ? pol.bossHealAt : pol.healAt);
        if (pol.defendCharge && eng.isCharging) { const di = bs.menuItems.findIndex(t => t.getData('action') === 'defend'); if (di >= 0) { bs.menuIndex = di; bs.confirmMenuAction(); L.defends = (L.defends || 0) + 1; L.sec += 2; continue; } }   // she was warned: "... is gathering power!"

        if (low && heals.length) {
          const want = pickHeal(heals); bs.showItemMenu();
          let i = bs.itemMenuItems.findIndex(t => t.getData('itemId') === want);
          if (i < 0) { L.hidden++; i = bs.itemMenuItems.findIndex(t => { const id = t.getData('itemId'), d = DB()[id]; return d && d.effect && d.effect.type === 'heal'; }); }   // the bundle's battle bag shows 4 rows
          if (i >= 0) { bs.itemMenuIndex = i; bs.confirmItemSelection(); L.items++; L.sec += 3; continue; }
          bs.clearItemMenu(); bs.drawMenu();
        }
        if (low && !L.boss && s.hp < p.totalMaxHp * pol.fleeAt && !heals.length) { bs.menuIndex = 3; bs.confirmMenuAction(); L.flee++; L.sec += 2; continue; }
        bs.menuIndex = 0; bs.confirmMenuAction(); L.rounds++; continue;
      }
      if (ph === 'playerQuiz' || ph === 'enemyQuiz') { idle = 0;
        // Keypad answers (ui-overhaul.js, on unless qok-keypad=0): she types the number, so each key costs time (prof.keypad.first
        // for the first key, .key for every further digit and for Enter), a slip can spoil a sum she knew (.slip), and with
        // .noGuess the one-in-four lucky pick of the four buttons is gone: p becomes (p - 0.25) / 0.75. The game's own timer is
        // already 1.5x (quizTimerSeconds comes from the patched getTimerSeconds).
        const kp = prof.keypad && window.__QOK_KEYPAD__ && window.__QOK_KEYPAD__.on() ? prof.keypad : null;
        const keys = kp ? String((((bs.quizQuestion.answers.find(x => !!x.isCorrect) || {}).text || {}).en) || '0').length : 0;
        const pEff = kp ? (kp.noGuess ? Math.max(0, (prof.p - 0.25) / 0.75) : prof.p) * (1 - (kp.slip || 0)) : prof.p;
        const T = bs.quizTimerSeconds, timed = !!(s.timerEnabled && bs.quizTimerBar && bs.quizTimerBarFullWidth), t = think() + (kp ? kp.first + kp.key * keys : 0), right = rnd() < pEff; L.q++;
        if (timed && t >= T) { L.to++; L.sec += T + 2.8; bs.onQuizTimeout(); continue; }
        if (timed) bs.quizTimerBar.displayWidth = bs.quizTimerBarFullWidth * (1 - t / T);      // where the bundle's linear tween stands after t seconds
        const a = bs.quizQuestion.answers, good = a.findIndex(x => !!x.isCorrect), bad = a.map((x, i) => i).filter(i => i !== good);
        bs.quizSelectedIndex = right || !bad.length ? good : bad[Math.floor(rnd() * bad.length)]; if (right) L.ok++; L.sec += t + 2.8;
        bs.confirmQuizAnswer(); continue;
      }
      if (ph === 'message' || ph === 'intro') {
        if (bs._messageCallback) { idle = 0; bs.advanceMessage(); continue; }
        tickClock(bs, 1001); if (++idle > 12) { end = 'stuck'; break; } continue;                 // the 1 s delay after an answer
      }
      if (ph === 'itemSelect') { bs.clearItemMenu(); bs.drawMenu(); continue; }
      if (++idle > 50) { end = 'stuck'; break; } await sleep(2);
    }
    if (!end) end = 'stuck';
    if (ST().hp < L.minHp) L.minHp = ST().hp;
    L.res = end; L.mhpEnd = eng.monsterHp; L.stuckPhase = end === 'stuck' ? bs.phase + '/' + eng.state : undefined;
    if ((end === 'win' && mon.id !== 'demonKing') || end === 'fled') {
      // the scene's own ending: the victory / fled message, whose callback is endBattle()
      for (let k = 0; k < 40 && g.scene.isActive('BattleScene') && bs.sceneActive; k++) { if (bs._messageCallback) { bs.advanceMessage(); break; } tickClock(bs, 1001); }
      L.sec += 3;
    } else { try { bs._messageCallback = void 0; bs.scene.stop(); } catch (e) {} g.scene.resume('WorldMapScene'); }   // loss / final boss / stuck: leave without GameOverScene / VictoryScene
    await waitFor(() => !g.scene.isActive('BattleScene') && g.scene.isActive('WorldMapScene') && !g.scene.isPaused('WorldMapScene'), 15000, 'back on the field');
    wm.isMoving = false;
    L.hpEnd = ST().hp; L.lvl1 = ST().level; L.xp = ST().exp - L.exp0; L.gold = ST().gold - L.gold0; L.ms = Math.round(performance.now() - t0); L.sec = Math.round(L.sec);
    return L;
  }

  // ---- between fights
  function fieldHeal(log) { let n = 0; while (ST().hp > 0 && ST().hp < P().totalMaxHp * pol.healAt) { const h = healItems(); if (!h.length) break; const id = pickHeal(h); P().heal(DB()[id].effect.value); P().removeItem(id, 1); n++; } if (n && log) log.fieldItems = (log.fieldItems || 0) + n; return n; }
  function defeatRule() { const s = ST(), lost = Math.floor((s.gold || 0) / 2); s.gold = (s.gold || 0) - lost; P().fullHeal(); s.poisonedUntil = 0; return lost; }   // ui-overhaul.js returnToTown()
  // Walk `steps` steps; zone is a fixed id or, on the overworld, the game's own answer for the cell under her.
  async function walk(o) {
    const em = GS().encounterManager, gs = GS(), out = { steps: 0, fights: [], died: false, fieldItems: 0 };
    em.isDungeon = !!o.dungeon; if (o.reset) em.reset();
    for (let i = 0; i < o.steps; i++) { out.steps++;
      let zone = o.zone; if (!zone && o.cells) { const c = o.cells[Math.min(o.cells.length - 1, Math.floor(i * (o.cells.length - 1) / Math.max(1, o.steps - 1)))]; zone = gs.getOverworldZone(c[0], c[1]); }
      if (!zone) continue; em.isDungeon = !!o.dungeon;
      if (o.map && window.__QOK_BALANCE__) zone = window.__QOK_BALANCE__.zoneFor(o.map, zone);     // the fixed game's dungeon zone table (battle-recovery.js)
      const mon = em.onStep(zone); if (!mon) continue;
      const f = await fight(mon, zone); f.step = i; out.fights.push(f);
      if (f.res === 'loss') { out.died = true; out.goldLost = defeatRule(); break; }
      if (f.res === 'stuck') { out.stuck = true; break; }
      fieldHeal(out);
    }
    return out;
  }
  function chest(dungeonId, golden) {
    if (golden) { const ok = P().addItem('holyAmulet', 1); return { itemId: 'holyAmulet', gold: 0, lost: !ok }; }     // dq-tiles.js a2dOnApply names it as the bundle's goldenChestPos; tryOpenTreasure ignores addItem's answer
    const r = WM().getTreasureReward.call({ currentMapId: dungeonId });
    if (r.itemId && window.__QOK_BALANCE__ && !window.__QOK_BALANCE__.canAdd(r.itemId)) return { itemId: r.itemId, gold: 0, closed: true };     // the fixed game leaves such a chest shut (battle-recovery.js)
    ST().gold += r.gold; if (r.itemId) { if (!P().addItem(r.itemId, 1)) r.lost = true; GS().questManager.updateProgress(ST(), 'collect', r.itemId, 1); } return r;
  }
  function crystal() { const h = ST().hp; P().fullHeal(); return P().totalMaxHp - h; }
  function equipBest(log) { const s = ST(), db = DB(); for (const it of s.inventory.slice()) { const d = db[it.itemId]; if (!d || !['weapon', 'armor', 'shield', 'helmet', 'accessory'].includes(d.type) || !d.stats) continue; const cur = s.equipment[d.type], cs = cur && db[cur] && db[cur].stats ? (db[cur].stats.atk || 0) + (db[cur].stats.def || 0) : 0, ns = (d.stats.atk || 0) + (d.stats.def || 0); if (ns > cs) { P().equip(it.itemId); if (log) log.push(it.itemId); } } }
  function applyRewards(r) { const lost = []; if (!r) return lost; const p = P(), n0 = (r.items || []).map(it => p.getItemCount(it.itemId)); WM().applyQuestRewards(r); (r.items || []).forEach((it, i) => { if (p.getItemCount(it.itemId) <= n0[i]) lost.push(it.itemId); }); return lost; }   // WorldMapScene.applyQuestRewards
  function quest(q, quests, log) {
    const qm = GS().questManager, s = ST();
    const talk = id => { for (const ob of quests[id].objectives) if (ob.type === 'talk') qm.updateProgress(s, 'talk', ob.targetId, 1); };
    if (q.start) { if (qm.canStartQuest(q.start, s)) { qm.startQuest(q.start, s); talk(q.start); log.questStarted = q.start; } else if (!s.activeQuests.includes(q.start) && !s.completedQuests.includes(q.start)) log.questRefused = q.start; }
    if (q.turnIn && s.activeQuests.includes(q.turnIn)) { talk(q.turnIn); if (qm.isQuestReady(q.turnIn, s)) { const r = qm.completeQuest(q.turnIn, s), lost = applyRewards(r); log.questDone = q.turnIn; log.questReward = r; if (lost.length) log.questLost = lost; } else log.questNotReady = { id: q.turnIn, progress: JSON.parse(JSON.stringify(s.questProgress[q.turnIn] || {})) }; }
  }
  // A town: quest people, healer, gear (weapon, armor, shield, helmet: the best she can pay for), then heal items.
  function town(o, quests) {
    const s = ST(), p = P(), db = DB(), log = { id: o.id, gold0: s.gold, hp0: s.hp, maxHp0: p.totalMaxHp, level: s.level, bought: [], equipped: [] };
    if (o.quest) quest(o.quest, quests, log);
    if (s.hp < p.totalMaxHp) { if (!o.healer) { p.fullHeal(); log.healed = 0; } else if (s.gold >= o.healer) { s.gold -= o.healer; p.fullHeal(); log.healed = o.healer; } else log.cantHeal = o.healer; }
    equipBest(log.equipped);
    const stat = id => { const d = id && db[id]; return d && d.stats ? (d.stats.atk || 0) + (d.stats.def || 0) : 0; };
    const sellOld = () => { if (!o.sell) return; for (const it of s.inventory.slice()) { const d = db[it.itemId]; if (!d || !['weapon', 'armor', 'shield', 'helmet'].includes(d.type) || d.unsellable || !(d.sellPrice > 0)) continue;
      if (stat(it.itemId) > stat(s.equipment[d.type])) continue; const n = it.quantity; s.gold += d.sellPrice * n; p.removeItem(it.itemId, n); (log.sold = log.sold || []).push(it.itemId + (n > 1 ? '*' + n : '')); } };
    log.bag0 = s.inventory.length; sellOld();
    log.upgrades = 0; log.affordable = 0;
    for (const slot of ['weapon', 'armor', 'shield', 'helmet']) {
      const better = (o.shop || []).map(id => db[id]).filter(d => d && d.type === slot && stat(d.id) > stat(s.equipment[slot])).sort((a, b) => stat(b.id) - stat(a.id));
      if (!better.length) continue; log.upgrades++;
      const buy = better.find(d => d.buyPrice <= s.gold); if (!buy) { (log.tooDear = log.tooDear || []).push(better[better.length - 1].id + ':' + better[better.length - 1].buyPrice); continue; }
      log.affordable++; if (p.addItem(buy.id, 1)) { s.gold -= buy.buyPrice; p.equip(buy.id); log.bought.push(buy.id); }        // ShopScene.buyItem: addItem, then gold -= buyPrice
      else (log.bagFull = log.bagFull || []).push(buy.id);                                                                 // "Inventory is full!"
    }
    sellOld();
    // heal items: keep about `stock` of them, spending at most half of what is left
    const heals = (o.shop || []).map(id => db[id]).filter(d => d && d.type === 'consumable' && d.effect && d.effect.type === 'heal').sort((a, b) => a.effect.value - b.effect.value);
    let budget = Math.floor(s.gold * (o.itemShare == null ? 0.5 : o.itemShare)); const have = () => healItems().reduce((a, x) => a + x.quantity, 0);
    const pick = heals.filter(d => d.effect.value <= p.totalMaxHp * 1.2).pop() || heals[0];
    while (pick && have() < (o.stock || 6) && pick.buyPrice <= budget && p.addItem(pick.id, 1)) { s.gold -= pick.buyPrice; budget -= pick.buyPrice; log.bought.push(pick.id); }
    log.healStock = have(); log.canAffordAHeal = !!heals.length && s.gold >= heals[0].buyPrice || have() > 0;
    log.gold1 = s.gold; log.hp1 = s.hp; log.bag1 = s.inventory.length; return log;
  }
  function status() { const s = ST(), p = P(); return { level: s.level, exp: s.exp, expToNext: s.expToNext, hp: s.hp, maxHp: p.totalMaxHp, atk: p.totalAtk, def: p.totalDef, spd: s.spd, gold: s.gold, eq: Object.assign({}, s.equipment),
    inv: s.inventory.filter(i => i.quantity > 0).map(i => i.itemId + '*' + i.quantity), heals: healItems().reduce((a, x) => a + x.quantity, 0), active: s.activeQuests.slice(), done: s.completedQuests.slice(), grade: s.quizDifficulty, timer: s.timerEnabled, enc: GS().encounterManager.encounterRateMultiplier }; }
  // The boss, `tries` times, each from the record she walked in with (the game's own boss retry). She goes on with the first win.
  async function bossTrials(monsterId, zone, tries) {
    const snap = snapshot(), out = { tries: [], wins: 0, firstWin: -1 }; let winState = null;
    for (let i = 0; i < tries; i++) { restore(snap); const f = await fight(monsterId, zone, { boss: true }); out.tries.push(f); if (f.res === 'win') { out.wins++; if (!winState) { winState = snapshot(); out.firstWin = i; } } delete ST().storyFlags['warp.overworld.boss']; }
    if (winState) { const o = JSON.parse(winState), s = ST(); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, o.s); GS().quizManager.stats = o.stats; } else restore(snap);
    return out;
  }
  function visit(id) { return GS().questManager.updateProgress(ST(), 'visit', id, 1); }
  // The bundle's wake handler: addItem (its false return ignored: a full bag of 20 stacks drops the item), and equip() for the four legendary pieces.
  function bossWon(rewards, auto) { const got = [], lost = []; for (const id of rewards || []) { if (P().addItem(id, 1)) got.push(id); else lost.push(id); if ((auto || []).includes(id)) P().equip(id); } const eq = []; equipBest(eq); return { got, lost, equipped: eq, bag: ST().inventory.length }; }
  // WorldMapScene.performTransition's own locks, and the overworld wind canyon (acts-hifi manifest gate: item windbreakerStone)
  function gate(id) { const s = ST(), f = s.storyFlags, has = x => s.inventory.some(i => i.itemId === x && i.quantity > 0), q = x => s.activeQuests.includes(x) || s.completedQuests.includes(x);
    if (id === 'wind-canyon') return has('windbreakerStone') || f['canyon.windCleared'] ? null : 'no Windbreaker Stone in the bag';
    if (id === 'crystalCave' && !f['boss.giantToad.defeated']) return 'Giant Toad not beaten';
    if (id === 'shadowCave' && !f['boss.stormHarpy.defeated'] && !f['boss.dragon.defeated']) return 'Storm Harpy not beaten';
    if (id === 'volcanicForge' && !f['boss.sandGolem.defeated'] && !f['boss.flameTitan.defeated']) return 'Sand Golem not beaten';
    if (id === 'magmaTunnels' && !has('flameCloak') && !f['boss.lavaWyrm.defeated']) return 'no Flame Cloak in the bag';
    if (id === 'demonCastle') { const need = { weapon: 'excalibur', armor: 'aegisOfDawn', shield: 'galeShield', helmet: 'crownOfWisdom' }, miss = Object.keys(need).filter(k => s.equipment[k] !== need[k] && !has(need[k])).map(k => need[k]); if (miss.length) return 'sealed, missing ' + miss.join(', '); }
    const qg = { whisperingWoodsCave: 'owlsLesson', coastalReef: 'drakeCargo', oasisDepths: 'lunasMap', scorchedRuins: 'ancientRelic', emberMines: 'flameCloak', obsidianCavern: 'lunasProphecy' }[id];
    if (qg && !q(qg)) return 'quest ' + qg + ' not started';
    return null; }
  function forceBoss(bossId, rewards, auto) { const m = monster(bossId); ST().storyFlags['boss.' + bossId + '.defeated'] = true; ST().gold += m.goldReward; P().addExp(m.expReward); GS().questManager.updateProgress(ST(), 'defeat', bossId, 1); return bossWon(rewards, auto); }
  window.__HON = { visit, bossWon, forceBoss, gate, init, fight, walk, chest, crystal, town, quest, status, bossTrials, snapshot, restore, defeatRule, fieldHeal, equipBest, applyRewards, monster, healItems,
    record: () => JSON.stringify({ state: ST(), quizStats: GS().quizManager.getStats() }) };
})();
