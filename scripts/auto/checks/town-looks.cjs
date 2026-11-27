'use strict';
// How the twelve painted towns LOOK in the running game (design review 2026-11-27: T3, T4, T5, T6, T10, T11).
// Every town is entered the census way (a save seeded on the overworld door's exit cell, Continue, a real walk into
// the door); inside she really walks, with the arrow keys and the playthrough town walker. Nothing places her.
//   T11  arrival: no black band above the plate (Port Sapphire's north gate), and she is not under the Quests panel
//   T10  the first spot of a person's talk band she reaches offers THAT person (Port Sapphire: beside the Wise Woman
//        the pill read Save and the talk key saved); the talk key there opens the Wise Woman's words
//   T4   she walks up to every person from below and keeps pushing, then from the side: Talk shows and the two
//        sprite boxes (measured from the served sheets) overlap by no more than 4 px (a person in a lane too narrow
//        for two bodies is held to the `spaceMax` of her town json)
//   T5   wherever the pill shows (every person, the shop spot, the save spot) its box does not touch her or the
//        person she faces
//   T3   the shopkeepers that stood on their stalls: the town names a counter band, and on screen the place where
//        her legs would be drawn is the plate's own paint
//   T6   the two wells and the chimney: she walks to the review's spot and pushes into the stones; her body stays
//        out of the painted outline
// Frames: FIELD_OUT/looks-<town>-<what>-<port>.png (FIELD_DPR=2 for the owner's pictures).
//   node scripts/auto/checks/town-looks.cjs [townId ...]      LOOKS_ONLY=arrival,npc,shop,save,props limits the parts
const fs = require('fs'), path = require('path');
const F = require('./field-lib.cjs');
const R = require('./field-town-reach.cjs');
const ptsrc = fs.readFileSync(path.join(F.ROOT, 'scripts/acts/probe/playthrough/ptlib.cjs'), 'utf8');
const HELP = ptsrc.slice(ptsrc.indexOf('const HELP = () => {') + 'const HELP = '.length, ptsrc.indexOf('\nclass Session'));
const A1 = (() => { const src = fs.readFileSync(path.join(F.ROOT, 'public/act1-world-map.js'), 'utf8'), m = /var LANDMARKS = (\[.*?\]);/.exec(src);
  return JSON.parse(m[1]).map(l => ({ id: l.mapId, at: [l.at.x, l.at.y], exit: [l.exit.x, l.exit.y], tile: l.tile })); })();
