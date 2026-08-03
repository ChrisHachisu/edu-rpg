#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BLUEPRINT = path.join(ROOT, 'design/review/overworld-art-blueprint');
const SOURCE = path.join(BLUEPRINT, 'source-plates');
const SOURCE_MANIFEST = path.join(SOURCE, 'manifest.json');
const MOSAIC_MANIFEST = path.join(BLUEPRINT, 'source-mosaic/manifest.json');
const CONCEPT = path.join(BLUEPRINT, 'generated/overworld-source-mosaic-redraw-v2.png');
const OUT = path.join(BLUEPRINT, 'act-by-act/act1');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const STAGE = fs.mkdtempSync(path.join(path.dirname(OUT), '.act1-stage-'));
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'act1-reference-pack-'));
const MAGICK = '/opt/homebrew/bin/magick';
const FONT = '/System/Library/Fonts/Supplemental/Arial.ttf';
const TILE_PIXELS = 16;
const WORLD_TILES = [320, 400];
const CROP = { x: 0, y: 550, width: 875, height: 852 };

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function pngDimensions(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function runMagick(args) {
  const result = spawnSync(MAGICK, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`magick failed: ${result.stderr || result.stdout}`);
}

function makePanel(input, title, role, output) {
  const image = path.join(WORK, `${path.basename(output, '.png')}-image.png`);
  const caption = path.join(WORK, `${path.basename(output, '.png')}-caption.png`);
  runMagick([input, '-resize', '720x760>', '-background', '#111827', '-gravity', 'center', '-extent', '760x800', image]);
  runMagick([
    '-background', '#111827', '-fill', '#f8fafc', '-font', FONT, '-pointsize', '26',
    '-size', '720x118', '-gravity', 'center', `caption:${title}\n${role}`,
    '-bordercolor', '#111827', '-border', '20x10', caption,
  ]);
  runMagick([image, caption, '-append', output]);
}

function promote() {
  const backup = `${OUT}.backup-${process.pid}`;
  let backedUp = false;
  if (fs.existsSync(OUT)) {
    fs.renameSync(OUT, backup);
    backedUp = true;
  }
  try {
    fs.renameSync(STAGE, OUT);
  } catch (error) {
    if (backedUp) fs.renameSync(backup, OUT);
    throw error;
  }
  if (backedUp) fs.rmSync(backup, { recursive: true, force: true });
}

try {
  const sourceManifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST, 'utf8'));
  const sourceEntry = sourceManifest.plates.act1;
  if (!sourceEntry || sourceManifest.plateTilePixels !== TILE_PIXELS) {
    throw new Error('Act 1 source manifest or 16px/tile authority is missing');
  }

  const sourceClean = path.join(SOURCE, sourceEntry.clean);
  const sourceMarked = path.join(SOURCE, sourceEntry.marked);
  const packedClean = path.join(STAGE, 'act1-source-clean.png');
  const packedMarked = path.join(STAGE, 'act1-source-connectors.png');
  const macroCrop = path.join(STAGE, 'act1-macro-concept-crop.png');
  const contactSheet = path.join(STAGE, 'act1-reference-contact-sheet.png');

  fs.copyFileSync(sourceClean, packedClean);
  fs.copyFileSync(sourceMarked, packedMarked);
  if (sha256(sourceClean) !== sha256(packedClean) || sha256(sourceMarked) !== sha256(packedMarked)) {
    throw new Error('Source authority copies are not byte-exact');
  }

  runMagick([
    CONCEPT,
    '-crop', `${CROP.width}x${CROP.height}+${CROP.x}+${CROP.y}`,
    '+repage', '-strip', macroCrop,
  ]);

  const cleanPanel = path.join(WORK, 'clean-panel.png');
  const markedPanel = path.join(WORK, 'marked-panel.png');
  const macroPanel = path.join(WORK, 'macro-panel.png');
  makePanel(packedClean, 'ACT 1 SOURCE — CLEAN', 'TOPOLOGY + SCALE AUTHORITY', cleanPanel);
  makePanel(packedMarked, 'ACT 1 SOURCE — MARKED', 'CRYSTAL CONNECTOR AUTHORITY', markedPanel);
  makePanel(macroCrop, 'MACRO CONCEPT CROP', 'STYLE + COMPOSITION ONLY — NO TERRAIN AUTHORITY', macroPanel);
  runMagick([cleanPanel, markedPanel, macroPanel, '+append', '-strip', contactSheet]);

  const crystal = sourceEntry.markers.find(marker => marker.id === 'crystal-act1');
  if (!crystal) throw new Error('Crystal Act 1 marker is missing');
  const localTopLeft = [
    (crystal.at[0] - sourceEntry.bounds[0]) * TILE_PIXELS,
    (crystal.at[1] - sourceEntry.bounds[1]) * TILE_PIXELS,
  ];
  const manifest = {
    schemaVersion: 1,
    act: 1,
    northUp: true,
    sourceScale: { tilePixels: TILE_PIXELS, worldTiles: WORLD_TILES },
    warnings: [
      'The macro concept crop is style and broad composition guidance only. It has no terrain, topology, landmark, route, coordinate, or scale authority.',
      'Only the clean and connector-marked runtime source plates preserve Act 1 topology and scale authority.',
    ],
    inputs: {
      sourceManifest: { file: path.relative(ROOT, SOURCE_MANIFEST), sha256: sha256(SOURCE_MANIFEST) },
      sourceMosaicManifest: { file: path.relative(ROOT, MOSAIC_MANIFEST), sha256: sha256(MOSAIC_MANIFEST) },
      cleanRuntimePlate: {
        file: path.relative(ROOT, sourceClean), sha256: sha256(sourceClean), dimensions: pngDimensions(sourceClean),
        boundsWorldTilesInclusive: sourceEntry.bounds, role: 'Act 1 topology and scale authority',
      },
      markedRuntimePlate: {
        file: path.relative(ROOT, sourceMarked), sha256: sha256(sourceMarked), dimensions: pngDimensions(sourceMarked),
        boundsWorldTilesInclusive: sourceEntry.bounds, role: 'Act 1 connector-location authority',
      },
      macroConcept: {
        file: path.relative(ROOT, CONCEPT), sha256: sha256(CONCEPT), dimensions: pngDimensions(CONCEPT),
        role: 'Macro silhouette, visual style, and broad composition guide only; no terrain authority', authority: 'none',
      },
    },
    crystalConnector: {
      id: crystal.id, worldTile: crystal.at, color: crystal.color,
      sourcePlateLocalPixelTopLeft: localTopLeft,
      sourcePlateLocalPixelCenter: localTopLeft.map(value => value + TILE_PIXELS / 2),
    },
    macroCrop: {
      cropBoxPixels: CROP,
      dimensions: pngDimensions(macroCrop),
      approximateWorldWindowIfProportionallyProjected: {
        xMin: CROP.x / pngDimensions(CONCEPT)[0] * WORLD_TILES[0],
        xMax: (CROP.x + CROP.width) / pngDimensions(CONCEPT)[0] * WORLD_TILES[0],
        yMin: CROP.y / pngDimensions(CONCEPT)[1] * WORLD_TILES[1],
        yMax: (CROP.y + CROP.height) / pngDimensions(CONCEPT)[1] * WORLD_TILES[1],
      },
      includes: 'Complete southwest Act 1 composition plus generous northern and eastern context toward Act 2',
      authority: 'none',
    },
    outputs: {
      cleanSourceCopy: {
        file: 'act1-source-clean.png', sha256: sha256(packedClean), dimensions: pngDimensions(packedClean),
        byteExactCopy: true, role: 'Act 1 topology and scale authority',
      },
      markedSourceCopy: {
        file: 'act1-source-connectors.png', sha256: sha256(packedMarked), dimensions: pngDimensions(packedMarked),
        byteExactCopy: true, role: 'Crystal connector authority',
      },
      macroConceptCrop: {
        file: 'act1-macro-concept-crop.png', sha256: sha256(macroCrop), dimensions: pngDimensions(macroCrop),
        role: 'Style and broad composition reference only', authority: 'none',
      },
      reviewContactSheet: {
        file: 'act1-reference-contact-sheet.png', sha256: sha256(contactSheet), dimensions: pngDimensions(contactSheet),
        role: 'Human review index; captions are outside all source images', authority: 'none',
      },
    },
    generatedBy: path.relative(ROOT, __filename),
  };
  fs.writeFileSync(path.join(STAGE, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (pngDimensions(packedClean).join('x') !== sourceEntry.dimensions.join('x')) throw new Error('Clean plate dimensions changed');
  if (pngDimensions(packedMarked).join('x') !== sourceEntry.dimensions.join('x')) throw new Error('Marked plate dimensions changed');
  promote();
  console.log(`ACT1 REFERENCE PACK PASS ${path.relative(ROOT, OUT)}`);
} finally {
  fs.rmSync(WORK, { recursive: true, force: true });
  if (fs.existsSync(STAGE)) fs.rmSync(STAGE, { recursive: true, force: true });
}
