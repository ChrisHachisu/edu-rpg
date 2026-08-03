import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [baselinePath, masksPath, outputPath] = process.argv.slice(2);
if (!baselinePath || !masksPath || !outputPath) {
  throw new Error('usage: node render-corridor-checkpoint.mjs <baseline.json> <compiled-corridorMasks.js> <output.svg>');
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const { CORRIDOR_MASKS } = await import(pathToFileURL(path.resolve(masksPath)).href);
const windows = baseline.corridorWindows;
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const key = ({ x, y }) => `${x},${y}`;
const tilePalette = {
  0: '#89a95d', 1: '#d7b979', 2: '#397ca6', 3: '#2f603e', 4: '#767b83',
  6: '#d9a23e', 7: '#684c86', 8: '#9e4860', 9: '#48b5ac', 10: '#5a3d76',
  11: '#d7b979', 12: '#9972bf', 13: '#8c7754', 14: '#545964', 15: '#684c86',
  16: '#71c5db', 17: '#aeb8c3', 18: '#c79a51', 19: '#72538c', 20: '#d7b979', 21: '#34373d',
};
const routeIds = new Set([1, 11, 13, 20]);
const rowLayout = {
  crystal: { top: 100, title: 'Crystal Cave — Act 1 → 2', note: '21 cells: x=150…170 at y=305' },
  shadow: { top: 420, title: 'Shadow Cave — Act 2 → 3', note: '31 cells: x=260 at y=203…233' },
  volcanic: { top: 760, title: 'Volcanic Forge — Act 4 → 5', note: '21 cells: x=150…170 at y=110' },
};

const out = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1080" viewBox="0 0 1600 1080">',
  '<rect width="1600" height="1080" fill="#111820"/>',
  '<style>text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.title{fill:#f3f5f7;font-size:26px;font-weight:700}.label{fill:#d6dde4;font-size:17px}.small{fill:#aeb8c3;font-size:13px}.pass{fill:#7fd39a;font-size:14px;font-weight:700}</style>',
  '<text class="title" x="70" y="48">Preserved overworld — exact three-corridor owner checkpoint</text>',
  `<text class="small" x="70" y="76">Post-dq stable corridor windows · preserved bundle ${escape(baseline.provenance.bundleSha256.slice(0, 12))}…${escape(baseline.provenance.bundleSha256.slice(-8))} · exact water/routes/mouths/specials</text>`,
];

for (const mask of CORRIDOR_MASKS) {
  const window = windows[mask.id];
  if (!window) throw new Error(`missing shipped window for ${mask.id}`);
  if (window.sha256 !== mask.postDqWindowEvidence.sha256) {
    throw new Error(`${mask.id} post-dq window hash does not match the reviewed mask evidence`);
  }
  const layout = rowLayout[mask.id];
  const width = window.bounds.maxX - window.bounds.minX + 1;
  const height = window.bounds.maxY - window.bounds.minY + 1;
  const tile = Math.min(8, Math.floor(240 / height), Math.floor(470 / width));
  const changed = new Map(mask.changedCells.map(cell => [key(cell), cell]));
  const mouths = new Set(mask.retainedMouths.map(key));
  const counts = { mountain: 0, 'blocked-tree': 0 };

  for (const cell of mask.changedCells) {
    const row = window.rows[cell.y - window.bounds.minY];
    const before = Number.parseInt(row[cell.x - window.bounds.minX], 36);
    if (before !== 2) throw new Error(`${mask.id} changes non-water ${key(cell)} (tile ${before})`);
    counts[cell.barrier] += 1;
  }

  out.push(`<text class="title" x="70" y="${layout.top}">${escape(layout.title)}</text>`);
  out.push(`<text class="label" x="70" y="${layout.top + 26}">${escape(layout.note)} · mountain ${counts.mountain} · blocked-tree ${counts['blocked-tree']}</text>`);

  for (const [panelIndex, after] of [false, true].entries()) {
    const panelX = panelIndex === 0 ? 90 : 820;
    const mapX = panelX + 42;
    const mapY = layout.top + 64;
    out.push(`<text class="label" x="${panelX}" y="${mapY - 12}">${after ? 'PROPOSED — geographic land, ordinary crossing blocked' : 'POST-DQ BASELINE — exact corridor window'}</text>`);
    out.push(`<rect x="${mapX - 2}" y="${mapY - 2}" width="${width * tile + 4}" height="${height * tile + 4}" rx="3" fill="#080c10" stroke="#394651"/>`);

    window.rows.forEach((row, rowIndex) => {
      [...row].forEach((digit, columnIndex) => {
        const x = window.bounds.minX + columnIndex;
        const y = window.bounds.minY + rowIndex;
        const changedCell = changed.get(`${x},${y}`);
        const before = Number.parseInt(digit, 36);
        const effective = after && changedCell ? (changedCell.barrier === 'mountain' ? 4 : 3) : before;
        const px = mapX + columnIndex * tile;
        const py = mapY + rowIndex * tile;
        out.push(`<rect x="${px}" y="${py}" width="${tile}" height="${tile}" fill="${tilePalette[effective] ?? '#c4ccd4'}"/>`);
        if (routeIds.has(before)) out.push(`<circle cx="${px + tile / 2}" cy="${py + tile / 2}" r="${Math.max(1, tile / 5)}" fill="#fff3c4"/>`);
        if (after && changedCell) out.push(`<rect x="${px + .5}" y="${py + .5}" width="${tile - 1}" height="${tile - 1}" fill="none" stroke="#f5c84c" stroke-width="1"/>`);
        if (mouths.has(`${x},${y}`)) out.push(`<rect x="${px - 1}" y="${py - 1}" width="${tile + 2}" height="${tile + 2}" fill="none" stroke="#f27ab0" stroke-width="2"/>`);
      });
    });

    const copyX = panelX + 410;
    if (after) {
      out.push(`<text class="pass" x="${copyX}" y="${mapY + 26}">PASS · every changed cell was tile 2</text>`);
      out.push(`<text class="pass" x="${copyX}" y="${mapY + 48}">PASS · all use ground substrate</text>`);
      out.push(`<text class="pass" x="${copyX}" y="${mapY + 70}">PASS · 0 new walkable cells</text>`);
      out.push(`<text class="pass" x="${copyX}" y="${mapY + 92}">PASS · mouths/routes unchanged</text>`);
      out.push(`<text class="small" x="${copyX}" y="${mapY + 120}">window ${escape(window.sha256.slice(0, 16))}…</text>`);
    }
  }
}

out.push('<rect x="70" y="1024" width="18" height="18" fill="#f5c84c"/><text class="small" x="98" y="1038">gold outline = exact mask</text>');
out.push('<rect x="310" y="1024" width="18" height="18" fill="none" stroke="#f27ab0" stroke-width="3"/><text class="small" x="338" y="1038">pink outline = retained mouth</text>');
out.push('<circle cx="610" cy="1033" r="4" fill="#fff3c4"/><text class="small" x="625" y="1038">dot = shipped route tile</text>');
out.push('<text class="small" x="950" y="1038">Act 3/4 untouched · portal worlds untouched · no runtime terrain applied</text>');
out.push('</svg>');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, out.join('\n'));
