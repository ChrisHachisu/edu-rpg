'use strict';
// Sound fixes (track U, 2026-11-27): proves the additive fixes in public/music-override.js from the running page.
//   a  the six effect names the dungeon modules call (door, confirm, error, hit, door_open, menu_move) reach the
//      effect player with a name the effect table resolves, and each renders non-zero output offline
//   b  Quit to Title, Game Over then Title, and the ending then Title: the playing key is `title` within 2 s
//   c  the loop buffer is the decoded file: no second 1024-sample trim when the decoder already removed priming
//   d  a New Game after a muted session unmutes the audio manager (the new player says Sound ON)
//   e  overlay taps (tab, settings row, keypad key and Enter) and the quest-complete card play a short effect;
//      localStorage qok-ui-sfx=0 silences them
// Not testable here (no ears, no device): how it sounds; iOS decode length and unlock; the silent switch.
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5564/ node scripts/auto/checks/sound.cjs [a|b|c|d|e ...]
// No argument runs everything in one browser session. Chromium runs with --mute-audio: state, calls and
// rendered samples are checked, not loudness at a speaker.
const U = require('./_uilib.cjs');
const { L, rec, tap } = U;
const WANT = process.argv.slice(2).filter(x => /^[a-e]$/.test(x));
const on = k => !WANT.length || WANT.includes(k);

const AUDIO = () => window.__QOK.audio;
const state = page => page.evaluate(() => { const a = window.__QOK.audio, m = window.__QOK_MUSIC__, g = window.__PHASER_GAME__;
  return { bgm: a.composer && a.composer.currentBgm, live: !!(m && m.src), on: a.soundEnabled, scenes: g.scene.getScenes(true).map(s => s.scene.key), ctx: a.ctx && a.ctx.state }; });
async function waitBgm(page, want, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const s = await state(page); if (s.bgm === want && s.live) return { ok: true, ms: Date.now() - t0 }; await page.waitForTimeout(100); }
  return { ok: false, ms, last: await state(page) };
}
async function titleUp(page) { await page.waitForFunction(() => { const g = window.__PHASER_GAME__; return g.scene.isActive('TitleScene'); }, { timeout: 30000 }); }
async function boot(page) {
  const s = L.save({ mapId: 'overworld', x: 69, y: 256 }); s.player.soundEnabled = true; s.player.masterVolume = 0.7; s.player.hp = s.player.maxHp = 400;
  await page.goto(L.URL_, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([s]) => { localStorage.clear(); localStorage.setItem('edu-rpg-save', JSON.stringify(s)); }, [s]);
  await page.reload({ waitUntil: 'load' });
  await L.toTitle(page);
  await page.touchscreen.tap(195, 420);                       // a real first touch: unlocks and starts the title track
  const t = await waitBgm(page, 'title', 8000);
  rec('boot: the title track plays after a first touch (precondition)', t.ok, t);
}
async function cont(page) {
  if (await page.evaluate(() => { const g = window.__PHASER_GAME__; return g.scene.isActive('WorldMapScene') && !g.scene.isActive('TitleScene'); })) return;
  await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex(m => m.getData && m.getData('action') === 'continue'); if (i < 0) throw new Error('no continue'); t.selectedIndex = i; t.confirmTitle(); });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 90000 });
  await page.waitForFunction(() => { const T = window.__DQ_TILES__; return T && T.ready && T.ready(); }, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await L.noEncounters(page);
}
const spy = page => page.evaluate(() => { const a = window.__QOK.audio; window.__SFXN = []; if (!a.sfx.__spy) { a.sfx.__spy = 1; const o = a.sfx.play.bind(a.sfx); a.sfx.play = n => { window.__SFXN.push(n); return o(n); }; } });
const names = page => page.evaluate(() => window.__SFXN.slice());
async function quitToTitle(page) {
  await tap(page, '#fieldTabs [data-fi="3"]'); await tap(page, '#qok-ui [data-act="quitAsk"]'); await tap(page, '#qok-ui [data-act="quitConfirm"]');
}

