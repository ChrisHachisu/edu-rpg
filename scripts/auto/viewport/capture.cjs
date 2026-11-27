'use strict';
// Pictures and raw numbers for the screen size matrix (the report run of scripts/auto/checks/viewport.cjs):
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5578/ VP_OUT=/tmp/vp \
//     node scripts/auto/viewport/capture.cjs <size id> <en|ja-kana|ja-kanji> [part ...]
// Writes VP_OUT/shots/<size>-<lang>-<screen>.jpg and VP_OUT/m/<size>-<lang>[-parts].json. VP_DUMP=1 adds every text run.
// sizes: se i13 promax mini ipad ipadL pro proL    parts: title field town dungeon boss ending
const fs = require('fs'), path = require('path');
const V = require('./vplib.cjs');
const OUT = process.env.VP_OUT || '/tmp/vp';
(async () => {
  const size = V.SIZES.find(s => s.id === process.argv[2]), lang = process.argv[3] || 'en', parts = process.argv.slice(4);
  if (!size) throw new Error('size? ' + V.SIZES.map(s => s.id).join(' '));
  const r = await V.run(size, lang, { parts: parts.length ? parts : V.PARTS, shots: path.join(OUT, 'shots'), dump: !!process.env.VP_DUMP });
  fs.mkdirSync(path.join(OUT, 'm'), { recursive: true });
  const f = path.join(OUT, 'm', `${size.id}-${lang}${parts.length ? '-' + parts.join('+') : ''}.json`);
  fs.writeFileSync(f, JSON.stringify(r));
  console.log('wrote', f, 'screens', r.order.length, 'notes', JSON.stringify(r.notes), 'partErrors', JSON.stringify(r.partErrors));
})().catch(e => { console.error('CRASH', e); process.exit(1); });
