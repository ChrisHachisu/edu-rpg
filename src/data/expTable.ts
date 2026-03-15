// EXP required to reach each level (index = level)
// Growth curve: roughly level^2.2 * 8, tuned for ~3 hour game
export const expTable: number[] = [
  0,      // Lv 0 (unused)
  0,      // Lv 1 (start)
  10,     // Lv 2
  30,     // Lv 3
  60,     // Lv 4
  100,    // Lv 5
  160,    // Lv 6
  240,    // Lv 7
  340,    // Lv 8
  470,    // Lv 9
  620,    // Lv 10
  800,    // Lv 11
  1010,   // Lv 12
  1260,   // Lv 13
  1550,   // Lv 14
  1880,   // Lv 15
  2260,   // Lv 16
  2700,   // Lv 17
  3200,   // Lv 18
  3780,   // Lv 19
  4440,   // Lv 20
  5200,   // Lv 21
  6060,   // Lv 22
  7040,   // Lv 23
  8150,   // Lv 24
  9400,   // Lv 25
  10800,  // Lv 26
  12400,  // Lv 27
  14200,  // Lv 28
  16300,  // Lv 29
  18700,  // Lv 30
];

// Stat gains per level: [hp, atk, def, spd]
export const levelUpGains: [number, number, number, number][] = [
  [0, 0, 0, 0],  // Lv 0
  [0, 0, 0, 0],  // Lv 1 (start stats)
  [5, 1, 1, 1],  // Lv 2
  [6, 2, 1, 1],  // Lv 3
  [5, 1, 2, 1],  // Lv 4
  [7, 2, 1, 2],  // Lv 5
  [6, 2, 2, 1],  // Lv 6
  [8, 1, 2, 1],  // Lv 7
  [5, 3, 1, 2],  // Lv 8
  [7, 2, 2, 1],  // Lv 9
  [8, 2, 3, 2],  // Lv 10
  [6, 3, 2, 1],  // Lv 11
  [7, 2, 2, 2],  // Lv 12
  [8, 3, 2, 1],  // Lv 13
  [6, 2, 3, 2],  // Lv 14
  [9, 3, 2, 2],  // Lv 15
  [7, 2, 3, 1],  // Lv 16
  [8, 3, 2, 2],  // Lv 17
  [7, 3, 3, 2],  // Lv 18
  [9, 2, 3, 2],  // Lv 19
  [8, 4, 3, 2],  // Lv 20
  [8, 3, 3, 2],  // Lv 21
  [9, 3, 3, 2],  // Lv 22
  [8, 3, 4, 2],  // Lv 23
  [10, 4, 3, 2], // Lv 24
  [9, 3, 4, 3],  // Lv 25
  [10, 4, 3, 2], // Lv 26
  [9, 4, 4, 2],  // Lv 27
  [11, 3, 4, 3], // Lv 28
  [10, 5, 4, 2], // Lv 29
  [12, 4, 5, 3], // Lv 30
];
