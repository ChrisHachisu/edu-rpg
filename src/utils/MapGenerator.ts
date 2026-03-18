// Procedural tilemap generator — creates maps at runtime
// Returns 2D arrays of tile indices matching our generated tilesets

// Overworld tiles: 0=grass, 1=path, 2=water, 3=tree, 4=mountain, 5=bridge, 6=town, 7=cave, 8=castle
// Town tiles: 0=floor, 1=wall, 2=house-roof, 3=grass, 4=water, 5=path, 6=save, 7=exit
//   8=shop-awning, 9=house-wall-window, 10=house-wall-door, 11=shop-wall-display, 12=shop-wall-door
// Dungeon tiles: 0=floor, 1=wall, 2=cracked, 3=door, 4=treasure, 5=lava, 6=stairs-up, 7=boss
//   8=opened-chest, 9=stairs-down, 10=boss-exit-portal

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Perlin-like noise helper for organic terrain
function noiseAt(x: number, y: number, scale: number, seed: number): number {
  const nx = x * scale + seed;
  const ny = y * scale + seed * 0.7;
  return Math.sin(nx * 1.3 + ny * 0.7) * Math.cos(ny * 1.1 + nx * 0.3)
       + Math.sin(nx * 0.4 + ny * 1.6) * 0.5
       + Math.cos(nx * 2.1 - ny * 0.9) * 0.3;
}

