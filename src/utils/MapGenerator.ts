// Procedural tilemap generator — creates maps at runtime
// Returns 2D arrays of tile indices matching our generated tilesets

// Overworld tiles: 0=grass, 1=path, 2=water, 3=tree, 4=mountain, 5=bridge, 6=town, 7=cave
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

export function generateOverworldMap(width: number, height: number): number[][] {
  const rand = seededRandom(42);
  const map: number[][] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      // Water borders
      if (x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2) {
        row.push(2);
        continue;
      }

      // Create some water bodies
      const waterNoise = Math.sin(x * 0.3) * Math.cos(y * 0.25) + Math.sin(x * 0.1 + y * 0.15);
      if (waterNoise > 1.2 && y > 10 && y < height - 10) {
        row.push(2);
        continue;
      }

      // Mountains in upper area
      if (y < 20 && x > 40) {
        const mtNoise = Math.sin(x * 0.4) * Math.cos(y * 0.3);
        if (mtNoise > 0.2 && rand() > 0.3) {
          row.push(4);
          continue;
        }
      }

      // Dense forests
      if ((x > 15 && x < 30 && y > 30 && y < 45) || (x > 25 && x < 35 && y > 20 && y < 35)) {
        if (rand() > 0.35) {
          row.push(3);
          continue;
        }
      }

      // Scattered trees
      if (rand() > 0.88 && y > 5 && y < height - 5) {
        row.push(3);
        continue;
      }

      row.push(0); // grass default
    }
    map.push(row);
  }

  // Carve paths between key locations (expanded 5-act network)
  // Paths are organized by act — NO cross-barrier paths
  const paths: [number, number][] = [
    // ── Act 1 — south of river ──
    ...pathBetween(10, 50, 16, 45),   // greenhollow → mistyGrotto
    ...pathBetween(10, 50, 20, 38),   // greenhollow → oakshade
    ...pathBetween(20, 38, 38, 40),   // oakshade → portSapphire
    ...pathBetween(38, 40, 44, 38),   // portSapphire → tidepools
    ...pathBetween(38, 40, 40, 31),   // portSapphire → crystalCave entrance (river south bank)
    ...pathBetween(40, 31, 40, 25),   // guide path through river gap area (overwritten by river, reconnects when gap opens)
    // ── Act 2 — between river and mountains ──
    ...pathBetween(40, 26, 40, 25),   // crystalCave north entrance → Act 2 path
    ...pathBetween(40, 25, 44, 25),   // crystalCave exit → coralTunnels
    ...pathBetween(44, 25, 48, 25),   // coralTunnels → ironkeep
    ...pathBetween(48, 25, 42, 21),   // ironkeep → moonvale
    ...pathBetween(48, 25, 50, 19),   // ironkeep → shadowTower entrance (mountain south face)
    ...pathBetween(50, 19, 50, 14),   // guide path through mountain gap area
    // ── Act 3/4 — between mountains and lava ──
    ...pathBetween(50, 14, 45, 13),   // shadowTower exit → frostpeakCavern
    ...pathBetween(50, 14, 48, 11),   // shadowTower exit → ruinsCamp
    ...pathBetween(48, 11, 52, 11),   // ruinsCamp → sunkenRuins
    ...pathBetween(48, 11, 55, 13),   // ruinsCamp → ashfall
    ...pathBetween(55, 13, 56, 9),    // ashfall → volcanicForge entrance (lava south edge)
    ...pathBetween(56, 9, 56, 6),     // guide path through lava gap area
    // ── Act 5 — north of lava ──
    ...pathBetween(56, 6, 56, 5),     // volcanicForge exit → lastBastion
    ...pathBetween(56, 5, 58, 4),     // lastBastion → demonCastle
    // ── Hidden legendary dungeon paths (Act 5 — remote corners) ──
    ...pathBetween(56, 5, 30, 5),     // lastBastion → westward through demon realm
    ...pathBetween(30, 5, 4, 4),      // → far northwest: Sealed Sanctum
    ...pathBetween(58, 4, 75, 4),     // demonCastle → far northeast: Celestial Vault
  ];

  for (const [px, py] of paths) {
    if (px >= 0 && px < width && py >= 0 && py < height) {
      if (map[py][px] === 2) {
        map[py][px] = 5; // bridge over water
      } else {
        map[py][px] = 1; // path
      }
    }
  }

  // Place town markers (9 towns)
  const towns: [number, number][] = [
    [10, 50], [20, 38], [38, 40], [44, 38], [48, 25],
    [42, 21], [48, 11], [55, 13], [56, 5],
  ];
  for (const [tx, ty] of towns) {
    map[ty][tx] = 6;
  }

  // Place dungeon entrances (11 dungeons — 8 original + 1 gate north + 2 hidden legendary)
  const dungeons: [number, number][] = [
    [16, 45], [40, 31], [40, 26], [44, 25], [50, 19],
    [45, 13], [52, 11], [56, 9], [58, 4],
    [4, 4], [75, 4],
  ];
  for (const [dx, dy] of dungeons) {
    map[dy][dx] = 7;
  }

  // ── Physical terrain barriers (always solid — portals provide inter-act travel) ──

  // --- River barrier between Act 1 and Act 2 ---
  // Meanders around y≈29 with sinusoidal variation, 2-3 tiles wide
  const riverBaseY = 29;
  for (let x = 2; x <= width - 3; x++) {
    const meander = Math.round(
      Math.sin(x * 0.12) * 2 + Math.cos(x * 0.07 + 1.5) * 1
    );
    const centerY = riverBaseY + meander;
    const extraWidth = Math.sin(x * 0.22 + 0.7) > 0.3 ? 1 : 0;
    const riverTop = centerY;
    const riverBot = centerY + 1 + extraWidth;

    for (let ry = riverTop; ry <= riverBot; ry++) {
      if (ry >= 2 && ry < height - 2) {
        map[ry][x] = 2; // water — always solid
      }
    }

    // Scatter trees along riverbanks for organic look
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

  // --- Mountain barrier between Act 2 and Act 3 ---
  // Meanders around y≈16 with sinusoidal ridgeline, 2-3 tiles wide
  const mtBaseY = 16;
  for (let x = 2; x <= width - 3; x++) {
    const meander = Math.round(
      Math.sin(x * 0.1 + 2) * 1.5 + Math.cos(x * 0.06) * 1
    );
    const centerY = mtBaseY + meander;
    const extraWidth = Math.cos(x * 0.18 + 1) > 0.2 ? 1 : 0;
    const mtTop = centerY;
    const mtBot = centerY + 1 + extraWidth;

    for (let my = mtTop; my <= mtBot; my++) {
      if (my >= 2 && my < height - 2) {
        map[my][x] = 4; // mountain — always solid
      }
    }

    // Scatter trees at mountain base
    const below = mtBot + 1;
    if (below >= 2 && below < height - 2
        && (map[below][x] === 0 || map[below][x] === 1)
        && Math.sin(x * 0.6 + 1) > 0.4) {
      map[below][x] = 3;
    }
  }

  // --- Lava barrier between Act 4 and Act 5 ---
  // Meanders around y≈8 with sinusoidal variation, 1-2 tiles wide
  const lavaBaseY = 8;
  for (let x = 2; x <= width - 3; x++) {
    const meander = Math.round(
      Math.sin(x * 0.14 + 3) * 1.5 + Math.cos(x * 0.08 + 2) * 0.8
    );
    const centerY = lavaBaseY + meander;
    const extraWidth = Math.sin(x * 0.25 + 1.5) > 0.4 ? 1 : 0;
    const lavaTop = centerY;
    const lavaBot = centerY + extraWidth;

    for (let ly = lavaTop; ly <= lavaBot; ly++) {
      if (ly >= 2 && ly < height - 2) {
        map[ly][x] = 4; // mountain tile (impassable) — always solid
      }
    }
  }

  return map;
}