const ACTS = JSON.parse(fs.readFileSync(path.join(F.ROOT, 'public/acts-hifi/manifest.json'), 'utf8')).landmarks.map(l => ({ id: l.virtual || l.mapId, at: l.at, exit: l.exit, tile: l.tile }));
const DOORS = A1.concat(ACTS).filter(l => l.tile === 6);
const port = new URL(F.URL_).port, ONLY = (process.env.LOOKS_ONLY || 'arrival,npc,shop,save,props').split(',');
const inject = page => page.evaluate(`(${HELP.trim().replace(/;\s*$/, '')})()`);
const get = async p => { const r = await fetch(new URL(p, F.URL_)); if (!r.ok) throw new Error(`${p}: ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
const shot = (page, id, what) => F.grab(page, path.join(F.OUT, `looks-${id}-${what}-${port}.png`));
// A frame whose pixels are compared with the plate: the state read before the grab and after it must agree (the camera eases for a
// while after a walk, and on the busy box it was still moving between look() and the grab: the band then read as 13 of 255 off).
async function steadyShot(page, id, what) {
  let s0 = await look(page), img = null;
  for (let i = 0; i < 6; i++) { img = await shot(page, id, what); const s1 = await look(page);
    if (Math.abs(s1.cam.x - s0.cam.x) < 0.01 && Math.abs(s1.cam.y - s0.cam.y) < 0.01 && s1.cam.z === s0.cam.z && Math.abs(s1.x - s0.x) < 0.01 && Math.abs(s1.y - s0.y) < 0.01) return { s: s1, img };
    s0 = s1; await page.waitForTimeout(300); }
  return { s: s0, img };
}
async function townDismiss(page) {
  for (let i = 0; i < 24; i++) {
    const m = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); const f = document.querySelector('#act1-hifi-preserved-root iframe');
      const d = f && f.contentWindow.document.querySelector('#dialogue'); return !!(w && w.showingMessage) || !!(d && d.dataset.open === 'true'); }).catch(() => false);
    if (!m) return; if (i % 2) await page.keyboard.press('z'); else await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(350);
  }
}
// what is on screen now: her feet and every person's (world px), the camera, the pill (page CSS px), the frame's place in the page
const look = page => page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), w = f.contentWindow, t = w.__ACT1_TOWN__, p = t.position(), c = t.camera, fr = f.getBoundingClientRect();
  const e = w.document.querySelector('#prompt'), r = e.getBoundingClientRect(), on = e.dataset.show === 'true';
  const tabs = document.getElementById('fieldTabs'), tr = tabs && tabs.getBoundingClientRect();
  const near = t.nearestNpc(), svc = t.nearestService();
  return { x: p.x, y: p.y, cam: { x: c.x, y: c.y, z: c.zoom }, ox: fr.left, oy: fr.top, W: innerWidth, H: innerHeight, tabTop: tr && tr.height > 0 ? tr.top : innerHeight,
    pill: on ? { text: e.textContent, box: [r.left + fr.left, r.top + fr.top, r.right + fr.left, r.bottom + fr.top] } : null, near: near ? near.id : null, svc: svc ? svc.kind : null,
    npcs: t.npcs.map(n => ({ id: n.id, x: n.point.x, y: n.point.y })) }; });
// the HUD panels drawn over the town view (the Quests panel, the map button, the compass): [{ id, box }] in page CSS px
const hudPanels = page => page.evaluate(() => [...document.querySelectorAll('#qfh-quest, #qfh-map, #qfh-compass, #qfh-floor')].map(e => { const r = e.getBoundingClientRect(), st = getComputedStyle(e);
  return r.width > 8 && r.height > 8 && st.visibility !== 'hidden' && st.display !== 'none' && +st.opacity > 0.1 ? { id: e.id, box: [r.left, r.top, r.right, r.bottom] } : null; }).filter(Boolean));
const onScreen = (s, x, y, box) => [s.ox + (x + box[0] - s.cam.x) * s.cam.z, s.oy + (y + box[1] - s.cam.y) * s.cam.z, s.ox + (x + box[2] - s.cam.x) * s.cam.z, s.oy + (y + box[3] - s.cam.y) * s.cam.z];
const cross = (a, b) => { const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return w > 0 && h > 0 ? Math.min(w, h) : 0; };
// Screen against plate, for one world-px rectangle: the mean colour of the device pixels whose centres lie in it, against the
// plate read at the very same places (nearest pixel, as town.html draws it: imageSmoothingEnabled = false), so a camera
// resting between two pixels does not count as a difference. Returns the mean absolute difference per channel (0..255), or null when `skip` hides part of it.
function blockDiff(img, s, P, ak, x0, y0, x1, y1, skip) {
  const k = img.w / s.W, toS = (wx, wy) => [(s.ox + (wx - s.cam.x) * s.cam.z) * k, (s.oy + (wy - s.cam.y) * s.cam.z) * k];
  const [ax, ay] = toS(x0, y0), [bx, by] = toS(x1, y1), a = [0, 0, 0], b = [0, 0, 0]; let n = 0;
  for (let py = Math.ceil(ay - 0.5); py + 0.5 < by; py++) for (let px = Math.ceil(ax - 0.5); px + 0.5 < bx; px++) {
    if (px < 0 || py < 0 || px >= img.w || py >= img.h) return null;
    const cx = (px + 0.5) / k, cy = (py + 0.5) / k; if (skip && skip(cx, cy)) return null;
    const u = Math.floor(((cx - s.ox) / s.cam.z + s.cam.x) * ak), v = Math.floor(((cy - s.oy) / s.cam.z + s.cam.y) * ak);
    if (u < 0 || v < 0 || u >= P.w || v >= P.h) return null;
    const i = (py * img.w + px) * img.bpp, q = (v * P.w + u) * P.bpp;
    for (let c = 0; c < 3; c++) { a[c] += img.data[i + c]; b[c] += P.data[q + c]; }
    n++; }
  return n ? (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / (3 * n) : null;
}
const push = async (page, keys, ms) => { await page.evaluate(k => window.__PTH.setKeys(k), keys); await page.waitForTimeout(ms); await page.evaluate(() => window.__PTH.setKeys([])); await page.waitForTimeout(450); };
const toward = (dx, dy) => { const k = []; if (dx > 3) k.push('ArrowRight'); if (dx < -3) k.push('ArrowLeft'); if (dy > 3) k.push('ArrowDown'); if (dy < -3) k.push('ArrowUp'); return k; };
const walkCell = (page, cx, cy, r) => page.evaluate(([x, y, r]) => window.__PTH.walkToCell(x, y, r), [cx, cy, r]).catch(e => ({ ok: false, why: String(e).slice(0, 80) }));

(async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : R.TOWNS;
  const { browser, page } = await F.L.launch({ dpr: +(process.env.FIELD_DPR || 1) });
  for (const id of want) {
    const d = DOORS.find(l => l.id === id); if (!d) { F.ok(false, `${id}: no door`); continue; }
    try {
      const TJ = JSON.parse(await get(`act1-hifi/town/${id}-town.json`)), C = TJ.worldPxPerCell;
      const boxes = {}; for (const n of TJ.npcs) { try { boxes[n.id] = R.spriteBox(R.png(await get(`act1-hifi/${n.sheet}`))); } catch (e) { boxes[n.id] = [-11, -29, 11, 1.2]; } }
      const band = (TJ.occluders || []).find(o => o.id === 'shop-counter'), keeper = TJ.npcs.find(n => n.id === 'shopkeeper');
      const bandTop = band && keeper ? Math.min(...band.polygon.filter(p => Math.abs(p[0] - keeper.cell[0]) * C < 20).map(p => p[1] * C)) : null;
      if (bandTop !== null) boxes.shopkeeper = [boxes.shopkeeper[0], boxes.shopkeeper[1], boxes.shopkeeper[2], Math.min(boxes.shopkeeper[3], bandTop - keeper.cell[1] * C)];   // only what shows above the counter
      const s0 = F.L.save({ mapId: 'overworld', x: d.exit[0], y: d.exit[1], flags: { ...F.L.allFlags(), ...F.ALLB }, inventory: F.INV, completedQuests: F.QUESTS });
      s0.player.name = 'Mika';
      await F.L.bootSave(page, s0);
      const w = await F.L.walkCells(page, [d.at], { maxMs: 25000 });
      await page.waitForFunction(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); return !!(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__); }, { timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(3500); await inject(page);
      const t = await page.evaluate(() => window.__PTH.town());
      if (!F.ok(t && t.id === id, `${id}: entered by walking into the door`, `walk ${w.why}, town ${t && t.id}`)) continue;
      const pillClear = (s, who, what) => { if (!s.pill) return F.ok(false, `${id}: the pill shows ${what}`, 'no pill');
        const hero = onScreen(s, s.x, s.y, R.HERO), n = who && s.npcs.find(q => q.id === who), tb = n && onScreen(s, n.x, n.y, boxes[who]);
        const a = cross(s.pill.box, hero), b = tb ? cross(s.pill.box, tb) : 0;
        return F.ok(a <= 1 && b <= 1, `${id}: the pill is clear of her and of ${who || 'the spot'} ${what}`, `"${s.pill.text}" pill at y ${Math.round(s.pill.box[1])}-${Math.round(s.pill.box[3])}, her box y ${Math.round(hero[1])}-${Math.round(hero[3])}${tb ? `, ${who}'s y ${Math.round(tb[1])}-${Math.round(tb[3])}` : ''}; it covers ${a.toFixed(0)} px of her${tb ? ` and ${b.toFixed(0)} px of ${who}` : ''}`); };

      // ---- T11: the first view, before anything is dismissed
      if (ONLY.includes('arrival')) {
        const img = await shot(page, id, 'arrival'), s = await look(page), k = img.w / s.W;
        // black rows in the upper half, read right of the Quests panel and left of the right-hand buttons
        let black = 0; for (let y = Math.round(s.H * 0.04 * k); y < Math.round(s.H * 0.5 * k); y++) { let dark = 0, n = 0; for (let x = Math.round(175 * k); x < Math.round(330 * k); x += 3) { const q = F.px(img, x, y); if (q[0] + q[1] + q[2] < 36) dark++; n++; } if (dark / n >= 0.6) black++; }
        const hero = onScreen(s, s.x, s.y, R.HERO), qp = await hudPanels(page);
        const under = Math.max(0, ...qp.map(q => cross(hero, q.box)));
        F.ok(black / k <= 16, `${id}: no black band above the plate on arrival`, `${Math.round(black / k)} CSS px of black rows in the upper half of the first view (allowed 16: the fade at the map's end)`);
        F.ok(under <= 1 && hero[1] >= 60, `${id}: she arrives clear of the Quests panel and the top bar`, `her box x ${Math.round(hero[0])}-${Math.round(hero[2])}, y ${Math.round(hero[1])}-${Math.round(hero[3])}; HUD panels ${qp.map(q => `${q.id} ${q.box.map(Math.round).join(',')}`).join('; ') || 'none found'}`);
      }
      await townDismiss(page);

      // ---- T10, T4, T5: every person
      if (ONLY.includes('npc')) for (const n of TJ.npcs) {
        const isSvc = n.id === 'healer' || n.id === 'shopkeeper', lim = Array.isArray(n.space) && Number.isFinite(n.spaceMax) ? n.spaceMax : 4;
        const g = await page.evaluate(x => window.__PTH.walkToNpc(x), n.id); await page.waitForTimeout(500);
        let s = await look(page);
        const first = g.ok && s.near === n.id && (isSvc || !s.svc) && s.pill && !(!isSvc && /^Save$|^Shop$|セーブ|みせ|店/.test(s.pill.text));
        const firstWhy = `walk ${g.why}; pill "${s.pill ? s.pill.text : 'none'}"${s.svc && !isSvc ? `, the ${s.svc} spot takes it` : ''}; her feet ${(s.x - n.cell[0] * C).toFixed(0)},${(s.y - n.cell[1] * C).toFixed(0)} px from theirs`;
        // a keeper behind a counter is reached at the shop spot (below); a walker without the town's own band cannot plan to her
        if (n.id === 'shopkeeper' && !g.ok) F.info(`${id}: the walker found no way into the shopkeeper's talk band`, firstWhy);
        else F.ok(first, `${id}: the first spot of ${n.id}'s talk band offers ${n.id}`, firstWhy);
        if (id === 'portSapphire' && n.id === 'wisewoman') {
          await page.evaluate(() => window.__PTH.clear()); await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1500);
          const said = await page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), dl = f.contentWindow.document.querySelector('#dialogue'), w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
            return [...window.__PTH.log().map(m => m.t), dl && dl.dataset.open === 'true' ? dl.textContent : '', w && w.showingMessage && w.messageText ? String(w.messageText.text) : ''].filter(Boolean).map(x => x.slice(0, 70)); });
          await shot(page, id, 'npc-wisewoman-talk');
          F.ok(said.length && !said.some(x => /saved|セーブ/i.test(x)), `${id}: the talk key beside the Wise Woman opens her words, not the save`, JSON.stringify(said).slice(0, 200));
          await townDismiss(page);
        }
        // from below: stand three cells under her feet, then walk straight up into her (where a stall or a counter leaves no
        // ground below her, the first spot of her band stands for it)
        const p0 = s.npcs.find(q => q.id === n.id);
        const gb = await walkCell(page, p0.x / C, p0.y / C + 3.0, 0.35), below = gb.ok;
        if (below) { await push(page, ['ArrowUp'], 1000); s = await look(page); }
        else if (s.near !== n.id) { await page.evaluate(x => window.__PTH.walkToNpc(x), n.id); await page.waitForTimeout(500); s = await look(page); }
        await shot(page, id, `npc-${n.id}`);
        const o1 = cross(onScreen(s, s.x, s.y, R.HERO), onScreen(s, p0.x, p0.y, boxes[n.id])) / s.cam.z;
        let o2 = 0, sideWhy = 'no room beside';
        const talks = s.near === n.id && !!s.pill;
        if (talks) pillClear(s, n.id, below ? `below ${n.id}` : `at ${n.id}'s talk spot`); else if (n.id === 'shopkeeper' && !g.ok) F.info(`${id}: no Talk at the keeper away from the shop spot`, `near ${s.near}`);
        else F.ok(false, `${id}: Talk shows when she has walked right up to ${n.id}`, `near ${s.near}, pill ${s.pill ? s.pill.text : 'none'}; her feet ${(s.x - p0.x).toFixed(0)},${(s.y - p0.y).toFixed(0)} px from theirs`);
        const south = [s.x - p0.x, s.y - p0.y];
        // from the side (east, else west): walk level with her and push in
        for (const side of [1, -1]) {
          const gs = await walkCell(page, n.cell[0] + side * 2.6, n.cell[1] + 0.25, 0.45); if (!gs.ok) continue;
          await push(page, [side > 0 ? 'ArrowLeft' : 'ArrowRight'], 900); const s2 = await look(page);
          o2 = cross(onScreen(s2, s2.x, s2.y, R.HERO), onScreen(s2, p0.x, p0.y, boxes[n.id])) / s2.cam.z; sideWhy = `from the ${side > 0 ? 'east' : 'west'} her feet ${(s2.x - p0.x).toFixed(0)},${(s2.y - p0.y).toFixed(0)}`;
          await shot(page, id, `npc-${n.id}-side`);
          if (s2.near === n.id && s2.pill) pillClear(s2, n.id, `at ${n.id}'s side`);
          break;
        }
        F.ok(o1 <= lim && o2 <= lim, `${id}: she stops a body away from ${n.id}`, `sprite boxes overlap ${o1.toFixed(1)} px ${below ? 'walking up from below' : 'at her talk spot'} (her feet ${south[0].toFixed(0)},${south[1].toFixed(0)} px from theirs), ${o2.toFixed(1)} px from the side (${sideWhy}); allowed ${lim}${lim !== 4 ? ' (a lane too narrow for two bodies)' : ''}`);
      }

      // ---- T3, T5: the shop spot
      if (ONLY.includes('shop') && Array.isArray(TJ.shopCounter)) {
        const g = await walkCell(page, TJ.shopCounter[0], TJ.shopCounter[1], 0.6); await page.waitForTimeout(600);
        let { s, img } = await steadyShot(page, id, 'shop');
        F.ok(g.ok && s.pill && (s.svc === 'shop' || s.near === 'shopkeeper'), `${id}: the shop spot offers the shop`, `walk ${g.why}; pill "${s.pill ? s.pill.text : 'none'}"`);
        if (s.pill) pillClear(s, 'shopkeeper', 'at the shop spot');
        if (R.BANDED.includes(id)) {
          if (!band) F.ok(false, `${id}: the shopkeeper's legs are behind the counter`, 'the town json names no counter band: she is drawn whole, standing on the stall');
          else {
            const P = R.png(await get(`act1-hifi/${TJ.screen}`)), ak = P.w / (TJ.cells * C), kx = keeper.cell[0] * C, ky = keeper.cell[1] * C;
            // Block means (3 world px squares), so half a pixel of camera offset does not count as a difference. `legs`: from the band's
            // top edge down to her feet; `torso`: the 12 px above the band, where she IS drawn (proof that the frame shows her).
            const measure = (s, img) => { const hero = onScreen(s, s.x, s.y, R.HERO);
              const skip = (cx, cy) => (cx > hero[0] - 2 && cx < hero[2] + 2 && cy > hero[1] - 2 && cy < hero[3] + 2) || (s.pill && cx > s.pill.box[0] - 2 && cx < s.pill.box[2] + 2 && cy > s.pill.box[1] - 2 && cy < s.pill.box[3] + 2);
              const ringW = band.polygon.map(c => [c[0] * C, c[1] * C]), inBand = (x, y) => R.inRing(x, y, ringW);
              // `want`: true = blocks wholly inside the band's outline (a slanted top edge is followed), false = wholly outside it
              const part = (y0, y1, want) => { let sum = 0, cnt = 0;
                for (let by = y0; by + 3 <= y1 + 0.01; by += 3) for (let bx = kx - 9; bx < kx + 9; bx += 3) {
                  if ([[bx - 1, by - 1], [bx + 4, by - 1], [bx - 1, by + 4], [bx + 4, by + 4]].some(q => inBand(q[0], q[1]) !== want)) continue;
                  const d = blockDiff(img, s, P, ak, bx, by, bx + 3, by + 3, skip); if (d === null) continue; sum += d; cnt++; }
                return { cnt, diff: cnt ? sum / cnt : 0 }; };
              const legs = part(bandTop + 1, ky + 2, true), torso = part(bandTop - 16, bandTop + 4, false); return { cnt: legs.cnt, diff: legs.diff, torso: torso.diff, tcnt: torso.cnt }; };
            let m = measure(s, img);
            if (m.cnt < 6 || m.tcnt < 6) { await push(page, ['ArrowDown'], 700); ({ s, img } = await steadyShot(page, id, 'shop-back')); m = measure(s, img); }
            F.ok(m.cnt >= 6 && m.tcnt >= 6 && m.diff <= 3 && m.torso >= 20, `${id}: the shopkeeper's legs are behind the counter`, `from the band's top edge down to her feet (${m.cnt} blocks) the screen is the plate's own paint to within ${m.diff.toFixed(1)} of 255 (allowed 3); above the band, where she is drawn, it differs by ${m.torso.toFixed(1)} (need 20)`);
            // and the counter never covers HER: pressed against it, her own sprite is on screen (her body's middle differs from the plate)
            await push(page, ['ArrowUp'], 700); ({ s, img } = await steadyShot(page, id, 'shop-close'));
            const seen = (() => { let sum = 0, cnt = 0;
              for (let by = s.y - 24; by < s.y - 3; by += 3) for (let bx = s.x - 6; bx < s.x + 6; bx += 3) { const d = blockDiff(img, s, P, ak, bx, by, bx + 3, by + 3, null); if (d !== null) { sum += d; cnt++; } }
              return cnt ? sum / cnt : 0; })();
            F.ok(seen >= 20, `${id}: pressed against the counter she is drawn in front of it`, `her feet ${(s.x - kx).toFixed(0)},${(s.y - ky).toFixed(0)} px from the keeper's; where her body is, the screen differs from the plate by ${seen.toFixed(1)} of 255 (need 20: under the band it would be the plate's own paint)`);
          }
        }
      }

      // ---- T5: the save spot
      if (ONLY.includes('save') && Array.isArray(TJ.savePoint)) {
        const g = await walkCell(page, TJ.savePoint[0], TJ.savePoint[1], 0.6); await page.waitForTimeout(600);
        const s = await look(page); await shot(page, id, 'save');
        F.ok(g.ok && s.pill && s.svc === 'save', `${id}: the save spot offers Save`, `walk ${g.why}; pill "${s.pill ? s.pill.text : 'none'}"`);
        if (s.pill) pillClear(s, null, 'at the save spot');
      }

      // ---- T6: the stones
      if (ONLY.includes('props')) for (const p of (R.PROPS[id] || [])) {
        const ring = p.oval ? R.ovalRing(p.oval) : p.cells.map(c => [c[0] * C, c[1] * C]);
        // onto the review's spot if the town lets her; otherwise as near as she can get on the review's side. Then she steers
        // at the spot for a second and a half, as a child would, and every step of the way is measured.
        const off = { east: [22, 0], west: [-22, 0], north: [0, -22] }[p.from];
        let g = await walkCell(page, p.was[0] / C, p.was[1] / C, 0.2), how = 'she walked onto the review\'s spot';
        if (!g.ok) { for (const r of [0.7, 1.4, 2.4]) { g = await walkCell(page, (p.was[0] + off[0]) / C, (p.was[1] + off[1]) / C, r); if (g.ok) break; } how = `the review's spot refuses her; from the ${p.from} (walk ${g.why})`; }
        const depth = s => { let d = 0; if (s.y < p.front) for (const h of [2, 8, 14, 20, R.BODY_UP]) for (const side of [-1, 1]) { let dd = 0; while (dd < R.BODY_HALF * 2 && R.inRing(s.x + side * (R.BODY_HALF - dd), s.y - h, ring)) dd++; d = Math.max(d, dd); } return d; };
        let s = await look(page), deep = depth(s), at = [s.x, s.y], near = Math.hypot(s.x - p.was[0], s.y - p.was[1]);
        for (let i = 0; i < 16; i++) { await page.evaluate(k => window.__PTH.setKeys(k), toward(p.was[0] - s.x, p.was[1] - s.y)); await page.waitForTimeout(90); s = await look(page);
          const d = depth(s); if (d > deep) { deep = d; at = [s.x, s.y]; } near = Math.min(near, Math.hypot(s.x - p.was[0], s.y - p.was[1])); }
        await page.evaluate(() => window.__PTH.setKeys([])); await page.waitForTimeout(450); s = await look(page);
        await shot(page, id, p.id);
        F.ok(deep <= 3 && near <= 40, `${id}: the ${p.id} refuses her`, `${how}, then steered at it: she came within ${near.toFixed(0)} px of the spot and at the worst (feet ${at[0].toFixed(0)},${at[1].toFixed(0)}) her body was ${deep} px inside the painted outline (allowed 3)`);
      }
    } catch (e) { F.ok(false, `${id}: town looks ran`, String(e && e.stack || e).slice(0, 300)); }
  }
  await browser.close();
  F.done('town-looks');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
