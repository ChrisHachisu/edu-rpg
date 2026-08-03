export const ACT1_LANDMARK_IDS = [
  'greenhollow',
  'millbrook',
  'portSapphire',
  'mistyGrotto',
  'crystalCave',
  'sunkenCellar',
  'whisperingWoodsCave',
  'coastalReef',
] as const;

export type Act1LandmarkId = typeof ACT1_LANDMARK_IDS[number];

export interface Act1LandmarkRenderRecipe {
  environment: string;
  assembly: string;
}

function recipe(environment: string, assembly: string): Readonly<Act1LandmarkRenderRecipe> {
  return Object.freeze({ environment, assembly });
}

/**
 * Renderer-owned art direction for natural landmark thresholds. Semantic data owns only
 * the walkable threshold and adjacent approach; the renderer composes the surrounding terrain.
 */
export const ACT1_LANDMARK_RENDER_RECIPES = Object.freeze({
  greenhollow: recipe('old-growth forest', 'old-growth village threshold'),
  millbrook: recipe('lakeside meadow', 'lakeside mill-settlement threshold'),
  portSapphire: recipe('sheltered coast', 'coastal harbor-and-street threshold'),
  mistyGrotto: recipe('misty forest cliff', 'misty forest-cliff grotto mouth'),
  crystalCave: recipe('crystal-bearing ridge', 'crystal mountain cave mouth'),
  sunkenCellar: recipe('coastal ruin', 'ruined coastal cellar descent'),
  whisperingWoodsCave: recipe('dark old-growth forest', 'root-wrapped forest cave mouth'),
  coastalReef: recipe('tidal coast', 'tide-channel reef descent'),
}) satisfies Readonly<Record<Act1LandmarkId, Readonly<Act1LandmarkRenderRecipe>>>;
