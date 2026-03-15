// EXP required to reach each level (index = level)
// Growth curve: tuned for ~2 hour game with 5 acts
// Act 1 end ~Lv 6, Act 2 end ~Lv 12, Act 3 end ~Lv 18, Act 4 end ~Lv 24, final boss ~Lv 28-30
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
  820,    // Lv 11 (+40% from here)
  1080,   // Lv 12
  1400,   // Lv 13
  1800,   // Lv 14
  2280,   // Lv 15
  2850,   // Lv 16
  3520,   // Lv 17
  4300,   // Lv 18
  5200,   // Lv 19
  6250,   // Lv 20
  7450,   // Lv 21
  8850,   // Lv 22
  10500,  // Lv 23
  12400,  // Lv 24
  14600,  // Lv 25
  17100,  // Lv 26
  19900,  // Lv 27
  23100,  // Lv 28
  26000,  // Lv 29
  30000,  // Lv 30
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