export function generateOverworldMap(width: number, height: number): number[][] {
  const rand = seededRandom(42);
  const map: number[][] = [];

  // ── Phase 1: Base terrain ──
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      // Water borders (2 tiles wide)
      if (x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2) {
        row.push(2);
        continue;
      }

      // Act 5 (y=2-70): fill with mountains — maze carved later
      if (y <= 70) {
        row.push(4);
        continue;
      }

      // ── Act 3/4 terrain (y=72-100): desert east + volcanic west ──
      if (y >= 72 && y <= 100) {
        // Scattered mountains (volcanic terrain west, rocky desert east)
        const volcNoise = noiseAt(x, y, 0.15, 3.0);
        if (x < 40 && volcNoise > 0.6 && rand() > 0.3) {
          row.push(4); // volcanic mountains
          continue;
        }
        // Desert sand patches (represented as grass for now, trees are sparse)
        if (x > 50 && rand() > 0.95) {
          row.push(3); // sparse scrub
          continue;
        }
        // Lava pools in volcanic area
        if (x < 35 && y > 74 && y < 98) {
          const lavaNoise = noiseAt(x, y, 0.25, 5.0);
          if (lavaNoise > 1.0 && rand() > 0.4) {
            row.push(2); // lava/water pool
            continue;
          }
        }
        row.push(0);
        continue;
      }

      // ── Act 2 terrain (y=102-130): mountain forests ──
      if (y >= 102 && y <= 130) {
        // Dense forests
        if (x > 40 && x < 80 && y > 110 && y < 125) {
          if (rand() > 0.4) { row.push(3); continue; }
        }
        // Mountain clusters (west side has frozen peaks)
        if (x < 30 && y > 105 && y < 120) {
          const mtNoise = noiseAt(x, y, 0.2, 2.0);
          if (mtNoise > 0.4 && rand() > 0.35) {
            row.push(4);
            continue;
          }
        }
        // Staggered lake in Act 2 (creates natural barrier shape)
        const lakeCx = 50, lakeCy = 120;
        const lakeDist = Math.sqrt((x - lakeCx) ** 2 + (y - lakeCy) ** 2);
        const lakeNoise = noiseAt(x, y, 0.3, 7.0);
        if (lakeDist < 8 + lakeNoise * 3 && lakeDist > 2) {
          row.push(2);
          continue;
        }
        // Scattered trees
        if (rand() > 0.88) { row.push(3); continue; }
        row.push(0);
        continue;
      }

      // ── Act 1 terrain (y=132-157): plains and coast ──

      // Coastal water (east/southeast — staggered coastline)
      const coastNoise = noiseAt(x, y, 0.1, 1.5);
      if (x > 95 + coastNoise * 8 && y > 138) {
        row.push(2);
        continue;
      }

      // Small pond/lake in Act 1 (natural feature)
      const pondCx = 60, pondCy = 148;
      const pondDist = Math.sqrt((x - pondCx) ** 2 + (y - pondCy) ** 2);
      if (pondDist < 4 + noiseAt(x, y, 0.4, 4.0) * 2) {
        row.push(2);
        continue;
      }

      // Dense forests (between Greenhollow and Millbrook)
      if (x > 22 && x < 42 && y > 146 && y < 154) {
        if (rand() > 0.35) { row.push(3); continue; }
      }

      // Light forests (between Millbrook and Port Sapphire)
      if (x > 50 && x < 75 && y > 140 && y < 150) {
        if (rand() > 0.75) { row.push(3); continue; }
      }

      // Scattered trees
      if (rand() > 0.9) { row.push(3); continue; }

      row.push(0); // grass default
    }
    map.push(row);
  }

  // ── Phase 2: Carve paths between key locations ──
  const paths: [number, number][] = [
    // ── Act 1 — south of river (y=132-157) ──
    ...pathBetween(15, 150, 25, 148),   // greenhollow → sunkenCellar (optional, SW)
    ...pathBetween(15, 150, 45, 145),   // greenhollow → millbrook
    ...pathBetween(45, 145, 66, 138),   // millbrook → portSapphire (3-way junction)
    ...pathBetween(66, 138, 85, 144),   // portSapphire → mistyGrotto (E)
    ...pathBetween(66, 138, 66, 130),   // portSapphire → crystalCave S (N)

    // ── Act 2 — between river and mountains (y=102-130) ──
    ...pathBetween(66, 127, 70, 118),   // crystalCave N → ironkeep
    // ironkeep → stormNest (west, windy path)
    ...pathBetween(70, 118, 55, 114),
    ...pathBetween(55, 114, 40, 110),
    ...pathBetween(40, 110, 25, 108),
    // ironkeep → frozenLake (east)
    ...pathBetween(70, 118, 85, 114),
    ...pathBetween(85, 114, 100, 112),
    ...pathBetween(70, 118, 90, 102),   // ironkeep → shadowCave S

    // ── Act 3/4 paths drawn LATER in Phase 9b (after terrain/stream) ──

    // ── Act 5 — north of lava (y=2-70) ──
    ...pathBetween(13, 67, 85, 58),     // volcanicForge N exit → lastBastion
    ...pathBetween(85, 58, 65, 40),     // lastBastion → havensEdge
    ...pathBetween(65, 40, 55, 25),     // havensEdge → south of Demon Castle approach
  ];

  for (const [px, py] of paths) {
    if (px >= 0 && px < width && py >= 0 && py < height) {
      map[py][px] = map[py][px] === 2 ? 5 : 1; // bridge over water, path elsewhere
    }
  }

  // ── Phase 3: Act 5 mountain maze ──
  const act5Top = 3;
  const act5Bot = 69;

  // Collect path/grass seeds in Act 5
  const act5Seeds: [number, number][] = [];
  for (let y = act5Top; y <= act5Bot; y++) {
    for (let x = 3; x < width - 3; x++) {
      if (map[y][x] === 1 || map[y][x] === 0) {
        act5Seeds.push([x, y]);
      }
    }
  }

  // Random-walk corridors branching from the main road
  for (let branch = 0; branch < 120; branch++) {
    if (act5Seeds.length === 0) break;
    const startIdx = Math.floor(rand() * act5Seeds.length);
    let [x, y] = act5Seeds[startIdx];

    const primaryDir = Math.floor(rand() * 4);
    const walkLen = 10 + Math.floor(rand() * 35);

    for (let step = 0; step < walkLen; step++) {
      const dir = rand() > 0.45 ? primaryDir : Math.floor(rand() * 4);
      const dx = [0, 0, -1, 1][dir];
      const dy = [-1, 1, 0, 0][dir];
      const nx = x + dx;
      const ny = y + dy;

      if (nx >= 3 && nx < width - 3 && ny >= act5Top && ny <= act5Bot) {
        x = nx;
        y = ny;
        if (map[y][x] === 4) {
          map[y][x] = 0;
          act5Seeds.push([x, y]);
        }
      }
    }
  }

  // ── Phase 3b: Winding maze paths to legendary dungeons ──
  const carve = (cx: number, cy: number) => {
    if (cx >= 2 && cx < width - 2 && cy >= 3 && cy <= act5Bot) {
      if (map[cy][cx] === 4) map[cy][cx] = 0;
    }
  };

  const carveMazePath = (sx: number, sy: number, ex: number, ey: number) => {
    let x = sx, y = sy;
    const visited: Set<string> = new Set();

    let safety = 0;
    while ((x !== ex || y !== ey) && safety++ < 600) {
      carve(x, y);
      visited.add(`${x},${y}`);

      if (rand() < 0.6) {
        if (Math.abs(x - ex) >= Math.abs(y - ey)) {
          x += x < ex ? 1 : -1;
        } else {
          y += y < ey ? 1 : -1;
        }
      } else {
        if (Math.abs(x - ex) >= Math.abs(y - ey)) {
          y += rand() > 0.5 ? 1 : -1;
        } else {
          x += rand() > 0.5 ? 1 : -1;
        }
      }

      x = Math.max(3, Math.min(width - 4, x));
      y = Math.max(3, Math.min(act5Bot, y));
    }
    carve(ex, ey);

    // Dead-end branches
    const pathTiles = Array.from(visited);
    const numBranches = 8 + Math.floor(rand() * 6);
    for (let b = 0; b < numBranches; b++) {
      const startTile = pathTiles[Math.floor(rand() * pathTiles.length)];
      const [bx, by] = startTile.split(',').map(Number);

      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const dir = dirs[Math.floor(rand() * dirs.length)];
      const branchLen = 3 + Math.floor(rand() * 8);

      let dx = bx, dy = by;
      for (let s = 0; s < branchLen; s++) {
        dx += dir[0];
        dy += dir[1];
        if (rand() < 0.25) {
          const turnDir = dirs[Math.floor(rand() * dirs.length)];
          dx += turnDir[0];
          dy += turnDir[1];
        }
        dx = Math.max(3, Math.min(width - 4, dx));
        dy = Math.max(3, Math.min(act5Bot, dy));
        carve(dx, dy);
      }
    }
  };

  // 4 Portal positions scattered in Act 5 maze
  carveMazePath(20, 58, 15, 25);   // Stormreach portal (NW)
  carveMazePath(88, 56, 100, 25);  // Frostfall portal (NE)
  carveMazePath(30, 55, 35, 45);   // Sunken Temple portal (SW)
  carveMazePath(70, 55, 80, 45);   // Twilight portal (SE)

  // ── Phase 4: Demon Castle island ──
  const castleX = 55, castleY = 15;
  for (let dy = -7; dy <= 7; dy++) {
    for (let dx = -7; dx <= 7; dx++) {
      const ix = castleX + dx;
      const iy = castleY + dy;
      if (ix >= 2 && ix < width - 2 && iy >= 2 && iy < height - 2) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 4 && dist <= 6.5) {
          map[iy][ix] = 2; // water moat
        } else if (dist < 4) {
          map[iy][ix] = 0; // island ground
        }
      }
    }
  }

  // Land bridge south of island (y=19 to y=27)
  for (let y = 19; y <= 27; y++) {
    if (y >= 2 && y < height - 2) {
      map[y][castleX] = 1;
      map[y][castleX + 1] = 1;
    }
  }

  // ── Phase 5: Town markers ──
  const towns: [number, number][] = [
    [15, 150], [45, 145], [66, 138],  // Act 1
    [70, 118],                          // Act 2
    [45, 92], [80, 85],                // Act 3
    [30, 78],                           // Act 4
    [85, 58], [65, 40],                // Act 5
  ];
  for (const [tx, ty] of towns) {
    map[ty][tx] = 6;
  }

  // ── Phase 6: Dungeon entrance markers ──
  const caveDungeons: [number, number][] = [
    // Act 1
    [25, 148], [85, 144],             // Sunken Cellar (SW), Misty Grotto (E)
    [66, 130], [66, 127],             // Crystal Cave S/N
    // Act 2
    [25, 108], [100, 112],            // Storm Nest (west), Frozen Lake (east)
    [90, 102], [90, 100],             // Shadow Cave S/N
    // Act 3
    [60, 95], [10, 103],              // Desert Tomb, Bandit Hideout (far west, south)
    // Act 4
    [25, 89],                          // Magma Tunnels
    [12, 70], [12, 67],               // Volcanic Forge S/N
  ];
  for (const [dx, dy] of caveDungeons) {
    map[dy][dx] = 7;
  }
  // Demon Castle uses castle tile (8)
  map[castleY][castleX] = 8;

  // Portal tiles (tile 9) for 4 portal lands
  const portals: [number, number][] = [
    [15, 25],   // Stormreach Isles
    [100, 25],  // Frostfall Peaks
    [35, 45],   // Sunken Temple Isle
    [80, 45],   // Twilight Realm
  ];
  for (const [px, py] of portals) {
    map[py][px] = 9;
  }

  // ── Phase 7: Physical terrain barriers (organic, not straight lines) ──

  // --- River barrier between Act 1 and Act 2 (y≈131) ---
  const riverBaseY = 131;
  for (let x = 2; x <= width - 3; x++) {
    const meander = Math.round(
      Math.sin(x * 0.08) * 3 + Math.cos(x * 0.05 + 1.5) * 2
      + Math.sin(x * 0.15 + 2.5) * 1.5
    );
    const centerY = riverBaseY + meander;
    const extraWidth = Math.sin(x * 0.18 + 0.7) > 0.2 ? 1 : 0;
    const riverTop = centerY;
    const riverBot = centerY + 1 + extraWidth;

    for (let ry = riverTop; ry <= riverBot; ry++) {
      if (ry >= 2 && ry < height - 2) {
        map[ry][x] = 2;
      }
    }

    // Riverbank trees
    const above = riverTop - 1;
    const below = riverBot + 1;
    if (above >= 2 && above < height - 2
        && (map[above][x] === 0 || map[above][x] === 1)
        && Math.sin(x * 0.5) > 0.5) {
      map[above][x] = 3;
    }
    if (below >= 2 && below < height - 2
        && (map[below][x] === 0 || map[below][x] === 1)
        && Math.cos(x * 0.4) > 0.5) {
      map[below][x] = 3;
    }
  }

  // --- Mountain barrier between Act 2 and Act 3 (y≈101) ---
  const mtBaseY = 101;
  for (let x = 2; x <= width - 3; x++) {
    const meander = Math.round(
      Math.sin(x * 0.07 + 2) * 2 + Math.cos(x * 0.04) * 1.5
      + Math.sin(x * 0.12 + 1) * 1
    );
    const centerY = mtBaseY + meander;
    const extraWidth = Math.cos(x * 0.15 + 1) > 0.1 ? 1 : 0;
    const mtTop = centerY;
    const mtBot = centerY + 1 + extraWidth;

    for (let my = mtTop; my <= mtBot; my++) {
      if (my >= 2 && my < height - 2) {
        map[my][x] = 4;
      }
    }

    const below = mtBot + 1;
    if (below >= 2 && below < height - 2
        && (map[below][x] === 0 || map[below][x] === 1)
        && Math.sin(x * 0.6 + 1) > 0.4) {
      map[below][x] = 3;
    }
  }

  // --- Lava barrier between Act 3/4 and Act 5 (y≈71) ---
  const lavaBaseY = 71;
  for (let x = 2; x <= width - 3; x++) {
    const meander = Math.round(
      Math.sin(x * 0.09 + 3) * 2 + Math.cos(x * 0.06 + 2) * 1.5
    );
    const centerY = lavaBaseY + meander;
    const extraWidth = Math.sin(x * 0.2 + 1.5) > 0.3 ? 1 : 0;
    const lavaTop = centerY;
    const lavaBot = centerY + extraWidth;

    for (let ly = lavaTop; ly <= lavaBot; ly++) {
      if (ly >= 2 && ly < height - 2) {
        map[ly][x] = 4;
      }
    }
  }

  // ── Phase 7b: Staggered water bodies for organic feel ──

  // Coastal inlet in Act 1 (SE corner — makes coastline feel natural)
  for (let y = 150; y <= 156; y++) {
    for (let x = 90; x < width - 2; x++) {
      const coastShape = noiseAt(x, y, 0.15, 6.0);
      if (x > 95 + coastShape * 6 - (y - 150) * 1.5) {
        if (y >= 2 && y < height - 2 && x >= 2 && x < width - 2) {
          map[y][x] = 2;
        }
      }
    }
  }

  // Winding stream in Act 3 (separates desert and volcanic regions)
  for (let y = 74; y <= 98; y++) {
    const streamX = Math.round(42 + Math.sin(y * 0.15) * 5 + Math.cos(y * 0.08 + 1) * 3);
    if (streamX >= 2 && streamX < width - 2 && y >= 2 && y < height - 2) {
      map[y][streamX] = 2;
      if (streamX + 1 < width - 2 && Math.sin(y * 0.3) > 0.3) {
        map[y][streamX + 1] = 2;
      }
    }
  }

  // ── Phase 8: Re-stamp markers AFTER barriers ──
  for (const [tx, ty] of towns) map[ty][tx] = 6;
  for (const [dx, dy] of caveDungeons) map[dy][dx] = 7;
  map[castleY][castleX] = 8;

  // Ensure adjacent tiles around all markers are walkable
  const allMarkers: [number, number][] = [...towns, ...caveDungeons, [castleX, castleY]];
  for (const [mx, my] of allMarkers) {
    for (const [adjDx, adjDy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const ax = mx + adjDx, ay = my + adjDy;
      if (ax >= 2 && ax < width - 2 && ay >= 2 && ay < height - 2) {
        if (map[ay][ax] === 4 || map[ay][ax] === 2) {
          map[ay][ax] = 1;
        }
      }
    }
  }

  // ── Phase 9: Post-adjacency terrain overrides ──

  // Crystal Cave: water at y=128-129 blocks passage between S(66,130) and N(66,127)
  // Phase 8 clears adjacent tiles around cave markers, so we re-add water here
  for (let wx = 63; wx <= 69; wx++) {
    if (wx >= 2 && wx < width - 2) {
      map[128][wx] = 2;
      map[129][wx] = 2;
    }
  }
  // Ensure cave tiles are preserved (Phase 8 stamps them, Phase 9 must not overwrite)
  map[127][66] = 7;  // north exit
  map[130][66] = 7;  // south entrance

  // Storm Nest approach: scatter tree/mountain obstacles along the windy west path
  // ironkeep(70,118) → (55,114) → (40,110) → stormNest(25,108)
  const stormObstacles: [number, number, number][] = [
    // Tree/mountain clusters flanking the westward path
    [65, 116, 3], [62, 112, 4], [58, 116, 3], [55, 112, 4],
    [52, 108, 3], [48, 112, 3], [45, 108, 4], [42, 112, 3],
    [38, 108, 4], [35, 112, 3], [32, 106, 4], [30, 110, 3],
    [28, 106, 4], [27, 110, 3],
    // Mountain blocks near Storm Nest entrance
    [23, 106, 4], [23, 110, 4], [27, 106, 4],
  ];
  for (const [ox, oy, tile] of stormObstacles) {
    if (ox >= 2 && ox < width - 2 && oy >= 2 && oy < height - 2) {
      // Don't overwrite path, town, cave, or castle tiles
      if (map[oy][ox] === 0 || map[oy][ox] === 3) {
        map[oy][ox] = tile;
      }
    }
  }

  // Shadow Cave: mountain wall between S(90,102) and N(90,100)
  // Phase 8 clears adjacent tiles around cave markers, creating gaps at x=89-91.
  // Fill mountains across y=101 to block Act 2→3 bypass.
  for (let bx = 86; bx <= 93; bx++) {
    if (bx !== 90) map[101][bx] = 4;  // skip cave column
  }
  map[101][90] = 4;  // between cave entrances (cave column itself)
  // Re-stamp cave markers
  map[102][90] = 7;  // SC S (Act 2 side)
  map[100][90] = 7;  // SC N (Act 3 side)
  // Ensure approach tiles are walkable
  map[103][90] = 1;  // south approach to SC S
  map[99][90] = 1;   // north approach to SC N

  // Volcanic Forge: mountains fill between S(12,70) and N(12,67)
  map[68][12] = 4;
  map[69][12] = 4;

  // Volcanic Forge N: mountains surround N/S/W — player exits east
  map[66][12] = 4;  // north of VF N
  map[68][12] = 4;  // south of VF N
  map[67][11] = 4;  // west of VF N
  map[67][13] = 1;  // east exit walkable
  map[67][14] = 1;

  // ── [6] Oasis Haven + Desert Tomb: comprehensive water barriers ──
  // Block ALL east access: water extends from north of Oasis Haven eastward
  // to connect with the winding stream, and south of Desert Tomb to prevent sneaking below.

  // 1. Water strip NORTH of Oasis Haven extending east to connect with winding stream (~x=42)
  //    Oasis Haven is at (45,92), stream runs around x=42. Extend water east from x=46 to x=80+
  for (let rx = 46; rx <= 85; rx++) {
    for (let ry = 88; ry <= 90; ry++) {
      if (rx >= 2 && rx < width - 2 && ry >= 2 && ry < height - 2) {
        if (map[ry][rx] !== 6 && map[ry][rx] !== 7 && map[ry][rx] !== 8) {
          map[ry][rx] = 2;
        }
      }
    }
  }

  // 2. Water barrier EAST of Desert Tomb (original + extended south)
  //    Desert Tomb at (60,95). Block east approach from Ruins Camp (80,85).
  for (let ry = 88; ry <= 100; ry++) {
    for (let rx = 64; rx <= 67; rx++) {
      if (rx >= 2 && rx < width - 2 && ry >= 2 && ry < height - 2) {
        if (map[ry][rx] !== 6 && map[ry][rx] !== 7 && map[ry][rx] !== 8) {
          map[ry][rx] = 2;
        }
      }
    }
  }

  // 3. Water SOUTH of Desert Tomb extending east — blocks sneaking below
  //    From (60,98) extending east to (80,100)
  for (let rx = 58; rx <= 85; rx++) {
    for (let ry = 98; ry <= 100; ry++) {
      if (rx >= 2 && rx < width - 2 && ry >= 2 && ry < height - 2) {
        if (map[ry][rx] !== 6 && map[ry][rx] !== 7 && map[ry][rx] !== 8) {
          map[ry][rx] = 2;
        }
      }
    }
  }

  // Re-stamp Desert Tomb cave marker
  map[95][60] = 7;
  // Walkable corridor between Oasis Haven (45,92) and Desert Tomb (60,95)
  for (let px = 44; px <= 63; px++) {
    for (let py = 91; py <= 97; py++) {
      if (map[py][px] === 2 && py >= 91 && py <= 97 && px >= 44 && px <= 63) {
        map[py][px] = 1;
      }
    }
  }
  // Re-stamp path tiles along the Oasis Haven → Desert Tomb route
  for (let px = 45; px <= 60; px++) {
    if (map[92][px] === 2) map[92][px] = 0;
    if (map[93][px] === 2) map[93][px] = 0;
    if (map[94][px] === 2) map[94][px] = 0;
    if (map[95][px] === 2) map[95][px] = 0;
  }

  // Extra walkable clearance around Oasis Haven (8-directional)
  const ohX = 45, ohY = 92;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const ax = ohX + dx, ay = ohY + dy;
      if (ax >= 2 && ax < width - 2 && ay >= 2 && ay < height - 2) {
        if (map[ay][ax] === 4 || map[ay][ax] === 2) {
          map[ay][ax] = 0;
        }
      }
    }
  }
  // Re-stamp Oasis Haven town marker
  map[ohY][ohX] = 6;

  // ── River barrier: block direct ruinsCamp→oasisHaven shortcut ──
  // Water band connecting winding stream (~x=42) to east water barrier zone
  for (let rx = 38; rx <= 63; rx++) {
    for (let ry = 87; ry <= 89; ry++) {
      if (rx >= 2 && rx < width - 2 && ry >= 2 && ry < height - 2) {
        if (map[ry][rx] !== 6 && map[ry][rx] !== 7 && map[ry][rx] !== 8) {
          map[ry][rx] = 2;
        }
      }
    }
  }

  // Bandit Hideout: mountain south, walkable north (exit point)
  map[104][10] = 4;  // mountain south of cave entrance
  map[102][10] = 1;  // walkable north of cave (player exits here)

  // Magma Tunnels (25,89): mountains E/S/W — embedded in terrain, approach from north
  map[89][24] = 4;   // west
  map[89][26] = 4;   // east
  map[90][25] = 4;   // south
  map[90][24] = 4;   // SW
  map[90][26] = 4;   // SE
  map[88][25] = 1;   // north approach (walkable path)

  // ── Phase 9b: Act 3/4 paths (drawn AFTER terrain/stream to avoid breakage) ──
  const act34Paths: [number, number][] = [
    // shadowCave N exit (90,100) → north to y=98, then west to ruinsCamp (80,85)
    // Route via y=98 so 3-wide path (py+1) stays at y=99, not y=101 (barrier)
    ...pathBetween(90, 100, 90, 98),
    ...pathBetween(90, 98, 80, 85),
    // ruinsCamp (80,85) → north to y=78 → west to embersRest (30,78)
    ...pathBetween(80, 85, 80, 78),     // north from ruinsCamp
    ...pathBetween(80, 78, 30, 78),     // west to embersRest
    // embersRest (30,78) → oasisHaven (45,92): south then east (bridges over water)
    ...pathBetween(30, 78, 30, 90),     // south from embersRest
    ...pathBetween(30, 90, 45, 92),     // east to oasisHaven
    // oasisHaven (45,92) → desertTomb (60,95)
    ...pathBetween(45, 92, 60, 95),
    // embersRest (30,78) → magmaTunnels (25,89)
    ...pathBetween(30, 78, 25, 89),
    // magmaTunnels (25,89) → volcanicForge S (12,70)
    ...pathBetween(25, 89, 12, 70),
  ];
  for (const [px, py] of act34Paths) {
    if (px >= 0 && px < width && py >= 0 && py < height) {
      // Bridge over water, path elsewhere. Don't overwrite markers.
      if (map[py][px] === 6 || map[py][px] === 7 || map[py][px] === 8) continue;
      map[py][px] = map[py][px] === 2 ? 5 : 1;
    }
  }

  // Re-stamp Act 3/4 markers after path drawing
  map[85][80] = 6;   // ruinsCamp
  map[92][45] = 6;   // oasisHaven
  map[95][60] = 7;   // desertTomb
  map[78][30] = 6;   // embersRest
  map[89][25] = 7;   // magmaTunnels
  map[103][10] = 7;  // banditHideout

  // Clean stray road tiles inside water barrier zone (east of Desert Tomb)
  for (let ry = 88; ry <= 100; ry++) {
    for (let rx = 64; rx <= 85; rx++) {
      if (map[ry][rx] === 1) { // clean up isolated road tiles in water zone
        // Check if this road tile is isolated (not connecting anything useful)
        const adj = [[0,-1],[0,1],[-1,0],[1,0]].filter(([dx,dy]) => {
          const nx = rx+dx, ny = ry+dy;
          return nx >= 0 && nx < width && ny >= 0 && ny < height
            && (map[ny][nx] === 1 || map[ny][nx] === 5 || map[ny][nx] === 6 || map[ny][nx] === 7);
        });
        if (adj.length <= 1) map[ry][rx] = 0; // isolated road → grass
      }
    }
  }

  // ── FINAL: Seal mountain barrier at y=101 across ENTIRE map width ──
  // The Phase 7 barrier meanders ±4.5 tiles, leaving gaps at some x values.
  // This pass guarantees a continuous wall at y=101 so Act 2 and Act 3 are
  // fully separated. Only the Shadow Cave dungeon allows passage.
  for (let x = 2; x < width - 2; x++) {
    const tile = map[101][x];
    if (tile !== 6 && tile !== 7 && tile !== 8 && tile !== 5) {
      map[101][x] = 4;
    }
  }
  // Re-stamp markers and approach tiles near y=101
  map[100][90] = 7;  // Shadow Cave N (Act 3 side)
  map[102][90] = 7;  // Shadow Cave S (Act 2 side)
  map[99][90] = 1;   // north approach to SC N
  map[103][90] = 1;  // south approach to SC S

  return map;
}

