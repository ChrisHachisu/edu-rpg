'use strict';
// Story playthrough hand-over between probes (E3). A probe that is run with
//   PT_SAVE=<file>      seeds THAT save (the record the previous segment of the playthrough wrote)
//                       instead of its own synthetic one, so story flags, quests and inventory are
//                       whatever the real game path earned so far;
//   PT_SAVE_OUT=<file>  writes the game's own record when it is done (the auto save, as the game
//                       writes it outside a town), for the next segment.
// Without these variables the probes behave exactly as before.
const fs = require('fs');
const seed = () => (process.env.PT_SAVE ? JSON.parse(fs.readFileSync(process.env.PT_SAVE, 'utf8')) : null);
// The game's current record, as Continue would read it. Outside a town saveGame is the auto save (ui-overhaul.js).
const capture = page => page.evaluate(() => {
  const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene'), gs = window.__GAME_STATE__;
  try { if (w && w.updatePosition) w.updatePosition(); } catch (e) {}
  let raw = null;
  try { if (gs.autoSave) { gs.autoSave(); raw = localStorage.getItem('edu-rpg-autosave'); } } catch (e) {}
  if (!raw) { try { gs.saveGame(); } catch (e) {} raw = localStorage.getItem('edu-rpg-autosave') || localStorage.getItem('edu-rpg-save'); }
  return raw;
});
async function dump(page) {
  if (!process.env.PT_SAVE_OUT || !page) return null;
  const raw = await capture(page).catch(() => null);
  if (raw) fs.writeFileSync(process.env.PT_SAVE_OUT, raw);
  return raw ? JSON.parse(raw).player.position : null;
}
module.exports = { seed, capture, dump, active: () => !!process.env.PT_SAVE };
