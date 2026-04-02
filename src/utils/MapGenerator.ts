// Procedural tilemap generator — creates maps at runtime
// Returns 2D arrays of tile indices matching our generated tilesets

// Overworld tiles: 0=grass, 1=path, 2=water, 3=tree, 4=mountain, 5=bridge, 6=town, 7=cave, 8=castle,
//   9=portal, 10=hauntedPortal, 11=signpost, 12=stormNest, 13=darkPath, 14=wallBarrier, 15=gateCave,
//   16=frozenLake, 17=mist, 18=desert, 19=specialCave, 20=desertSignpost
// Town tiles: 0=floor, 1=wall, 2=house-roof, 3=grass, 4=water, 5=path, 6=save, 7=exit
//   8=shop-awning, 9=house-wall-window, 10=house-wall-door, 11=shop-wall-display, 12=shop-wall-door
//   13=clinic-roof, 14=clinic-wall-window, 15=clinic-wall-door
// Dungeon tiles: 0=floor, 1=wall, 2=cracked, 3=door, 4=treasure, 5=lava, 6=stairs-up, 7=boss
//   8=opened-chest, 9=stairs-down, 10=boss-exit-portal, 11=boss-warp-portal, 12=boss-exit-stairs
//   14=save, 15=locked-door, 17=hidden-door, 18=sign, 19=unlockedDoor, 20=coloredPillar
//   23=crystalPillar, 24=crumble, 25=windTile/iceTile, 26=sandTrapCenter, 27=sandTrapRing, 28=iceWall
//   29=shadowPortal, 30=banditTrap, 31=banditBear

// ─── Global signpost data (populated by overworld generator) ───
export interface SignpostData {
  x: number;
  y: number;
  textKey: string;
  branches: { arrow: string; mapIds: string[] }[];
}
export const overworldSignposts: SignpostData[] = [];

// ─── Dungeon result types ───
export interface DungeonResult {
  map: number[][];
  keyChests: { x: number; y: number }[];
  hiddenRoomChests?: string[];
  correctExitY?: number;
  goldenChestPos?: { x: number; y: number };
  pillarPositions?: { x: number; y: number; colorIdx: number }[];
  pillarSequence?: number[];
  pillarSequenceColors?: string[];
  patrolWaypoints?: { x: number; y: number }[][];
  mimicChests?: string[];
  windCorridorDir?: { dx: number; dy: number };
  portalPairs?: { a: { x: number; y: number }; b: { x: number; y: number } }[];
}

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

// ─── Overworld path helper: straight L-path between two points, 3 tiles wide ───
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

  const wide: [number, number][] = [];
  for (const [px, py] of points) {
    wide.push([px, py]);
    wide.push([px + 1, py]);
    wide.push([px, py + 1]);
  }
  return wide;
}

