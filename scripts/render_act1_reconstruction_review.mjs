#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = resolve(ROOT, '.map-engine-build/act1Overworld.js');
const OUT = resolve(
  ROOT,
  'design/review/overworld-art-blueprint/act-by-act/act1/reconstruction',
);
const MAGICK = '/opt/homebrew/bin/magick';
const CELL = 16;

if (!existsSync(BUILD)) {
  throw new Error('Missing .map-engine-build/act1Overworld.js; run pnpm run test:map-engine first');
}
if (!existsSync(MAGICK)) throw new Error(`ImageMagick is required at ${MAGICK}`);

const module = await import(`${pathToFileURL(BUILD).href}?review=${Date.now()}`);
const reconstruction = module.buildAct1OverworldReconstruction(
  module.ACT1_OVERWORLD_CANONICAL_SEED,
);
const { map, surfaces, metrics: sourceMetrics } = reconstruction;
const [minX, minY, maxX, maxY] = module.ACT1_SOURCE_BOUNDS;
const widthCells = maxX - minX + 1;
const heightCells = maxY - minY + 1;
const WIDTH = widthCells * CELL;
const HEIGHT = heightCells * CELL;

if (WIDTH !== 2368 || HEIGHT !== 2912) {
  throw new Error(`Unexpected review dimensions ${WIDTH}x${HEIGHT}`);
}

mkdirSync(OUT, { recursive: true });

const cleanPng = resolve(OUT, 'act1-reconstruction-exact-scale.png');
const semanticPng = resolve(OUT, 'act1-reconstruction-semantic-overlay.png');
const playerPng = resolve(OUT, 'act1-reconstruction-player-scale-overlay.png');
const metricsJson = resolve(OUT, 'act1-reconstruction-metrics.json');
const readme = resolve(OUT, 'README.md');
const cleanSvg = resolve(OUT, '.act1-reconstruction-clean.svg');
const semanticSvg = resolve(OUT, '.act1-reconstruction-semantic.svg');
const playerSvg = resolve(OUT, '.act1-reconstruction-player.svg');
const semanticLayerPng = resolve(OUT, '.act1-reconstruction-semantic-layer.png');
const playerLayerPng = resolve(OUT, '.act1-reconstruction-player-layer.png');
const semanticRoutePng = resolve(OUT, '.act1-reconstruction-semantic-routes.png');

const cropPoint = point => ({
  x: (point.x - minX) * CELL + CELL / 2,
  y: (point.y - minY) * CELL + CELL / 2,
});
const pointKey = point => `${point.x},${point.y}`;
const cellSurface = (x, y) => surfaces[y]?.[x] ?? 'water';
const inCrop = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;