function pathBetween(x1: number, y1: number, x2: number, y2: number): [number, number][] {
  const points: [number, number][] = [];
  let x = x1, y = y1;

  while (x !== x2 || y !== y2) {
    points.push([x, y]);
    if (x !== x2) {
      x += x2 > x ? 1 : -1;
    } else {
      y += y2 > y ? 1 : -1;
    }
  }
  points.push([x2, y2]);

  // Add path width
  const wide: [number, number][] = [];
  for (const [px, py] of points) {
    wide.push([px, py]);
    wide.push([px + 1, py]);
    wide.push([px, py + 1]);
  }
  return wide;
}

/**
 * Generate a 40×40 portal land mini-overworld.
 * Layout: grass with paths, village entrance (tile 6), dungeon entrance (tile 7), portal exit (tile 9).
 * Uses overworld tile set (ow-*).
 */
export function generatePortalLandMap(width: number, height: number, seed: number): number[][] {
  const rand = seededRandom(seed);

  // Fill with grass (0) and scatter some terrain
  const map: number[][] = Array.from({ length: height }, () => new Array(width).fill(0));

  // Border: mountains (4)
  for (let x = 0; x < width; x++) {
    map[0][x] = 4;
    map[height - 1][x] = 4;
  }
  for (let y = 0; y < height; y++) {
    map[y][0] = 4;
    map[y][width - 1] = 4;
  }

  // Random forest patches (3)
  for (let i = 0; i < Math.floor(width * height * 0.12); i++) {
    const fx = 2 + Math.floor(rand() * (width - 4));
    const fy = 2 + Math.floor(rand() * (height - 4));
    if (map[fy][fx] === 0) map[fy][fx] = 3;
  }

  // Random mountain patches (4) in clusters
  for (let i = 0; i < 6; i++) {
    const cx = 5 + Math.floor(rand() * (width - 10));
    const cy = 5 + Math.floor(rand() * (height - 10));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (rand() < 0.5 && cy + dy > 0 && cy + dy < height - 1 && cx + dx > 0 && cx + dx < width - 1) {
          map[cy + dy][cx + dx] = 4;
        }
      }
    }
  }

  // Village entrance (tile 6) — center-left area
  const villageX = 10, villageY = 20;
  map[villageY][villageX] = 6;

  // Dungeon entrance (tile 7) — upper-right area
  const dungeonX = 25, dungeonY = 10;
  map[dungeonY][dungeonX] = 7;

  // Portal exit (tile 9) — bottom center
  const portalX = Math.floor(width / 2), portalY = height - 2;
  map[portalY][portalX] = 9;

  // Carve paths between key locations using pathBetween
  const carvePortalPath = (x1: number, y1: number, x2: number, y2: number) => {
    for (const [px, py] of pathBetween(x1, y1, x2, y2)) {
      if (py > 0 && py < height - 1 && px > 0 && px < width - 1) {
        if (map[py][px] !== 6 && map[py][px] !== 7 && map[py][px] !== 9) {
          map[py][px] = 1; // path
        }
      }
    }
  };

  // Connect portal → village → dungeon
  carvePortalPath(portalX, portalY, villageX, villageY);
  carvePortalPath(villageX, villageY, dungeonX, dungeonY);

  return map;
}

