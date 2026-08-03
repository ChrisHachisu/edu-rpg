#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'design/review/overworld-art-blueprint/source-plates');
const OUT = path.join(ROOT, 'design/review/overworld-art-blueprint/source-mosaic');
const RUN_TAG = `${process.pid}-${Date.now()}`;
const OUT_PARENT = path.dirname(OUT);
const WORK = path.join(OUT_PARENT, `.source-mosaic-work-${RUN_TAG}`);
const STAGE = path.join(OUT_PARENT, `.source-mosaic-stage-${RUN_TAG}`);
const BACKUP = path.join(OUT_PARENT, `.source-mosaic-backup-${RUN_TAG}`);
const MANIFEST_FILE = path.join(SOURCE, 'manifest.json');
const MAGICK = '/opt/homebrew/bin/magick';
const TILE = 16;
const CANVAS_TILES = [320, 400];
const CANVAS = CANVAS_TILES.map(value => value * TILE);
const PLATE_IDS = ['act1', 'act2', 'act3', 'act4', 'act5'];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function runMagick(args) {
  const result = spawnSync(MAGICK, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`magick failed (${args.join(' ')}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

function compareImages(left, right) {
  const result = spawnSync(MAGICK, ['compare', '-metric', 'AE', left, right, 'null:'], { encoding: 'utf8' });
  if (result.status !== 0 && result.status !== 1) throw new Error(`magick compare failed: ${result.stderr || result.stdout}`);
  const match = (result.stderr || result.stdout).trim().match(/^([0-9.]+)(?: \(([0-9.]+)\))?/);
  if (!match) throw new Error(`could not parse compare metric: ${result.stderr || result.stdout}`);
  return { differentPixels: Number(match[1]), normalizedDifference: Number(match[2] || 0) };
}

function pngDimensions(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function imageMetrics(file) {
  const standardDeviation = Number(runMagick([
    file, '-alpha', 'off', '-channel', 'RGB', '-format', '%[fx:standard_deviation]', 'info:',
  ]).trim());
  const terrainCoverage = Number(runMagick([
    file, '-colorspace', 'Gray', '-threshold', '8%', '-format', '%[fx:mean]', 'info:',
  ]).trim());
  return { standardDeviation, terrainCoverage, blackCoverage: 1 - terrainCoverage };
}

function expectedDimensions(bounds) {
  return [(bounds[2] - bounds[0] + 1) * TILE, (bounds[3] - bounds[1] + 1) * TILE];
}

function intersection(left, right) {
  const bounds = [
    Math.max(left[0], right[0]),
    Math.max(left[1], right[1]),
    Math.min(left[2], right[2]),
    Math.min(left[3], right[3]),
  ];
  return bounds[0] <= bounds[2] && bounds[1] <= bounds[3] ? bounds : null;
}

function crop(file, bounds, sourceBounds, output) {
  const dimensions = expectedDimensions(bounds);
  runMagick([
    file,
    '-crop', `${dimensions[0]}x${dimensions[1]}+${(bounds[0] - sourceBounds[0]) * TILE}+${(bounds[1] - sourceBounds[1]) * TILE}`,
    '+repage', output,
  ]);
}

function auditOverlaps(plates) {
  const audits = [];
  for (let leftIndex = 0; leftIndex < plates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < plates.length; rightIndex += 1) {
      const left = plates[leftIndex];
      const right = plates[rightIndex];
      const bounds = intersection(left.bounds, right.bounds);
      if (!bounds) continue;
      const leftCrop = path.join(WORK, `${left.id}-${right.id}-left.png`);
      const rightCrop = path.join(WORK, `${left.id}-${right.id}-right.png`);
      crop(left.file, bounds, left.bounds, leftCrop);
      crop(right.file, bounds, right.bounds, rightCrop);
      const comparison = compareImages(leftCrop, rightCrop);
      audits.push({
        plates: [left.id, right.id],
        bounds,
        dimensions: expectedDimensions(bounds),
        ...comparison,
      });
    }
  }
  const act34 = audits.find(audit => audit.plates[0] === 'act3' && audit.plates[1] === 'act4');
  if (!act34 || act34.differentPixels !== 0) throw new Error('Act 3/4 overlap is not in exact alignment');
  return audits;
}

function markerDrawArgs(markers) {
  const draw = [];
  for (const marker of markers) {
    const [x, y] = marker.pixel;
    draw.push(
      '-fill', 'none', '-stroke', '#101820', '-strokewidth', '8', '-draw', `circle ${x},${y} ${x + 15},${y}`,
      '-stroke', '#ffffff', '-strokewidth', '5', '-draw', `circle ${x},${y} ${x + 15},${y}`,
      '-stroke', marker.color, '-strokewidth', '3', '-draw', `circle ${x},${y} ${x + 15},${y}`,
      '-draw', `line ${x - 21},${y} ${x - 10},${y} line ${x + 10},${y} ${x + 21},${y} line ${x},${y - 21} ${x},${y - 10} line ${x},${y + 10} ${x},${y + 21}`,
    );
  }
  return draw;
}

function prepareStage() {
  fs.mkdirSync(OUT_PARENT, { recursive: true });
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  if (fs.existsSync(OUT)) fs.cpSync(OUT, STAGE, { recursive: true });
  else fs.mkdirSync(STAGE, { recursive: true });
}

function promote(files) {
  const stagedFiles = fs.readdirSync(STAGE).sort();
  const requiredFiles = [...files].sort();
  if (stagedFiles.length !== requiredFiles.length || stagedFiles.some((file, index) => file !== requiredFiles[index])) {
    throw new Error(`staged output set mismatch: ${stagedFiles.join(', ')}`);
  }
  for (const file of requiredFiles) {
    const staged = path.join(STAGE, file);
    if (!fs.statSync(staged).isFile()) throw new Error(`staged output is not a file: ${file}`);
  }
  let backedUp = false;
  if (fs.existsSync(OUT)) {
    fs.renameSync(OUT, BACKUP);
    backedUp = true;
  }
  try {
    fs.renameSync(STAGE, OUT);
  } catch (error) {
    if (backedUp) {
      try {
        fs.renameSync(BACKUP, OUT);
      } catch (restoreError) {
        error.message += `; restore failed (${restoreError.message}); original retained at ${BACKUP}`;
      }
    }
    throw error;
  }
  if (backedUp) fs.rmSync(BACKUP, { recursive: true, force: true });
}

(async () => {
  try {
    prepareStage();
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    if (manifest.plateTilePixels !== TILE) throw new Error(`expected ${TILE}px plate tiles`);
    const plates = PLATE_IDS.map(id => {
      const entry = manifest.plates[id];
      if (!entry) throw new Error(`manifest is missing ${id}`);
      const file = path.join(SOURCE, entry.clean);
      const dimensions = expectedDimensions(entry.bounds);
      if (pngDimensions(file).join('x') !== dimensions.join('x')) throw new Error(`${id} dimensions do not match bounds`);
      return { id, file, bounds: entry.bounds, dimensions, sha256: sha256(file) };
    });

    // The overlap audit runs before the deterministic later-act-wins placement order is selected.
    const overlapAudit = auditOverlaps(plates);
    const placementOrder = [...PLATE_IDS];
    const cleanName = 'world-current-clean.png';
    const markedName = 'world-current-connectors.png';
    const evidenceName = 'manifest.json';
    const stagedClean = path.join(STAGE, cleanName);
    const stagedMarked = path.join(STAGE, markedName);
    const oceanPatch = path.join(WORK, 'ocean-source.png');
    runMagick([plates.find(plate => plate.id === 'act5').file, '-crop', '512x512+0+0', '+repage', '-strip', oceanPatch]);

    const compose = ['-size', `${CANVAS[0]}x${CANVAS[1]}`, `tile:${oceanPatch}`];
    for (const id of placementOrder) {
      const plate = plates.find(candidate => candidate.id === id);
      compose.push(plate.file, '-geometry', `+${plate.bounds[0] * TILE}+${plate.bounds[1] * TILE}`, '-composite');
    }
    compose.push('-strip', stagedClean);
    runMagick(compose);
    if (pngDimensions(stagedClean).join('x') !== CANVAS.join('x')) throw new Error('clean mosaic dimensions are incorrect');

    const placementAudit = [];
    for (const plate of plates) {
      const placedCrop = path.join(WORK, `${plate.id}-placed.png`);
      runMagick([
        stagedClean,
        '-crop', `${plate.dimensions[0]}x${plate.dimensions[1]}+${plate.bounds[0] * TILE}+${plate.bounds[1] * TILE}`,
        '+repage', placedCrop,
      ]);
      placementAudit.push({ plate: plate.id, ...compareImages(plate.file, placedCrop) });
    }
    const act12 = overlapAudit.find(audit => audit.plates[0] === 'act1' && audit.plates[1] === 'act2');
    for (const audit of placementAudit) {
      const expected = audit.plate === 'act1' && act12 ? act12.differentPixels : 0;
      if (audit.differentPixels !== expected) throw new Error(`${audit.plate} placement changed pixels outside the audited overlap`);
    }

    const markers = PLATE_IDS.flatMap(id => manifest.plates[id].markers.map(marker => ({
      id: marker.id,
      sourcePlate: id,
      tile: marker.at,
      pixel: [marker.at[0] * TILE + TILE / 2, marker.at[1] * TILE + TILE / 2],
      color: marker.color,
    })));
    if (markers.length !== 8) throw new Error(`expected 8 connector markers, found ${markers.length}`);
    runMagick([stagedClean, ...markerDrawArgs(markers), '-strip', stagedMarked]);
    if (pngDimensions(stagedMarked).join('x') !== CANVAS.join('x')) throw new Error('marked mosaic dimensions are incorrect');
    const markerDelta = compareImages(stagedClean, stagedMarked);
    if (markerDelta.differentPixels === 0) throw new Error('marked mosaic has no marker pixels');

    const evidence = {
      source: 'five final clean runtime source plates',
      sourceManifest: path.relative(ROOT, MANIFEST_FILE),
      sourceManifestSha256: sha256(MANIFEST_FILE),
      tilePixels: TILE,
      canvasTiles: CANVAS_TILES,
      outputDimensions: CANVAS,
      background: {
        mode: 'tiled source ocean pixels',
        sourcePlate: 'act5',
        sourceCrop: [0, 0, 512, 512],
        sha256: sha256(oceanPatch),
      },
      placementOrder,
      overlapPolicy: 'later plate wins; no source pixels are resized or altered',
      overlapAudit,
      placementAudit,
      inputs: plates.map(plate => ({
        id: plate.id,
        file: path.relative(ROOT, plate.file),
        sha256: plate.sha256,
        bounds: plate.bounds,
        dimensions: plate.dimensions,
        offset: [plate.bounds[0] * TILE, plate.bounds[1] * TILE],
      })),
      markers,
      markerDelta,
      outputs: {
        clean: cleanName,
        marked: markedName,
        cleanSha256: sha256(stagedClean),
        markedSha256: sha256(stagedMarked),
        cleanMetrics: imageMetrics(stagedClean),
        markedMetrics: imageMetrics(stagedMarked),
      },
    };
    fs.writeFileSync(path.join(STAGE, evidenceName), `${JSON.stringify(evidence, null, 2)}\n`);
    promote([cleanName, markedName, evidenceName]);
    console.log(`MOSAIC PASS ${CANVAS.join('x')} overlaps=${overlapAudit.length} markers=${markers.length}`);
  } finally {
    try {
      fs.rmSync(WORK, { recursive: true, force: true });
    } finally {
      fs.rmSync(STAGE, { recursive: true, force: true });
    }
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
