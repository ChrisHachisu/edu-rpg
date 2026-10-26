// Prints the regenerated Act 1 plate (rows, blockers, plate hash) as JSON, the way the authority test builds it.
import { buildAct1OwnerPaintPlate } from '../act1_owner_paint_plate.mjs';
import { applyLandmarkFootprints } from '../act1_landmark_footprints.mjs';
const plate = buildAct1OwnerPaintPlate();
const proof = applyLandmarkFootprints(plate);
console.log(JSON.stringify({ rows: plate.rows, blockers: plate.landmarkBlockers, plateSha256: plate.plateSha256,
  landmarks: plate.landmarks.map(l => ({ mapId: l.mapId, at: l.at, exit: l.exit, approaches: l.approaches })),
  safe: plate.safeCandidates, report: proof.landmarks.map(r => [r.mapId, r.blocked]) }));