// ─── 320×400 Overworld with 4 elliptical landmass regions ───
export function generateOverworldMap(width: number, height: number): number[][] {
  const rand = seededRandom(42);
  const map: number[][] = [];

  // Elliptical region test: is (px,py) inside the given region?
  const inRegion = (px: number, py: number, cx: number, cy: number, hw: number, hh: number, seed: number): boolean => {
    const nx = (px - cx) / hw;
    const ny = (py - cy) / hh;
    const distSq = nx * nx + ny * ny;
    const noise = noiseAt(px, py, 0.04, seed) * 0.25 + noiseAt(px, py, 0.08, seed + 100) * 0.15;
    return distSq + noise < 1;
  };

  // 4 landmass regions
  const regionSW = { cx: 85, cy: 305, hw: 65, hh: 75, seed: 1 };   // Act 1
  const regionSE = { cx: 235, cy: 305, hw: 65, hh: 75, seed: 2 };   // Act 2
  const regionNE = { cx: 235, cy: 110, hw: 65, hh: 90, seed: 3 };   // Act 3/4
  const regionNW = { cx: 85, cy: 110, hw: 65, hh: 90, seed: 4 };    // Act 5

  // ── Phase 1: Base terrain ──
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      // Water borders (2 tiles wide)
      if (x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2) {
        row.push(2);
        continue;
      }

      const inSW = inRegion(x, y, regionSW.cx, regionSW.cy, regionSW.hw, regionSW.hh, regionSW.seed);
      const inSE = inRegion(x, y, regionSE.cx, regionSE.cy, regionSE.hw, regionSE.hh, regionSE.seed);
      const inNE = inRegion(x, y, regionNE.cx, regionNE.cy, regionNE.hw, regionNE.hh, regionNE.seed);
      const inNW = inRegion(x, y, regionNW.cx, regionNW.cy, regionNW.hw, regionNW.hh, regionNW.seed);

      // Not in any region → water
      if (!inSW && !inSE && !inNE && !inNW) {
        row.push(2);
        continue;
      }

      // ── Act 1 (SW region) ──
      if (inSW) {
        // Forest patches near Greenhollow
        if (x > 60 && x < 90 && y > 310 && y < 340 && rand() > 0.35) {
          row.push(3); continue;
        }
        // Lighter forest east
        if (x > 100 && x < 135 && y > 290 && y < 320 && rand() > 0.7) {
          row.push(3); continue;
        }
        // Mountains at edges
        if (x > 135 && y > 260 && y < 360 && noiseAt(x, y, 0.12, 10) > 0.8 && rand() > 0.5) {
          row.push(4); continue;
        }
        // Small lake near Millbrook
        if (Math.sqrt((x - 95) ** 2 + (y - 330) ** 2) < 5 + noiseAt(x, y, 0.4, 4) * 2) {
          row.push(2); continue;
        }
        // Scattered trees
        if (rand() > 0.9) { row.push(3); continue; }
        row.push(0);
        continue;
      }

      // ── Act 2 (SE region) ──
      if (inSE) {
        // River barrier between Act 2 north/south sections
        if (y >= 275 && y <= 298 && x >= 170 && x <= 300 && !(x >= 221 && x <= 222)) {
          const riverCenter = 286 + noiseAt(x, 0, 0.08, 5.5) * 3;
          const riverHalfWidth = 3.5 + noiseAt(x, 0, 0.12, 6.5) * 2.5;
          const distFromCenter = Math.abs(y - riverCenter);
          if (distFromCenter < riverHalfWidth) {
            row.push(4); continue;
          }
          if (distFromCenter < riverHalfWidth + 2 && noiseAt(x, y, 0.2, 3.3) > 0.3 && rand() > 0.4) {
            row.push(4); continue;
          }
        }
        // Southern part (below river)
        if (y > 294) {
          if (x > 210 && x < 270 && y > 330 && y < 365 && rand() > 0.5) {
            row.push(3); continue;
          }
          if (rand() > 0.88) { row.push(3); continue; }
          row.push(0); continue;
        }
        // Barrier wall column (wall barrier tile 14)
        if (x >= 238 && x <= 242 && y >= 230 && y <= 280) {
          const leftGap = x <= 239 && Math.abs(y - 248) <= 1;
          const rightGap = x >= 241 && Math.abs(y - 248) <= 1;
          if (!leftGap && !rightGap) {
            row.push(14); continue;
          }
        }
        // Dense forest flanking barrier
        if ((x >= 234 && x <= 237 || x >= 243 && x <= 246) && y >= 230 && y <= 280 && rand() > 0.4) {
          row.push(3); continue;
        }
        // Frozen Lake water body
        const lakeDist = Math.sqrt((x - 200) ** 2 + (y - 265) ** 2);
        const lakeNoise = noiseAt(x, y, 0.25, 6);
        if (lakeDist < 8 + lakeNoise * 2.5 && lakeDist > 1.5) {
          row.push(2); continue;
        }
        // Mountain/water patches near frozen lake
        if (x > 185 && x < 215 && y > 258 && y < 275 && noiseAt(x, y, 0.12, 7) > 0.45 && rand() > 0.4) {
          row.push(4); continue;
        }
        // Northern trees
        if (y < 275 && y > 230 && rand() > 0.88) { row.push(3); continue; }
        if (rand() > 0.85) { row.push(3); continue; }
        row.push(0);
        continue;
      }

      // ── Act 3/4 (NE region) ──
      if (inNE) {
        // Western portion: desert/volcanic terrain
        if (x < 210) {
          if (noiseAt(x, y, 0.1, 3) > 0.5 && rand() > 0.3) {
            row.push(4); continue;
          }
          if (x < 200 && y < 75 && noiseAt(x, y, 0.2, 5) > 0.9 && rand() > 0.4) {
            row.push(2); continue;
          }
        }
        // Water moat around Oasis
        const oasisDist = Math.sqrt((x - 220) ** 2 + (y - 150) ** 2);
        if (oasisDist < 12) {
          if (oasisDist > 8 && rand() > 0.6) { row.push(3); continue; }
          if (oasisDist > 5 && oasisDist < 8 && rand() > 0.5) { row.push(2); continue; }
          row.push(0); continue;
        }
        // Northern horizontal river
        if (y >= 75 && y <= 130 && x >= 165 && x <= 290) {
          const riverCenter = 87 + (x < 230 ? (230 - x) * 0.35 : 0) + noiseAt(x, 0, 0.09, 17) * 3;
          const riverHalfWidth = 5 + noiseAt(x, 0, 0.11, 18) * 2;
          const distFromCenter = Math.abs(y - riverCenter);
          if (distFromCenter < riverHalfWidth) {
            row.push(4); continue;
          }
          if (distFromCenter < riverHalfWidth + 2 && noiseAt(x, y, 0.22, 19) > 0.2 && rand() > 0.35) {
            row.push(4); continue;
          }
        }
        // Eastern vertical river
        if (y >= 112 && y <= 194 && x >= 248 && x <= 292) {
          const riverCenter = 268 + noiseAt(0, y, 0.09, 20) * 5;
          const riverHalfWidth = 11 + noiseAt(0, y, 0.11, 21) * 4;
          const distFromCenter = Math.abs(x - riverCenter);
          if (distFromCenter < riverHalfWidth) {
            row.push(4); continue;
          }
          if (distFromCenter < riverHalfWidth + 3 && noiseAt(x, y, 0.22, 22) > 0.2 && rand() > 0.35) {
            row.push(4); continue;
          }
        }
        // Swamp region between rivers
        if (y >= 85 && y <= 117 && x >= 165 && x <= 245) {
          const swampNoise = noiseAt(x, y, 0.13, 36);
          if (swampNoise > 0.25 && rand() > 0.15) {
            row.push(4); continue;
          }
          if (swampNoise > 0.08 && rand() > 0.65) {
            row.push(4); continue;
          }
        }
        // Second horizontal river (lower)
        if (y >= 107 && y <= 128 && x >= 165 && x <= 290) {
          const riverCenter = 117 + noiseAt(x, 0, 0.09, 33) * 3;
          const riverHalfWidth = 6 + noiseAt(x, 0, 0.11, 34) * 2;
          const distFromCenter = Math.abs(y - riverCenter);
          if (distFromCenter < riverHalfWidth) {
            row.push(4); continue;
          }
          if (distFromCenter < riverHalfWidth + 2 && noiseAt(x, y, 0.2, 35) > 0.2 && rand() > 0.35) {
            row.push(4); continue;
          }
        }
        // Third horizontal river (middle)
        if (y >= 124 && y <= 152 && x >= 193 && x <= 268) {
          const riverCenter = 137 + noiseAt(x, 0, 0.1, 23) * 4;
          const riverHalfWidth = 6 + noiseAt(x, 0, 0.12, 24) * 3;
          const distFromCenter = Math.abs(y - riverCenter);
          const taperFactor = x < 225 ? Math.max(0, (x - 193) / 32) : 1;
          if (taperFactor > 0.1 && distFromCenter < riverHalfWidth * taperFactor) {
            row.push(4); continue;
          }
          const threshold = 0.25 + (1 - taperFactor) * 0.45;
          if (distFromCenter < riverHalfWidth + 3 && noiseAt(x, y, 0.18, 37) > threshold && rand() > 0.35) {
            row.push(4); continue;
          }
        }
        // Desert sand tiles for central desert
        if (y > 90 && y < 200) {
          if (noiseAt(x, y, 0.15, 9) > 0.7 && rand() > 0.5) {
            row.push(4); continue;
          }
          row.push(18); continue;
        }
        row.push(0);
        continue;
      }

      // ── Act 5 (NW region) ──
      if (inNW) {
        // Northern mountains (dense)
        if (y < 80) {
          row.push(4); continue;
        }
        // Scattered forest
        if (x > 40 && x < 130 && y > 90 && y < 170 && rand() > 0.7) {
          row.push(3); continue;
        }
        // Mountain patches
        if (noiseAt(x, y, 0.08, 6) > 0.7 && rand() > 0.4) {
          row.push(4); continue;
        }
        // Scattered trees
        if (rand() > 0.88) { row.push(3); continue; }
        row.push(0);
        continue;
      }

      row.push(0);
    }
    map.push(row);
  }

  // ── Phase 2: Carve paths between key locations ──
  const carvePaths = (tiles: [number, number][]) => {
    for (const [px, py] of tiles) {
      if (px >= 0 && px < width && py >= 0 && py < height) {
        const t = map[py][px];
        if (t === 6 || t === 7 || t === 8 || t === 9 || t === 10 || t === 12) continue;
        map[py][px] = 1;
      }
    }
  };

  // Act 1 paths
  carvePaths([
    ...pathBetween(60, 340, 45, 350), ...pathBetween(60, 340, 80, 310),
    ...pathBetween(60, 340, 100, 320), ...pathBetween(100, 320, 130, 290),
    ...pathBetween(130, 290, 140, 350), ...pathBetween(130, 290, 120, 260),
    ...pathBetween(130, 290, 148, 295),
  ]);
  // Act 2 southern paths
  carvePaths([
    ...pathBetween(172, 305, 200, 320), ...pathBetween(200, 320, 185, 335),
    ...pathBetween(200, 320, 280, 295), ...pathBetween(200, 320, 222, 295),
  ]);
  // Act 2 bridge path
  carvePaths([...pathBetween(222, 295, 222, 275)]);
  // Act 2 northern paths
  carvePaths([
    ...pathBetween(222, 275, 222, 262), ...pathBetween(222, 262, 200, 265),
    ...pathBetween(222, 262, 238, 248), ...pathBetween(242, 248, 252, 242),
    ...pathBetween(252, 242, 260, 234),
  ]);
  // Act 3/4 paths
  carvePaths([
    ...pathBetween(260, 198, 270, 120), ...pathBetween(270, 120, 220, 150),
    ...pathBetween(220, 150, 225, 160), ...pathBetween(220, 150, 250, 140),
    ...pathBetween(270, 120, 278, 93), ...pathBetween(278, 93, 242, 93),
    ...pathBetween(278, 93, 278, 82), ...pathBetween(242, 81, 195, 80),
    ...pathBetween(195, 80, 202, 48), ...pathBetween(195, 80, 185, 48),
    ...pathBetween(195, 80, 195, 110), ...pathBetween(195, 110, 172, 110),
  ]);
  // Act 5 paths
  carvePaths([
    ...pathBetween(148, 110, 100, 150), ...pathBetween(100, 150, 70, 100),
    ...pathBetween(70, 100, 80, 60), ...pathBetween(70, 100, 120, 70),
    ...pathBetween(70, 100, 85, 30),
  ]);

  // ── Phase 3: Act 5 mountain maze ──
  const mazeTop = 22, mazeBot = 79, mazeLeft = 22, mazeRight = 148;
  const mazeSeeds: [number, number][] = [];
  for (let y = mazeTop; y <= mazeBot; y++) {
    for (let x = mazeLeft; x < mazeRight; x++) {
      if (map[y][x] === 1 || map[y][x] === 0) mazeSeeds.push([x, y]);
    }
  }
  // Random-walk corridors
  for (let branch = 0; branch < 200; branch++) {
    if (mazeSeeds.length === 0) break;
    const startIdx = Math.floor(rand() * mazeSeeds.length);
    let [cx, cy] = mazeSeeds[startIdx];
    const primaryDir = Math.floor(rand() * 4);
    const walkLen = 10 + Math.floor(rand() * 40);
    for (let step = 0; step < walkLen; step++) {
      const dir = rand() > 0.45 ? primaryDir : Math.floor(rand() * 4);
      const dx = [0, 0, -1, 1][dir];
      const dy = [-1, 1, 0, 0][dir];
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= mazeLeft && nx < mazeRight && ny >= mazeTop && ny <= mazeBot) {
        cx = nx;
        cy = ny;
        if (map[cy][cx] === 4) {
          map[cy][cx] = 0;
          mazeSeeds.push([cx, cy]);
        }
      }
    }
  }

  // Winding maze paths to 4 portal positions
  const carve = (cx: number, cy: number) => {
    if (cx >= mazeLeft && cx < mazeRight && cy >= mazeTop && cy <= mazeBot && map[cy][cx] === 4) {
      map[cy][cx] = 0;
    }
  };
  const carveMazePath = (sx: number, sy: number, ex: number, ey: number) => {
    let x = sx, y = sy;
    let safety = 0;
    while ((x !== ex || y !== ey) && safety++ < 800) {
      carve(x, y);
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
      x = Math.max(mazeLeft, Math.min(mazeRight - 1, x));
      y = Math.max(mazeTop, Math.min(mazeBot, y));
    }
    carve(ex, ey);
  };
  carveMazePath(70, 70, 40, 50);
  carveMazePath(100, 70, 130, 40);
  carveMazePath(70, 100, 50, 130);
  carveMazePath(100, 100, 120, 140);

  // ── Phase 4: Demon Castle island ──
  const castleX = 85, castleY = 30;
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const ix = castleX + dx;
      const iy = castleY + dy;
      if (ix >= 2 && ix < width - 2 && iy >= 2 && iy < height - 2) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 5 && dist <= 7.5) {
          map[iy][ix] = 2;
        } else if (dist < 5) {
          map[iy][ix] = 0;
        }
      }
    }
  }
  // Land bridge south of castle island
  for (let y = 35; y <= 50; y++) {
    if (y >= 2 && y < height - 2) {
      if ((map[y][castleX] === 4 || map[y][castleX] === 2)) map[y][castleX] = 1;
      if ((map[y][castleX + 1] === 4 || map[y][castleX + 1] === 2)) map[y][castleX + 1] = 1;
    }
  }

  // ── Phase 5: Inter-region land bridges ──
  // Act 1 ↔ Act 2 bridge (south)
  for (let dy = -3; dy <= 3; dy++) {
    const bridgeY = 295 + dy;
    if (bridgeY >= 2 && bridgeY < height - 2) {
      for (let dx = -2; dx <= 0; dx++) {
        const bx = 148 + dx;
        if (bx >= 2 && map[bridgeY][bx] === 2) map[bridgeY][bx] = 0;
      }
    }
    const bridgeY2 = 305 + dy;
    if (bridgeY2 >= 2 && bridgeY2 < height - 2) {
      for (let dx = 0; dx <= 2; dx++) {
        const bx = 172 + dx;
        if (bx < width - 2 && map[bridgeY2][bx] === 2) map[bridgeY2][bx] = 0;
      }
    }
  }
  // Act 2 ↔ Act 3/4 bridge (east)
  for (let dy = -3; dy <= 3; dy++) {
    const bridgeX = 260 + dy;
    if (bridgeX >= 2 && bridgeX < width - 2) {
      for (let dx = 0; dx <= 2; dx++) {
        const by = 235 - dx;
        if (by >= 2 && map[by][bridgeX] === 2) map[by][bridgeX] = 0;
      }
      for (let dx = 0; dx <= 2; dx++) {
        const by = 198 + dx;
        if (by < height - 2 && map[by][bridgeX] === 2) map[by][bridgeX] = 0;
      }
    }
  }
  // Act 3/4 ↔ Act 5 bridge (north)
  for (let dy = -3; dy <= 3; dy++) {
    const bridgeY = 110 + dy;
    if (bridgeY >= 2 && bridgeY < height - 2) {
      for (let dx = 0; dx <= 2; dx++) {
        const bx = 172 + dx;
        if (bx < width - 2 && map[bridgeY][bx] === 2) map[bridgeY][bx] = 0;
      }
      for (let dx = -2; dx <= 0; dx++) {
        const bx = 148 + dx;
        if (bx >= 2 && map[bridgeY][bx] === 2) map[bridgeY][bx] = 0;
      }
    }
  }

  // ── Phase 6: Place landmarks ──
  const towns: [number, number][] = [
    [60, 340], [100, 320], [130, 290],
    [200, 320], [222, 262], [252, 242],
    [220, 150], [270, 120], [195, 80],
    [100, 150], [70, 100],
  ];
  for (const [tx, ty] of towns) {
    if (ty >= 0 && ty < height && tx >= 0 && tx < width) map[ty][tx] = 6;
  }

  const dungeons: [number, number][] = [
    [45, 350], [80, 310], [140, 350], [120, 260],
    [185, 335], [260, 234],
    [225, 160], [298, 120], [278, 82],
    [202, 48], [242, 93], [242, 81], [185, 48],
    [172, 110], [148, 110],
    [80, 60], [120, 70],
  ];
  for (const [dx, dy] of dungeons) {
    if (dy >= 0 && dy < height && dx >= 0 && dx < width) map[dy][dx] = 7;
  }

  // Special cave tile (19) for desert oasis
  const specialCaves: [number, number][] = [[250, 140]];
  for (const [sx, sy] of specialCaves) {
    if (sy >= 0 && sy < height && sx >= 0 && sx < width) map[sy][sx] = 19;
  }

  // Castle
  map[castleY][castleX] = 8;

  // Portals
  const portals: [number, number][] = [[40, 50], [130, 40], [50, 130], [120, 140]];
  for (const [px, py] of portals) {
    if (py >= 0 && py < height && px >= 0 && px < width) map[py][px] = 9;
  }

  // Haunted portals
  const hauntedPortals: [number, number][] = [[238, 248], [242, 248]];
  for (const [hx, hy] of hauntedPortals) {
    if (hy >= 0 && hy < height && hx >= 0 && hx < width) map[hy][hx] = 10;
  }

  // Storm Nest marker
  const stormNests: [number, number][] = [[280, 295]];
  for (const [sx, sy] of stormNests) {
    if (sy >= 0 && sy < height && sx >= 0 && sx < width) map[sy][sx] = 12;
  }

  // Gate caves (tile 15)
  const gateCaves: [number, number][] = [[148, 295], [172, 305]];
  for (const [gx, gy] of gateCaves) {
    if (gy >= 0 && gy < height && gx >= 0 && gx < width) map[gy][gx] = 15;
  }

  // Frozen Lake (tile 16)
  const frozenLakes: [number, number][] = [[200, 265]];
  for (const [fx, fy] of frozenLakes) {
    if (fy >= 0 && fy < height && fx >= 0 && fx < width) map[fy][fx] = 16;
  }

  // ── Phase 7: Clear tiles around all landmarks ──
  const allLandmarks: [number, number][] = [
    ...towns, ...dungeons, ...specialCaves,
    [castleX, castleY], ...portals, ...hauntedPortals,
    ...stormNests, ...gateCaves, ...frozenLakes,
  ];
  for (const [lx, ly] of allLandmarks) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        const ax = lx + dx;
        const ay = ly + dy;
        if (ax >= 2 && ax < width - 2 && ay >= 2 && ay < height - 2) {
          const t = map[ay][ax];
          if (t === 6 || t === 7 || t === 8 || t === 9 || t === 10 || t === 12 || t === 15 || t === 16 || t === 19) continue;
          if (t === 4 || t === 2) map[ay][ax] = 1;
        }
      }
    }
  }

  // ── Phase 8: Water bodies and barriers ──
  // Purge stray bridge tiles in strait between regions
  for (let y = 270; y <= 360; y++) {
    for (let x = 90; x <= 155; x++) {
      if (y >= 0 && y < height && x >= 0 && x < width && map[y][x] === 5) {
        let hasWaterNeighbor = false;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
          const nx = x + dx, ny = y + dy;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width && map[ny][nx] === 2) {
            hasWaterNeighbor = true;
            break;
          }
        }
        if (!hasWaterNeighbor) map[y][x] = 1;
      }
    }
  }

  // Water barrier between Act 1 and Act 2
  for (let y = 290; y <= 310; y++) {
    for (let x = 150; x <= 170; x++) {
      if (y >= 2 && y < height - 2 && x >= 2 && x < width - 2 &&
          map[y][x] !== 7 && map[y][x] !== 6 && map[y][x] !== 8) {
        map[y][x] = 2;
      }
    }
  }
  // Re-stamp gate caves and paths around them
  map[295][148] = 7; map[305][172] = 7;
  map[296][148] = 1; map[294][148] = 1;
  map[306][172] = 1; map[304][172] = 1;

  // Diamond-shaped water body between Act 2 north and Act 3/4
  for (let y = 202; y <= 231; y++) {
    const distFromCenter = Math.abs(y - 216);
    const halfWidth = Math.max(3, 7 - Math.floor(distFromCenter / 4));
    for (let x = 260 - halfWidth; x <= 260 + halfWidth; x++) {
      if (y >= 2 && y < height - 2 && x >= 2 && x < width - 2 &&
          map[y][x] !== 7 && map[y][x] !== 6 && map[y][x] !== 8) {
        map[y][x] = 2;
      }
    }
  }
  // Extra water at top of diamond
  for (let x = 257; x <= 263; x++) {
    if (map[232]?.[x] !== undefined && map[232][x] !== 7) map[232][x] = 2;
    if (map[233]?.[x] !== undefined && map[233][x] !== 7) map[233][x] = 2;
  }
  // Mountain border on diamond
  for (let y = 232; y <= 235; y++) {
    for (const x of [256, 257, 263, 264]) {
      if (map[y]?.[x] !== undefined && map[y][x] !== 7 && map[y][x] !== 2) map[y][x] = 4;
    }
  }
  if (map[235]?.[260] !== undefined) map[235][260] = 1;
  if (map[198]?.[260] !== undefined) map[198][260] = 7;
  // Clear area around Act 2→3 dungeon entrance
  for (let y = 194; y <= 202; y++) {
    for (let x = 258; x <= 262; x++) {
      if (map[y]?.[x] !== undefined && map[y][x] !== 7 && map[y][x] !== 6 && map[y][x] !== 8 && map[y][x] !== 10) {
        map[y][x] = 1;
      }
    }
  }
  map[198][260] = 7;

  // Water barrier between Act 3/4 and Act 5
  for (let y = 105; y <= 115; y++) {
    for (let x = 150; x <= 170; x++) {
      if (y >= 2 && y < height - 2 && x >= 2 && x < width - 2 &&
          map[y][x] !== 7 && map[y][x] !== 6 && map[y][x] !== 8) {
        map[y][x] = 2;
      }
    }
  }
  map[110][172] = 7; map[110][148] = 7;
  map[111][172] = 1; map[109][172] = 1;
  map[111][148] = 1; map[109][148] = 1;

  // Scorched Ruins dungeon at 278,82
  if (map[82]?.[278] !== undefined) {
    map[82][278] = 7;
    if (map[83]?.[278] !== undefined && map[83][278] !== 7 && map[83][278] !== 6) map[83][278] = 1;
  }

  // Elliptical water body between Act 2 south and Act 1 east edge
  for (let y = 275; y <= 325; y++) {
    for (let x = 84; x <= 100; x++) {
      if (y < 2 || y >= height - 2 || x < 2 || x >= width - 2) continue;
      const nx = (x - 92) / 8;
      const ny = (y - 300) / 25;
      const distSq = nx * nx + ny * ny;
      const noise = noiseAt(x, y, 0.15, 77) * 0.18;
      if (distSq + noise < 1 && map[y][x] !== 7 && map[y][x] !== 6 && map[y][x] !== 8 && map[y][x] !== 9 && map[y][x] !== 10) {
        map[y][x] = 2;
      }
    }
  }

  // Path south from Whisper Woods
  for (let y = 311; y <= 315; y++) {
    if (y < height) map[y][80] = 1;
    if (y < height && 81 < width) map[y][81] = 1;
  }

  // ── Phase 9: Re-stamp ALL landmarks (water/barriers may have overwritten them) ──
  for (const [tx, ty] of towns) {
    if (ty >= 0 && ty < height && tx >= 0 && tx < width) map[ty][tx] = 6;
  }
  for (const [dx, dy] of dungeons) {
    if (dy >= 0 && dy < height && dx >= 0 && dx < width) map[dy][dx] = 7;
  }
  map[castleY][castleX] = 8;
  for (const [px, py] of portals) {
    if (py >= 0 && py < height && px >= 0 && px < width) map[py][px] = 9;
  }
  for (const [hx, hy] of hauntedPortals) {
    if (hy >= 0 && hy < height && hx >= 0 && hx < width) map[hy][hx] = 10;
  }
  for (const [sx, sy] of stormNests) {
    if (sy >= 0 && sy < height && sx >= 0 && sx < width) map[sy][sx] = 12;
  }
  for (const [gx, gy] of gateCaves) {
    if (gy >= 0 && gy < height && gx >= 0 && gx < width) map[gy][gx] = 15;
  }
  for (const [fx, fy] of frozenLakes) {
    if (fy >= 0 && fy < height && fx >= 0 && fx < width) map[fy][fx] = 16;
  }
  for (const [sx, sy] of specialCaves) {
    if (sy >= 0 && sy < height && sx >= 0 && sx < width) map[sy][sx] = 19;
  }

  // ── Phase 10: Mist zone around Frozen Lake ──
  const mistCx = 200, mistCy = 265;
  const mistInner = 8, mistMid = 14, mistOuter = 20;
  for (let y = mistCy - mistOuter; y <= mistCy + mistOuter; y++) {
    for (let x = mistCx - mistOuter; x <= mistCx + mistOuter; x++) {
      if (x < 2 || x >= width - 2 || y < 2 || y >= height - 2) continue;
      const dist = Math.sqrt((x - mistCx) ** 2 + (y - mistCy) ** 2);
      if (dist > mistOuter) continue;
      const t = map[y][x];
      if (t !== 0 && t !== 1 && t !== 3) continue;
      let chance: number;
      if (dist <= mistInner) {
        chance = 1;
      } else if (dist <= mistMid) {
        chance = 1 - (dist - mistInner) / (mistMid - mistInner) * 0.4;
      } else {
        chance = 0.6 - (dist - mistMid) / (mistOuter - mistMid) * 0.6;
      }
      if (rand() < chance) map[y][x] = 17;
    }
  }

  // ── Phase 11: Auto-generate signposts at path junctions ──
  overworldSignposts.length = 0;

  interface PathBranch {
    origin: [number, number];
    paths: { mapId: string; dest: [number, number] }[];
  }

  const routeDefs: PathBranch[] = [
    { origin: [60, 340], paths: [
      { mapId: 'sunkenCellar', dest: [45, 350] },
      { mapId: 'whisperingWoodsCave', dest: [80, 310] },
      { mapId: 'millbrook', dest: [100, 320] },
    ]},
    { origin: [100, 320], paths: [
      { mapId: 'greenhollow', dest: [60, 340] },
      { mapId: 'portSapphire', dest: [130, 290] },
    ]},
    { origin: [130, 290], paths: [
      { mapId: 'millbrook', dest: [100, 320] },
      { mapId: 'coastalReef', dest: [140, 350] },
      { mapId: 'mistyGrotto', dest: [120, 260] },
      { mapId: 'crystalCave', dest: [148, 295] },
    ]},
    { origin: [200, 320], paths: [
      { mapId: 'ironMine', dest: [185, 335] },
      { mapId: 'stormNest', dest: [280, 295] },
      { mapId: 'frostwatch', dest: [222, 295] },
    ]},
    { origin: [222, 262], paths: [
      { mapId: 'frozenLake', dest: [200, 265] },
      { mapId: 'hauntedForest', dest: [238, 248] },
    ]},
    { origin: [252, 242], paths: [
      { mapId: 'shadowCave', dest: [260, 234] },
    ]},
    { origin: [270, 120], paths: [
      { mapId: 'oasisHaven', dest: [220, 150] },
      { mapId: 'scorchedRuins', dest: [278, 82] },
    ]},
    { origin: [278, 93], paths: [
      { mapId: 'scorchedRuins', dest: [278, 82] },
      { mapId: 'magmaTunnels', dest: [242, 93] },
    ]},
    { origin: [195, 80], paths: [
      { mapId: 'emberMines', dest: [202, 48] },
      { mapId: 'obsidianCavern', dest: [185, 48] },
      { mapId: 'volcanicForge', dest: [195, 110] },
    ]},
    { origin: [100, 150], paths: [
      { mapId: 'havensEdge', dest: [70, 100] },
      { mapId: 'volcanicForge', dest: [148, 110] },
    ]},
    { origin: [70, 100], paths: [
      { mapId: 'lastBastion', dest: [100, 150] },
      { mapId: 'demonBarracks', dest: [80, 60] },
      { mapId: 'voidRift', dest: [120, 70] },
      { mapId: 'demonCastle', dest: [85, 30] },
    ]},
  ];

  const getPathTiles = (ox: number, oy: number, dx: number, dy: number) => pathBetween(ox, oy, dx, dy);
  const usedSignLocations = new Set<string>();
  const walkableTiles = new Set([1, 6, 7, 8, 9, 10, 11, 20]);
  const isWalkableAt = (px: number, py: number) => px >= 0 && px < width && py >= 0 && py < height && walkableTiles.has(map[py][px]);

  const nearHubOverrides: Record<string, { nearHub: string; arrow: string }[]> = {
    greenhollow: [{ nearHub: '100,320', arrow: '↓' }],
    millbrook: [{ nearHub: '130,290', arrow: '↓' }],
    scorchedRuins: [{ nearHub: '270,120', arrow: '↑' }],
    volcanicForge: [{ nearHub: '195,80', arrow: '↓' }],
  };

  const candidateSignposts: {
    x: number; y: number;
    branches: { arrow: string; mapIds: string[] }[];
  }[] = [];

  for (const route of routeDefs) {
    const [originX, originY] = route.origin;
    const pathsWithTiles = route.paths.map(p => ({
      mapId: p.mapId,
      tiles: getPathTiles(originX, originY, p.dest[0], p.dest[1]),
    }));
    if (pathsWithTiles.length < 2) continue;

    const forkPoints = new Map<string, { x: number; y: number; dirPerDest: Map<string, string> }>();

    for (let i = 0; i < pathsWithTiles.length; i++) {
      for (let j = i + 1; j < pathsWithTiles.length; j++) {
        const tilesA = pathsWithTiles[i].tiles;
        const tilesB = pathsWithTiles[j].tiles;
        let lastShared = 0;
        const minLen = Math.min(tilesA.length, tilesB.length);
        for (let k = 0; k < minLen; k++) {
          if (tilesA[k][0] === tilesB[k][0] && tilesA[k][1] === tilesB[k][1]) {
            lastShared = k;
          } else break;
        }
        const [fx, fy] = tilesA[lastShared];
        const key = `${fx},${fy}`;
        if (!forkPoints.has(key)) {
          forkPoints.set(key, { x: fx, y: fy, dirPerDest: new Map() });
        }
        const fp = forkPoints.get(key)!;
        if (lastShared + 1 < tilesA.length) {
          const [nx, ny] = tilesA[lastShared + 1];
          const sdx = Math.sign(nx - fx);
          const sdy = Math.sign(ny - fy);
          const arrow = sdx === 1 ? '→' : sdx === -1 ? '←' : sdy === -1 ? '↑' : '↓';
          fp.dirPerDest.set(pathsWithTiles[i].mapId, arrow);
        }
        if (lastShared + 1 < tilesB.length) {
          const [nx, ny] = tilesB[lastShared + 1];
          const sdx = Math.sign(nx - fx);
          const sdy = Math.sign(ny - fy);
          const arrow = sdx === 1 ? '→' : sdx === -1 ? '←' : sdy === -1 ? '↑' : '↓';
          fp.dirPerDest.set(pathsWithTiles[j].mapId, arrow);
        }
      }
    }

    for (const [, fp] of forkPoints) {
      if (fp.dirPerDest.size < 2) continue;
      if (fp.x === originX && fp.y === originY) continue;
      if (Math.abs(fp.x - 120) + Math.abs(fp.y - 260) < 12) continue;

      const coordKey = `${fp.x},${fp.y}`;
      let tooClose = false;
      for (const used of usedSignLocations) {
        const [ux, uy] = used.split(',').map(Number);
        if (Math.abs(fp.x - ux) + Math.abs(fp.y - uy) < 10) {
          tooClose = true; break;
        }
      }
      if (tooClose) continue;

      // Apply near-hub overrides
      for (const [mapId] of fp.dirPerDest) {
        const overrides = nearHubOverrides[mapId];
        if (overrides) {
          for (const ovr of overrides) {
            const [hx, hy] = ovr.nearHub.split(',').map(Number);
            if (Math.abs(fp.x - hx) + Math.abs(fp.y - hy) < 15) {
              fp.dirPerDest.set(mapId, ovr.arrow);
            }
          }
        }
      }

      // Group destinations by arrow direction
      const byDir: Record<string, string[]> = {};
      for (const [mapId, arrow] of fp.dirPerDest) {
        if (!byDir[arrow]) byDir[arrow] = [];
        byDir[arrow].push(mapId);
      }
      const dirEntries = Object.entries(byDir);
      if (dirEntries.length < 2) continue;

      // Skip if only 2 destinations going opposite directions (not a real junction)
      if (fp.dirPerDest.size === 2) {
        const arrows = [...fp.dirPerDest.values()];
        const isOpposite = (a: string, b: string) =>
          (a === '←' && b === '→') || (a === '→' && b === '←') ||
          (a === '↑' && b === '↓') || (a === '↓' && b === '↑');
        if (arrows.length === 2 && isOpposite(arrows[0], arrows[1])) continue;
      }

      candidateSignposts.push({
        x: fp.x, y: fp.y,
        branches: dirEntries.map(([arrow, mapIds]) => ({ arrow, mapIds })),
      });
      usedSignLocations.add(coordKey);
    }
  }

  // Place signpost tiles
  const dirs4: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (let si = 0; si < candidateSignposts.length; si++) {
    const sp = candidateSignposts[si];
    const branchData = sp.branches.map(b => ({ arrow: b.arrow, mapIds: b.mapIds }));

    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
      const sx = sp.x + dx;
      const sy = sp.y + dy;
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
      const tile = map[sy][sx];
      if (walkableTiles.has(tile) || tile === 2 || tile === 11 || tile === 20) continue;

      let hasWalkableNeighbor = false;
      for (const [nx, ny] of dirs4) {
        if (isWalkableAt(sx + nx, sy + ny)) {
          hasWalkableNeighbor = true; break;
        }
      }
      if (!hasWalkableNeighbor) continue;

      // Check if mostly desert → use desert signpost (20) instead of regular (11)
      const desertNeighborCount = dirs4.filter(([nx, ny]) => map[sy + ny]?.[sx + nx] === 18).length;
      const signTile = desertNeighborCount >= 2 ? 20 : 11;

      map[sy][sx] = signTile;
      overworldSignposts.push({
        x: sx, y: sy,
        textKey: `sign.auto.${si}`,
        branches: branchData,
      });
      break;
    }
  }

  // ── Phase 12: Final cleanup ──
  // Convert any remaining bridge tiles (5) to path
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (map[y][x] === 5) map[y][x] = 1;
    }
  }

  // Barrier wall around haunted forest path
  for (let y = 275; y <= 298; y++) {
    for (let x = 218; x <= 226; x++) {
      if (x < 221 || x > 222) {
        const t = map[y]?.[x];
        if (t === 0 || t === 1) map[y][x] = 4;
      }
    }
  }

  // Forest around haunted portals
  for (const [hx, hy] of [[238, 248], [242, 248]] as [number, number][]) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ax = hx + dx, ay = hy + dy;
        if (ax === hx && ay === hy) continue;
        const t = map[ay]?.[ax];
        if (t === 0 || t === 1) map[ay][ax] = 3;
      }
    }
  }

  // Dark path between haunted portals
  for (let x = 221; x <= 222; x++) {
    for (let y = 275; y <= 298; y++) {
      const t = map[y]?.[x];
      if (t !== undefined && t !== 2 && t !== 4 && t !== 14) map[y][x] = 13;
    }
  }

  return map;
}