export function generateTownMap(width: number, height: number, seed: number): number[][] {
  const rand = seededRandom(seed);
  const cx = Math.floor(width / 2);

  // Fill with grass
  const map: number[][] = Array.from({ length: height }, () => new Array(width).fill(3));

  // Border walls
  for (let x = 0; x < width; x++) {
    map[0][x] = 1;
    map[height - 1][x] = (x >= cx - 1 && x <= cx + 1) ? 7 : 1;
  }
  for (let y = 0; y < height; y++) {
    map[y][0] = 1;
    map[y][width - 1] = 1;
  }

  // Main north-south road (2 tiles wide)
  for (let y = 2; y < height - 1; y++) {
    map[y][cx - 1] = 5;
    map[y][cx] = 5;
  }

  // East-west crossroad at y=5
  for (let x = 2; x < width - 2; x++) {
    map[5][x] = 5;
  }

  // Plaza around intersection
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const py = 5 + dy, px = cx + dx;
      if (py > 0 && py < height - 1 && px > 0 && px < width - 1) {
        map[py][px] = 0;
      }
    }
  }

  // Helper: place a 3×2 house (row 0 = roof, row 1 = wall with window/door/window)
  function placeHouse(hx: number, hy: number): void {
    for (let dx = 0; dx < 3; dx++) {
      const px = hx + dx, ry = hy;
      if (ry > 0 && ry < height - 1 && px > 0 && px < width - 1) {
        map[ry][px] = 2; // roof
      }
      const wy = hy + 1;
      if (wy > 0 && wy < height - 1 && px > 0 && px < width - 1) {
        map[wy][px] = dx === 1 ? 10 : 9; // center=door, sides=window
      }
    }
    // Floor in front
    for (let dx = 0; dx < 3; dx++) {
      const fy = hy + 2, fx = hx + dx;
      if (fy > 0 && fy < height - 1 && fx > 0 && fx < width - 1) {
        if (map[fy][fx] === 3) map[fy][fx] = 0;
      }
    }
  }

  // Helper: place a 3×2 shop (row 0 = awning, row 1 = display/door/display)
  function placeShop(sx: number, sy: number): void {
    for (let dx = 0; dx < 3; dx++) {
      const px = sx + dx;
      if (sy > 0 && sy < height - 1 && px > 0 && px < width - 1) {
        map[sy][px] = 8; // awning
      }
      const wy = sy + 1;
      if (wy > 0 && wy < height - 1 && px > 0 && px < width - 1) {
        map[wy][px] = dx === 1 ? 12 : 11; // center=door, sides=display
      }
    }
    // Floor in front
    for (let dx = 0; dx < 3; dx++) {
      const fy = sy + 2, fx = sx + dx;
      if (fy > 0 && fy < height - 1 && fx > 0 && fx < width - 1) {
        if (map[fy][fx] === 3) map[fy][fx] = 0;
      }
    }
  }

  // Helper: place a 3×2 clinic (row 0 = green roof with cross, row 1 = wall with window/door/window)
  function placeClinic(cx: number, cy: number): void {
    for (let dx = 0; dx < 3; dx++) {
      const px = cx + dx;
      if (cy > 0 && cy < height - 1 && px > 0 && px < width - 1) {
        map[cy][px] = 13; // clinic roof
      }
      const wy = cy + 1;
      if (wy > 0 && wy < height - 1 && px > 0 && px < width - 1) {
        map[wy][px] = dx === 1 ? 15 : 14; // center=door, sides=window
      }
    }
    // Floor in front
    for (let dx = 0; dx < 3; dx++) {
      const fy = cy + 2, fx = cx + dx;
      if (fy > 0 && fy < height - 1 && fx > 0 && fx < width - 1) {
        if (map[fy][fx] === 3) map[fy][fx] = 0;
      }
    }
  }

  // Place houses
  const houses: { x: number; y: number }[] = [
    { x: 2, y: 2 },
    { x: width - 5, y: 2 },
    { x: 2, y: 7 },
    { x: width - 5, y: 7 },
  ];
  for (const h of houses) placeHouse(h.x, h.y);

  // Place clinic (5 blocks west of shop, bottom row)
  const clinicX = width - 14;
  const clinicY = 11;
  placeClinic(clinicX, clinicY);

  // Place shop (bottom-right)
  const shopX = width - 5;
  const shopY = 11;
  placeShop(shopX, shopY);

  // Side paths
  const allBuildings = [...houses, { x: clinicX + 1, y: clinicY }, { x: shopX + 1, y: shopY }];
  for (const b of allBuildings) {
    const frontY = b.y + 2;
    const startX = Math.min(b.x, cx - 1);
    const endX = Math.max(b.x + 2, cx);
    for (let x = startX; x <= endX; x++) {
      if (frontY > 0 && frontY < height - 1 && x > 0 && x < width - 1) {
        if (map[frontY][x] === 3) map[frontY][x] = 0;
      }
    }
  }

  // Save point
  map[10][cx] = 6;

  // Water feature
  if (rand() > 0.4) {
    const wx = cx + (rand() > 0.5 ? 2 : -3);
    if (wx > 1 && wx < width - 2 && map[4][wx] === 3) {
      map[4][wx] = 4;
    }
  }

  return map;
}