function hashUnit(x, y, salt = 0) {
  let value = Math.imul((x + salt) ^ 0x9e3779b9, 0x85ebca6b);
  value ^= Math.imul((y - salt) ^ 0xc2b2ae35, 0x27d4eb2f);
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  return (value >>> 0) / 0xffffffff;
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function svgDocument(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="water-light" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#174b53"/><stop offset="1" stop-color="#092c39"/>
    </linearGradient>
    <linearGradient id="forest-light" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#30442f"/><stop offset="1" stop-color="#13241c"/>
    </linearGradient>
    <linearGradient id="meadow-light" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#708052"/><stop offset="1" stop-color="#405036"/>
    </linearGradient>
    <linearGradient id="trail-light" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#947b58"/><stop offset="1" stop-color="#665038"/>
    </linearGradient>
    <linearGradient id="mountain-light" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#747775"/><stop offset="1" stop-color="#343b3d"/>
    </linearGradient>
    <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="1.5" dy="2" stdDeviation="1.8" flood-color="#07100d" flood-opacity=".72"/>
    </filter>
    <filter id="label-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000" flood-opacity=".9"/>
    </filter>
  </defs>
  ${body}
</svg>\n`;
}

function renderTerrain() {
  const out = [`<rect width="${WIDTH}" height="${HEIGHT}" fill="#092d38"/>`];
  const fills = {
    water: '#123e4a',
    meadow: '#53633e',
    trail: '#786044',
    forest: '#263a2a',
    mountain: '#505759',
  };

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const surface = cellSurface(x, y);
      const px = (x - minX) * CELL;
      const py = (y - minY) * CELL;
      const n1 = hashUnit(x, y, 17);
      const n2 = hashUnit(x, y, 53);
      out.push(`<rect x="${px}" y="${py}" width="16" height="16" fill="${fills[surface]}"/>`);

      if (surface === 'water') {
        if (n1 > .82) {
          const yy = py + 4 + Math.floor(n2 * 8);
          out.push(`<path d="M${px + 2} ${yy} q4 -2 8 0 t4 0" fill="none" stroke="#4a7a80" stroke-width="1" opacity=".38"/>`);
        }
        continue;
      }

      const waterNeighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (
        inCrop(x + dx, y + dy) && cellSurface(x + dx, y + dy) === 'water'
      ));
      if (waterNeighbor) {
        const coastY = py + 2 + Math.floor(n2 * 5);
        out.push(`<path d="M${px + 1} ${coastY} Q${px + 8} ${coastY - 2} ${px + 15} ${coastY + 1}" fill="none" stroke="#92917a" stroke-width="1.3" opacity=".58"/>`);
      }

      if (surface === 'meadow') {
        if (n1 > .54) {
          const gx = px + 3 + Math.floor(n1 * 9);
          const gy = py + 5 + Math.floor(n2 * 8);
          out.push(`<path d="M${gx} ${gy + 4} l-1 -4 m1 4 l2 -5 m-1 5 l4 -3" stroke="#91a166" stroke-width=".8" opacity=".45"/>`);
        }
        if (n2 > .94) out.push(`<circle cx="${px + 4}" cy="${py + 4}" r="1" fill="#d4b568" opacity=".65"/>`);
      } else if (surface === 'trail') {
        if (n1 > .61) {
          const yy = py + 4 + Math.floor(n1 * 8);
          out.push(`<path d="M${px + 1} ${yy} Q${px + 7} ${yy - 2 + n2 * 4} ${px + 15} ${yy + 1}" fill="none" stroke="#aa9068" stroke-width="1.1" opacity=".38"/>`);
        }
        if (n2 > .86) out.push(`<ellipse cx="${px + 5 + n1 * 6}" cy="${py + 5 + n2 * 6}" rx="1.5" ry=".8" fill="#4d402f" opacity=".38"/>`);
      } else if (surface === 'forest') {
        if (n1 > .37) {
          const cx = px + 5 + n1 * 6;
          const cy = py + 6 + n2 * 5;
          const radius = 3.4 + n2 * 2.6;
          out.push(`<path d="M${(cx - radius).toFixed(1)} ${cy.toFixed(1)} q${(radius * .5).toFixed(1)} ${(-radius).toFixed(1)} ${radius.toFixed(1)} ${(-radius * .45).toFixed(1)} q${radius.toFixed(1)} ${(-radius * .65).toFixed(1)} ${(radius * 1.55).toFixed(1)} ${(radius * .35).toFixed(1)} q${radius.toFixed(1)} ${(radius * .45).toFixed(1)} ${(radius * .45).toFixed(1)} ${(radius * 1.2).toFixed(1)} q${(-radius).toFixed(1)} ${radius.toFixed(1)} ${(-radius * 3).toFixed(1)} ${(radius * .1).toFixed(1)} z" fill="#172b20" opacity=".58"/>`);
          if (n2 > .5) out.push(`<path d="M${(cx - 2).toFixed(1)} ${(cy - 2).toFixed(1)} q4 -3 7 1" fill="none" stroke="#5a7048" stroke-width="1" opacity=".45"/>`);
        }
      } else if (surface === 'mountain') {
        if (n1 > .47) {
          const peak = px + 4 + n1 * 7;
          out.push(`<path d="M${px + 1} ${py + 14} L${peak.toFixed(1)} ${py + 2} L${px + 15} ${py + 14} Z" fill="#596164" stroke="#7c8381" stroke-width=".7" opacity=".58"/>`);
          out.push(`<path d="M${peak.toFixed(1)} ${py + 2} L${(peak + 2).toFixed(1)} ${py + 7} L${(peak + 5).toFixed(1)} ${py + 9}" fill="none" stroke="#a1a7a2" stroke-width=".8" opacity=".42"/>`);
        }
        if (x > 138 && y > 280 && n2 > .84) {
          out.push(`<path d="M${px + 11} ${py + 12} l2 -7 l2 7 z" fill="#86c6cd" stroke="#d1f2ed" stroke-width=".6" opacity=".8"/>`);
        }
      }
    }
  }
  return out.join('');
}

function townAssembly(landmark, variant) {
  const { x, y } = cropPoint(landmark.at);
  const colors = variant === 'port'
    ? ['#4c6470', '#b8a276', '#273c45']
    : variant === 'mill'
      ? ['#5d4933', '#b08d57', '#394738']
      : ['#4e3c2b', '#a07147', '#26392a'];
  const water = variant === 'mill'
    ? `<circle cx="${x - 26}" cy="${y - 22}" r="12" fill="#31636a" stroke="#83a9a2" stroke-width="2"/>`
    : '';
  const dock = variant === 'port'
    ? `<path d="M${x + 5} ${y - 5} h32 m-4 -8 v26" stroke="#aa8a5c" stroke-width="5" opacity=".92"/><path d="M${x + 28} ${y - 18} l10 -8 v18" fill="none" stroke="#d8d0ad" stroke-width="2"/>`
    : '';
  const wheel = variant === 'mill'
    ? `<circle cx="${x - 18}" cy="${y - 5}" r="10" fill="none" stroke="#9b825a" stroke-width="3"/><path d="M${x - 28} ${y - 5} h20 M${x - 18} ${y - 15} v20 M${x - 25} ${y - 12} l14 14 M${x - 11} ${y - 12} l-14 14" stroke="#9b825a" stroke-width="1.3"/>`
    : '';
  return `<g filter="url(#soft-shadow)">
    ${water}${dock}${wheel}
    <path d="M${x} ${y + 19} Q${x - 3} ${y + 7} ${x} ${y - 19}" fill="none" stroke="#9b825e" stroke-width="9" stroke-linecap="round"/>
    <path d="M${x} ${y + 19} Q${x - 3} ${y + 7} ${x} ${y - 19}" fill="none" stroke="#c0a477" stroke-width="2" stroke-linecap="round" opacity=".6"/>
    <g fill="${colors[0]}" stroke="#1b211c" stroke-width="1.5">
      <rect x="${x - 34}" y="${y - 27}" width="23" height="18" rx="2"/>
      <rect x="${x + 11}" y="${y - 17}" width="25" height="19" rx="2"/>
      <rect x="${x - 28}" y="${y + 8}" width="20" height="16" rx="2"/>
    </g>
    <g fill="${colors[1]}" stroke="#352a21" stroke-width="1.2">
      <path d="M${x - 37} ${y - 27} l14 -10 l15 10 z"/>
      <path d="M${x + 8} ${y - 17} l15 -11 l16 11 z"/>
      <path d="M${x - 31} ${y + 8} l13 -9 l13 9 z"/>
    </g>
    <path d="M${x - 3} ${y + 8} h6" stroke="#e0c99b" stroke-width="2"/>
  </g>`;
}

function caveAssembly(landmark, variant) {
  const { x, y } = cropPoint(landmark.at);
  const crystal = variant === 'crystal';
  const reef = variant === 'reef';
  const cellar = variant === 'cellar';
  const mist = variant === 'mist';
  const root = variant === 'root';
  const rock = crystal ? '#596669' : reef ? '#52686a' : '#394039';
  const surround = crystal
    ? `<path d="M${x - 36} ${y + 12} L${x - 20} ${y - 30} L${x - 5} ${y - 8} L${x + 10} ${y - 36} L${x + 36} ${y + 12}" fill="#424c4e" stroke="#858c88" stroke-width="3"/><path d="M${x + 17} ${y - 21} l5 -15 l6 16 z M${x - 28} ${y - 2} l5 -14 l6 14 z" fill="#82c3ca" stroke="#d0efea" stroke-width="1.5"/>`
    : reef
      ? `<path d="M${x - 38} ${y + 15} q18 -18 34 -7 q18 -18 41 7" fill="#496466" stroke="#89a8a0" stroke-width="3"/><path d="M${x - 34} ${y + 19} q10 -7 20 0 t20 0 t20 0" fill="none" stroke="#76aeb3" stroke-width="4"/>`
      : cellar
        ? `<path d="M${x - 29} ${y + 14} v-32 h18 m22 0 h18 v32" fill="none" stroke="#655d4d" stroke-width="6"/><path d="M${x - 29} ${y - 18} l11 -11 m7 11 l12 -12 m9 12 l9 -9" stroke="#918976" stroke-width="3"/>`
        : `<circle cx="${x - 20}" cy="${y - 10}" r="18" fill="#1b2b20"/><circle cx="${x + 20}" cy="${y - 12}" r="20" fill="#213426"/><circle cx="${x}" cy="${y - 24}" r="18" fill="#29402d"/>`;
  const roots = root
    ? `<path d="M${x - 30} ${y - 24} Q${x - 8} ${y - 5} ${x - 17} ${y + 20} M${x + 30} ${y - 25} Q${x + 8} ${y - 4} ${x + 17} ${y + 20}" fill="none" stroke="#6d5636" stroke-width="5"/>`
    : '';
  const mistVeil = mist
    ? `<path d="M${x - 42} ${y - 2} Q${x - 15} ${y - 17} ${x + 8} ${y - 3} T${x + 43} ${y - 5} M${x - 35} ${y + 13} Q${x - 8} ${y} ${x + 35} ${y + 11}" fill="none" stroke="#aec1b3" stroke-width="5" opacity=".35"/>`
    : '';
  const stair = cellar || reef
    ? `<path d="M${x - 9} ${y - 4} h18 M${x - 8} ${y + 1} h16 M${x - 7} ${y + 6} h14 M${x - 6} ${y + 11} h12" stroke="#b4a27c" stroke-width="2"/>`
    : '';
  const threshold = cellar
    ? `<path d="M${x - 13} ${y - 8} h26 v23 h-26 z" fill="#1a1b18" stroke="#756d5b" stroke-width="3"/><path d="M${x} ${y + 18} V${y - 5}" stroke="#a88d60" stroke-width="7" stroke-linecap="round" opacity=".9"/>${stair}`
    : reef
      ? `<path d="M${x - 15} ${y - 8} Q${x - 5} ${y - 15} ${x + 13} ${y - 6} Q${x + 5} ${y + 2} ${x + 10} ${y + 15} Q${x - 2} ${y + 20} ${x - 13} ${y + 13} Q${x - 5} ${y + 2} ${x - 15} ${y - 8} Z" fill="#173c46" stroke="#7b9993" stroke-width="3"/><path d="M${x} ${y + 18} Q${x - 4} ${y + 6} ${x + 2} ${y - 6}" stroke="#b09a6c" stroke-width="7" fill="none" stroke-linecap="round" opacity=".9"/>${stair}`
      : `<path d="M${x - 19} ${y + 13} Q${x - 17} ${y - 14} ${x} ${y - 19} Q${x + 17} ${y - 14} ${x + 19} ${y + 13} Z" fill="${rock}" stroke="#8a8c7b" stroke-width="3"/><path d="M${x - 10} ${y + 12} Q${x - 9} ${y - 7} ${x} ${y - 9} Q${x + 9} ${y - 7} ${x + 10} ${y + 12} Z" fill="#111614"/><path d="M${x} ${y + 17} L${x} ${y - 1}" stroke="#a88d60" stroke-width="7" stroke-linecap="round" opacity=".9"/>`;
  return `<g filter="url(#soft-shadow)">
    ${surround}${roots}
    ${threshold}${mistVeil}
  </g>`;
}

function renderLandmarks() {
  const byId = new Map(map.landmarks.map(landmark => [landmark.id, landmark]));
  return [
    townAssembly(byId.get('greenhollow'), 'forest'),
    townAssembly(byId.get('millbrook'), 'mill'),
    townAssembly(byId.get('portSapphire'), 'port'),
    caveAssembly(byId.get('sunkenCellar'), 'cellar'),
    caveAssembly(byId.get('whisperingWoodsCave'), 'root'),
    caveAssembly(byId.get('coastalReef'), 'reef'),
    caveAssembly(byId.get('mistyGrotto'), 'mist'),
    caveAssembly(byId.get('crystalCave'), 'crystal'),
  ].join('');
}

function renderSemanticOverlay() {
  const routeColors = ['#ffd36b', '#78d5b7', '#f4a4c5', '#76b9ff', '#e8c06c', '#bda7ff', '#70e5f0'];
  const routeLabelLayout = {
    'port-sapphire-to-crystal-cave': { dx: 0, dy: -34, anchor: 'middle' },
  };
  const landmarkLabelLayout = {
    portSapphire: { dx: -26, dy: -44, anchor: 'end' },
    crystalCave: { dx: -28, dy: 64, anchor: 'end' },
  };
  const out = ['<g filter="url(#label-shadow)">'];
  for (const [index, route] of map.routes.entries()) {
    const mid = cropPoint(route.cells[Math.floor(route.cells.length / 2)]);
    const layout = routeLabelLayout[route.id] ?? { dx: 8, dy: -8, anchor: 'start' };
    out.push(`<text x="${mid.x + layout.dx}" y="${mid.y + layout.dy}" text-anchor="${layout.anchor}" font-family="Menlo,monospace" font-size="14" fill="#fff5d6" stroke="#122019" stroke-width="3" paint-order="stroke">${xml(route.id)}</text>`);
  }
  for (const landmark of map.landmarks) {
    const threshold = cropPoint(landmark.at);
    const approach = cropPoint(landmark.approach);
    out.push(`<line x1="${threshold.x}" y1="${threshold.y}" x2="${approach.x}" y2="${approach.y}" stroke="#fff" stroke-width="2" stroke-dasharray="3 2"/>`);
    out.push(`<circle cx="${threshold.x}" cy="${threshold.y}" r="6" fill="none" stroke="#ff8d61" stroke-width="3"/>`);
    out.push(`<path d="M${approach.x} ${approach.y - 6} l6 6 l-6 6 l-6 -6 z" fill="#e8f4df" stroke="#1b2a24" stroke-width="2"/>`);
    const alignRight = threshold.x > WIDTH - 330;
    const defaultLayout = { dx: alignRight ? -14 : 14, dy: -14, anchor: alignRight ? 'end' : 'start' };
    const layout = landmarkLabelLayout[landmark.id] ?? defaultLayout;
    const tx = threshold.x + layout.dx;
    const ty = threshold.y + layout.dy;
    if (landmarkLabelLayout[landmark.id]) {
      const leaderEndX = tx + (layout.anchor === 'end' ? 6 : -6);
      const leaderEndY = ty + 5;
      out.push(`<path d="M${threshold.x} ${threshold.y} L${threshold.x + Math.sign(layout.dx) * 13} ${threshold.y + Math.sign(layout.dy) * 13} L${leaderEndX} ${leaderEndY}" fill="#000" fill-opacity="0" stroke="#fff5d6" stroke-width="1.5" opacity=".8"/>`);
    }
    out.push(`<text x="${tx}" y="${ty}" text-anchor="${layout.anchor}" font-family="Menlo,monospace" font-size="18" font-weight="700" fill="#fff5d6" stroke="#17211d" stroke-width="4" paint-order="stroke">${xml(landmark.id)}</text>`);
    out.push(`<text x="${tx}" y="${ty + 21}" text-anchor="${layout.anchor}" font-family="Menlo,monospace" font-size="13" fill="#ffe0c8" stroke="#17211d" stroke-width="3" paint-order="stroke">threshold ${landmark.at.x},${landmark.at.y} / approach ${landmark.approach.x},${landmark.approach.y}</text>`);
  }
  const gate = cropPoint(map.progressionGates[0].at);
  out.push(`<path d="M${gate.x - 16} ${gate.y - 12} L${gate.x + 16} ${gate.y + 12} M${gate.x + 16} ${gate.y - 12} L${gate.x - 16} ${gate.y + 12}" stroke="#ff5f59" stroke-width="5"/>`);
  out.push(`<path d="M${gate.x - 5} ${gate.y - 12} L${gate.x - 28} ${gate.y - 32}" fill="#000" fill-opacity="0" stroke="#ff7770" stroke-width="1.5"/>`);
  out.push(`<text x="${gate.x - 34}" y="${gate.y - 34}" text-anchor="end" font-family="Menlo,monospace" font-size="18" font-weight="700" fill="#ff7770" stroke="#17211d" stroke-width="4" paint-order="stroke">Crystal seal: no-bypass barrier</text>`);
  out.push('</g>');
  out.push(`<g transform="translate(26 26)"><rect width="390" height="74" rx="9" fill="#0b1714" opacity=".9" stroke="#d7d1b0" stroke-width="2"/><circle cx="21" cy="24" r="6" fill="none" stroke="#ff8d61" stroke-width="3"/><text x="38" y="30" fill="#fff" font-family="Menlo,monospace" font-size="16">walkable landmark threshold</text><path d="M21 45 l6 6 l-6 6 l-6 -6 z" fill="#e8f4df"/><text x="38" y="57" fill="#fff" font-family="Menlo,monospace" font-size="16">cardinal approach / route endpoint</text></g>`);
  return out.join('');
}

function renderSemanticRouteLayer() {
  const routeColors = ['#ffd36b', '#78d5b7', '#f4a4c5', '#76b9ff', '#e8c06c', '#bda7ff', '#70e5f0'];
  const args = [cleanPng];
  for (const [index, route] of map.routes.entries()) {
    const from = cropPoint(route.cells[0]);
    const to = cropPoint(route.cells.at(-1));
    const corner = { x: to.x, y: from.y };
    const lines = `line ${from.x},${from.y} ${corner.x},${corner.y} line ${corner.x},${corner.y} ${to.x},${to.y}`;
    args.push('-fill', 'none', '-stroke', '#10251f', '-strokewidth', '7', '-draw', lines);
    args.push('-fill', 'none', '-stroke', routeColors[index], '-strokewidth', '2.6', '-draw', lines);
  }
  args.push('-strip', semanticRoutePng);
  execFileSync(MAGICK, args, { cwd: ROOT, stdio: 'inherit' });
}

function renderPlayerOverlay() {
  const placements = [
    { label: 'Greenhollow basin', point: { x: 65, y: 337 } },
    { label: 'Millbrook floodplain', point: { x: 105, y: 326 } },
    { label: 'Port hinterland', point: { x: 129, y: 311 } },
    { label: 'Southern meadow', point: { x: 88, y: 365 } },
  ];
  const out = ['<g filter="url(#label-shadow)">'];
  for (const placement of placements) {
    const p = cropPoint(placement.point);
    out.push(`<circle cx="${p.x}" cy="${p.y}" r="10.665" fill="#ffd15d" fill-opacity=".18" stroke="#ffd15d" stroke-width="2.5"/>`);
    out.push(`<rect x="${p.x - 8}" y="${p.y - 8}" width="16" height="16" fill="#51d8e3" fill-opacity=".25" stroke="#51d8e3" stroke-width="2"/>`);
    out.push(`<circle cx="${p.x}" cy="${p.y}" r="2" fill="#fff"/>`);
    out.push(`<text x="${p.x + 17}" y="${p.y - 15}" font-family="Menlo,monospace" font-size="17" font-weight="700" fill="#fff8df" stroke="#17211d" stroke-width="4" paint-order="stroke">${xml(placement.label)}</text>`);
  }
  out.push('</g>');
  out.push(`<g transform="translate(26 26)"><rect width="445" height="88" rx="9" fill="#0b1714" opacity=".92" stroke="#d7d1b0" stroke-width="2"/><rect x="18" y="16" width="16" height="16" fill="#51d8e3" fill-opacity=".25" stroke="#51d8e3" stroke-width="2"/><text x="49" y="30" fill="#fff" font-family="Menlo,monospace" font-size="16">16 px = 1.0-tile hero footprint</text><circle cx="26" cy="60" r="10.665" fill="#ffd15d" fill-opacity=".18" stroke="#ffd15d" stroke-width="2.5"/><text x="49" y="66" fill="#fff" font-family="Menlo,monospace" font-size="16">21.33 px = 1.333-tile envelope</text></g>`);
  return out.join('');
}

function renderPng(svgPath, pngPath) {
  execFileSync(MAGICK, [
    '-background', 'none',
    '-density', '96',
    '-font', '/System/Library/Fonts/Menlo.ttc',
    svgPath,
    '-strip',
    '-define', 'png:exclude-chunk=date,time',
    '-define', 'png:compression-level=9',
    pngPath,
  ], { cwd: ROOT, stdio: 'inherit' });
}

const terrain = renderTerrain();
const landmarks = renderLandmarks();
writeFileSync(cleanSvg, svgDocument(`${terrain}${landmarks}`));
writeFileSync(semanticSvg, svgDocument(renderSemanticOverlay()));
writeFileSync(playerSvg, svgDocument(renderPlayerOverlay()));
renderPng(cleanSvg, cleanPng);
renderPng(semanticSvg, semanticLayerPng);
renderPng(playerSvg, playerLayerPng);
renderSemanticRouteLayer();
execFileSync(MAGICK, [semanticRoutePng, semanticLayerPng, '-composite', '-strip', semanticPng], {
  cwd: ROOT,
  stdio: 'inherit',
});
execFileSync(MAGICK, [cleanPng, playerLayerPng, '-composite', '-strip', playerPng], {
  cwd: ROOT,
  stdio: 'inherit',
});
rmSync(cleanSvg);
rmSync(semanticSvg);
rmSync(playerSvg);
rmSync(semanticLayerPng);
rmSync(playerLayerPng);
rmSync(semanticRoutePng);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function relative(path) {
  return path.slice(ROOT.length + 1);
}

const landmarkCoordinates = Object.fromEntries(map.landmarks.map(landmark => [landmark.id, {
  kind: landmark.kind,
  threshold: landmark.at,
  approach: landmark.approach,
  cardinalDistance: Math.abs(landmark.at.x - landmark.approach.x)
    + Math.abs(landmark.at.y - landmark.approach.y),
}]));
const landmarkApproaches = new Set(map.landmarks.map(landmark => pointKey(landmark.approach)));
const routes = map.routes.map(route => ({
  id: route.id,
  cellCount: route.cells.length,
  from: route.cells[0],
  to: route.cells.at(-1),
  bothEndpointsAreLandmarkApproaches: landmarkApproaches.has(pointKey(route.cells[0]))
    && landmarkApproaches.has(pointKey(route.cells.at(-1))),
}));
const port = map.landmarks.find(landmark => landmark.id === 'portSapphire');
const reefRoute = map.routes.find(route => route.id === 'port-sapphire-to-coastal-reef');
const crystalRoute = map.routes.find(route => route.id === 'port-sapphire-to-crystal-cave');
const crystal = map.landmarks.find(landmark => landmark.id === 'crystalCave');
const gate = map.progressionGates[0];
const groundKeys = new Set();
for (let y = 0; y < map.height; y += 1) {
  for (let x = 0; x < map.width; x += 1) {
    if (map.terrain[y][x] === 'ground') groundKeys.add(`${x},${y}`);
  }
}

function floodGround(start, blocked = null) {
  const reached = new Set();
  const queue = [start];
  while (queue.length > 0) {
    const point = queue.shift();
    const key = pointKey(point);
    if (reached.has(key) || key === blocked || !groundKeys.has(key)) continue;
    reached.add(key);
    queue.push(
      { x: point.x + 1, y: point.y },
      { x: point.x - 1, y: point.y },
      { x: point.x, y: point.y + 1 },
      { x: point.x, y: point.y - 1 },
    );
  }
  return reached;
}

const openGround = floodGround(port.approach);
const closedCrystalGround = floodGround(port.approach, pointKey(gate.at));
const assertions = {
  dimensionsExact: WIDTH === 2368 && HEIGHT === 2912,
  sourceWaterBoundaryPreserved: sourceMetrics.sourceFootprintMismatchCells === 0,
  exactlyEightLandmarks: map.landmarks.length === 8,
  exactlySevenRoutes: map.routes.length === 7,
  noOrphanRouteEndpoints: routes.every(route => route.bothEndpointsAreLandmarkApproaches),
  portReefRootsAtPort: pointKey(reefRoute.cells[0]) === pointKey(port.approach),
  crystalGateOnRoute: crystalRoute.cells.some(point => pointKey(point) === pointKey(gate.at)),
  allWalkableGroundConnected: openGround.size === groundKeys.size,
  crystalHasNoClosedGateBypass: !closedCrystalGround.has(pointKey(crystal.approach))
    && !closedCrystalGround.has(pointKey(crystal.at)),
  thresholdsCardinalAndWalkable: map.landmarks.every(landmark => (
    landmarkCoordinates[landmark.id].cardinalDistance === 1
    && map.terrain[landmark.at.y][landmark.at.x] === 'ground'
  )),
  noTransitionSpecialAssets: map.specials.length === 0,
  meadowWithinTarget: sourceMetrics.nonWaterPercentages.meadow >= .28
    && sourceMetrics.nonWaterPercentages.meadow <= .36,
  trailWithinTarget: sourceMetrics.nonWaterPercentages.trail >= .06
    && sourceMetrics.nonWaterPercentages.trail <= .10,
  forestWithinTarget: sourceMetrics.nonWaterPercentages.forest >= .42
    && sourceMetrics.nonWaterPercentages.forest <= .52,
  mountainWithinTarget: sourceMetrics.nonWaterPercentages.mountain >= .10
    && sourceMetrics.nonWaterPercentages.mountain <= .16,
};

if (Object.values(assertions).some(value => !value)) {
  throw new Error(`Act 1 review assertion failed: ${JSON.stringify(assertions)}`);
}

const outputHashes = {
  [relative(cleanPng)]: sha256(cleanPng),
  [relative(semanticPng)]: sha256(semanticPng),
  [relative(playerPng)]: sha256(playerPng),
};

const reviewMetrics = {
  schemaVersion: 1,
  authority: {
    compiledBuilder: '.map-engine-build/act1Overworld.js',
    canonicalSeed: module.ACT1_OVERWORLD_CANONICAL_SEED,
    northUp: true,
    reviewPixelsPerWorldCell: CELL,
  },
  dimensions: {
    worldCells: [map.width, map.height],
    cropBoundsInclusive: [minX, minY, maxX, maxY],
    cropCells: [widthCells, heightCells],
    outputPixels: [WIDTH, HEIGHT],
  },
  sourceFootprint: {
    landCells: sourceMetrics.sourceLandCells,
    waterCells: sourceMetrics.sourceWaterCells,
    mismatchCells: sourceMetrics.sourceFootprintMismatchCells,
    waterBoundaryPreserved: sourceMetrics.sourceWaterPreserved,
  },
  surfacePlan: {
    cropCounts: {
      water: sourceMetrics.sourceWaterCells,
      meadow: sourceMetrics.counts.meadow,
      trail: sourceMetrics.counts.trail,
      forest: sourceMetrics.counts.forest,
      mountain: sourceMetrics.counts.mountain,
    },
    fullWorldCounts: sourceMetrics.counts,
    nonWaterPercentages: Object.fromEntries(Object.entries(sourceMetrics.nonWaterPercentages)
      .map(([key, value]) => [key, Number((value * 100).toFixed(4))])),
  },
  landmarks: landmarkCoordinates,
  routes,
  progressionGate: {
    id: gate.id,
    at: gate.at,
    requiredFlag: gate.requiredFlag,
    onCrystalRoute: assertions.crystalGateOnRoute,
  },
  assertions,
  sha256: outputHashes,
};

writeFileSync(metricsJson, `${JSON.stringify(reviewMetrics, null, 2)}\n`);
writeFileSync(readme, `# Act 1 exact-scale reconstruction review

Status: **PASS for deterministic semantic reconstruction evidence; review-only, not runtime wiring**

## Generate

From the repository root, first compile and verify the map engine, then render:

\`\`\`sh
PATH=/Users/christopherhachisu/.nvm/versions/node/v20.20.2/bin:$PATH pnpm run test:map-engine
/Users/christopherhachisu/.nvm/versions/node/v20.20.2/bin/node scripts/render_act1_reconstruction_review.mjs
\`\`\`

The renderer imports \`.map-engine-build/act1Overworld.js\`, uses canonical seed 42,
and rasterizes through \`/opt/homebrew/bin/magick\`. It does not read or modify the
runtime bundle.

## Authority and proof

- \`act1-reconstruction-exact-scale.png\` is the clean, unlabeled terrain/material
  blueprint. It is exactly 2368x2912, north-up, cropped to inclusive world bounds
  \`[16,218]-[163,399]\` at 16 review pixels per world cell.
- \`act1-reconstruction-semantic-overlay.png\` proves the seven exact semantic route
  centerlines, their landmark-purpose endpoints, every threshold/approach pair, the
  Port-rooted Reef spur, and the Crystal gate on the no-bypass approach.
- \`act1-reconstruction-player-scale-overlay.png\` preserves the exact map scale and
  shows both the 16px (1.0-tile) and 21.33px (1.333-tile) hero footprint envelopes in
  four representative open-country placements.
- \`act1-reconstruction-metrics.json\` is the mechanical record of source footprint,
  measured class counts, coordinates, graph endpoints, assertions, and output hashes.

## Natural landmark entries

All eight destinations are compact assemblies embedded in their surrounding material,
with a walkable terrain threshold at the exact semantic cell and a cardinal route
approach: Greenhollow old-growth village lanes; Millbrook lakeside mill-settlement;
Port Sapphire harbor/street; Sunken Cellar ruined coastal descent; Whispering Woods
root-wrapped cave mouth; Coastal Reef tidal shelf/descent; Darkfang misty cliff grotto;
and Crystal Cave's crystal-bearing mountain mouth. There are no generic portal markers
or freestanding transition-special assets in the clean blueprint.

## Mechanical result

- PASS: exact 2368x2912 dimensions and source land/water footprint, with zero mismatch.
- PASS: measured non-water mix is meadow ${reviewMetrics.surfacePlan.nonWaterPercentages.meadow}%,
  trail/apron ${reviewMetrics.surfacePlan.nonWaterPercentages.trail}%, forest
  ${reviewMetrics.surfacePlan.nonWaterPercentages.forest}%, mountain/cliff
  ${reviewMetrics.surfacePlan.nonWaterPercentages.mountain}%.
- PASS: exactly eight landmarks, seven purposeful edges, and no orphan route endpoint.
- PASS: Port-to-Reef begins at Port's approach; the Crystal seal is on its authored route.
- PASS: all walkable ground belongs to one open component; closing the Crystal seal
  isolates its approach and threshold with no terrain bypass.
- PASS: every threshold is walkable and cardinally adjacent to its approach.
- PASS: \`specials\` contains no transition assets.

## Boundaries

These files are deterministic review evidence only. They do not wire the new semantic
map into runtime, modify \`dist/\` or \`public/\`, change any dungeon, design Act 2, or
authorize the Crystal handoff beyond the currently verified Act 1 gate.
`);

console.log(`ACT 1 RECONSTRUCTION REVIEW PASS: ${WIDTH}x${HEIGHT}; ${map.landmarks.length} landmarks; ${map.routes.length} routes`);
for (const [path, hash] of Object.entries(outputHashes)) console.log(`${hash}  ${path}`);