async function partA(page) {
  const r = await page.evaluate(async () => {
    const a = window.__QOK.audio, map = Object.keys(a.sfx.sfxMap), out = {}, C = a.sfx.constructor, SR = 44100;
    for (const n of ['door', 'confirm', 'error', 'hit', 'door_open', 'menu_move']) {
      window.__SFXN = []; a.playSfx(n); const got = window.__SFXN.slice();
      const res = got.length === 1 && map.includes(got[0]);
      let peak = 0;
      if (res) { const oc = new OfflineAudioContext(2, SR * 3, SR), g = oc.createGain(); g.gain.value = 0.7; g.connect(oc.destination); new C(oc, g).play(got[0]); const d = (await oc.startRendering()).getChannelData(0); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
      out[n] = { got, resolvable: res, peak: +peak.toFixed(4) };
    }
    return out;
  });
  for (const n of Object.keys(r)) rec(`a  '${n}' reaches the effect player as a resolvable name with audible output`, r[n].resolvable && r[n].peak > 0.01, r[n]);
}

async function partC(page) {
  const r = await page.evaluate(async () => {
    const a = window.__QOK.audio, m = window.__QOK_MUSIC__, out = {};
    if (!m || a.composer !== m) return { err: 'file player not installed' };
    for (const k of ['town', 'victory']) {
      const raw = await a.ctx.decodeAudioData(await (await fetch('audio/' + k + '.m4a')).arrayBuffer());
      delete m.buffers[k]; const buf = await m._load(k);
      const want = Math.round({ town: 30, victory: 12 }[k] * raw.sampleRate), skip = raw.length >= want + 1024 ? 1024 : 0, d = raw.getChannelData(0), b = buf.getChannelData(0);
      let same = true; for (let i = 0; i < 64; i++) if (b[i] !== d[skip + i]) same = false;
      out[k] = { rawLen: raw.length, bufLen: buf.length, expectLen: Math.min(want, raw.length - skip), skip, firstSamplesMatch: same };
    }
    return out;
  });
  if (r.err) return rec('c  the file player is installed', false, r);
  for (const k of Object.keys(r)) rec(`c  ${k}: loop buffer is the decoded file (no double trim)`, r[k].bufLen === r[k].expectLen && r[k].firstSamplesMatch, r[k]);
}

async function partE(page) {
  await spy(page);
  await page.evaluate(() => localStorage.removeItem('qok-ui-sfx'));
  await tap(page, '#fieldTabs [data-fi="3"]'); await page.waitForTimeout(500);
  let n = await names(page);
  rec('e  tapping a field tab plays an effect', n.includes('menu_select'), n);
  await spy(page);
  const rowOk = await page.evaluate(() => { const r = [...document.querySelectorAll('#qok-ui [data-act="setting"]')].find(e => /timer/i.test(e.textContent)) || document.querySelector('#qok-ui [data-act="setting"]'); if (r) r.setAttribute('data-sfxprobe', '1'); return !!r; });
  if (rowOk) await tap(page, '#qok-ui [data-sfxprobe="1"]'); await page.waitForTimeout(500);
  n = await names(page);
  rec('e  tapping a settings row plays an effect', rowOk && n.includes('menu_select'), n);
  // keypad keys: the real keypad is only on a live quiz, so real taps on buttons carrying the keypad's own attributes
  await page.evaluate(() => { const u = document.getElementById('qok-ui'); for (const k of ['5', 'go']) { const b = document.createElement('button'); b.setAttribute('data-act', 'kpKey'); b.setAttribute('data-k', k); b.id = 'sfxprobe-' + k; b.style.cssText = 'position:fixed;left:20px;top:' + (k === 'go' ? 140 : 80) + 'px;width:80px;height:50px;z-index:99999'; u.appendChild(b); }
    window.__SFXN = []; });
  await tap(page, '#sfxprobe-5'); await page.waitForTimeout(400); const k5 = await names(page);
  await page.evaluate(() => { window.__SFXN = []; }); await tap(page, '#sfxprobe-go'); await page.waitForTimeout(400); const kg = await names(page);
  rec('e  a keypad digit plays an effect', k5.includes('menu_select'), k5);
  rec('e  the keypad Enter plays an effect', kg.length > 0 && !kg.includes('defeat'), kg);
  await page.evaluate(() => { window.__SFXN = []; document.body.classList.add('qok-quest-complete'); }); await page.waitForTimeout(900);
  n = await names(page); await page.evaluate(() => document.body.classList.remove('qok-quest-complete'));
  rec('e  the quest-complete card plays an effect', n.includes('treasure_open'), n);
  // the switch
  await page.evaluate(() => { localStorage.setItem('qok-ui-sfx', '0'); window.__SFXN = []; });
  await tap(page, '#sfxprobe-5'); await tap(page, '#sfxprobe-go'); await tap(page, '#fieldTabs [data-fi="3"]');
  await page.evaluate(() => { document.body.classList.add('qok-quest-complete'); }); await page.waitForTimeout(900);
  n = await names(page); await page.evaluate(() => { document.body.classList.remove('qok-quest-complete'); localStorage.removeItem('qok-ui-sfx'); document.querySelectorAll('[id^="sfxprobe-"]').forEach(e => e.remove()); });
  rec('e  qok-ui-sfx=0 silences every overlay sound', n.length === 0, n);
}

async function partB(page) {
  const back = async (label, how) => {
    await titleUp(page).catch(() => {});
    const r = await waitBgm(page, 'title', 2000);
    rec(`b  ${label}: the playing key is title within 2 s`, r.ok, r);
  };
  // 1 Quit to Title
  await quitToTitle(page); await back('Quit to Title');
  await cont(page);
  // 2 Game Over, then its title action
  await page.evaluate(() => { const g = window.__PHASER_GAME__; g.scene.stop('WorldMapScene'); g.scene.start('GameOverScene'); });
  const go = await waitBgm(page, 'gameOver', 4000); rec('b  Game Over plays the gameOver track (precondition)', go.ok, go);
  await page.evaluate(() => { const g = window.__PHASER_GAME__; g.scene.stop('GameOverScene'); g.scene.start('TitleScene'); });
  await back('Game Over then Title');
  await cont(page);
  // 3 the ending, then Title (the scene's own confirmChoice, "Title" is the second entry)
  await page.evaluate(() => { const g = window.__PHASER_GAME__; g.scene.stop('WorldMapScene'); g.scene.start('VictoryScene'); });
  const vi = await waitBgm(page, 'victory', 4000); rec('b  the ending plays the victory track (precondition)', vi.ok, vi);
  await page.evaluate(() => { const v = window.__PHASER_GAME__.scene.getScene('VictoryScene'); v.menuIndex = 1; v.confirmChoice(); });
  await back('ending then Title');
}

async function partD(page) {
  await cont(page);
  const pre = await page.evaluate(() => { const a = window.__QOK.audio, st = window.__GAME_STATE__.player.state; a.setMuted(true); st.soundEnabled = false; return { mgr: a.soundEnabled, state: st.soundEnabled }; });
  rec('d  precondition: the manager is muted by a session', pre.mgr === false && pre.state === false, pre);
  await quitToTitle(page); await titleUp(page); await page.waitForTimeout(500);
  const r = await page.evaluate(() => { window.__GAME_STATE__.newGame('1', 'Probe', 'gray'); return { stateOn: window.__GAME_STATE__.player.state.soundEnabled }; });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({ mgr: window.__QOK.audio.soundEnabled, gain: window.__QOK.audio.masterGain && window.__QOK.audio.masterGain.gain.value }));
  rec('d  New Game after a muted session: the audio manager is unmuted to match the new player', r.stateOn === true && after.mgr === true && after.gain > 0, { newPlayerSoundOn: r.stateOn, ...after });
}

(async () => {
  const o = await L.launch({ dpr: 1 }); const page = o.page;
  try {
    await boot(page);
    await cont(page);
    await spy(page);
    if (on('a')) await partA(page);
    if (on('c')) await partC(page);
    if (on('e')) await partE(page);
    if (on('b')) await partB(page);
    if (on('d')) await partD(page);
  } catch (e) { rec('ran to the end', false, String(e && e.stack || e).slice(0, 500)); }
  await o.browser.close();
  U.finish('sound');
})();
