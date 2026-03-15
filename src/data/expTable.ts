// EXP required to reach each level (index = level)
// Growth curve: tuned for ~3-4 hour game with 5 acts, 22 dungeon floors
// Act 1 end ~Lv 6, Act 2 end ~Lv 12, Act 3 end ~Lv 18, Act 4 end ~Lv 24, final boss ~Lv 28-30
export const expTable: number[] = [
  0,      // Lv 0 (unused)
  0,      // Lv 1 (start)
  17,     // Lv 2
  50,     // Lv 3
  100,    // Lv 4
  170,    // Lv 5
  270,    // Lv 6
  410,    // Lv 7
  580,    // Lv 8
  800,    // Lv 9
  1060,   // Lv 10
  1400,   // Lv 11
  1840,   // Lv 12
  2400,   // Lv 13
  3060,   // Lv 14
  3880,   // Lv 15
  4850,   // Lv 16
  5980,   // Lv 17
  7400,   // Lv 18
  8900,   // Lv 19
  10700,  // Lv 20
  12700,  // Lv 21
  15000,  // Lv 22
  17900,  // Lv 23
  21500,  // Lv 24
  25000,  // Lv 25
  29000,  // Lv 26
  34000,  // Lv 27
  39500,  // Lv 28
  45000,  // Lv 29
  52000,  // Lv 30
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