// ─── Portal Land Mini-Overworld (40×40) ───
export function generatePortalLandMap(width: number, height: number, seed: number): number[][] {
  const rand = seededRandom(seed);
  const map: number[][] = Array.from({ length: height }, () => new Array(width).fill(0));

  // Border: mountains
  for (let x = 0; x < width; x++) { map[0][x] = 4; map[height - 1][x] = 4; }
  for (let y = 0; y < height; y++) { map[y][0] = 4; map[y][width - 1] = 4; }

  // Random forest patches
  for (let i = 0; i < Math.floor(width * height * 0.12); i++) {
    const fx = 2 + Math.floor(rand() * (width - 4));
    const fy = 2 + Math.floor(rand() * (height - 4));
    if (map[fy][fx] === 0) map[fy][fx] = 3;
  }

  // Mountain clusters
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

  const villageX = 10, villageY = 20;
  map[villageY][villageX] = 6;

  const dungeonX = 25, dungeonY = 10;
  map[dungeonY][dungeonX] = 7;

  const portalX = Math.floor(width / 2), portalY = height - 2;
  map[portalY][portalX] = 9;

  // Carve paths
  const carvePortalPath = (x1: number, y1: number, x2: number, y2: number) => {
    for (const [px, py] of pathBetween(x1, y1, x2, y2)) {
      if (py > 0 && py < height - 1 && px > 0 && px < width - 1 &&
          map[py][px] !== 6 && map[py][px] !== 7 && map[py][px] !== 9) {
        map[py][px] = 1;
      }
    }
  };
  carvePortalPath(portalX, portalY, villageX, villageY);
  carvePortalPath(villageX, villageY, dungeonX, dungeonY);

  return map;
}

