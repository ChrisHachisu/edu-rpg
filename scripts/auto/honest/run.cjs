'use strict';
// Honest player, part 3: one child profile walks the story, one process at a time.
//   NODE_PATH=/opt/node-tools/node_modules node scripts/auto/honest/run.cjs --profile g1 --rep 1 [--budget 330] [--tries 20] [--to 9]
// State lives in $HONEST_DIR/<profile>-r<rep>/ : ckpt.json (her record + where she is) and events.jsonl (one line per stop).
// A process stops after --budget seconds (or after stop --to) and the next one continues from ckpt.json; chain.sh loops it.
// Exit code: 0 = story finished, 3 = more to do (run again), 1 = error.
const fs = require('fs'), path = require('path');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5500/';
process.env.PROBE_OUT = process.env.PROBE_OUT || '/home/user/work/honest/probe-out';
const DIR = process.env.HONEST_DIR || '/home/user/work/honest/runs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const { PROFILES, keypadOf, effOf, exposeEffort } = require('./profiles.cjs');
const POLICY = { healAt: 0.35, fleeAt: 0.2 };
const SAVVY = { healAt: 0.35, fleeAt: 0.2, bossHealAt: 0.5, defendCharge: true };   // variant 'savvy': heals at half HP against a boss and defends on the turn a boss was announced to be charging
const PROFILE = arg('profile', 'g1'), REP = +arg('rep', 1), BUDGET = +arg('budget', 330) * 1000, TRIES = +arg('tries', 20), TO = +arg('to', 999), DEATH_CAP = +arg('deathcap', 6);
const VARIANT = arg('variant', '');           // '' (sells outgrown gear) | 'nosell' (never sells: the brief's literal policy) | 'savvy' (see SAVVY) | 'allchests' (every visible chest)
if (VARIANT === 'allchests') process.env.HONEST_CHEST_DETOUR = '9999';
const SELL = VARIANT !== 'nosell';
const prof = PROFILES[PROFILE] && { ...PROFILES[PROFILE], keypad: keypadOf(PROFILE), eff: effOf(PROFILE) }; if (!prof) throw new Error('unknown profile ' + PROFILE);   // HONEST_KEYPAD=same|noguess|off (default same)
const L = require('../../acts/probe/lib.cjs');
const WORLD = require('./world.cjs');
const INPAGE = fs.readFileSync(path.join(__dirname, 'inpage.js'), 'utf8');
const RUN = path.join(DIR, `${PROFILE}${VARIANT ? '-' + VARIANT : ''}-r${REP}`); fs.mkdirSync(RUN, { recursive: true });
const CK = path.join(RUN, 'ckpt.json'), EV = path.join(RUN, 'events.jsonl');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), `[${PROFILE}${VARIANT ? '-' + VARIANT : ''} r${REP}]`, ...a);
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h | 0; };
const slim = f => { const o = {}; for (const k of ['m', 'boss', 'res', 'lvl0', 'lvl1', 'hp0', 'hpEnd', 'minHp', 'maxHp', 'atk', 'def', 'mhp', 'matk', 'mdef', 'mhpEnd', 'tier', 'rounds', 'q', 'ok', 'to', 'crit', 'fast', 'items', 'hidden', 'flee', 'defends', 'taken', 'maxHit', 'hits', 'dealt', 'xp', 'gold', 'sec', 'ms', 'stuckPhase', 'eff', 'effn', 'effmiss']) if (f[k] !== undefined && f[k] !== 0 && f[k] !== false) o[k] = f[k]; return o; };

