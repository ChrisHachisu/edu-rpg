'use strict';
// Honest player, day 4 B2 (review finding 7): three door heroes per grade instead of one. From the typical hero of balance-doors.json
// (the median-level playthrough at that door) it makes one two levels BELOW and one two levels ABOVE, with the bundle's own level table:
// each level adds a fixed row of max HP / attack / defence / speed (the `al` table next to Player.addExp) and the XP line moves with it
// (`Wr`). Gear, bag and gold stay those of the typical hero; current HP keeps its distance to the new maximum. Both tables are READ from
// the built bundle (HONEST_DIST), never copied here, so a changed bundle changes the heroes.
//   const H = require('./heroes.cjs'); H.shift(record, -2)   ->   a new { state, quizStats }
const fs = require('fs'), path = require('path');
let T = null;
function tables() {
  if (T) return T;
  const dist = process.env.HONEST_DIST || '/home/user/work/d4/b2/dist', f = fs.readdirSync(path.join(dist, 'assets')).find(n => /^index-.*\.js$/.test(n));
  const src = fs.readFileSync(path.join(dist, 'assets', f), 'utf8');
  const wr = /\bWr = \[([\d\s,e]+)\]/.exec(src), al = /\bal = \[([\s\S]*?)\n\s*\],?\n/.exec(src);
  if (!wr || !al) throw new Error('level tables not found in ' + f);
  const Wr = wr[1].split(',').map(Number), rows = [...al[1].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g)].map(m => m.slice(1, 5).map(Number));
  if (rows.length < 30 || Wr.length < 30) throw new Error('level tables look wrong: ' + rows.length + ' rows, ' + Wr.length + ' XP lines');
  return (T = { Wr, al: rows });
}
function shift(record, by) {
  const { Wr, al } = tables(), s = JSON.parse(JSON.stringify(record.state)), gap = s.maxHp - s.hp;
  for (let i = 0; i < Math.abs(by); i++) {
    if (by > 0) { s.level++; const r = al[s.level] || [5, 2, 2, 1]; s.maxHp += r[0]; s.atk += r[1]; s.def += r[2]; s.spd += r[3]; }
    else { const r = al[s.level] || [5, 2, 2, 1]; s.maxHp -= r[0]; s.atk -= r[1]; s.def -= r[2]; s.spd -= r[3]; s.level--; }
  }
  s.exp = Wr[s.level] + Math.floor((Wr[s.level + 1] - Wr[s.level]) / 2); s.expToNext = Wr[s.level + 1]; s.hp = Math.max(1, s.maxHp - gap);
  return { state: s, quizStats: record.quizStats || {} };
}
module.exports = { shift, tables };
if (require.main === module) { const t = tables(); console.log('XP lines', t.Wr.length, 'level rows', t.al.length, 'level 24..28', JSON.stringify(t.al.slice(24, 29))); }
