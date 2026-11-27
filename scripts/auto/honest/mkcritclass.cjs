'use strict';
// Write the critical-hit class table into the balance block of public/battle-recovery.js (the lines marked @@CLASS@@ and @@NEG@@).
//   node scripts/auto/honest/mkcritclass.cjs [effort-ref.json] [--cap 2] [--dry]
// factor of a plan row = mean effort of that row (new bank, effort model) / mean effort of the OLD bank for the grade, rounded to 0.05, within [1, cap].
const fs = require('fs'), path = require('path');
const f = process.argv.slice(2).find(a => a.endsWith('.json')) || path.join(__dirname, 'effort-ref.json');
const cap = +(process.argv.includes('--cap') ? process.argv[process.argv.indexOf('--cap') + 1] : 2), dry = process.argv.includes('--dry');
const E = JSON.parse(fs.readFileSync(f, 'utf8')), CL = {}, NEG = {};
const q = v => Math.round(v * 20) / 20;
for (const g of Object.keys(E.rows)) { CL[g] = [];
  for (let act = 1; act <= 5; act++) { const rows = E.rows[g][act] || {}, arr = [];
    for (const [k, v] of Object.entries(rows)) { const m = Math.min(cap, Math.max(1, q(v.mean / E.ref[g]))); if (k === '-1') NEG[g] = m; else if (+k >= 0) arr[+k] = m; }
    for (let i = 0; i < arr.length; i++) if (arr[i] == null) arr[i] = 0; CL[g].push(arr); } }
const js = o => JSON.stringify(o).replace(/"(\w+)":/g, '$1:').replace(/"(\d)":/g, "'$1':");
const p = path.join(__dirname, '..', '..', '..', 'public', 'battle-recovery.js'); let s = fs.readFileSync(p, 'utf8');
const lines = Object.keys(CL).map(g => `    ${/^\d$/.test(g) ? "'" + g + "'" : g}: ${JSON.stringify(CL[g])}`).join(',\n');
const a = /  var CLASS = [\s\S]*?;   \/\/ @@CLASS@@/, b = /  var NEG = [^\n]*;     \/\/ @@NEG@@/;
if (!a.test(s) || !b.test(s)) throw new Error('markers not found');
s = s.replace(a, () => `  var CLASS = {\n${lines}\n  };   // @@CLASS@@`).replace(b, () => `  var NEG = ${JSON.stringify(NEG).replace(/"(\w+)":/g, '$1:')};     // @@NEG@@`);
if (dry) console.log(lines); else { fs.writeFileSync(p + '.tmp', s); fs.renameSync(p + '.tmp', p); console.log('wrote class table for', Object.keys(CL).join(' '), 'neg', JSON.stringify(NEG)); }
// a summary for the report
for (const g of Object.keys(CL)) console.log(g, 'ref', E.ref[g].toFixed(2), 'factors by act', CL[g].map(a => { const v = a.filter(x => x > 0); return v.length ? (v.reduce((x, y) => x + y, 0) / v.length).toFixed(2) + ' [' + Math.min(...v) + '-' + Math.max(...v) + ']' : '-'; }).join('  '));