interface Room {
  x: number; y: number; w: number; h: number;
  cx: number; cy: number;
}

/**
 * Generate a dungeon floor map.
 */
export function generateDungeonMap(
  width: number, height: number, seed: number,
  floor: number = 1, totalFloors: number = 1,
  gate: boolean = false,
  gateFinalFloor: boolean = false,
  castle: boolean = false,
): number[][] {
  const floorSeed = seed + (floor - 1) * 997;
  const rand = seededRandom(floorSeed);

  const isFirstFloor = floor === 1;
  const isFinalFloor = floor === totalFloors;

  const map: number[][] = Array.from({ length: height }, () => new Array(width).fill(1));

  // --- Generate rooms (scaled to map size) ---
  const rooms: Room[] = [];
  const roomCount = Math.min(22, Math.floor(4 + Math.sqrt(width * height) / 4));
  const minRoomSize = Math.max(3, Math.floor(width / 12));
  const maxRoomSize = Math.max(minRoomSize + 3, Math.min(12, Math.floor(width / 5)));

  const roomYMin = gate ? 6 : 2;
  const roomYMax = gate ? height - 6 : height - 4;
  const spacing = width >= 30 ? 2 : 1;

  for (let attempt = 0; attempt < roomCount * 50 && rooms.length < roomCount; attempt++) {
    const rw = minRoomSize + Math.floor(rand() * (maxRoomSize - minRoomSize + 1));
    const rh = minRoomSize + Math.floor(rand() * (maxRoomSize - minRoomSize + 1));
    const rx = 1 + Math.floor(rand() * Math.max(1, width - rw - 2));
    const ry = roomYMin + Math.floor(rand() * Math.max(1, roomYMax - rh - roomYMin));

    let overlaps = false;
    for (const r of rooms) {
      if (rx - spacing < r.x + r.w && rx + rw + spacing > r.x &&
          ry - spacing < r.y + r.h && ry + rh + spacing > r.y) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) });
  }

  rooms.sort((a, b) => a.cy - b.cy);

  // --- Carve rooms ---
  for (const room of rooms) {
    for (let ry = room.y; ry < room.y + room.h; ry++) {
      for (let rx = room.x; rx < room.x + room.w; rx++) {
        map[ry][rx] = rand() > 0.92 ? 2 : 0;
      }
    }
  }

  // --- Connect rooms via MST (Prim's algorithm) for clean, non-circular paths ---
  const isStandardDungeon = !gate && !castle;
  if (rooms.length > 1) {
    const inMST = new Set<number>();
    const mstEdges: [number, number][] = [];
    inMST.add(0);
    while (inMST.size < rooms.length) {
      let bestDist = Infinity;
      let bestFrom = -1;
      let bestTo = -1;
      for (const from of inMST) {
        for (let to = 0; to < rooms.length; to++) {
          if (inMST.has(to)) continue;
          const dist = Math.abs(rooms[from].cx - rooms[to].cx) + Math.abs(rooms[from].cy - rooms[to].cy);
          if (dist < bestDist) {
            bestDist = dist;
            bestFrom = from;
            bestTo = to;
          }
        }
      }
      if (bestTo === -1) break;
      inMST.add(bestTo);
      mstEdges.push([bestFrom, bestTo]);
    }
    // Carve MST corridors
    for (const [a, b] of mstEdges) {
      carveLCorridor(map, rooms[a].cx, rooms[a].cy, rooms[b].cx, rooms[b].cy, rand);
    }
    // Add 1-2 short extra connections for variety (shortest non-MST edges)
    const extraCount = 1 + Math.floor(rand() * 2);
    const mstSet = new Set(mstEdges.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`));
    const nonMSTEdges: { a: number; b: number; dist: number }[] = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (!mstSet.has(`${i},${j}`)) {
          nonMSTEdges.push({ a: i, b: j, dist: Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy) });
        }
      }
    }
    nonMSTEdges.sort((ea, eb) => ea.dist - eb.dist);
    for (let e = 0; e < Math.min(extraCount, nonMSTEdges.length); e++) {
      const edge = nonMSTEdges[e];
      carveLCorridor(map, rooms[edge.a].cx, rooms[edge.a].cy, rooms[edge.b].cx, rooms[edge.b].cy, rand);
    }
  }

  // --- Dead-end branches (straight corridors into uncarved walls) ---
  // Carve a STRAIGHT dead-end from a room edge. Returns endpoint if >= 4 tiles, else null.
  const carveDeadEnd = (room: Room, ddx: number, ddy: number, length: number): [number, number] | null => {
    const startX = ddx > 0 ? room.x + room.w : ddx < 0 ? room.x - 1 : room.cx;
    const startY = ddy > 0 ? room.y + room.h : ddy < 0 ? room.y - 1 : room.cy;
    const tiles: [number, number][] = [];
    for (let step = 0; step < length; step++) {
      const tx = startX + ddx * step;
      const ty = startY + ddy * step;
      if (tx <= 0 || tx >= width - 1 || ty <= 1 || ty >= height - 2) break;
      if (map[ty][tx] !== 1) break; // Hit open tile — stop
      // Check perpendicular neighbors are walls (prevents connecting to adjacent corridors)
      if (step > 0) {
        if (ddx !== 0) {
          if ((ty - 1 >= 0 && map[ty - 1][tx] !== 1) || (ty + 1 < height && map[ty + 1][tx] !== 1)) break;
        } else {
          if ((tx - 1 >= 0 && map[ty][tx - 1] !== 1) || (tx + 1 < width && map[ty][tx + 1] !== 1)) break;
        }
      }
      tiles.push([tx, ty]);
    }
    if (tiles.length < 4) return null;
    for (const [tx, ty] of tiles) { map[ty][tx] = 0; }
    return tiles[tiles.length - 1];
  };

  // Treasure branches
  const MIN_TREASURE_DIST = 8;
  const treasurePositions: [number, number][] = [];
  const isFarEnoughFromOther = (x: number, y: number): boolean =>
    treasurePositions.every(([tx, ty]) => Math.abs(x - tx) + Math.abs(y - ty) >= MIN_TREASURE_DIST);

  for (let i = 0; i < rooms.length; i++) {
    if (rand() > 0.3 && treasurePositions.length < Math.floor(roomCount / 2)) {
      const room = rooms[i];
      const dirs = shuffleArray([[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][], rand);
      for (const [ddx, ddy] of dirs) {
        const branchLen = 6 + Math.floor(rand() * 8);
        const endpoint = carveDeadEnd(room, ddx, ddy, branchLen);
        if (endpoint && isFarEnoughFromOther(endpoint[0], endpoint[1])) {
          treasurePositions.push(endpoint);
          break;
        }
      }
    }
  }

  // Fallback: place treasure at room corners if no dead-end branches worked
  if (treasurePositions.length === 0) {
    for (let i = 1; i < rooms.length - 1 && treasurePositions.length < 2; i++) {
      const r = rooms[i];
      const corners: [number, number][] = shuffleArray([
        [r.x, r.y], [r.x + r.w - 1, r.y],
        [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1],
      ] as [number, number][], rand);
      for (const [cx2, cy2] of corners) {
        if (cx2 > 0 && cx2 < width - 1 && cy2 > 1 && cy2 < height - 3
            && (map[cy2][cx2] === 0 || map[cy2][cx2] === 2) && isFarEnoughFromOther(cx2, cy2)) {
          treasurePositions.push([cx2, cy2]);
          break;
        }
      }
    }
  }

  // Cap at 2
  while (treasurePositions.length > 2) {
    let worstIdx = 0;
    let worstDist = Infinity;
    for (let i = 0; i < treasurePositions.length; i++) {
      for (let j = 0; j < treasurePositions.length; j++) {
        if (i === j) continue;
        const d = Math.abs(treasurePositions[i][0] - treasurePositions[j][0])
                + Math.abs(treasurePositions[i][1] - treasurePositions[j][1]);
        if (d < worstDist) { worstDist = d; worstIdx = i; }
      }
    }
    treasurePositions.splice(worstIdx, 1);
  }

  // Extra maze dead-end branches (no treasure, exploration variety)
  for (let i = 0; i < rooms.length; i++) {
    if (rand() < 0.6) { // 60% of rooms get a maze branch
      const room = rooms[i];
      const dirs = shuffleArray([[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][], rand);
      for (const [ddx, ddy] of dirs) {
        const branchLen = 5 + Math.floor(rand() * 10);
        if (carveDeadEnd(room, ddx, ddy, branchLen)) break;
      }
    }
  }

  const entranceX = Math.floor(width / 2);

  if (gate) {
    // ── Gate dungeon (single floor) ──
    // Boss ON the exit stairs at top — blocks passage to next act
    map[0][entranceX] = 7;
    // Clear approach area below boss
    for (let dy = 1; dy <= 4; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const bx = entranceX + dx;
        if (bx > 0 && bx < width - 1 && dy < height - 1) {
          map[dy][bx] = 0;
        }
      }
    }
    if (rooms.length > 0) {
      carveLCorridor(map, entranceX, 4, rooms[0].cx, rooms[0].cy, rand);
    }

    // Entrance at bottom (player enters from previous act)
    map[height - 1][entranceX] = 6;
    for (let dx = -1; dx <= 1; dx++) {
      const ex = entranceX + dx;
      if (ex > 0 && ex < width - 1) {
        map[height - 2][ex] = 0;
        map[height - 3][ex] = 0;
      }
    }
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const bx = entranceX + dx;
        const by = (height - 6) + dy;
        if (bx > 0 && bx < width - 1 && by > 0 && by < height - 1) {
          map[by][bx] = 0;
        }
      }
    }
    if (rooms.length > 0) {
      const lastRoom = rooms[rooms.length - 1];
      carveLCorridor(map, lastRoom.cx, lastRoom.cy, entranceX, height - 6, rand);
    }
  } else if (castle) {
    // ── Castle dungeon ──
    map[height - 1][entranceX] = 6;
    for (let dx = -1; dx <= 1; dx++) {
      const ex = entranceX + dx;
      if (ex > 0 && ex < width - 1) {
        map[height - 2][ex] = 0;
        map[height - 3][ex] = 0;
      }
    }
    if (rooms.length > 0) {
      const lastRoom = rooms[rooms.length - 1];
      carveLCorridor(map, entranceX, height - 3, lastRoom.cx, lastRoom.cy, rand);
    }

    const topX = entranceX;
    if (isFinalFloor) {
      // Grand throne room: 13-wide × 9-tall
      const topRoomY = 2;
      for (let dy = 0; dy < 9; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const bx = topX + dx;
          const by = topRoomY + dy;
          if (bx > 0 && bx < width - 1 && by > 0 && by < height - 1) {
            map[by][bx] = 0;
          }
        }
      }
      // Decorative pillars (wall tiles)
      const pillarOffsets = [-4, 4];
      const pillarRows = [2, 4, 6];
      for (const pdx of pillarOffsets) {
        for (const pdy of pillarRows) {
          const px = topX + pdx;
          const py = topRoomY + pdy;
          if (px > 0 && px < width - 1 && py > 0 && py < height - 1) {
            map[py][px] = 1;
          }
        }
      }
      // Boss on throne at center-back
      map[topRoomY + 1][topX] = 7;
      // Connect corridor from room below into throne room entrance
      map[topRoomY + 9][topX] = 0;
      map[topRoomY + 10][topX] = 0;
      if (rooms.length > 0) {
        carveLCorridor(map, rooms[0].cx, rooms[0].cy, topX, topRoomY + 10, rand);
      }
    } else {
      // Non-final floor: smaller top room with stairs
      const topRoomY = 2;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const bx = topX + dx;
          const by = topRoomY + dy;
          if (bx > 0 && bx < width - 1 && by > 0 && by < height - 1) {
            map[by][bx] = 0;
          }
        }
      }
      map[topRoomY + 3][topX] = 0;
      if (rooms.length > 0) {
        carveLCorridor(map, rooms[0].cx, rooms[0].cy, topX, topRoomY + 3, rand);
      }
      map[0][entranceX] = 9;
      map[1][entranceX] = 0;
    }

  } else {
    // ── Standard dungeon ──
    // Entrance always at top (entranceX, 0)
    for (let dx = -1; dx <= 1; dx++) {
      const ex = entranceX + dx;
      if (ex > 0 && ex < width - 1) {
        map[1][ex] = 0;
        map[2][ex] = 0;
      }
    }
    map[0][entranceX] = 6;
    if (rooms.length > 0) {
      carveLCorridor(map, entranceX, 2, rooms[0].cx, rooms[0].cy, rand);
    }

    // Goal room: bottom-most room (opposite from entrance at top)
    // Rooms are sorted by cy ascending, so last room has highest cy
    const goalRoom = rooms.length > 0 ? rooms[rooms.length - 1] : null;

    // Carve goal room area and connect to nearest room
    const goalX = goalRoom ? goalRoom.cx : entranceX;
    const goalY = goalRoom ? goalRoom.cy : height - 3;

    if (gateFinalFloor && isFinalFloor) {
      // Gate final floor: boss ON the exit stairs at bottom — blocks passage to next act
      map[height - 1][entranceX] = 7;
      // Clear boss arena above the boss for approach
      for (let bdy = -3; bdy <= -1; bdy++) {
        for (let bdx = -3; bdx <= 3; bdx++) {
          const bx2 = entranceX + bdx;
          const by2 = (height - 1) + bdy;
          if (bx2 > 0 && bx2 < width - 1 && by2 > 0 && by2 < height - 1) {
            map[by2][bx2] = 0;
          }
        }
      }
      // Connect rooms to boss arena
      if (rooms.length > 0) {
        const lastRoom = rooms[rooms.length - 1];
        carveLCorridor(map, lastRoom.cx, lastRoom.cy, entranceX, height - 4, rand);
      }
    } else if (isFinalFloor) {
      // Boss on final floor at bottom room center
      map[goalY][goalX] = 7;
      // Ensure boss has a clear room around it
      for (let bdy = -1; bdy <= 1; bdy++) {
        for (let bdx = -2; bdx <= 2; bdx++) {
          const bx2 = goalX + bdx;
          const by2 = goalY + bdy;
          if (bx2 > 0 && bx2 < width - 1 && by2 > 0 && by2 < height - 1 && map[by2][bx2] === 1) {
            map[by2][bx2] = 0;
          }
        }
      }
    } else {
      // Stairs-down at bottom room center
      map[goalY][goalX] = 9;
      // Ensure stairs area is clear
      for (let bdy = -1; bdy <= 1; bdy++) {
        for (let bdx = -1; bdx <= 1; bdx++) {
          const bx2 = goalX + bdx;
          const by2 = goalY + bdy;
          if (bx2 > 0 && bx2 < width - 1 && by2 > 0 && by2 < height - 1 && map[by2][bx2] === 1) {
            map[by2][bx2] = 0;
          }
        }
      }
    }
  }

  // ── BFS reachability validation: ensure goal is reachable from entrance ──
  // Find the goal tile (stairs-down=9, boss=7, or gate exit=6 at bottom)
  let goalTileX = entranceX, goalTileY = 1;
  for (let y2 = height - 1; y2 >= 0; y2--) {
    for (let x2 = 0; x2 < width; x2++) {
      const tile = map[y2][x2];
      if (tile === 9 || tile === 7) {
        goalTileX = x2;
        goalTileY = y2;
      }
    }
  }

  // BFS from entrance to goal
  {
    const visited = new Set<string>();
    const queue: [number, number][] = [[entranceX, 1]];
    visited.add(`${entranceX},1`);
    let reached = false;
    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      if (cx === goalTileX && cy === goalTileY) { reached = true; break; }
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = cx + dx, ny = cy + dy;
        const key = `${nx},${ny}`;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (visited.has(key)) continue;
        const t = map[ny][nx];
        if (t === 1 || t === 5) continue; // wall or lava = impassable
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
    // If unreachable, carve fallback L-corridor to connect
    if (!reached) {
      // Find nearest connected tile to goal
      let bestX = entranceX, bestY = 2, bestDist = Infinity;
      for (const key of visited) {
        const [vx, vy] = key.split(',').map(Number);
        const dist = Math.abs(vx - goalTileX) + Math.abs(vy - goalTileY);
        if (dist < bestDist) { bestDist = dist; bestX = vx; bestY = vy; }
      }
      carveLCorridor(map, bestX, bestY, goalTileX, goalTileY, rand);
    }
  }

  // ── Place treasure tiles ──
  const isWallTile = (x: number, y: number) =>
    y < 0 || y >= height || x < 0 || x >= width || map[y][x] === 1 || map[y][x] === 5;

  const isWalkable = (t: number) => t !== 1 && t !== 5 && t !== 4 && t !== 7 && t !== 8;

  const isValidTreasureSpot = (x: number, y: number): boolean => {
    const nWall = isWallTile(x, y - 1);
    const sWall = isWallTile(x, y + 1);
    const wWall = isWallTile(x - 1, y);
    const eWall = isWallTile(x + 1, y);
    // Must have at least one wall neighbor
    if (!nWall && !sWall && !wWall && !eWall) return false;
    // Not in a straight corridor (open on opposite sides)
    if (!nWall && !sWall) return false;
    if (!wWall && !eWall) return false;
    // Not at an intersection (3+ open sides — would block multi-path travel)
    const openCount = [!nWall, !sWall, !wWall, !eWall].filter(Boolean).length;
    if (openCount >= 3) return false;
    return true;
  };

  // BFS reachability check: can we walk from (sx,sy) to (gx,gy) without crossing blockedSet?
  const canReach = (sx: number, sy: number, gx: number, gy: number, blocked: Set<string>): boolean => {
    if (sx === gx && sy === gy) return true;
    const visited = new Set<string>();
    const queue: [number, number][] = [[sx, sy]];
    visited.add(`${sx},${sy}`);
    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = cx + dx, ny = cy + dy;
        const key = `${nx},${ny}`;
        if (nx === gx && ny === gy) return true;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (visited.has(key) || blocked.has(key)) continue;
        if (!isWalkable(map[ny][nx])) continue;
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
    return false;
  };

  // Find the critical destination tile (stairs-down or boss)
  let goalX = entranceX, goalY = height - 2;
  for (let y2 = height - 1; y2 >= 0; y2--) {
    for (let x2 = 0; x2 < width; x2++) {
      if (map[y2][x2] === 9 || map[y2][x2] === 7 || map[y2][x2] === 6 && y2 === height - 1) {
        goalX = x2; goalY = y2; break;
      }
    }
    if (goalX !== entranceX || goalY !== height - 2) break;
  }

  const placedChests = new Set<string>();

  for (let ti = treasurePositions.length - 1; ti >= 0; ti--) {
    const [tx, ty] = treasurePositions[ti];
    if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) {
      treasurePositions.splice(ti, 1);
      continue;
    }

    let placed = false;
    if (isValidTreasureSpot(tx, ty)) {
      // Verify placing here doesn't block path from entrance to goal
      const testBlocked = new Set([...placedChests, `${tx},${ty}`]);
      if (canReach(entranceX, 1, goalX, goalY, testBlocked)) {
        map[ty][tx] = 4;
        placedChests.add(`${tx},${ty}`);
        placed = true;
      }
    }

    if (!placed) {
      // Relocate to a room spot that doesn't block paths
      let relocated = false;
      for (const room of shuffleArray([...rooms], rand)) {
        const candidates: [number, number][] = [];
        for (let rx = room.x; rx < room.x + room.w; rx++) {
          for (let ry = room.y; ry < room.y + room.h; ry++) {
            if ((map[ry][rx] === 0 || map[ry][rx] === 2) && isValidTreasureSpot(rx, ry)) {
              const tb = new Set([...placedChests, `${rx},${ry}`]);
              if (canReach(entranceX, 1, goalX, goalY, tb)) {
                candidates.push([rx, ry]);
              }
            }
          }
        }
        if (candidates.length > 0) {
          const [cx, cy] = candidates[Math.floor(rand() * candidates.length)];
          map[cy][cx] = 4;
          placedChests.add(`${cx},${cy}`);
          treasurePositions[ti] = [cx, cy];
          relocated = true;
          break;
        }
      }
      if (!relocated) {
        treasurePositions.splice(ti, 1);
      }
    }
  }

  return map;
}

function carveLCorridor(
  map: number[][],
  x1: number, y1: number,
  x2: number, y2: number,
  rand: () => number
): void {
  const height = map.length;
  const width = map[0].length;

  const horizFirst = rand() > 0.5;

  let cx = x1, cy = y1;

  if (horizFirst) {
    while (cx !== x2) {
      if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1 && map[cy][cx] === 1) {
        map[cy][cx] = 0;
      }
      cx += cx < x2 ? 1 : -1;
    }
    while (cy !== y2) {
      if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1 && map[cy][cx] === 1) {
        map[cy][cx] = 0;
      }
      cy += cy < y2 ? 1 : -1;
    }
  } else {
    while (cy !== y2) {
      if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1 && map[cy][cx] === 1) {
        map[cy][cx] = 0;
      }
      cy += cy < y2 ? 1 : -1;
    }
    while (cx !== x2) {
      if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1 && map[cy][cx] === 1) {
        map[cy][cx] = 0;
      }
      cx += cx < x2 ? 1 : -1;
    }
  }
  if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1 && map[cy][cx] === 1) {
    map[cy][cx] = 0;
  }
}

function shuffleArray<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