// ─── Town Generator ───
export function generateTownMap(width: number, height: number, seed: number): number[][] {
  const rand = seededRandom(seed);
  const cx = Math.floor(width / 2);
  const map: number[][] = Array.from({ length: height }, () => new Array(width).fill(3));

  // Border walls
  for (let x = 0; x < width; x++) {
    map[0][x] = 1;
    map[height - 1][x] = (x >= cx - 1 && x <= cx) ? 7 : 1;
  }
  for (let y = 0; y < height; y++) { map[y][0] = 1; map[y][width - 1] = 1; }

  // Main road
  for (let y = 2; y < height - 1; y++) { map[y][cx - 1] = 5; map[y][cx] = 5; }
  // Cross road
  for (let x = 2; x < width - 2; x++) map[5][x] = 5;

  // Plaza
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const py = 5 + dy, px = cx + dx;
      if (py > 0 && py < height - 1 && px > 0 && px < width - 1) map[py][px] = 0;
    }
  }

  // Place houses
  function placeHouse(hx: number, hy: number): void {
    for (let dx = 0; dx < 3; dx++) {
      const px = hx + dx;
      const ry = hy;
      if (ry > 0 && ry < height - 1 && px > 0 && px < width - 1) map[ry][px] = 2;
      const wy = hy + 1;
      if (wy > 0 && wy < height - 1 && px > 0 && px < width - 1) {
        map[wy][px] = dx === 1 ? 10 : 9;
      }
    }
    for (let dx = 0; dx < 3; dx++) {
      const fy = hy + 2, fx = hx + dx;
      if (fy > 0 && fy < height - 1 && fx > 0 && fx < width - 1 && map[fy][fx] === 3) map[fy][fx] = 0;
    }
  }

  function placeShop(sx: number, sy: number): void {
    for (let dx = 0; dx < 3; dx++) {
      const px = sx + dx;
      if (sy < height - 1 && px > 0 && px < width - 1) map[sy][px] = 8;
      const wy = sy + 1;
      if (wy < height - 1 && px > 0 && px < width - 1) {
        map[wy][px] = dx === 1 ? 12 : 11;
      }
    }
    for (let dx = 0; dx < 3; dx++) {
      const fy = sy + 2, fx = sx + dx;
      if (fy < height - 1 && fx > 0 && fx < width - 1 && map[fy][fx] === 3) map[fy][fx] = 0;
    }
  }

  function placeClinic(clx: number, cly: number): void {
    for (let dx = 0; dx < 3; dx++) {
      const px = clx + dx;
      if (cly < height - 1 && px > 0 && px < width - 1) map[cly][px] = 13;
      const wy = cly + 1;
      if (wy < height - 1 && px > 0 && px < width - 1) {
        map[wy][px] = dx === 1 ? 15 : 14;
      }
    }
    for (let dx = 0; dx < 3; dx++) {
      const fy = cly + 2, fx = clx + dx;
      if (fy < height - 1 && fx > 0 && fx < width - 1 && map[fy][fx] === 3) map[fy][fx] = 0;
    }
  }

  const houses = [{ x: 2, y: 2 }, { x: width - 5, y: 2 }, { x: 2, y: 7 }, { x: width - 5, y: 7 }];
  for (const h of houses) placeHouse(h.x, h.y);

  const clinicX = width - 14, clinicY = 11;
  placeClinic(clinicX, clinicY);

  const shopX = width - 5, shopY = 11;
  placeShop(shopX, shopY);

  // Side paths
  const allBuildings = [...houses, { x: clinicX + 1, y: clinicY }, { x: shopX + 1, y: shopY }];
  for (const b of allBuildings) {
    const frontY = b.y + 2;
    const startX = Math.min(b.x, cx - 1);
    const endX = Math.max(b.x + 2, cx);
    for (let x = startX; x <= endX; x++) {
      if (frontY > 0 && frontY < height - 1 && x > 0 && x < width - 1 && map[frontY][x] === 3) {
        map[frontY][x] = 0;
      }
    }
  }

  // Save point
  map[10][cx] = 6;

  // Water feature
  if (rand() > 0.4) {
    const wx = cx + (rand() > 0.5 ? 2 : -3);
    if (wx > 1 && wx < width - 2 && map[4][wx] === 3) map[4][wx] = 4;
  }

  return map;
}

