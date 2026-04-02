// Procedural tilemap generator — creates maps at runtime
// Returns 2D arrays of tile indices matching our generated tilesets

// Overworld tiles: 0=grass, 1=path, 2=water, 3=tree, 4=mountain, 5=bridge, 6=town, 7=cave/dungeon, 8=castle
//   9=portal-land, 10=gate, 12=stormNest(special cave), 13=storm-blocked, 14=crossroads-barrier
//   15=crystalCave(special), 16=frozenLake(special), 17=fog/mist, 18=snowfield, 19=desert-tomb
// Town tiles: 0=floor, 1=wall, 2=house-roof, 3=grass, 4=water, 5=path, 6=save, 7=exit
//   8=shop-awning, 9=house-wall-window, 10=house-wall-door, 11=shop-wall-display, 12=shop-wall-door
// Dungeon tiles: 0=floor, 1=wall, 2=cracked, 3=door, 4=treasure, 5=lava, 6=stairs-up, 7=boss
//   8=opened-chest, 9=stairs-down, 10=boss-exit-portal, 11=boss-warp-portal, 12=boss-exit-stairs
//   17=hidden-wall, 24=maze-wall, 25=wind-corridor, 29=shadow-portal, 30=spike-trap, 31=tripwire

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

  // ── Phase 1: Base terrain using four elliptical region definitions ──
  // Each region: cx, cy = center; hw, hh = half-widths; seed = noise seed
  const regionU = { cx: 85, cy: 305, hw: 65, hh: 75, seed: 1 };  // Act 1 (SW)
  const regionM = { cx: 235, cy: 305, hw: 65, hh: 75, seed: 2 }; // Act 2 (SE)
  const regionC = { cx: 235, cy: 110, hw: 65, hh: 90, seed: 3 }; // Act 3/4 (NE)
  const regionT = { cx: 85, cy: 110, hw: 65, hh: 90, seed: 4 };  // Act 5 (NW)

  const inRegion = (x: number, y: number, cx: number, cy: number, hw: number, hh: number, seed: number): boolean => {
    const qx = (x - cx) / hw, qy = (y - cy) / hh;
    const distSq = qx * qx + qy * qy;
    const noise = noiseAt(x, y, 0.04, seed) * 0.25 + noiseAt(x, y, 0.08, seed + 100) * 0.15;
    return distSq + noise < 1;
  };

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      if (x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2) { row.push(2); continue; }

      const inU = inRegion(x, y, regionU.cx, regionU.cy, regionU.hw, regionU.hh, regionU.seed);
      const inMr = inRegion(x, y, regionM.cx, regionM.cy, regionM.hw, regionM.hh, regionM.seed);
      const inC = inRegion(x, y, regionC.cx, regionC.cy, regionC.hw, regionC.hh, regionC.seed);
      const inT = inRegion(x, y, regionT.cx, regionT.cy, regionT.hw, regionT.hh, regionT.seed);

      if (!inU && !inMr && !inC && !inT) { row.push(2); continue; }

      if (inU) {
        // Act 1: mixed plains/forest/coast
        if (x > 60 && x < 90 && y > 310 && y < 340 && rand() > 0.35) { row.push(3); continue; }
        if (x > 100 && x < 135 && y > 290 && y < 320 && rand() > 0.7) { row.push(3); continue; }
        if (x > 135 && y > 260 && y < 360 && noiseAt(x, y, 0.12, 10) > 0.8 && rand() > 0.5) { row.push(4); continue; }
        if (Math.sqrt((x - 95) ** 2 + (y - 330) ** 2) < 5 + noiseAt(x, y, 0.4, 4) * 2) { row.push(2); continue; }
        if (rand() > 0.9) { row.push(3); continue; }
        row.push(0); continue;
      }

      if (inMr) {
        // Act 2: mixed with rivers and ice regions
        if (y >= 275 && y <= 298 && x >= 170 && x <= 300 && !(x >= 221 && x <= 222)) {
          const riverCy = 286 + noiseAt(x, 0, 0.08, 5.5) * 3;
          const riverR = 3.5 + noiseAt(x, 0, 0.12, 6.5) * 2.5;
          const dist = Math.abs(y - riverCy);
          if (dist < riverR) { row.push(4); continue; }
          if (dist < riverR + 2 && noiseAt(x, y, 0.2, 3.3) > 0.3 && rand() > 0.4) { row.push(4); continue; }
        }
        if (y > 294) {
          if (x > 210 && x < 270 && y > 330 && y < 365 && rand() > 0.5) { row.push(3); continue; }
          if (rand() > 0.88) { row.push(3); continue; }
          row.push(0); continue;
        }
        if (x >= 238 && x <= 242 && y >= 230 && y <= 280) {
          const atGate = (x <= 239 && Math.abs(y - 248) <= 1) || (x >= 241 && Math.abs(y - 248) <= 1);
          if (!atGate) { row.push(14); continue; }
        }
        if ((x >= 234 && x <= 237 || x >= 243 && x <= 246) && y >= 230 && y <= 280 && rand() > 0.4) { row.push(3); continue; }
        const frozenDist = Math.sqrt((x - 200) ** 2 + (y - 265) ** 2);
        if (frozenDist < 8 + noiseAt(x, y, 0.25, 6) * 2.5 && frozenDist > 1.5) { row.push(2); continue; }
        if (x > 185 && x < 215 && y > 258 && y < 275 && noiseAt(x, y, 0.12, 7) > 0.45 && rand() > 0.4) { row.push(4); continue; }
        if (y < 275 && y > 230 && rand() > 0.88) { row.push(3); continue; }
        if (rand() > 0.85) { row.push(3); continue; }
        row.push(0); continue;
      }

      if (inC) {
        // Act 3/4: desert/volcanic
        if (x < 210) {
          if (noiseAt(x, y, 0.1, 3) > 0.5 && rand() > 0.3) { row.push(4); continue; }
          if (x < 200 && y < 75 && noiseAt(x, y, 0.2, 5) > 0.9 && rand() > 0.4) { row.push(2); continue; }
        }
        const oasisDist = Math.sqrt((x - 220) ** 2 + (y - 150) ** 2);
        if (oasisDist < 12) {
          if (oasisDist > 8 && rand() > 0.6) { row.push(3); continue; }
          if (oasisDist > 5 && oasisDist < 8 && rand() > 0.5) { row.push(2); continue; }
          row.push(0); continue;
        }
        if (y >= 75 && y <= 130 && x >= 165 && x <= 290) {
          const baseCy = 87 + (x < 230 ? (230 - x) * 0.35 : 0) + noiseAt(x, 0, 0.09, 17) * 3;
          const baseR = 5 + noiseAt(x, 0, 0.11, 18) * 2;
          const bd = Math.abs(y - baseCy);
          if (bd < baseR) { row.push(4); continue; }
          if (bd < baseR + 2 && noiseAt(x, y, 0.22, 19) > 0.2 && rand() > 0.35) { row.push(4); continue; }
        }
        if (y >= 112 && y <= 194 && x >= 248 && x <= 292) {
          const cCx = 268 + noiseAt(0, y, 0.09, 20) * 5;
          const cR = 11 + noiseAt(0, y, 0.11, 21) * 4;
          const cd = Math.abs(x - cCx);
          if (cd < cR) { row.push(4); continue; }
          if (cd < cR + 3 && noiseAt(x, y, 0.22, 22) > 0.2 && rand() > 0.35) { row.push(4); continue; }
        }
        if (y >= 85 && y <= 117 && x >= 165 && x <= 245) {
          const vn = noiseAt(x, y, 0.13, 36);
          if (vn > 0.25 && rand() > 0.15) { row.push(4); continue; }
          if (vn > 0.08 && rand() > 0.65) { row.push(4); continue; }
        }
        if (y >= 107 && y <= 128 && x >= 165 && x <= 290) {
          const rCy = 117 + noiseAt(x, 0, 0.09, 33) * 3;
          const rR = 6 + noiseAt(x, 0, 0.11, 34) * 2;
          const rd = Math.abs(y - rCy);
          if (rd < rR) { row.push(4); continue; }
          if (rd < rR + 2 && noiseAt(x, y, 0.2, 35) > 0.2 && rand() > 0.35) { row.push(4); continue; }
        }
        if (y >= 124 && y <= 152 && x >= 193 && x <= 268) {
          const sCy = 137 + noiseAt(x, 0, 0.1, 23) * 4;
          const sR = 6 + noiseAt(x, 0, 0.12, 24) * 3;
          const sd = Math.abs(y - sCy);
          const rt = x < 225 ? Math.max(0, (x - 193) / 32) : 1;
          if (rt > 0.1 && sd < sR * rt) { row.push(4); continue; }
          const sThresh = 0.25 + (1 - rt) * 0.45;
          if (sd < sR + 3 && noiseAt(x, y, 0.18, 37) > sThresh && rand() > 0.35) { row.push(4); continue; }
        }
        if (y > 90 && y < 200) {
          if (noiseAt(x, y, 0.15, 9) > 0.7 && rand() > 0.5) { row.push(4); continue; }
          row.push(18); continue;
        }
        row.push(0); continue;
      }

      if (inT) {
        // Act 5: demon realm mountains
        if (y < 80) { row.push(4); continue; }
        if (x > 40 && x < 130 && y > 90 && y < 170 && rand() > 0.7) { row.push(3); continue; }
        if (noiseAt(x, y, 0.08, 6) > 0.7 && rand() > 0.4) { row.push(4); continue; }
        if (rand() > 0.88) { row.push(3); continue; }
        row.push(0); continue;
      }

      row.push(0);
    }
    map.push(row);
  }

  // ── Phase 2: Carve paths between key locations ──
  const drawPath = (coords: [number, number][]) => {
    for (const [px, py] of coords) {
      if (px >= 0 && px < width && py >= 0 && py < height) {
        const t = map[py][px];
        if (t === 6 || t === 7 || t === 8 || t === 9 || t === 10 || t === 12) continue;
        map[py][px] = 1;
      }
    }
  };

  drawPath([
    ...pathBetween(60, 340, 45, 350), ...pathBetween(60, 340, 80, 310),
    ...pathBetween(60, 340, 100, 320), ...pathBetween(100, 320, 130, 290),
    ...pathBetween(130, 290, 140, 350), ...pathBetween(130, 290, 120, 260),
    ...pathBetween(130, 290, 148, 295),
  ]);
  drawPath([
    ...pathBetween(172, 305, 200, 320), ...pathBetween(200, 320, 185, 335),
    ...pathBetween(200, 320, 280, 295), ...pathBetween(200, 320, 222, 295),
  ]);
  drawPath([...pathBetween(222, 295, 222, 275)]);
  drawPath([
    ...pathBetween(222, 275, 222, 262), ...pathBetween(222, 262, 200, 265),
    ...pathBetween(222, 262, 238, 248), ...pathBetween(242, 248, 252, 242),
    ...pathBetween(252, 242, 260, 234),
  ]);
  drawPath([
    ...pathBetween(260, 198, 270, 120), ...pathBetween(270, 120, 220, 150),
    ...pathBetween(220, 150, 225, 160), ...pathBetween(220, 150, 250, 140),
    ...pathBetween(270, 120, 278, 93), ...pathBetween(278, 93, 242, 93),
    ...pathBetween(278, 93, 278, 82), ...pathBetween(242, 81, 195, 80),
    ...pathBetween(195, 80, 202, 48), ...pathBetween(195, 80, 185, 48),
    ...pathBetween(195, 80, 195, 110), ...pathBetween(195, 110, 172, 110),
  ]);
  drawPath([
    ...pathBetween(148, 110, 100, 150), ...pathBetween(100, 150, 70, 100),
    ...pathBetween(70, 100, 80, 60), ...pathBetween(70, 100, 120, 70),
    ...pathBetween(70, 100, 85, 30),
  ]);

  // ── Phase 3: Act 5 maze carving (y=22..79, x=22..147) ──
  const mazeTop = 22, mazeBot = 79, mazeLeft = 22, mazeRight = 148;
  const mazeSeeds: [number, number][] = [];
  for (let my = mazeTop; my <= mazeBot; my++) {
    for (let mx = mazeLeft; mx < mazeRight; mx++) {
      if (map[my][mx] === 1 || map[my][mx] === 0) mazeSeeds.push([mx, my]);
    }
  }
  for (let branch = 0; branch < 200 && mazeSeeds.length !== 0; branch++) {
    const si = Math.floor(rand() * mazeSeeds.length);
    let [sx, sy] = mazeSeeds[si];
    const primaryDir = Math.floor(rand() * 4);
    const walkLen = 10 + Math.floor(rand() * 40);
    for (let step = 0; step < walkLen; step++) {
      const dir = rand() > 0.45 ? primaryDir : Math.floor(rand() * 4);
      const dx = [0, 0, -1, 1][dir], dy = [-1, 1, 0, 0][dir];
      const nx = sx + dx, ny = sy + dy;
      if (nx >= mazeLeft && nx < mazeRight && ny >= mazeTop && ny <= mazeBot) {
        sx = nx; sy = ny;
        if (map[sy][sx] === 4) { map[sy][sx] = 0; mazeSeeds.push([sx, sy]); }
      }
    }
  }

  // ── Phase 3b: Portal access paths in maze ──
  const carveCell = (cx2: number, cy2: number) => {
    if (cx2 >= mazeLeft && cx2 < mazeRight && cy2 >= mazeTop && cy2 <= mazeBot && map[cy2][cx2] === 4) {
      map[cy2][cx2] = 0;
    }
  };
  const carveMazePath = (sx: number, sy: number, ex: number, ey: number) => {
    let cx2 = sx, cy2 = sy;
    let safety = 0;
    while ((cx2 !== ex || cy2 !== ey) && safety++ < 800) {
      carveCell(cx2, cy2);
      if (rand() < 0.6) {
        if (Math.abs(cx2 - ex) >= Math.abs(cy2 - ey)) cx2 += cx2 < ex ? 1 : -1;
        else cy2 += cy2 < ey ? 1 : -1;
      } else {
        if (Math.abs(cx2 - ex) >= Math.abs(cy2 - ey)) cy2 += rand() > 0.5 ? 1 : -1;
        else cx2 += rand() > 0.5 ? 1 : -1;
      }
      cx2 = Math.max(mazeLeft, Math.min(mazeRight - 1, cx2));
      cy2 = Math.max(mazeTop, Math.min(mazeBot, cy2));
    }
    carveCell(ex, ey);
  };
  carveMazePath(70, 70, 40, 50);   // Stormreach portal
  carveMazePath(100, 70, 130, 40); // Frostfall portal
  carveMazePath(70, 100, 50, 130); // Sunken Temple portal
  carveMazePath(100, 100, 120, 140); // Twilight portal

  // ── Phase 4: Demon Castle island ──
  const castleX = 85, castleY = 30;
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const ix = castleX + dx, iy = castleY + dy;
      if (ix >= 2 && ix < width - 2 && iy >= 2 && iy < height - 2) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 5 && dist <= 7.5) map[iy][ix] = 2; // water moat
        else if (dist < 5) map[iy][ix] = 0; // island ground
      }
    }
  }
  // Land bridge south of castle island
  for (let ly = 35; ly <= 50; ly++) {
    if (ly >= 2 && ly < height - 2) {
      if (map[ly][castleX] === 4 || map[ly][castleX] === 2) map[ly][castleX] = 1;
      if (map[ly][castleX + 1] === 4 || map[ly][castleX + 1] === 2) map[ly][castleX + 1] = 1;
    }
  }

  // ── Phase 5: Town markers ──
  const towns: [number, number][] = [
    [60, 340], [100, 320], [130, 290],  // Act 1
    [200, 320], [222, 262], [252, 242], // Act 2
    [220, 150], [270, 120],             // Act 3
    [195, 80],                          // Act 4
    [100, 150], [70, 100],              // Act 5
  ];
  for (const [tx, ty] of towns) map[ty][tx] = 6;

  // ── Phase 6: Dungeon entrance markers ──
  const caveDungeons: [number, number][] = [
    [45, 350], [80, 310], [140, 350], [120, 260], // Act 1
    [185, 335], [260, 234],                         // Act 2
    [250, 140], [298, 133], [278, 82],              // Act 3
    [242, 93], [242, 81], [202, 48], [185, 48], [172, 110], [148, 110], // Act 4
    [80, 60], [120, 70],                            // Act 5
  ];
  for (const [dx, dy] of caveDungeons) map[dy][dx] = 7;

  // Special dungeon tiles
  map[castleY][castleX] = 8;           // Demon Castle (castle tile)
  map[295][148] = 15;                  // Crystal Cave S entrance (special tile)
  map[305][172] = 15;                  // Crystal Cave N entrance
  map[265][200] = 16;                  // Frozen Lake
  map[295][280] = 12;                  // Storm Nest (special cave)
  map[140][250] = 19;                  // Desert Tomb (desert-tomb special)

  // Portal tiles (tile 9)
  const portals: [number, number][] = [
    [40, 50],   // Stormreach Isles
    [130, 40],  // Frostfall Peaks
    [50, 130],  // Sunken Temple Isle
    [120, 140], // Twilight Realm
  ];
  for (const [px, py] of portals) map[py][px] = 9;

  // Gate tiles (tile 10) for haunted forest
  map[248][238] = 10;
  map[248][242] = 10;

  // ── Phase 7: Re-stamp all markers (to survive any overwrites) ──
  for (const [tx, ty] of towns) map[ty][tx] = 6;
  for (const [dx, dy] of caveDungeons) map[dy][dx] = 7;
  map[castleY][castleX] = 8;

  // Ensure adjacent tiles around markers are walkable
  const allMarkers: [number, number][] = [...towns, ...caveDungeons, [castleX, castleY]];
  for (const [mx, my] of allMarkers) {
    for (const [adjDx, adjDy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const ax = mx + adjDx, ay = my + adjDy;
      if (ax >= 2 && ax < width - 2 && ay >= 2 && ay < height - 2) {
        if (map[ay][ax] === 4 || map[ay][ax] === 2) map[ay][ax] = 1;
      }
    }
  }

  // ── Phase 8: Re-stamp special tiles ──
  map[castleY][castleX] = 8;
  map[295][148] = 15;
  map[305][172] = 15;
  map[265][200] = 16;
  map[295][280] = 12;
  map[140][250] = 19;
  for (const [px, py] of portals) map[py][px] = 9;
  map[248][238] = 10;
  map[248][242] = 10;

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
    map[height - 1][x] = (x >= cx - 1 && x <= cx) ? 7 : 1;
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

  // Helper: place a 3×2 clinic (row 0 = green roof with cross, row 1 = wall/counter/wall)
  function placeClinic(cx: number, cy: number): void {
    for (let dx = 0; dx < 3; dx++) {
      const px = cx + dx;
      if (cy > 0 && cy < height - 1 && px > 0 && px < width - 1) {
        map[cy][px] = 13; // clinic roof
      }
      const wy = cy + 1;
      if (wy > 0 && wy < height - 1 && px > 0 && px < width - 1) {
        map[wy][px] = dx === 1 ? 15 : 14; // center=counter, sides=window
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

export interface DungeonMapResult {
  map: number[][];
  keyChests: [number, number][];
  windCorridorDir?: { dx: number; dy: number };
  portalPairs?: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>;
  goldenChestPos?: { x: number; y: number };
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
  mechanic?: string,
): DungeonMapResult {
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
      // Gate final floor: boss at NORTH (row 0) protecting exit to next act
      // Entrance (stairs-up from previous floor) at SOUTH (bottom)
      map[0][entranceX] = 7;
      // Clear boss arena below the boss for approach
      for (let bdy = 1; bdy <= 4; bdy++) {
        for (let bdx = -3; bdx <= 3; bdx++) {
          const bx2 = entranceX + bdx;
          if (bx2 > 0 && bx2 < width - 1 && bdy < height - 1) {
            map[bdy][bx2] = 0;
          }
        }
      }
      // Entrance at south (stairs from previous floor)
      map[height - 1][entranceX] = 6;
      for (let dx = -1; dx <= 1; dx++) {
        const ex = entranceX + dx;
        if (ex > 0 && ex < width - 1) {
          map[height - 2][ex] = 0;
          map[height - 3][ex] = 0;
        }
      }
      // Connect rooms to boss arena at north and entrance at south
      if (rooms.length > 0) {
        carveLCorridor(map, rooms[0].cx, rooms[0].cy, entranceX, 4, rand);
        const lastRoom = rooms[rooms.length - 1];
        carveLCorridor(map, lastRoom.cx, lastRoom.cy, entranceX, height - 3, rand);
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

  // ── Place traps for banditHideout ──
  // Detect bandit hideout by seed pattern (seed is mapId.charCodeAt(0)*251, 'b'=98, 98*251=24598)
  const isBanditHideout = (seed % 1000) === (98 * 251 % 1000);
  if (isBanditHideout && !gate && !castle) {
    // Spike traps (tile 30): place on floor tiles in corridors, not in rooms, not on goal
    let spikeCount = 0;
    const maxSpikes = Math.floor(width * height / 80);
    for (let sy = 2; sy < height - 2 && spikeCount < maxSpikes; sy++) {
      for (let sx = 2; sx < width - 2 && spikeCount < maxSpikes; sx++) {
        if (map[sy][sx] !== 0) continue;
        if (sx === goalTileX && sy === goalTileY) continue;
        // Only place in corridors (exactly 2 open neighbors — straight passage)
        const openN = sy > 0 && map[sy-1][sx] !== 1;
        const openS = sy < height-1 && map[sy+1][sx] !== 1;
        const openW = sx > 0 && map[sy][sx-1] !== 1;
        const openE = sx < width-1 && map[sy][sx+1] !== 1;
        const openCount = [openN, openS, openW, openE].filter(Boolean).length;
        if (openCount === 2 && rand() < 0.08) {
          map[sy][sx] = 30;
          spikeCount++;
        }
      }
    }

    // Tripwires (tile 31): place spanning full-width narrow corridor sections
    // Find rows where corridor width ≤ 3 and place tripwire across them
    if (!isFinalFloor) {
      for (let ty = 3; ty < height - 3; ty++) {
        // Count floor tiles in this row (corridor width)
        let runStart = -1;
        for (let tx = 1; tx < width - 1; tx++) {
          const isFloor = map[ty][tx] !== 1 && map[ty][tx] !== 5;
          if (isFloor && runStart === -1) runStart = tx;
          if (!isFloor && runStart !== -1) {
            const runLen = tx - runStart;
            // Narrow corridor: width ≤ 3
            if (runLen <= 3 && runLen >= 1 && rand() < 0.15) {
              // Check above and below are walls (true corridor, not open room)
              const aboveWall = map[ty-1][runStart] === 1 && map[ty-1][tx-1] === 1;
              const belowWall = map[ty+1][runStart] === 1 && map[ty+1][tx-1] === 1;
              if (aboveWall && belowWall) {
                for (let wx = runStart; wx < tx; wx++) {
                  if (map[ty][wx] === 0) map[ty][wx] = 31;
                }
              }
            }
            runStart = -1;
          }
        }
      }
    }

    // Hidden rooms (tile 17 = fake wall entrance, tile 4 = chest inside)
    // Find dead-end corridor tiles and carve hidden rooms behind them
    if (!isFinalFloor) {
      for (let hy = 3; hy < height - 4; hy++) {
        for (let hx = 3; hx < width - 4; hx++) {
          if (map[hy][hx] !== 0) continue;
          // Dead-end: exactly 1 open neighbor
          const neighbors = [[0,-1],[0,1],[-1,0],[1,0]];
          const openNeighbors = neighbors.filter(([dx,dy]) => {
            const nx = hx+dx, ny = hy+dy;
            return nx >= 0 && nx < width && ny >= 0 && ny < height && map[ny][nx] !== 1;
          });
          if (openNeighbors.length !== 1) continue;
          if (rand() > 0.2) continue; // 20% chance

          // Direction away from open neighbor = direction to carve hidden room
          const [odx, ody] = openNeighbors[0];
          const rdx = -odx, rdy = -ody;

          // Room starts 1 tile behind dead-end in that direction
          const roomCenterX = hx + rdx * 2;
          const roomCenterY = hy + rdy * 2;

          // Check if 3×3 room fits
          let fits = true;
          for (let ry = roomCenterY - 1; ry <= roomCenterY + 1; ry++) {
            for (let rx = roomCenterX - 1; rx <= roomCenterX + 1; rx++) {
              if (rx <= 0 || rx >= width - 1 || ry <= 0 || ry >= height - 1) { fits = false; break; }
              if (map[ry][rx] !== 1) { fits = false; break; } // must be solid wall
            }
            if (!fits) break;
          }
          if (!fits) continue;

          // Carve the 3×3 room
          for (let ry = roomCenterY - 1; ry <= roomCenterY + 1; ry++) {
            for (let rx = roomCenterX - 1; rx <= roomCenterX + 1; rx++) {
              map[ry][rx] = 0;
            }
          }
          // Place hidden wall (tile 17) at the dead-end entrance
          map[hy][hx] = 17;
          // Carve corridor tile connecting dead-end to room
          if (map[hy + rdy][hx + rdx] === 1) map[hy + rdy][hx + rdx] = 0;
          // Place treasure chest in center of hidden room
          map[roomCenterY][roomCenterX] = 4;
        }
      }
    }

    // Final floor: hidden room before boss tile
    if (isFinalFloor) {
      for (let hy = 0; hy < height; hy++) {
        for (let hx = 0; hx < width; hx++) {
          if (map[hy][hx] !== 7) continue;
          // Place hidden wall tile just before the boss in the approach corridor
          // Check tiles in each direction from boss for open floor
          for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const nx = hx+dx, ny = hy+dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && map[ny][nx] === 0) {
              map[ny][nx] = 17;
              break;
            }
          }
        }
      }
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

  // ── Mechanic: maze-hunter ──
  // Full floor replacement with perfect maze + hunter boss
  if (mechanic === 'maze-hunter') {
    return generateMazeHunterFloor(width, height, seed, floor, totalFloors, rand, isFirstFloor, isFinalFloor);
  }

  // ── Build main path (entrance to goal) for mechanics that need it ──
  const mainPath: [number, number][] = [];
  const pathDirs: ('h' | 'v')[] = [];
  if (mechanic === 'wind-tower' || mechanic === 'shadow-portal') {
    const startX = entranceX, startY = 1;
    let gX = goalTileX, gY = goalTileY;
    // BFS to find path from entrance to goal
    const bfsParent = new Map<string, string>();
    const bfsQueue: [number, number][] = [[startX, startY]];
    bfsParent.set(`${startX},${startY}`, '');
    let found = false;
    while (bfsQueue.length > 0 && !found) {
      const [cx2, cy2] = bfsQueue.shift()!;
      if (cx2 === gX && cy2 === gY) { found = true; break; }
      for (const [ddx, ddy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
        const nx2 = cx2 + ddx, ny2 = cy2 + ddy;
        const k = `${nx2},${ny2}`;
        if (nx2 < 0 || nx2 >= width || ny2 < 0 || ny2 >= height) continue;
        if (bfsParent.has(k)) continue;
        const t2 = map[ny2][nx2];
        if (t2 === 1 || t2 === 5) continue;
        bfsParent.set(k, `${cx2},${cy2}`);
        bfsQueue.push([nx2, ny2]);
      }
    }
    if (found) {
      let cur = `${gX},${gY}`;
      const revPath: [number, number][] = [];
      while (cur !== '') {
        const [px2, py2] = cur.split(',').map(Number);
        revPath.push([px2, py2]);
        cur = bfsParent.get(cur) ?? '';
      }
      revPath.reverse();
      for (let pi = 0; pi < revPath.length; pi++) {
        mainPath.push(revPath[pi]);
        if (pi > 0) {
          const [px2] = revPath[pi], [ppx2] = revPath[pi - 1];
          pathDirs.push(px2 !== ppx2 ? 'h' : 'v');
        } else {
          pathDirs.push('h');
        }
      }
    }
  }

  // ── Mechanic: wind-tower ──
  let windCorridorDir: { dx: number; dy: number } | undefined;
  if (mechanic === 'wind-tower' && mainPath.length > 0) {
    const enterX = mainPath[0][0], enterY = mainPath[0][1];
    const exitX = goalTileX, exitY = goalTileY;
    const dxW = exitX - enterX, dyW = exitY - enterY;
    if (Math.abs(dxW) >= Math.abs(dyW)) {
      windCorridorDir = { dx: dxW > 0 ? 1 : -1, dy: 0 };
    } else {
      windCorridorDir = { dx: 0, dy: dyW > 0 ? 1 : -1 };
    }
    const windFrac = 0.4 + rand() * 0.2;
    const windTarget = Math.floor(mainPath.length * windFrac);
    let windCount = 0, segLen = 3 + Math.floor(rand() * 3), gapLen = 1 + Math.floor(rand() * 2);
    let inSeg = true, segProg = 0;
    for (let pi = 0; pi < mainPath.length && windCount < windTarget; pi++) {
      const [px2, py2] = mainPath[pi];
      if (inSeg) {
        if (map[py2]?.[px2] === 0) {
          map[py2][px2] = 25; windCount++;
          const d = pathDirs[pi];
          if (d === 'h' && py2 + 1 < height - 1 && map[py2 + 1]?.[px2] === 0) map[py2 + 1][px2] = 25;
          else if (d === 'v' && px2 + 1 < width - 1 && map[py2]?.[px2 + 1] === 0) map[py2][px2 + 1] = 25;
        }
        segProg++;
        if (segProg >= segLen) { inSeg = false; segProg = 0; gapLen = 1 + Math.floor(rand() * 2); }
      } else {
        segProg++;
        if (segProg >= gapLen) { inSeg = true; segProg = 0; segLen = 3 + Math.floor(rand() * 3); }
      }
    }
  }

  // ── Mechanic: shadow-portal ──
  let portalPairs: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> | undefined;
  if (mechanic === 'shadow-portal' && mainPath.length > 0) {
    const PORTAL_TILE = 29;
    const numPairs = floor <= 2 ? 2 : floor <= 4 ? 3 : 4;
    const pairIndices: number[] = [];
    for (let pi = 1; pi < numPairs; pi++) {
      const frac = pi / numPairs;
      const idx = Math.min(mainPath.length - 2, Math.max(2, Math.floor(mainPath.length * (frac * 0.6 + 0.2))));
      pairIndices.push(idx);
    }
    const pairPositions: { x: number; y: number }[] = [];
    for (const idx of pairIndices) {
      const [px2, py2] = mainPath[idx];
      pairPositions.push({ x: px2, y: py2 });
      // Widen corridor around portal
      const prevIdx = Math.max(0, idx - 1), nextIdx = Math.min(mainPath.length - 1, idx + 1);
      const [ppx, ppy] = mainPath[prevIdx], [pnx, pny] = mainPath[nextIdx];
      if (Math.abs(pnx - ppx) > Math.abs(pny - ppy)) {
        for (let di = -1; di <= 1; di++) {
          const ny3 = py2 + di;
          if (ny3 > 0 && ny3 < height - 1 && map[ny3]?.[px2] === 0) map[ny3][px2] = 1;
        }
      } else {
        for (let di = -1; di <= 1; di++) {
          const nx3 = px2 + di;
          if (nx3 > 0 && nx3 < width - 1 && map[py2]?.[nx3] === 0) map[py2][nx3] = 1;
        }
      }
    }
    portalPairs = [];
    for (let pi = 0; pi < pairPositions.length; pi++) {
      const idx = pairIndices[pi];
      const findBackward = (start: number, dir: number) => {
        for (let step = 1; step <= 6; step++) {
          const si = start + dir * step;
          if (si < 0 || si >= mainPath.length) continue;
          const [sx2, sy2] = mainPath[si];
          if (sx2 > 1 && sx2 < width - 2 && sy2 > 1 && sy2 < height - 2 && map[sy2][sx2] === 0) {
            return { x: sx2, y: sy2 };
          }
        }
        return null;
      };
      const posA = findBackward(idx, -1);
      const posB = findBackward(idx, 1);
      if (posA && posB) {
        map[posA.y][posA.x] = PORTAL_TILE;
        map[posB.y][posB.x] = PORTAL_TILE;
        portalPairs.push({ a: posA, b: posB });
      }
    }
  }

  const result: DungeonMapResult = { map, keyChests: [] };
  if (windCorridorDir) result.windCorridorDir = windCorridorDir;
  if (portalPairs && portalPairs.length > 0) result.portalPairs = portalPairs;
  return result;
}

/** Generate a perfect-maze floor for the maze-hunter mechanic */
function generateMazeHunterFloor(
  width: number, height: number, seed: number,
  floor: number, totalFloors: number,
  rand: () => number,
  isFirstFloor: boolean, isFinalFloor: boolean,
): DungeonMapResult {
  const mazeW = [19, 21, 23, 25, 27, 29][Math.min(floor - 1, 5)];
  const mazeH = mazeW;
  const maze = Array.from({ length: mazeH }, () => new Array(mazeW).fill(1));
  const midX = Math.floor(mazeW / 2);
  const bottomY = mazeH - 2;

  // Perfect maze generation via recursive backtracking
  const cellsX = Math.floor((mazeW - 1) / 2);
  const cellsY = Math.floor((mazeH - 1) / 2);
  const cellToTile = (cx2: number, cy2: number): [number, number] => [1 + cx2 * 2, 1 + cy2 * 2];
  const visited = new Set<number>();
  const stack: [number, number][] = [];
  const startCX = Math.floor(cellsX / 2), startCY = cellsY - 1;
  visited.add(startCY * cellsX + startCX);
  stack.push([startCX, startCY]);
  const [stx, sty] = cellToTile(startCX, startCY);
  maze[sty][stx] = 0;
  const dirs4: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  while (stack.length > 0) {
    const [cx2, cy2] = stack[stack.length - 1];
    const neighbors: [number, number, number, number][] = [];
    for (const [dx2, dy2] of dirs4) {
      const nx2 = cx2 + dx2, ny2 = cy2 + dy2;
      if (nx2 < 0 || nx2 >= cellsX || ny2 < 0 || ny2 >= cellsY) continue;
      if (visited.has(ny2 * cellsX + nx2)) continue;
      const [vx, vy] = cellToTile(cx2, cy2);
      neighbors.push([nx2, ny2, vx + dx2, vy + dy2]);
    }
    if (neighbors.length === 0) { stack.pop(); continue; }
    const [nx2, ny2, wx2, wy2] = neighbors[Math.floor(rand() * neighbors.length)];
    visited.add(ny2 * cellsX + nx2);
    stack.push([nx2, ny2]);
    if (wy2 >= 0 && wy2 < mazeH && wx2 >= 0 && wx2 < mazeW) maze[wy2][wx2] = 0;
    const [tx2, ty2] = cellToTile(nx2, ny2);
    if (ty2 >= 0 && ty2 < mazeH && tx2 >= 0 && tx2 < mazeW) maze[ty2][tx2] = 0;
  }

  // Entrance at bottom
  maze[mazeH - 1][midX] = 6;
  for (let by2 = mazeH - 2; by2 > 0 && maze[by2][midX] !== 0; by2--) maze[by2][midX] = 0;

  // BFS to find distances from entrance
  const dist = Array.from({ length: mazeH }, () => new Array(mazeW).fill(-1));
  const bfsQ: [number, number][] = [[midX, bottomY]];
  dist[bottomY][midX] = 0;
  let maxDist = 0;
  while (bfsQ.length > 0) {
    const [cx2, cy2] = bfsQ.shift()!;
    for (const [dx2, dy2] of dirs4) {
      const nx2 = cx2 + dx2, ny2 = cy2 + dy2;
      if (nx2 < 0 || nx2 >= mazeW || ny2 < 0 || ny2 >= mazeH) continue;
      if (dist[ny2][nx2] >= 0) continue;
      if (maze[ny2][nx2] !== 0) continue;
      dist[ny2][nx2] = dist[cy2][cx2] + 1;
      if (dist[ny2][nx2] > maxDist) maxDist = dist[ny2][nx2];
      bfsQ.push([nx2, ny2]);
    }
  }

  // Place goal (golden chest if final floor, else stairs-down)
  let goldenChestPos: { x: number; y: number } | undefined;
  if (isFinalFloor) {
    const minD = Math.floor(maxDist * 0.6);
    const candidates: [number, number][] = [];
    for (let fy = 1; fy < mazeH - 1; fy++) {
      for (let fx = 1; fx < mazeW - 1; fx++) {
        if (maze[fy][fx] === 0 && dist[fy][fx] >= minD) candidates.push([fx, fy]);
      }
    }
    if (candidates.length > 0) {
      const [gcx, gcy] = candidates[Math.floor(rand() * candidates.length)];
      maze[gcy][gcx] = 4;
      goldenChestPos = { x: gcx, y: gcy };
    }
    // Boss entrance at top
    const topW = Math.floor(mazeW / 2);
    let bosY = 2;
    for (let by2 = 1; by2 < Math.floor(mazeH / 3); by2++) {
      if (maze[by2][topW] === 0) { bosY = by2; break; }
    }
    maze[bosY][topW] = 7;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const bx2 = topW + dj, by3 = bosY + di;
        if (bx2 > 0 && bx2 < mazeW - 1 && by3 > 0 && by3 < mazeH - 1 && maze[by3][bx2] === 1) {
          maze[by3][bx2] = 0;
        }
      }
    }
    for (let sby = bosY + 2; sby < mazeH - 1 && maze[sby][topW] !== 0; sby++) maze[sby][topW] = 0;
    // Lock tile
    const lockY = Math.max(1, bosY - 2);
    maze[lockY][topW] = 10;
    if (bosY - 1 > 0 && bosY - 1 < mazeH - 1) maze[bosY - 1][topW] = 1;
  } else {
    // Stairs-down at farthest point
    const minD = Math.floor(maxDist * 0.7);
    const candidates: [number, number][] = [];
    for (let fy = 1; fy < mazeH - 1; fy++) {
      for (let fx = 1; fx < mazeW - 1; fx++) {
        if (maze[fy][fx] === 0 && dist[fy][fx] >= minD) candidates.push([fx, fy]);
      }
    }
    if (candidates.length > 0) {
      const [scx, scy] = candidates[Math.floor(rand() * candidates.length)];
      maze[scy][scx] = 9;
    } else {
      maze[1][midX] = 9;
    }
  }

  // Side exit on first floor
  if (isFirstFloor) {
    for (const di of [1, -1]) {
      const ex = midX + di;
      if (ex > 0 && ex < mazeW - 1 && maze[mazeH - 1][ex] === 1) {
        maze[mazeH - 1][ex] = 18;
        break;
      }
    }
  }

  // Extra dead-end chests
  const extraChests = 2 + (rand() > 0.5 ? 1 : 0);
  let chestsPlaced = 0;
  for (let attempt = 0; attempt < 300 && chestsPlaced < extraChests; attempt++) {
    const ex = 1 + Math.floor(rand() * (mazeW - 2));
    const ey = 1 + Math.floor(rand() * (mazeH - 2));
    if (maze[ey][ex] !== 0) continue;
    let openNeighbors = 0;
    for (const [dx2, dy2] of dirs4) {
      const t2 = maze[ey + dy2]?.[ex + dx2];
      if (t2 === 0 || t2 === 24 || t2 === 4 || t2 === 6 || t2 === 9) openNeighbors++;
    }
    if (openNeighbors === 1) { maze[ey][ex] = 4; chestsPlaced++; }
  }

  // Add maze-wall tiles (24) to some dead-end walls for visual variety
  let wallCount = 0;
  for (let fy = 1; fy < mazeH - 1; fy++) {
    for (let fx = 1; fx < mazeW - 1; fx++) {
      if (maze[fy][fx] === 0 && (wallCount++ % 8 === 0)) {
        for (const [dx2, dy2] of dirs4) {
          const nx2 = fx + dx2, ny2 = fy + dy2;
          if (nx2 > 0 && nx2 < mazeW - 1 && ny2 > 0 && ny2 < mazeH - 1 && maze[ny2][nx2] === 1) {
            maze[ny2][nx2] = 24; break;
          }
        }
      }
    }
  }

  const result: DungeonMapResult = { map: maze, keyChests: [] };
  if (goldenChestPos) result.goldenChestPos = goldenChestPos;
  return result;
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
