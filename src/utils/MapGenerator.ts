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
    ...pathBetween(15, 150, 25, 148),   // greenhollow → mistyGrotto
    ...pathBetween(15, 150, 45, 145),   // greenhollow → millbrook
    ...pathBetween(45, 145, 80, 140),   // millbrook → portSapphire
    ...pathBetween(80, 140, 85, 144),   // portSapphire → sunkenCellar
    ...pathBetween(45, 145, 55, 131),   // millbrook → crystalCave S

    // ── Act 2 — between river and mountains (y=102-130) ──
    ...pathBetween(55, 129, 70, 118),   // crystalCave N → ironkeep
    ...pathBetween(70, 118, 35, 112),   // ironkeep → highwatch
    ...pathBetween(35, 112, 15, 115),   // highwatch → stormNest (hidden path)
    ...pathBetween(35, 112, 25, 108),   // highwatch → frozenLake
    ...pathBetween(70, 118, 90, 102),   // ironkeep → shadowCave S

    // ── Act 3 — between mountains and lava (y=72-100) ──
    ...pathBetween(90, 100, 80, 85),    // shadowCave N → ruinsCamp
    ...pathBetween(80, 85, 45, 92),     // ruinsCamp → oasisHaven
    ...pathBetween(45, 92, 60, 95),     // oasisHaven → desertTomb
    ...pathBetween(45, 92, 35, 88),     // oasisHaven → banditHideout
    ...pathBetween(80, 85, 30, 78),     // ruinsCamp → embersRest

    // ── Act 4 — volcanic area (y=72-80) ──
    ...pathBetween(30, 78, 18, 75),     // embersRest → magmaTunnels
    ...pathBetween(18, 75, 12, 72),     // magmaTunnels → volcanicForge S

    // ── Act 5 — north of lava (y=2-70) ──
    ...pathBetween(13, 69, 85, 58),     // volcanicForge N exit → lastBastion
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

  // Sealed Sanctum (8,10) — NW
  carveMazePath(20, 58, 8, 10);
  // Celestial Vault (110,10) — NE
  carveMazePath(88, 56, 110, 10);

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
    [15, 150], [45, 145], [80, 140],  // Act 1
    [70, 118], [35, 112],              // Act 2
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
    [25, 148], [85, 144],             // Misty Grotto, Sunken Cellar
    [55, 131], [55, 129],             // Crystal Cave S/N
    // Act 2
    [15, 115], [25, 108],             // Storm Nest, Frozen Lake
    [90, 102], [90, 100],             // Shadow Cave S/N
    // Act 3
    [60, 95], [35, 88],               // Desert Tomb, Bandit Hideout
    // Act 4
    [18, 75],                          // Magma Tunnels
    [12, 72], [12, 69],               // Volcanic Forge S/N
    // Act 5
    [8, 10], [110, 10],               // Legendary: Sanctum (NW), Vault (NE)
  ];
  for (const [dx, dy] of caveDungeons) {
    map[dy][dx] = 7;
  }
  // Demon Castle uses castle tile (8)
  map[castleY][castleX] = 8;

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

  // Crystal Cave: water at y=130 blocks direct passage between S(55,131) and N(55,129)
  for (let wx = 52; wx <= 58; wx++) {
    if (wx >= 2 && wx < width - 2) {
      map[130][wx] = 2;
    }
  }

  // Shadow Cave: mountain north of Act 2 entrance, walkable north of Act 3 exit
  map[101][90] = 4;  // mountain — north of SC S (90,102)
  map[99][90] = 1;   // walkable — north of SC N (90,100)

  // Volcanic Forge: mountains fill between S(12,72) and N(12,69)
  map[70][12] = 4;
  map[71][12] = 4;

  // Volcanic Forge N: mountains surround N/S/W — player exits east
  map[68][12] = 4;  // north of VF N
  map[70][12] = 4;  // south of VF N
  map[69][11] = 4;  // west of VF N
  map[69][13] = 1;  // east exit walkable
  map[69][14] = 1;

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

  // Place houses
  const houses: { x: number; y: number }[] = [
    { x: 2, y: 2 },
    { x: width - 5, y: 2 },
    { x: 2, y: 7 },
    { x: width - 5, y: 7 },
    { x: 2, y: 11 },
  ];
  for (const h of houses) placeHouse(h.x, h.y);

  // Place shop
  const shopX = width - 5;
  const shopY = 11;
  placeShop(shopX, shopY);

  // Side paths
  const allBuildings = [...houses, { x: shopX + 1, y: shopY }];
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

  // --- Generate rooms ---
  const rooms: Room[] = [];
  const roomCount = Math.floor(5 + (width + height) / 10);
  const minRoomSize = 3;
  const maxRoomSize = Math.min(7, Math.floor(width / 4));

  const roomYMin = gate ? 6 : 2;
  const roomYMax = gate ? height - 6 : height - 4;

  for (let attempt = 0; attempt < 200 && rooms.length < roomCount; attempt++) {
    const rw = minRoomSize + Math.floor(rand() * (maxRoomSize - minRoomSize + 1));
    const rh = minRoomSize + Math.floor(rand() * (maxRoomSize - minRoomSize + 1));
    const rx = 1 + Math.floor(rand() * (width - rw - 2));
    const ry = roomYMin + Math.floor(rand() * (roomYMax - rh - roomYMin));

    let overlaps = false;
    for (const r of rooms) {
      if (rx - 1 < r.x + r.w && rx + rw + 1 > r.x && ry - 1 < r.y + r.h && ry + rh + 1 > r.y) {
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

  // --- Connect rooms ---
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i];
    const b = rooms[i + 1];
    carveLCorridor(map, a.cx, a.cy, b.cx, b.cy, rand);
  }

  for (let i = 0; i < rooms.length - 2; i++) {
    if (rand() > 0.55) {
      const a = rooms[i];
      const b = rooms[i + 2];
      carveLCorridor(map, a.cx, a.cy, b.cx, b.cy, rand);
    }
  }

  // --- Dead-end branches with treasure ---
  const MIN_TREASURE_DIST = 8;
  const treasurePositions: [number, number][] = [];

  const mainPathTiles: Set<string> = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (map[y][x] !== 1) mainPathTiles.add(`${x},${y}`);
    }
  }

  const isFarEnoughFromOther = (x: number, y: number): boolean =>
    treasurePositions.every(([tx, ty]) => Math.abs(x - tx) + Math.abs(y - ty) >= MIN_TREASURE_DIST);

  const MIN_PATH_DIST = 3;
  const isFarFromMainPath = (x: number, y: number): boolean => {
    for (let dy = -MIN_PATH_DIST; dy <= MIN_PATH_DIST; dy++) {
      for (let dx = -MIN_PATH_DIST; dx <= MIN_PATH_DIST; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= MIN_PATH_DIST
            && mainPathTiles.has(`${x + dx},${y + dy}`)) {
          return false;
        }
      }
    }
    return true;
  };

  for (let i = 0; i < rooms.length; i++) {
    if (rand() > 0.3 && treasurePositions.length < Math.floor(roomCount / 2)) {
      const room = rooms[i];
      const dirs = shuffleArray([[0, -1], [0, 1], [-1, 0], [1, 0]], rand);
      for (const [dx, dy] of dirs) {
        const branchLen = 6 + Math.floor(rand() * 5);
        let ex = room.cx + dx * (Math.floor(room.w / 2) + branchLen);
        let ey = room.cy + dy * (Math.floor(room.h / 2) + branchLen);
        ex = Math.max(1, Math.min(width - 2, ex));
        ey = Math.max(2, Math.min(height - 4, ey));

        if (map[ey][ex] === 1 && isFarEnoughFromOther(ex, ey) && isFarFromMainPath(ex, ey)) {
          carveLCorridor(map, room.cx, room.cy, ex, ey, rand);
          map[ey][ex] = 0;
          treasurePositions.push([ex, ey]);
          break;
        }
      }
    }
  }

  // Fallback
  if (treasurePositions.length === 0) {
    for (let i = 1; i < rooms.length - 1 && treasurePositions.length < 2; i++) {
      const r = rooms[i];
      const alcoveDirs = shuffleArray([[0, -1], [0, 1], [-1, 0], [1, 0]], rand);
      for (const [dx, dy] of alcoveDirs) {
        const ax = r.cx + dx * (Math.floor(r.w / 2) + 4);
        const ay = r.cy + dy * (Math.floor(r.h / 2) + 4);
        if (ax > 0 && ax < width - 1 && ay > 1 && ay < height - 3
            && map[ay][ax] === 1 && isFarEnoughFromOther(ax, ay)) {
          carveLCorridor(map, r.cx, r.cy, ax, ay, rand);
          map[ay][ax] = 0;
          treasurePositions.push([ax, ay]);
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

  const entranceX = Math.floor(width / 2);

  if (gate) {
    // ── Gate dungeon ──
    map[0][entranceX] = 6;
    map[1][entranceX] = 7;
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const bx = entranceX + dx;
        const by = 2 + dy;
        if (bx > 0 && bx < width - 1 && by > 0 && by < height - 1) {
          map[by][bx] = 0;
        }
      }
    }
    if (rooms.length > 0) {
      carveLCorridor(map, entranceX, 4, rooms[0].cx, rooms[0].cy, rand);
    }

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

    if (isFinalFloor) {
      map[topRoomY + 1][topX] = 7;
    } else {
      map[0][entranceX] = 9;
      map[1][entranceX] = 0;
    }

  } else {
    // ── Standard dungeon ──
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

    const bottomX = entranceX;
    const bottomRoomY = height - 3;
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const bx = bottomX + dx;
        const by = bottomRoomY + dy;
        if (bx > 0 && bx < width - 1 && by > 0 && by < height - 1) {
          map[by][bx] = 0;
        }
      }
    }
    map[bottomRoomY - 1][bottomX] = 0;
    if (rooms.length > 0) {
      const lastRoom = rooms[rooms.length - 1];
      carveLCorridor(map, lastRoom.cx, lastRoom.cy, bottomX, bottomRoomY - 1, rand);
    }

    if (gateFinalFloor && isFinalFloor) {
      const bossRoomY = height - 7;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const bx = entranceX + dx;
          const by = bossRoomY + dy;
          if (bx > 0 && bx < width - 1 && by > 0 && by < height - 1) {
            map[by][bx] = 0;
          }
        }
      }
      if (rooms.length > 0) {
        const lastRoom = rooms[rooms.length - 1];
        carveLCorridor(map, lastRoom.cx, lastRoom.cy, entranceX, bossRoomY, rand);
      }

      for (let cy = height - 4; cy <= height - 3; cy++) {
        if (cy > 0 && cy < height - 1) {
          map[cy][entranceX] = 0;
        }
      }

      map[height - 2][entranceX] = 7;
      map[height - 1][entranceX] = 6;
    } else if (isFinalFloor) {
      map[bottomRoomY + 1][bottomX] = 7;
    } else {
      map[bottomRoomY + 1][bottomX] = 9;
    }
  }

  // ── Place treasure tiles ──
  const isWallTile = (x: number, y: number) =>
    y < 0 || y >= height || x < 0 || x >= width || map[y][x] === 1 || map[y][x] === 5;

  const isValidTreasureSpot = (x: number, y: number): boolean => {
    const nWall = isWallTile(x, y - 1);
    const sWall = isWallTile(x, y + 1);
    const wWall = isWallTile(x - 1, y);
    const eWall = isWallTile(x + 1, y);
    if (!nWall && !sWall && !wWall && !eWall) return false;
    if (!nWall && !sWall) return false;
    if (!wWall && !eWall) return false;
    return true;
  };

  for (let ti = treasurePositions.length - 1; ti >= 0; ti--) {
    const [tx, ty] = treasurePositions[ti];
    if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) {
      treasurePositions.splice(ti, 1);
      continue;
    }

    if (isValidTreasureSpot(tx, ty)) {
      map[ty][tx] = 4;
    } else {
      let relocated = false;
      for (const room of shuffleArray([...rooms], rand)) {
        const candidates: [number, number][] = [];
        for (let rx = room.x; rx < room.x + room.w; rx++) {
          for (let ry = room.y; ry < room.y + room.h; ry++) {
            if ((map[ry][rx] === 0 || map[ry][rx] === 2) && isValidTreasureSpot(rx, ry)) {
              candidates.push([rx, ry]);
            }
          }
        }
        if (candidates.length > 0) {
          const [cx, cy] = candidates[Math.floor(rand() * candidates.length)];
          map[cy][cx] = 4;
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
