import { Point, Route, SemanticMap, Terrain, pointKey } from './semanticMap.js';

const WIDTH = 30;
const HEIGHT = 24;

export function buildStarterOverworld(seed: number): SemanticMap {
  const random = seededRandom(seed);
  const terrain: Terrain[][] = Array.from({ length: HEIGHT }, (_, y) => (
    Array.from({ length: WIDTH }, (_, x) => {
      if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) return 'water';
      if (x >= 23 && y <= 7) return 'mountain';
      if (x >= 22 && y >= 17) return 'water';
      const roll = random();
      if (roll < 0.1) return 'mountain';
      if (roll < 0.88) return 'forest';
      return 'ground';
    })
  ));

  const routes: Route[] = [
    { id: 'greenhollow-to-sunken-cellar', cells: cardinalPath({ x: 5, y: 20 }, { x: 2, y: 21 }) },
    { id: 'greenhollow-to-whispering-woods-cave', cells: cardinalPath({ x: 5, y: 20 }, { x: 7, y: 10 }) },
    { id: 'greenhollow-to-millbrook', cells: cardinalPath({ x: 5, y: 20 }, { x: 10, y: 16 }) },
    { id: 'millbrook-to-port-sapphire', cells: cardinalPath({ x: 10, y: 16 }, { x: 19, y: 14 }) },
    { id: 'port-sapphire-to-coastal-reef', cells: cardinalPath({ x: 19, y: 14 }, { x: 25, y: 19 }) },
    { id: 'port-sapphire-to-darkfang', cells: cardinalPath({ x: 19, y: 14 }, { x: 16, y: 8 }) },
    { id: 'port-sapphire-to-crystal-cave', cells: cardinalPath({ x: 19, y: 14 }, { x: 25, y: 4 }) },
  ];
  const clearings = uniquePoints([
    ...squareAround({ x: 5, y: 20 }, 1),
    ...squareAround({ x: 10, y: 16 }, 1),
    ...squareAround({ x: 19, y: 14 }, 1),
    ...squareAround({ x: 16, y: 8 }, 1),
    ...squareAround({ x: 25, y: 4 }, 1),
    ...squareAround({ x: 2, y: 21 }, 1),
    ...squareAround({ x: 7, y: 10 }, 1),
    ...squareAround({ x: 25, y: 19 }, 1),
  ]);

  for (const point of [...routes.flatMap(route => route.cells), ...clearings]) {
    terrain[point.y][point.x] = 'ground';
  }

  return {
    id: 'overworld-act1-slice',
    kind: 'overworld',
    revision: 3,
    seed,
    width: WIDTH,
    height: HEIGHT,
    terrain,
    routes,
    clearings,
    landmarks: [
      {
        id: 'greenhollow',
        kind: 'town',
        at: { x: 4, y: 20 },
        approach: { x: 5, y: 20 },
        transition: { targetMapId: 'greenhollow', arrival: { x: 8, y: 14 } },
      },
      {
        id: 'millbrook',
        kind: 'town',
        at: { x: 9, y: 16 },
        approach: { x: 10, y: 16 },
        transition: { targetMapId: 'millbrook', arrival: { x: 8, y: 14 } },
      },
      {
        id: 'portSapphire',
        kind: 'town',
        at: { x: 20, y: 14 },
        approach: { x: 19, y: 14 },
        transition: { targetMapId: 'portSapphire', arrival: { x: 8, y: 14 } },
      },
      {
        id: 'mistyGrotto',
        kind: 'dungeon',
        at: { x: 15, y: 8 },
        approach: { x: 16, y: 8 },
        transition: { targetMapId: 'mistyGrotto', arrival: { x: 50, y: 1 }, floor: 1 },
      },
      {
        id: 'crystalCave',
        kind: 'dungeon',
        at: { x: 26, y: 4 },
        approach: { x: 25, y: 4 },
        transition: { targetMapId: 'crystalCave', arrival: { x: 50, y: 99 }, floor: 1 },
      },
      {
        id: 'sunkenCellar',
        kind: 'dungeon',
        at: { x: 1, y: 21 },
        approach: { x: 2, y: 21 },
        transition: { targetMapId: 'sunkenCellar', arrival: { x: 50, y: 1 }, floor: 1 },
      },
      {
        id: 'whisperingWoodsCave',
        kind: 'dungeon',
        at: { x: 6, y: 10 },
        approach: { x: 7, y: 10 },
        transition: { targetMapId: 'whisperingWoodsCave', arrival: { x: 50, y: 1 }, floor: 1 },
      },
      {
        id: 'coastalReef',
        kind: 'dungeon',
        at: { x: 26, y: 19 },
        approach: { x: 25, y: 19 },
        transition: { targetMapId: 'coastalReef', arrival: { x: 50, y: 1 }, floor: 1 },
      },
    ],
    specials: [],
    // ponytail: optional quest entry guards stay in the retained adapter until exact boolean flags are defined.
    progressionGates: [
      {
        id: 'crystal-cave-seal',
        at: { x: 25, y: 6 },
        requiredFlag: 'boss.giantToad.defeated',
      },
    ],
  };
}

function cardinalPath(from: Point, to: Point): Point[] {
  const cells: Point[] = [{ ...from }];
  let { x, y } = from;

  while (x !== to.x) {
    x += Math.sign(to.x - x);
    cells.push({ x, y });
  }
  while (y !== to.y) {
    y += Math.sign(to.y - y);
    cells.push({ x, y });
  }

  return cells;
}

function squareAround(center: Point, radius: number): Point[] {
  const cells: Point[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) cells.push({ x, y });
  }
  return cells;
}

function uniquePoints(points: Point[]): Point[] {
  return [...new Map(points.map(point => [pointKey(point), point])).values()];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