function pathBetween(x1: number, y1: number, x2: number, y2: number): [number, number][] {
  const points: [number, number][] = [];
  let x = x1, y = y1;

  while (x !== x2 || y !== y2) {
    points.push([x, y]);
    // Prefer horizontal then vertical
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

  // Place houses (3×2 each): top-left corner of each house
  const houses: { x: number; y: number }[] = [
    { x: 2, y: 2 },                                  // top-left house
    { x: width - 5, y: 2 },                          // top-right house
    { x: 2, y: 7 },                                  // mid-left house
    { x: width - 5, y: 7 },                          // mid-right house
    { x: 2, y: 11 },                                 // bottom-left house
  ];
  for (const h of houses) placeHouse(h.x, h.y);

  // Place shop (3×2, bottom-right area)
  const shopX = width - 5;
  const shopY = 11;
  placeShop(shopX, shopY);

  // Side paths connecting buildings to main road
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

  // Save point on main road
  map[10][cx] = 6;

  // Small water feature near plaza (varies by seed)
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
  cx: number; cy: number; // center
}

/**
 * Generate a dungeon floor map.
 * @param width    - map width in tiles
 * @param height   - map height in tiles
 * @param seed     - base seed for this dungeon
 * @param floor    - 1-based floor index (default 1)
 * @param totalFloors - total number of floors in this dungeon (default 1)
 * @param gate     - gate dungeon mode: stairs at BOTH top and bottom, boss near top
 */
export function generateDungeonMap(
  width: number, height: number, seed: number,
  floor: number = 1, totalFloors: number = 1,
  gate: boolean = false,
): number[][] {
  // Unique seed per floor
  const floorSeed = seed + (floor - 1) * 997;
  const rand = seededRandom(floorSeed);

  const isFirstFloor = floor === 1;
  const isFinalFloor = floor === totalFloors;

  // Start with all walls
  const map: number[][] = Array.from({ length: height }, () => new Array(width).fill(1));

  // --- Generate rooms ---
  const rooms: Room[] = [];
  const roomCount = Math.floor(5 + (width + height) / 10); // 7-11 rooms depending on size
  const minRoomSize = 3;
  const maxRoomSize = Math.min(7, Math.floor(width / 4));

  // Gate dungeons reserve extra rows at both ends for boss room (top) and south entrance (bottom)
  const roomYMin = gate ? 6 : 2;
  const roomYMax = gate ? height - 6 : height - 4;

  for (let attempt = 0; attempt < 200 && rooms.length < roomCount; attempt++) {
    const rw = minRoomSize + Math.floor(rand() * (maxRoomSize - minRoomSize + 1));
    const rh = minRoomSize + Math.floor(rand() * (maxRoomSize - minRoomSize + 1));
    const rx = 1 + Math.floor(rand() * (width - rw - 2));
    const ry = roomYMin + Math.floor(rand() * (roomYMax - rh - roomYMin)); // leave reserved rows

    // Check overlap (with 1-tile margin)
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

  // Sort rooms top-to-bottom for progression
  rooms.sort((a, b) => a.cy - b.cy);

  // --- Carve rooms ---
  for (const room of rooms) {
    for (let ry = room.y; ry < room.y + room.h; ry++) {
      for (let rx = room.x; rx < room.x + room.w; rx++) {
        map[ry][rx] = rand() > 0.92 ? 2 : 0; // mostly floor, occasional cracked
      }
    }
  }

  // --- Connect rooms with L-shaped corridors ---
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i];
    const b = rooms[i + 1];
    carveLCorridor(map, a.cx, a.cy, b.cx, b.cy, rand);
  }

  // --- Add a few extra connections for loops (makes it less linear) ---
  for (let i = 0; i < rooms.length - 2; i++) {
    if (rand() > 0.55) {
      const a = rooms[i];
      const b = rooms[i + 2];
      carveLCorridor(map, a.cx, a.cy, b.cx, b.cy, rand);
    }
  }

  // --- Add dead-end branches with treasure ---
  const treasurePositions: [number, number][] = [];
  for (let i = 0; i < rooms.length; i++) {
    if (rand() > 0.4 && treasurePositions.length < Math.floor(roomCount / 2)) {
      // Extend a branch from this room in a random direction
      const room = rooms[i];
      const dirs = shuffleArray([[0, -1], [0, 1], [-1, 0], [1, 0]], rand);
      for (const [dx, dy] of dirs) {
        const branchLen = 2 + Math.floor(rand() * 3);
        let ex = room.cx + dx * (Math.floor(room.w / 2) + branchLen);
        let ey = room.cy + dy * (Math.floor(room.h / 2) + branchLen);
        ex = Math.max(1, Math.min(width - 2, ex));
        ey = Math.max(2, Math.min(height - 4, ey));

        // Only if target is still a wall
        if (map[ey][ex] === 1) {
          carveLCorridor(map, room.cx, room.cy, ex, ey, rand);
          // Small alcove at end
          map[ey][ex] = 0;
          treasurePositions.push([ex, ey]);
          break;
        }
      }
    }
  }

  // If no treasure spots yet, place in some rooms
  if (treasurePositions.length === 0) {
    for (let i = 1; i < rooms.length - 1 && treasurePositions.length < 2; i++) {
      const r = rooms[i];
      treasurePositions.push([r.x + 1, r.y + 1]);
    }
  }

  // Place treasure chests
  for (const [tx, ty] of treasurePositions) {
    if (tx > 0 && tx < width - 1 && ty > 0 && ty < height - 1) {
      map[ty][tx] = 4;
    }
  }

  const entranceX = Math.floor(width / 2);

  if (gate) {
    // ── Gate dungeon: stairs at BOTH top and bottom, boss near top ──

    // --- North exit area (top): stair + boss blocking corridor ---
    map[0][entranceX] = 6; // stairs-up → Act 2 exit
    // Boss at y=1 in a 1-tile-wide corridor — cannot be walked around
    map[1][entranceX] = 7; // boss tile — blocks only passage to north stair
    // Boss fight room (5×3) at y=2..4 — open area south of boss
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const bx = entranceX + dx;
        const by = 2 + dy;
        if (bx > 0 && bx < width - 1 && by > 0 && by < height - 1) {
          map[by][bx] = 0;
        }
      }
    }
    // Connect first room to boss fight room (south side at y=4)
    if (rooms.length > 0) {
      carveLCorridor(map, entranceX, 4, rooms[0].cx, rooms[0].cy, rand);
    }

    // --- South entrance area (bottom): stair + room ---
    map[height - 1][entranceX] = 6; // stairs-up → Act 1 exit
    for (let dx = -1; dx <= 1; dx++) {
      const ex = entranceX + dx;
      if (ex > 0 && ex < width - 1) {
        map[height - 2][ex] = 0;
        map[height - 3][ex] = 0;
      }
    }
    // South room (5×3) at y=(height-6)..(height-4)
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const bx = entranceX + dx;
        const by = (height - 6) + dy;
        if (bx > 0 && bx < width - 1 && by > 0 && by < height - 1) {
          map[by][bx] = 0;
        }
      }
    }
    // Connect last room to south entrance area
    if (rooms.length > 0) {
      const lastRoom = rooms[rooms.length - 1];
      carveLCorridor(map, lastRoom.cx, lastRoom.cy, entranceX, height - 6, rand);
    }
  } else {
    // ── Standard dungeon: entrance at top, boss/stairs at bottom ──

    // --- Entrance at top ---
    // Carve entrance area
    for (let dx = -1; dx <= 1; dx++) {
      const ex = entranceX + dx;
      if (ex > 0 && ex < width - 1) {
        map[1][ex] = 0;
        map[2][ex] = 0;
      }
    }
    // Floor 1: stairs-up exits to overworld; deeper floors: stairs-up goes to previous floor
    map[0][entranceX] = 6; // tile 6 = stairs-up
    // Connect entrance to nearest room
    if (rooms.length > 0) {
      carveLCorridor(map, entranceX, 2, rooms[0].cx, rooms[0].cy, rand);
    }

    // --- Bottom area: boss (final floor) or stairs-down (non-final floor) ---
    const bottomX = entranceX;
    const bottomRoomY = height - 3;
    // Carve bottom room (5×3)
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const bx = bottomX + dx;
        const by = bottomRoomY + dy;
        if (bx > 0 && bx < width - 1 && by > 0 && by < height - 1) {
          map[by][bx] = 0;
        }
      }
    }
    // Bottom room entrance
    map[bottomRoomY - 1][bottomX] = 0;
    // Connect last room to bottom room
    if (rooms.length > 0) {
      const lastRoom = rooms[rooms.length - 1];
      carveLCorridor(map, lastRoom.cx, lastRoom.cy, bottomX, bottomRoomY - 1, rand);
    }

    if (isFinalFloor) {
      // Boss marker at center of bottom room
      map[bottomRoomY + 1][bottomX] = 7;
    } else {
      // Stairs-down to next floor
      map[bottomRoomY + 1][bottomX] = 9; // tile 9 = stairs-down
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

  // L-shaped: go horizontal first or vertical first (random)
  const horizFirst = rand() > 0.5;

  let cx = x1, cy = y1;

  if (horizFirst) {
    // Horizontal leg
    while (cx !== x2) {
      if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1 && map[cy][cx] === 1) {
        map[cy][cx] = 0;
      }
      cx += cx < x2 ? 1 : -1;
    }
    // Vertical leg
    while (cy !== y2) {
      if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1 && map[cy][cx] === 1) {
        map[cy][cx] = 0;
      }
      cy += cy < y2 ? 1 : -1;
    }
  } else {
    // Vertical leg
    while (cy !== y2) {
      if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1 && map[cy][cx] === 1) {
        map[cy][cx] = 0;
      }
      cy += cy < y2 ? 1 : -1;
    }
    // Horizontal leg
    while (cx !== x2) {
      if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1 && map[cy][cx] === 1) {
        map[cy][cx] = 0;
      }
      cx += cx < x2 ? 1 : -1;
    }
  }
  // Carve final tile
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