// ─── Shuffle helper ───
function shuffleArray<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Corridor carving helper (used by dungeon generator) ───
function carveLCorridor(
  grid: number[][], x1: number, y1: number, x2: number, y2: number,
  rand: () => number
): void {
  const h = grid.length;
  const w = grid[0].length;
  const protectedTiles = new Set([6, 7, 9, 15]);

  const carveCell = (cx: number, cy: number, isHoriz: boolean) => {
    if (cx > 0 && cx < w - 1 && cy > 0 && cy < h - 1 && grid[cy][cx] === 1 && !protectedTiles.has(grid[cy][cx])) {
      grid[cy][cx] = 0;
    }
    if (isHoriz) {
      const ny = cy + 1;
      if (cx > 0 && cx < w - 1 && ny > 0 && ny < h - 1 && grid[ny][cx] === 1) grid[ny][cx] = 0;
    } else {
      const nx = cx + 1;
      if (nx > 0 && nx < w - 1 && cy > 0 && cy < h - 1 && grid[cy][nx] === 1) grid[cy][nx] = 0;
    }
  };

  let cx = x1, cy = y1;
  const horizFirst = rand() > 0.5;
  const orientation = Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? 'h' : 'v';
  let dir: 'h' | 'v' = orientation;

  if (horizFirst) {
    while (cx !== x2) {
      carveCell(cx, cy, true);
      cx += cx < x2 ? 1 : -1;
    }
    while (cy !== y2) {
      carveCell(cx, cy, false);
      cy += cy < y2 ? 1 : -1;
    }
  } else {
    while (cy !== y2) {
      carveCell(cx, cy, false);
      cy += cy < y2 ? 1 : -1;
    }
    while (cx !== x2) {
      carveCell(cx, cy, true);
      cx += cx < x2 ? 1 : -1;
    }
  }
  carveCell(cx, cy, dir === 'h');
}

// ─── Emergency corridor carver ───
function emergencyCarve(
  grid: number[][], x1: number, y1: number, x2: number, y2: number,
  rand: () => number
): void {
  const h = grid.length;
  const w = grid[0].length;
  const protectedTiles = new Set([6, 7, 9, 15]);

  const carveCell = (cx: number, cy: number, isHoriz: boolean) => {
    if (cx > 0 && cx < w - 1 && cy > 0 && cy < h - 1 && grid[cy][cx] === 1) {
      grid[cy][cx] = 0;
    }
    if (isHoriz) {
      const ny = cy + 1;
      if (cx > 0 && cx < w - 1 && ny > 0 && ny < h - 1 && grid[ny][cx] === 1) grid[ny][cx] = 0;
    } else {
      const nx = cx + 1;
      if (nx > 0 && nx < w - 1 && cy > 0 && cy < h - 1 && grid[cy][nx] === 1) grid[cy][nx] = 0;
    }
  };

  let cx = x1, cy = y1;
  let dir: 'h' | 'v' = Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? 'h' : 'v';
  const bendiness = 0.3;
  let budget = (Math.abs(x2 - x1) + Math.abs(y2 - y1)) * 3 + 50;

  while ((cx !== x2 || cy !== y2) && budget-- > 0) {
    carveCell(cx, cy, dir === 'h');
    const dx = x2 - cx;
    const dy = y2 - cy;
    if (rand() < bendiness && Math.abs(dx) + Math.abs(dy) > 6) {
      if (Math.abs(dx) > Math.abs(dy)) {
        cy += rand() > 0.5 ? 1 : -1;
        dir = 'v';
      } else {
        cx += rand() > 0.5 ? 1 : -1;
        dir = 'h';
      }
    } else {
      if (Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && rand() > 0.5)) {
        cx += dx > 0 ? 1 : -1;
        dir = 'h';
      } else {
        cy += dy > 0 ? 1 : -1;
        dir = 'v';
      }
    }
    cx = Math.max(2, Math.min(w - 3, cx));
    cy = Math.max(2, Math.min(h - 3, cy));
  }
  carveCell(cx, cy, dir === 'h');
}