(async () => {
  const T0 = Date.now(), W = WORLD.build();
  let ck = fs.existsSync(CK) ? JSON.parse(fs.readFileSync(CK, 'utf8')) : null;
  if (!ck) { const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'newgame', PROFILE + '.json'), 'utf8'));     // the game's own New Game record for this grade (explore1.cjs)
    if (st.quizDifficulty !== prof.grade) throw new Error('new game record grade mismatch');
    ck = { next: 0, record: { state: st, quizStats: {} }, meta: { chests: {}, forced: [], deaths: 0 }, done: false };
    fs.writeFileSync(EV, ''); }
  if (ck.done) { log('already finished'); process.exit(0); }
  const o = await L.launch(); const page = o.page; await exposeEffort(page); let code = 3;
  const ev = (fn, a) => page.evaluate(fn, a);
  try {
    const sv = { version: 4, timestamp: Date.now(), player: { ...ck.record.state, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 } }, playtime: 0, quizStats: ck.record.quizStats || {} };
    await L.bootSave(page, sv, { settle: 1500 });
    await ev(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });     // bootSave silences encounters; the real roll is wanted here
    await page.evaluate(INPAGE);
    await ev(c => window.__HON.init(c), { seed: hash(`${PROFILE}|${VARIANT}|${REP}|${ck.next}`), profile: prof, policy: VARIANT === 'savvy' ? SAVVY : POLICY });
    const st0 = await ev(() => window.__HON.status());
    if (st0.grade !== prof.grade) throw new Error('grade not carried: ' + st0.grade);
    log('booted at stop', ck.next, JSON.stringify({ lvl: st0.level, hp: st0.hp + '/' + st0.maxHp, atk: st0.atk, def: st0.def, gold: st0.gold, enc: st0.enc, timer: st0.timer }));
    const quests = W.tables.quests, status = () => ev(() => window.__HON.status());
    const save = async () => { ck.record = JSON.parse(await ev(() => window.__HON.record())); fs.writeFileSync(CK + '.tmp', JSON.stringify(ck)); fs.renameSync(CK + '.tmp', CK); };
    const emit = e => fs.appendFileSync(EV, JSON.stringify({ profile: PROFILE, variant: VARIANT || undefined, rep: REP, ...e }) + '\n');

    // one stretch of walking; a death applies the game's defeat rule in the page and is reported to the caller
    const walk = async (w, acc) => { const r = await ev(a => window.__HON.walk(a), w); acc.steps += r.steps; acc.fights.push(...r.fights.map(slim)); acc.fieldItems += r.fieldItems || 0; if (r.died) { acc.deaths++; acc.goldLost += r.goldLost || 0; ck.meta.deaths++; } if (r.stuck) acc.stuck = (acc.stuck || 0) + 1; return r; };
    const newAcc = () => ({ steps: 0, fights: [], fieldItems: 0, deaths: 0, goldLost: 0 });
    // an overworld leg (or a fixed-zone walk on a portal isle); a death sends her back to the last town, so the leg starts again
    async function leg(lg, what, zone) {
      const acc = newAcc(); if (!lg || !lg.steps) return acc; let forced = false;
      for (;;) { const r = await walk(zone ? { zone, steps: lg.steps, dungeon: false, reset: true } : { cells: lg.cells || [lg.from, lg.to], steps: lg.steps, dungeon: false, reset: true }, acc);
        if (!r.died) break; if (acc.deaths >= DEATH_CAP) { forced = true; break; } }
      if (forced) { acc.forced = true; ck.meta.forced.push('leg ' + what); }
      return acc;
    }
    async function dungeon(s, D, backLeg, backZone) {
      const arrive = await status(), acc = newAcc(); acc.floors = []; acc.chests = 0; acc.chestGold = 0; acc.chestItems = []; acc.crystals = 0; acc.attempts = 1;
      let bossRes = null, forced = false, hidden = 0;
      await ev(id => window.__HON.visit(id), s.dungeon || s.id);
      attempt: for (;;) {
        for (const fl of D.floors) {
          const f0 = acc.fights.length; let first = true;
          for (const lgF of fl.legs) {
            const r = await walk({ zone: D.zone, map: D.id, steps: lgF.steps, dungeon: true, reset: first }, acc); first = false;
            if (r.died) {
              if (acc.deaths >= DEATH_CAP) { forced = true; break attempt; }
              // back from the last town to the door (the same walk as before), then floor 1 again
              const b = await leg(backLeg, 'back to ' + D.id, backZone); acc.backFights = (acc.backFights || 0) + b.fights.length; acc.fights.push(...b.fights.map(f => ({ ...f, back: 1 }))); acc.deaths += b.deaths; acc.goldLost += b.goldLost;
              if (acc.deaths >= DEATH_CAP) { forced = true; break attempt; }
              acc.attempts++; continue attempt;
            }
            if (lgF.then === 'chest') { const key = `${fl.key}:${lgF.id}`; if (!ck.meta.chests[key]) { ck.meta.chests[key] = 1; const c = await ev(a => window.__HON.chest(a[0], a[1]), [D.id, !!lgF.golden]); if (c.closed) { acc.closedChests = (acc.closedChests || 0) + 1; } else { acc.chests++; acc.chestGold += c.gold || 0; if (c.itemId) acc.chestItems.push(c.itemId); } if (c.lost) (acc.lostItems = acc.lostItems || []).push(c.itemId); } }
            else if (lgF.then === 'crystal') { await ev(() => window.__HON.crystal()); acc.crystals++; }
            else if (lgF.then === 'boss') {
              const atBoss = await status();
              fs.writeFileSync(path.join(RUN, "door-" + D.bossId + ".json"), await ev(() => window.__HON.record()));     // her record at the boss door, for whatif.cjs
              const b = await ev(a => window.__HON.bossTrials(a[0], a[1], a[2]), [D.bossId, D.zone, TRIES]);
              bossRes = { id: D.bossId, at: atBoss, tries: b.tries.map(slim), wins: b.wins, n: b.tries.length, firstWin: b.firstWin };
              hidden += b.tries.reduce((a, t) => a + (t.hidden || 0), 0);
              if (b.wins > 0) bossRes.reward = await ev(r => window.__HON.bossWon(r[0], r[1]), [D.reward, W.bossAutoEquip]);
              else { bossRes.forced = true; ck.meta.forced.push('boss ' + D.bossId); bossRes.reward = await ev(a => window.__HON.forceBoss(a[0], a[1], a[2]), [D.bossId, D.reward, W.bossAutoEquip]); }
            }
          }
          acc.floors.push({ floor: fl.floor, fights: acc.fights.length - f0, steps: fl.routeSteps, attempt: acc.attempts });
        }
        break;
      }
      if (forced) { acc.forced = true; ck.meta.forced.push('dungeon ' + D.id);
        if (!bossRes) { const atBoss = await status(); await ev(() => window.__HON.crystal());           // carried past the floors: the boss is still measured, from full HP
          const b = await ev(a => window.__HON.bossTrials(a[0], a[1], a[2]), [D.bossId, D.zone, TRIES]);
          bossRes = { id: D.bossId, at: atBoss, tries: b.tries.map(slim), wins: b.wins, n: b.tries.length, firstWin: b.firstWin, afterForcedFloors: true };
          bossRes.reward = b.wins > 0 ? await ev(r => window.__HON.bossWon(r[0], r[1]), [D.reward, W.bossAutoEquip]) : await ev(a => window.__HON.forceBoss(a[0], a[1], a[2]), [D.bossId, D.reward, W.bossAutoEquip]); if (!b.wins) { bossRes.forced = true; ck.meta.forced.push('boss ' + D.bossId); } } }
      return { arrive, leave: await status(), boss: bossRes, ...acc };
    }

    for (; ck.next < W.stops.length && ck.next <= TO;) {
      if (Date.now() - T0 > BUDGET) break;
      const s = W.stops[ck.next], t1 = Date.now(), e = { n: s.n, act: s.act, t: s.t, id: s.id };
      if (s.optional) { e.optional = s.optional; e.snap = await ev(() => window.__HON.snapshot()); e.metaSnap = JSON.stringify(ck.meta); }
      const gates = [s.gate, (s.t === 'dungeon' || s.t === 'visit') ? s.id : null, s.t === 'isle' ? null : null].filter(Boolean);
      for (const gid of gates) { const why = await ev(g => window.__HON.gate(g), gid); if (why) { (e.gateBlocked = e.gateBlocked || []).push(gid + ': ' + why); if (!s.optional) ck.meta.forced.push(`gate ${gid} (${why})`); } }
      if (s.leg) { const before = await status(); const a = await leg(s.leg, s.id); e.leg = { raw: s.leg.raw, noPath: s.leg.noPath ? 1 : undefined, lvl: before.level, hp: before.hp, maxHp: before.maxHp, def: before.def, ...a }; }
      if (s.t === 'town') { e.town = await ev(a => window.__HON.town(a[0], a[1]), [{ id: s.id, shop: s.shop, healer: s.healer, quest: s.quest, sell: SELL }, quests]); e.after = await status(); }
      else if (s.t === 'visit') { const acc = newAcc(); await ev(id => window.__HON.visit(id), s.id); const r = await walk({ zone: s.zone, map: s.id, steps: s.steps, dungeon: true, reset: true }, acc); e.visit = acc; e.after = await status(); }
      else if (s.t === 'dungeon') { e.dungeon = await dungeon(s, W.dungeons[s.id], s.backLeg); e.after = e.dungeon.leave; }
      else if (s.t === 'isle') {
        const z = s.isleZone, l1 = { steps: s.legToVillage }, l2 = { steps: s.legToDungeon };
        e.isleLeg1 = await leg(l1, s.id + ' village', z);
        e.town = await ev(a => window.__HON.town(a[0], a[1]), [{ id: s.village, shop: s.shop, healer: s.healer, sell: SELL }, quests]);
        e.isleLeg2 = await leg(l2, s.id + ' dungeon', z);
        e.dungeon = await dungeon({ ...s, id: s.dungeon }, W.dungeons[s.dungeon], l2, z); e.dungeonId = s.dungeon; e.after = e.dungeon.leave;
      }
      if (s.optional) { await ev(j => window.__HON.restore(j), e.snap); ck.meta = JSON.parse(e.metaSnap); delete e.snap; delete e.metaSnap; e.restored = true; }
      e.ms = Date.now() - t1; e.errors = o.errors.splice(0).slice(0, 5);
      emit(e); ck.next++; if (ck.next >= W.stops.length) ck.done = true; await save();
      const a = e.after || {}, d = e.dungeon;
      log(`stop ${s.n} ${s.t} ${s.id}${s.optional ? ' (optional)' : ''}: lvl ${a.level} hp ${a.hp}/${a.maxHp} atk ${a.atk} def ${a.def} gold ${a.gold}` + (e.leg ? ` | leg fights ${e.leg.fights.length} deaths ${e.leg.deaths}` : '') + (d ? ` | fights ${d.fights.length} deaths ${d.deaths} chests ${d.chests} boss ${d.boss ? d.boss.wins + '/' + d.boss.n : '-'}${d.forced ? ' FORCED' : ''}` : '') + (e.town ? ` | bought ${e.town.bought.join(',') || '-'}${e.town.questDone ? ' quest ' + e.town.questDone : ''}` : '') + ` | ${e.ms} ms` + (e.gateBlocked ? ' GATE ' + e.gateBlocked.join('; ') : '') + (e.errors.length ? ' ERR ' + JSON.stringify(e.errors) : ''));
    }
    if (ck.done) code = 0;
    log(ck.done ? 'STORY FINISHED' : `paused at stop ${ck.next} after ${Math.round((Date.now() - T0) / 1000)} s`, 'forced:', JSON.stringify(ck.meta.forced));
  } catch (err) { log('FATAL', err && err.stack || err); code = 1; try { await page.screenshot({ path: path.join(RUN, 'fatal.png') }); } catch (e) {} }
  finally { await o.browser.close().catch(() => {}); }
  process.exit(code);
})();