// ─── Dungeon Generator ───
export function generateDungeonMap(
  width: number, height: number, seed: number,
  floor: number = 1, totalFloors: number = 1,
  gate: boolean = false,
  gateFinalFloor: boolean = false,
  castle: boolean = false,
  mechanic?: string,
  mapId?: string,
): DungeonResult {
  const floorSeed = seed + (floor - 1) * 997;
  const rand = seededRandom(floorSeed);
  const isFirstFloor = floor === 1;
  const isFinalFloor = floor === totalFloors;

  // ── Forest-maze mechanic: recursive backtracker maze ──
  if (mechanic === 'forest-maze') {
    const sizes = [13, 15, 19, 21, 25];
    const dim = sizes[Math.min(floor - 1, sizes.length - 1)];
    const rows = dim;
    const maze = Array.from({ length: rows }, () => new Array(dim).fill(1));

    const entranceX = isFirstFloor ? Math.floor(dim / 2) : 1;
    const entranceY = isFirstFloor ? rows - 2 : Math.floor(rows / 2);
    const gridW = Math.floor((dim - 1) / 2);
    const gridH = Math.floor((rows - 1) / 2);

    const cellToTile = (cx: number, cy: number): [number, number] => [1 + cx * 2, 1 + cy * 2];
    const visited = new Set<number>();
    const stack: [number, number][] = [];

    const startCX = isFirstFloor ? Math.floor(gridW / 2) : 0;
    const startCY = isFirstFloor ? gridH - 1 : Math.floor(gridH / 2);
    visited.add(startCY * gridW + startCX);
    stack.push([startCX, startCY]);

    const [startTX, startTY] = cellToTile(startCX, startCY);
    maze[startTY][startTX] = 0;

    const mazeDirections: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];
      const neighbors: [number, number, number, number][] = [];
      for (const [dx, dy] of mazeDirections) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH || visited.has(ny * gridW + nx)) continue;
        const [tx, ty] = cellToTile(cx, cy);
        neighbors.push([nx, ny, tx + dx, ty + dy]);
      }
      if (neighbors.length === 0) { stack.pop(); continue; }
      const [ncx, ncy, wallX, wallY] = neighbors[Math.floor(rand() * neighbors.length)];
      visited.add(ncy * gridW + ncx);
      stack.push([ncx, ncy]);
      if (wallY >= 0 && wallY < rows && wallX >= 0 && wallX < dim) maze[wallY][wallX] = 0;
      const [ntx, nty] = cellToTile(ncx, ncy);
      if (nty >= 0 && nty < rows && ntx >= 0 && ntx < dim) maze[nty][ntx] = 0;
    }

    // Carve entrance path
    if (isFirstFloor) {
      maze[rows - 1][entranceX] = 0;
      for (let y = rows - 2; y > 0; y--) {
        maze[y][entranceX] = 0;
        if ((entranceX > 1 && maze[y][entranceX - 1] === 0) ||
            (entranceX < dim - 2 && maze[y][entranceX + 1] === 0) ||
            y <= startTY) break;
      }
    } else {
      maze[entranceY][0] = 0;
      for (let x = 1; x < dim - 1; x++) {
        maze[entranceY][x] = 0;
        if ((entranceY > 1 && maze[entranceY - 1][x] === 0) ||
            (entranceY < rows - 2 && maze[entranceY + 1][x] === 0)) break;
      }
    }

    // Exits on right side
    let correctExitY = -1;
    if (!isFinalFloor) {
      const numExits = 3 + Math.min(floor - 1, 2);
      const exitYs: number[] = [];
      const spacing = Math.max(3, Math.floor((rows - 4) / (numExits + 1)));
      for (let e = 0; e < numExits; e++) {
        const rawY = 2 + spacing * (e + 1);
        const clampedY = Math.max(2, Math.min(rows - 3, rawY));
        const oddY = clampedY % 2 === 0 ? clampedY + 1 : clampedY;
        const finalY = Math.min(oddY, rows - 3);
        exitYs.push(finalY);
        maze[finalY][dim - 1] = 0;
        for (let x = dim - 2; x > 0 && maze[finalY][x] !== 0; x--) maze[finalY][x] = 0;
      }
      const correctIdx = Math.floor(rand() * exitYs.length);
      correctExitY = exitYs[correctIdx];
    }

    // Boss on final floor
    if (isFinalFloor) {
      const bossX = Math.floor(dim / 2);
      maze[rows - 1][bossX] = 7;
      for (let dy = -3; dy <= -1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bx = bossX + dx, by = rows - 1 + dy;
          if (bx > 0 && bx < dim - 1 && by > 0 && by < rows - 1 && maze[by][bx] === 1) {
            maze[by][bx] = 0;
          }
        }
      }
      for (let y = rows - 4; y > 0; y--) {
        if (maze[y][bossX] !== 0) maze[y][bossX] = 0;
        else break;
      }
    }

    // Place treasures
    const numChests = 1 + Math.floor(floor / 2);
    let placed = 0;
    for (let attempt = 0; attempt < 300 && placed < numChests; attempt++) {
      const tx = 1 + Math.floor(rand() * (dim - 2));
      const ty = 1 + Math.floor(rand() * (rows - 2));
      if (maze[ty][tx] !== 0) continue;
      let wallCount = 0;
      for (const [dx, dy] of mazeDirections) {
        const t = maze[ty + dy]?.[tx + dx];
        if (t === 0 || t === 24) wallCount++;
      }
      if (wallCount === 1) { maze[ty][tx] = 4; placed++; }
    }

    // Sign tile near entrance on floor 1
    if (isFirstFloor) {
      for (const offset of [1, -1]) {
        const sx = entranceX + offset;
        const sy = rows - 1;
        if (sx > 0 && sx < dim - 1 && maze[sy][sx] === 1) {
          maze[sy][sx] = 18;
          break;
        }
      }
    }

    return { map: maze, keyChests: [], correctExitY };
  }

  // ── Maze-hunter mechanic: perfect maze with hidden goal ──
  if (mechanic === 'maze-hunter') {
    const sizes = [19, 21, 23, 25, 27, 29];
    const dim = sizes[Math.min(floor - 1, sizes.length - 1)];
    const rows = dim;
    const maze = Array.from({ length: rows }, () => new Array(dim).fill(1));

    const entranceX = Math.floor(dim / 2);
    const entranceY = rows - 2;
    const gridW = Math.floor((dim - 1) / 2);
    const gridH = Math.floor((rows - 1) / 2);

    const cellToTile = (cx: number, cy: number): [number, number] => [1 + cx * 2, 1 + cy * 2];
    const visited = new Set<number>();
    const stack: [number, number][] = [];

    const startCX = Math.floor(gridW / 2);
    const startCY = gridH - 1;
    visited.add(startCY * gridW + startCX);
    stack.push([startCX, startCY]);

    const [startTX, startTY] = cellToTile(startCX, startCY);
    maze[startTY][startTX] = 0;

    const mazeDirections: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];
      const neighbors: [number, number, number, number][] = [];
      for (const [dx, dy] of mazeDirections) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH || visited.has(ny * gridW + nx)) continue;
        const [tx, ty] = cellToTile(cx, cy);
        neighbors.push([nx, ny, tx + dx, ty + dy]);
      }
      if (neighbors.length === 0) { stack.pop(); continue; }
      const [ncx, ncy, wallX, wallY] = neighbors[Math.floor(rand() * neighbors.length)];
      visited.add(ncy * gridW + ncx);
      stack.push([ncx, ncy]);
      if (wallY >= 0 && wallY < rows && wallX >= 0 && wallX < dim) maze[wallY][wallX] = 0;
      const [ntx, nty] = cellToTile(ncx, ncy);
      if (nty >= 0 && nty < rows && ntx >= 0 && ntx < dim) maze[nty][ntx] = 0;
    }

    // Entrance
    maze[rows - 1][entranceX] = 6;
    for (let y = rows - 2; y > 0; y--) {
      if (maze[y][entranceX] !== 0) maze[y][entranceX] = 0;
      else break;
    }

    // BFS distance map from entrance
    const distMap = Array.from({ length: rows }, () => new Array(dim).fill(-1));
    const bfsQueue: [number, number][] = [[entranceX, entranceY]];
    distMap[entranceY][entranceX] = 0;
    let maxDist = 0;
    while (bfsQueue.length > 0) {
      const [bx, by] = bfsQueue.shift()!;
      for (const [dx, dy] of mazeDirections) {
        const nx = bx + dx, ny = by + dy;
        if (nx < 0 || nx >= dim || ny < 0 || ny >= rows) continue;
        if (distMap[ny][nx] >= 0) continue;
        if (maze[ny][nx] === 0) {
          distMap[ny][nx] = distMap[by][bx] + 1;
          if (distMap[ny][nx] > maxDist) maxDist = distMap[ny][nx];
          bfsQueue.push([nx, ny]);
        }
      }
    }

    let goldenChestPos: { x: number; y: number } | undefined;

    if (isFinalFloor) {
      // Golden chest at distant location
      const minDist = Math.floor(maxDist * 0.6);
      const candidates: [number, number][] = [];
      for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < dim - 1; x++) {
          if (maze[y][x] === 0 && distMap[y][x] >= minDist) candidates.push([x, y]);
        }
      }
      if (candidates.length > 0) {
        const [gx, gy] = candidates[Math.floor(rand() * candidates.length)];
        maze[gy][gx] = 4;
        goldenChestPos = { x: gx, y: gy };
      }

      // Boss near top
      const bossX = Math.floor(dim / 2);
      let bossY = 2;
      for (let y = 1; y < Math.floor(rows / 3); y++) {
        if (maze[y][bossX] === 0) { bossY = y; break; }
        for (const off of [-1, 1]) {
          if (bossX + off > 0 && bossX + off < dim - 1 && maze[y][bossX + off] === 0) {
            bossY = y; break;
          }
        }
        if (maze[bossY][bossX] === 0 || bossY !== 2) break;
      }
      maze[bossY][bossX] = 7;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bx2 = bossX + dx, by2 = bossY + dy;
          if (bx2 > 0 && bx2 < dim - 1 && by2 > 0 && by2 < rows - 1 && maze[by2][bx2] === 1) {
            maze[by2][bx2] = 0;
          }
        }
      }
      for (let y = bossY + 2; y < rows - 1; y++) {
        if (maze[y][bossX] !== 0) maze[y][bossX] = 0;
        else break;
      }
      // Boss exit portal above boss
      const portalY = Math.max(1, bossY - 2);
      maze[portalY][bossX] = 10;
      const blockY = bossY - 1;
      if (blockY > 0 && blockY < rows - 1) maze[blockY][bossX] = 1;
    } else {
      // Stairs-down at farthest point
      const minDist = Math.floor(maxDist * 0.7);
      const candidates: [number, number][] = [];
      for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < dim - 1; x++) {
          if (maze[y][x] === 0 && distMap[y][x] >= minDist) candidates.push([x, y]);
        }
      }
      if (candidates.length > 0) {
        const [sx, sy] = candidates[Math.floor(rand() * candidates.length)];
        maze[sy][sx] = 9;
      } else {
        maze[1][entranceX] = 9;
      }
    }

    // Sign near entrance
    if (isFirstFloor) {
      for (const offset of [1, -1]) {
        const sx = entranceX + offset;
        const sy = rows - 1;
        if (sx > 0 && sx < dim - 1 && maze[sy][sx] === 1) {
          maze[sy][sx] = 18;
          break;
        }
      }
    }

    // Extra treasures
    const numChests = 2 + (rand() > 0.5 ? 1 : 0);
    let chestPlaced = 0;
    for (let attempt = 0; attempt < 300 && chestPlaced < numChests; attempt++) {
      const tx = 1 + Math.floor(rand() * (dim - 2));
      const ty = 1 + Math.floor(rand() * (rows - 2));
      if (maze[ty][tx] !== 0) continue;
      let wallCount = 0;
      for (const [dx, dy] of mazeDirections) {
        const t = maze[ty + dy]?.[tx + dx];
        if (t === 0 || t === 24 || t === 4 || t === 6 || t === 9) wallCount++;
      }
      if (wallCount === 1) { maze[ty][tx] = 4; chestPlaced++; }
    }

    // Crumble tiles for variety
    let tileCount = 0;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < dim - 1; x++) {
        if (maze[y][x] === 0) {
          tileCount++;
          if (tileCount % 8 === 0) {
            for (const [dx, dy] of mazeDirections) {
              const nx = x + dx, ny = y + dy;
              if (nx > 0 && nx < dim - 1 && ny > 0 && ny < rows - 1 && maze[ny][nx] === 1) {
                maze[ny][nx] = 24;
                break;
              }
            }
          }
        }
      }
    }

    return { map: maze, keyChests: [], goldenChestPos };
  }

  // ── Standard/Gate/Castle dungeon (branching corridor system) ──
  const map: number[][] = Array.from({ length: height }, () => new Array(width).fill(1));
  const keyChests: { x: number; y: number }[] = [];
  const hiddenRoomChests: string[] = [];
  const isStormNest = mapId === 'stormNest';

  // Room carving helper
  const carveRoom = (rx: number, ry: number, rw: number, rh: number, tile: number = 0) => {
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const px = rx + dx, py = ry + dy;
        if (px > 0 && px < width - 1 && py > 0 && py < height - 1) map[py][px] = tile;
      }
    }
  };

  const carveCell = (cx: number, cy: number, isHoriz: boolean) => {
    if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1 && map[cy][cx] === 1) map[cy][cx] = 0;
    if (isHoriz) {
      const ny = cy + 1;
      if (cx > 0 && cx < width - 1 && ny > 0 && ny < height - 1 && map[ny][cx] === 1) map[ny][cx] = 0;
    } else {
      const nx = cx + 1;
      if (nx > 0 && nx < width - 1 && cy > 0 && cy < height - 1 && map[cy][nx] === 1) map[cy][nx] = 0;
    }
  };

  // Determine entrance and exit positions
  let entranceX: number, entranceY: number, exitX: number, exitY: number;

  if (gate) {
    entranceX = Math.floor(width / 2); entranceY = height - 2;
    exitX = entranceX; exitY = 2;
  } else if (castle || isStormNest) {
    entranceX = Math.floor(width / 2); entranceY = height - 2;
    exitX = entranceX; exitY = 3;
  } else {
    entranceX = Math.floor(width / 2); entranceY = 2;
    const exitRand = seededRandom(floorSeed + 7777);
    const exitSide = 1 + Math.floor(exitRand() * 3);
    switch (exitSide) {
      case 1:
        exitX = Math.floor(width * 0.3) + Math.floor(exitRand() * Math.floor(width * 0.4));
        exitY = height - 3;
        break;
      case 2:
        exitX = 2;
        exitY = Math.floor(height * 0.3) + Math.floor(exitRand() * Math.floor(height * 0.4));
        break;
      case 3:
        exitX = width - 3;
        exitY = Math.floor(height * 0.3) + Math.floor(exitRand() * Math.floor(height * 0.4));
        break;
      default:
        exitX = Math.floor(width / 2); exitY = height - 3;
    }
    if (exitX === entranceX && exitY === entranceY) {
      exitX = Math.floor(width / 2); exitY = height - 3;
    }
  }

  // Carve entrance and exit rooms
  carveRoom(entranceX - 1, entranceY - 1, 3, 3);
  carveRoom(exitX - 1, exitY - 1, 3, 3);

  // Carve main corridor between entrance and exit
  const bendiness = 0.3;
  const mainPath: [number, number][] = [];
  const mainDirs: ('h' | 'v')[] = [];
  {
    let cx = entranceX, cy = entranceY;
    let dir: 'h' | 'v' = Math.abs(exitX - entranceX) >= Math.abs(exitY - entranceY) ? 'h' : 'v';
    let budget = (Math.abs(exitX - entranceX) + Math.abs(exitY - entranceY)) * 3 + 50;
    while ((cx !== exitX || cy !== exitY) && budget-- > 0) {
      carveCell(cx, cy, dir === 'h');
      mainPath.push([cx, cy]);
      mainDirs.push(dir);
      const dx = exitX - cx;
      const dy = exitY - cy;
      if (rand() < bendiness && Math.abs(dx) + Math.abs(dy) > 6) {
        if (Math.abs(dx) > Math.abs(dy)) {
          cy += rand() > 0.5 ? 1 : -1;
          dir = 'v';
        } else {
          cx += rand() > 0.5 ? 1 : -1;
          dir = 'h';
        }
      } else {
        if (Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && rand() > 0.5)) {
          cx += dx > 0 ? 1 : -1;
          dir = 'h';
        } else {
          cy += dy > 0 ? 1 : -1;
          dir = 'v';
        }
      }
      cx = Math.max(2, Math.min(width - 3, cx));
      cy = Math.max(2, Math.min(height - 3, cy));
    }
    carveCell(cx, cy, dir === 'h');
    mainPath.push([cx, cy]);
    mainDirs.push(dir);
  }

  // Place entrance and exit tiles
  if (gate) {
    map[height - 1][entranceX] = 6;
    carveRoom(entranceX - 1, 1, 3, 3);
    if (isFinalFloor) map[1][entranceX] = 7;
    else map[1][entranceX] = 9;
  } else if (castle || isStormNest) {
    if (isStormNest && isFirstFloor) {
      for (let dx = -1; dx <= 1; dx++) {
        const ex = entranceX + dx;
        if (ex > 0 && ex < width - 1) {
          map[height - 1][ex] = 0;
          map[height - 2][ex] = 0;
          map[height - 3][ex] = 0;
        }
      }
    } else {
      map[height - 1][entranceX] = 6;
    }
    carveRoom(entranceX - 1, height - 4, 3, 3);
    if (isFinalFloor) {
      carveRoom(entranceX - 6, 2, 13, 9);
      if (castle) {
        for (const pdx of [-4, 4]) {
          for (const pdy of [0, 2, 4]) {
            const px = entranceX + pdx, py = 2 + pdy;
            if (px > 0 && px < width - 1 && py > 0 && py < height - 1) map[py][px] = 1;
          }
        }
      }
      map[3][entranceX] = 7;
    } else {
      carveRoom(entranceX - 1, 1, 3, 3);
      map[1][entranceX] = 9;
      for (let y = 2; y <= exitY; y++) {
        if (map[y][entranceX] === 1) map[y][entranceX] = 0;
        if (entranceX > 0 && map[y][entranceX - 1] === 1) map[y][entranceX - 1] = 0;
      }
    }
  } else {
    // Standard dungeon
    const clampX = Math.max(0, Math.min(width - 1, entranceX));
    const clampY = Math.max(0, Math.min(height - 1, entranceY));
    let edgeX = clampX, edgeY = clampY;
    if (entranceY <= 2) edgeY = 0;
    else if (entranceY >= height - 3) edgeY = height - 1;
    else if (entranceX <= 2) edgeX = 0;
    else if (entranceX >= width - 3) edgeX = width - 1;

    map[edgeY][edgeX] = 6;
    const roomX = Math.max(1, Math.min(width - 4, entranceX - 1));
    const roomY = Math.max(1, Math.min(height - 4, entranceY - 1));
    carveRoom(roomX, roomY, 3, 3);

    // Carve from edge to entrance
    if (edgeY !== entranceY) {
      const step = edgeY < entranceY ? 1 : -1;
      for (let y = edgeY + step; y !== entranceY; y += step) {
        if (y > 0 && y < height - 1 && edgeX > 0 && edgeX < width - 1 && map[y][edgeX] === 1) {
          map[y][edgeX] = 0;
        }
      }
    }
    if (edgeX !== entranceX) {
      const step = edgeX < entranceX ? 1 : -1;
      for (let x = edgeX + step; x !== entranceX; x += step) {
        if (x > 0 && x < width - 1 && entranceY > 0 && entranceY < height - 1 && map[entranceY][x] === 1) {
          map[entranceY][x] = 0;
        }
      }
    }

    // Exit room
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ex = exitX + dx, ey = exitY + dy;
        if (ex > 0 && ex < width - 1 && ey > 0 && ey < height - 1) map[ey][ex] = 0;
      }
    }
    if (isFinalFloor || gateFinalFloor) map[exitY][exitX] = 7;
    else map[exitY][exitX] = 9;
  }

  // ── Branch corridors from main path ──
  const numBranches = Math.max(6, Math.min(8, Math.floor(7 + (rand() > 0.5 ? 1 : -1))));
  const branchSpacing = Math.max(1, Math.floor(mainPath.length / (numBranches + 1)));
  interface Branch {
    endX: number; endY: number; startX: number; startY: number;
    type: string; originIdx: number; branchDir: 'h' | 'v';
  }
  const branches: Branch[] = [];
  const branchTypes = new Array(numBranches).fill('empty');

  // Assign treasure to some branches
  const noKeyMechanics = new Set(['ice', 'forest-maze', 'darkness-pulse', 'wind-tower', 'shadow-portal', 'maze-hunter']);
  const shouldHaveKey = !noKeyMechanics.has(mechanic ?? '') &&
    (mechanic === 'colored-keys' && numBranches >= 2 || isFinalFloor && numBranches >= 3 || numBranches >= 4 && !isFirstFloor && rand() < 0.85);
  let hasKey = shouldHaveKey && numBranches >= 2;
  const numTreasure = Math.max(2, 3 - (hasKey ? 1 : 0));
  let treasureCount = 0;

  const shuffled: number[] = [];
  for (let i = 0; i < numBranches; i++) {
    if (branchTypes[i] === 'empty') shuffled.push(i);
  }
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const idx of shuffled) {
    if (treasureCount >= numTreasure) break;
    if (branchTypes[idx] === 'empty') { branchTypes[idx] = 'treasure'; treasureCount++; }
  }

  // Check if dungeon has hidden rooms
  const hasHiddenRooms = mapId ? new Set([
    'ironMine', 'hauntedForest', 'shadowCave', 'oasisDepths', 'scorchedRuins',
    'emberMines', 'obsidianCavern', 'volcanicForge', 'demonBarracks', 'voidRift',
    'magmaTunnels', 'demonCastle', 'portalStormreach', 'portalFrostfall',
    'portalSunkenTemple', 'portalTwilight',
  ]).has(mapId) : false;

  let hiddenCount = 0;
  if (hasHiddenRooms && !noKeyMechanics.has(mechanic ?? '')) {
    for (let i = 0; i < numBranches; i++) {
      if (branchTypes[i] === 'empty' && hiddenCount < 1 && rand() < 0.4) {
        branchTypes[i] = 'hidden';
        hiddenCount++;
      }
    }
  }

  // Generate branches
  const minBranchLen = 16, maxBranchLen = 40;
  for (let bi = 0; bi < numBranches; bi++) {
    const pathIdx = Math.min(mainPath.length - 1, (bi + 1) * branchSpacing);
    const [bx, by] = mainPath[pathIdx];
    const type = branchTypes[bi] || 'empty';
    const dirs = shuffleArray([[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][], rand);

    let placed = false;
    for (const [ddx, ddy] of dirs) {
      const branchLen = minBranchLen + Math.floor(rand() * (maxBranchLen - minBranchLen));
      // Validate branch direction has space
      let valid = true;
      for (let step = 3; step < branchLen && valid; step++) {
        const tx = bx + ddx * step, ty = by + ddy * step;
        if (tx <= 1 || tx >= width - 3 || ty <= 1 || ty >= height - 3) { valid = false; break; }
        if (step > 3) {
          for (const [cx, cy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [0, -2], [0, 2], [-2, 0], [2, 0]] as [number, number][]) {
            if (cx === -ddx && cy === -ddy) continue;
            if (cx === -ddx * 2 && cy === -ddy * 2) continue;
            const nx = tx + cx, ny = ty + cy;
            if (nx > 0 && nx < width && ny > 0 && ny < height && map[ny][nx] === 0) {
              valid = false; break;
            }
          }
        }
      }
      if (!valid) continue;

      // Carve branch with L-bend
      const bendPoint = Math.floor(branchLen * (0.4 + rand() * 0.3));
      const perpX = ddy !== 0 ? 1 : 0;
      const perpY = ddx !== 0 ? 1 : 0;
      const bendDir = rand() > 0.5 ? 1 : -1;

      let ex = bx, ey = by;
      let branchOrientation: 'h' | 'v' = ddx !== 0 ? 'h' : 'v';

      for (let step = 0; step < branchLen; step++) {
        let tx: number, ty: number;
        if (step < bendPoint) {
          tx = bx + ddx * step;
          ty = by + ddy * step;
        } else {
          const pastBend = step - bendPoint;
          tx = bx + ddx * bendPoint + perpX * bendDir * pastBend;
          ty = by + ddy * bendPoint + perpY * bendDir * pastBend;
          if (perpX !== 0) branchOrientation = 'h';
          else branchOrientation = 'v';
        }

        // Check for collisions
        if (step > 3 && tx > 0 && tx < width - 1 && ty > 0 && ty < height - 1) {
          let collision = false;
          for (const [cx, cy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [0, -2], [0, 2], [-2, 0], [2, 0]] as [number, number][]) {
            if (cx === -ddx && cy === -ddy) continue;
            if (cx === -ddx * 2 && cy === -ddy * 2) continue;
            const nx = tx + cx, ny = ty + cy;
            if (nx > 0 && nx < width && ny > 0 && ny < height && map[ny][nx] === 0) {
              collision = true; break;
            }
          }
          if (collision) break;
        }

        const isHoriz = ddx !== 0 || (step >= bendPoint && perpX !== 0);
        carveCell(tx, ty, isHoriz);
        ex = Math.max(2, Math.min(width - 2, tx));
        ey = Math.max(2, Math.min(height - 2, ty));
      }

      if (ex > 0 && ex < width - 1 && ey > 0 && ey < height - 1 && map[ey][ex] === 1) {
        map[ey][ex] = 0;
      }

      branches.push({ endX: ex, endY: ey, startX: bx, startY: by, type, originIdx: pathIdx, branchDir: branchOrientation });
      placed = true;
      break;
    }

    if (!placed) {
      // Fallback: short horizontal branch
      const dir = rand() > 0.5 ? 1 : -1;
      let ex = bx;
      for (let step = 0; step < 16; step++) {
        const tx = bx + dir * step;
        if (tx > 1 && tx < width - 3) { carveCell(tx, by, true); ex = tx; }
      }
      if (ex > 0 && ex < width - 1 && by > 0 && by < height - 1 && map[by][ex] === 1) {
        map[by][ex] = 0;
      }
      branches.push({ endX: ex, endY: by, startX: bx, startY: by, type, originIdx: pathIdx, branchDir: 'h' });
    }
  }

  // Place branch endpoint tiles
  for (const branch of branches) {
    const { endX: bex, endY: bey } = branch;
    if (bex <= 0 || bex >= width - 1 || bey <= 0 || bey >= height - 1) continue;
    switch (branch.type) {
      case 'treasure':
        if (map[bey][bex] === 0) map[bey][bex] = 4;
        break;
      case 'key':
        if (map[bey][bex] === 0) {
          map[bey][bex] = 4;
          keyChests.push({ x: bex, y: bey });
        }
        break;
      case 'save':
        if (map[bey][bex] === 0) {
          carveRoom(bex - 1, bey - 1, 3, 3);
          map[bey][bex] = 14;
        }
        break;
      case 'hidden': {
        const hiddenDirs = shuffleArray([[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][], rand);
        for (const [hdx, hdy] of hiddenDirs) {
          const wallX = bex + hdx, wallY = bey + hdy;
          if (wallX <= 0 || wallX >= width - 1 || wallY <= 0 || wallY >= height - 1) continue;
          if (map[wallY][wallX] !== 1) continue;
          const roomX = wallX + hdx * 2, roomY = wallY + hdy * 2;
          if (roomX - 1 <= 0 || roomX + 1 >= width - 1 || roomY - 1 <= 0 || roomY + 1 >= height - 1) continue;
          let allWalls = true;
          for (let ry = roomY - 1; ry <= roomY + 1 && allWalls; ry++) {
            for (let rx = roomX - 1; rx <= roomX + 1; rx++) {
              if (map[ry][rx] !== 1) { allWalls = false; break; }
            }
          }
          if (!allWalls) continue;
          for (let ry = roomY - 1; ry <= roomY + 1; ry++) {
            for (let rx = roomX - 1; rx <= roomX + 1; rx++) map[ry][rx] = 0;
          }
          const midX = wallX + hdx, midY = wallY + hdy;
          if (midX >= 1 && midX < width - 1 && midY >= 1 && midY < height - 1) map[midY][midX] = 0;
          map[wallY][wallX] = 17; // hidden door
          map[roomY][roomX] = 4;
          hiddenRoomChests.push(`${roomX},${roomY}`);
          break;
        }
        break;
      }
      case 'empty':
        if (map[bey][bex] === 0 && rand() > 0.5) map[bey][bex] = 2;
        break;
    }
  }

  // ── Save point placement ──
  const midFloor = Math.ceil(totalFloors / 2);
  if (isFirstFloor && totalFloors > 1 && !gate) {
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
      const sx = entranceX + dx, sy = entranceY + dy;
      if (sx > 0 && sx < width - 1 && sy > 0 && sy < height - 1 && (map[sy][sx] === 0 || map[sy][sx] === 2)) {
        carveRoom(sx - 1, sy - 1, 3, 3);
        map[sy][sx] = 14;
        break;
      }
    }
  }

  // ── Sign tile near entrance for mechanic dungeons ──
  if (isFirstFloor && (!!mechanic || mapId === 'ironMine')) {
    const signBaseY = castle || gate ? entranceY - 2 : entranceY;
    let signPlaced = false;
    for (let dy = -3; dy <= 3 && !signPlaced; dy++) {
      for (let dx = -2; dx <= 2 && !signPlaced; dx++) {
        const sx = entranceX + dx, sy = signBaseY + dy;
        if (sx <= 0 || sx >= width - 1 || sy <= 0 || sy >= height - 1 || map[sy][sx] !== 1) continue;
        let adjOpen = 0;
        for (const [nx, ny] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
          const ax = sx + nx, ay = sy + ny;
          if (ax > 0 && ax < width - 1 && ay > 0 && ay < height - 1) {
            const t = map[ay][ax];
            if (t === 0 || t === 2 || t === 6) adjOpen++;
          }
        }
        if (adjOpen === 1) { map[sy][sx] = 18; signPlaced = true; }
      }
    }
  }

  // ── BFS reachability: ensure exit is reachable ──
  let goalX = exitX, goalY = exitY;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const t = map[y][x];
      if (t === 9 || t === 7) { goalX = x; goalY = y; }
    }
  }

  {
    const visited = new Set<number>();
    const queue: [number, number][] = [[entranceX, entranceY]];
    visited.add(entranceY * width + entranceX);
    let reached = false;

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      if (cx === goalX && cy === goalY) { reached = true; break; }
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const key = ny * width + nx;
        if (visited.has(key)) continue;
        const t = map[ny][nx];
        if (t === 1 || t === 5) continue;
        visited.add(key);
        queue.push([nx, ny]);
      }
    }

    if (!reached) {
      // Find closest reachable tile and carve emergency path
      let bestX = entranceX, bestY = entranceY, bestDist = Infinity;
      for (const key of visited) {
        const vx = key % width, vy = Math.floor(key / width);
        const dist = Math.abs(vx - goalX) + Math.abs(vy - goalY);
        if (dist < bestDist) { bestDist = dist; bestX = vx; bestY = vy; }
      }
      emergencyCarve(map, bestX, bestY, goalX, goalY, rand);
    }
  }

  // ── Wind-tower mechanic: place wind tiles along corridors ──
  let windCorridorDir: { dx: number; dy: number } | undefined;
  if (mechanic === 'wind-tower') {
    const dx = entranceX - exitX;
    const dy = entranceY - exitY;
    windCorridorDir = Math.abs(dx) >= Math.abs(dy)
      ? { dx: dx > 0 ? 1 : -1, dy: 0 }
      : { dx: 0, dy: dy > 0 ? 1 : -1 };

    const ratio = 0.4 + rand() * 0.2;
    const tilesToPlace = Math.floor(mainPath.length * ratio);
    let placed = 0;
    let segLen = 3 + Math.floor(rand() * 3);
    let gapLen = 1 + Math.floor(rand() * 2);
    let inSegment = true;
    let counter = 0;

    for (let i = 0; i < mainPath.length && placed < tilesToPlace; i++) {
      const [px, py] = mainPath[i];
      if (inSegment) {
        if (map[py]?.[px] === 0) {
          map[py][px] = 25;
          placed++;
          const dir = mainDirs[i];
          if (dir === 'h' && py + 1 < height - 1 && map[py + 1]?.[px] === 0) {
            map[py + 1][px] = 25;
          } else if (dir === 'v' && px + 1 < width - 1 && map[py]?.[px + 1] === 0) {
            map[py][px + 1] = 25;
          }
        }
        counter++;
        if (counter >= segLen) {
          inSegment = false;
          counter = 0;
          gapLen = 1 + Math.floor(rand() * 2);
        }
      } else {
        counter++;
        if (counter >= gapLen) {
          inSegment = true;
          counter = 0;
          segLen = 3 + Math.floor(rand() * 3);
        }
      }
    }
  }

  // ── Shadow-portal mechanic: place portal pairs ──
  let portalPairs: { a: { x: number; y: number }; b: { x: number; y: number } }[] | undefined;
  if (mechanic === 'shadow-portal') {
    portalPairs = [];
    const PORTAL_TILE = 29;
    const numPairs = floor <= 2 ? 2 : floor <= 4 ? 3 : 4;

    // Pick points along main path
    const splitIndices: number[] = [];
    for (let p = 1; p < numPairs; p++) {
      const frac = p / numPairs;
      const idx = Math.floor(mainPath.length * (frac * 0.6 + 0.2));
      splitIndices.push(Math.min(mainPath.length - 2, Math.max(2, idx)));
    }

    // Place wall segments at split points
    for (const si of splitIndices) {
      const [px, py] = mainPath[si];
      const prev = Math.max(0, si - 1);
      const next = Math.min(mainPath.length - 1, si + 1);
      const [px0, py0] = mainPath[prev];
      const [px1, py1] = mainPath[next];
      if (Math.abs(px1 - px0) > Math.abs(py1 - py0)) {
        for (let dy = -1; dy <= 1; dy++) {
          const wy = py + dy;
          if (wy > 0 && wy < height - 1 && map[wy][px] === 0) map[wy][px] = 1;
        }
      } else {
        for (let dx = -1; dx <= 1; dx++) {
          const wx = px + dx;
          if (wx > 0 && wx < width - 1 && map[py][wx] === 0) map[py][wx] = 1;
        }
      }
    }

    // Place portal pairs on both sides of each split
    for (let si = 0; si < splitIndices.length; si++) {
      const idx = splitIndices[si];
      const findOpen = (startIdx: number, dir: number): { x: number; y: number } | null => {
        for (let offset = 1; offset <= 6; offset++) {
          const pi = startIdx + dir * offset;
          if (pi < 0 || pi >= mainPath.length) continue;
          const [px, py] = mainPath[pi];
          if (px > 1 && px < width - 2 && py > 1 && py < height - 2 && map[py][px] === 0) {
            return { x: px, y: py };
          }
        }
        return null;
      };
      const sideA = findOpen(idx, -1);
      const sideB = findOpen(idx, 1);
      if (sideA && sideB) {
        map[sideA.y][sideA.x] = PORTAL_TILE;
        map[sideB.y][sideB.x] = PORTAL_TILE;
        portalPairs.push({ a: sideA, b: sideB });
      }
    }
  }

  // ── Locked-door key mechanic ──
  // Convert tile 15 (locked doors) appropriately based on mechanic
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (map[y][x] !== 15) continue;
      const n = map[y][x - 1] === 1;
      const s = map[y][x + 1] === 1;
      const e = map[y - 1][x] === 1;
      const w = map[y + 1][x] === 1;
      if (n && s && e && w) map[y][x] = 1; // fully enclosed = wall
    }
  }

  // Convert remaining locked doors based on mechanic
  if (mechanic === 'wind') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (map[y][x] === 15) map[y][x] = 19;
      }
    }
  }

  // Ensure all tiles 5 (bridge) remain for lava
  // Clean up remaining tile 15 if no key mechanic
  if (!hasKey) keyChests.length = 0;

  return {
    map,
    keyChests,
    hiddenRoomChests,
    windCorridorDir,
    portalPairs,
  };
}
