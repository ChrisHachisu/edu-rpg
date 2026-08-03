const EPSILON = 1e-6;

function finitePoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} must be a finite point`);
  }
}

function segmentConstraint(point, from, to, actorRadius) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / length2));
  const center = { x: from.x + dx * t, y: from.y + dy * t };
  const allowedRadius = Math.max(0, from.halfWidth + (to.halfWidth - from.halfWidth) * t - actorRadius);
  const offsetX = point.x - center.x, offsetY = point.y - center.y;
  const distance = Math.hypot(offsetX, offsetY);
  const scale = distance > allowedRadius && distance > 0 ? allowedRadius / distance : 1;
  return {
    point: { x: center.x + offsetX * scale, y: center.y + offsetY * scale },
    center,
    allowedRadius,
    signedDistance: distance - allowedRadius,
    t,
  };
}

export function nearestCorridorConstraint(point, corridors, actorRadius = 0) {
  finitePoint(point, 'position');
  if (!Array.isArray(corridors) || corridors.length === 0) throw new Error('at least one corridor is required');
  if (!Number.isFinite(actorRadius) || actorRadius < 0) throw new Error('actor radius must be finite and non-negative');

  let nearest = null;
  for (const corridor of corridors) {
    if (!Array.isArray(corridor.points) || corridor.points.length < 2) {
      throw new Error(`corridor ${corridor.id ?? '(unnamed)'} requires at least two points`);
    }
    for (let index = 1; index < corridor.points.length; index += 1) {
      const from = corridor.points[index - 1], to = corridor.points[index];
      finitePoint(from, 'corridor point'); finitePoint(to, 'corridor point');
      if (![from.halfWidth, to.halfWidth].every(value => Number.isFinite(value) && value > actorRadius)) {
        throw new Error('corridor half-width must exceed the actor radius');
      }
      const candidate = segmentConstraint(point, from, to, actorRadius);
      if (!nearest || candidate.signedDistance < nearest.signedDistance) nearest = candidate;
    }
  }
  return nearest;
}

function isOutsideBlockers(point, blockers, actorRadius) {
  for (const blocker of blockers) {
    finitePoint(blocker.from, 'blocker start');
    finitePoint(blocker.to, 'blocker end');
    if (!Number.isFinite(blocker.halfWidth) || blocker.halfWidth < 0) {
      throw new Error('blocker half-width must be finite and non-negative');
    }
    const constraint = segmentConstraint(
      point,
      { ...blocker.from, halfWidth: blocker.halfWidth + actorRadius },
      { ...blocker.to, halfWidth: blocker.halfWidth + actorRadius },
      0,
    );
    if (constraint.signedDistance <= EPSILON) return false;
  }
  return true;
}

export function isInsideCorridors(point, corridors, actorRadius = 0, blockers = []) {
  return nearestCorridorConstraint(point, corridors, actorRadius).signedDistance <= EPSILON
    && isOutsideBlockers(point, blockers, actorRadius);
}

export function constrainCorridorMovement(
  position,
  delta,
  corridors,
  actorRadius = 0,
  maxSubstep = 2,
  blockers = [],
) {
  finitePoint(position, 'position'); finitePoint(delta, 'movement delta');
  if (!Number.isFinite(maxSubstep) || maxSubstep <= 0) throw new Error('max substep must be finite and positive');
  if (!isInsideCorridors(position, corridors, actorRadius, blockers)) throw new Error('movement must start inside a corridor');

  const distance = Math.hypot(delta.x, delta.y);
  const steps = Math.max(1, Math.ceil(distance / maxSubstep));
  const step = { x: delta.x / steps, y: delta.y / steps };
  let current = { ...position };
  for (let index = 0; index < steps; index += 1) {
    const desired = { x: current.x + step.x, y: current.y + step.y };
    if (isInsideCorridors(desired, corridors, actorRadius, blockers)) {
      current = desired;
      continue;
    }
    const projected = nearestCorridorConstraint(desired, corridors, actorRadius).point;
    const candidates = [
      { x: desired.x, y: current.y },
      { x: current.x, y: desired.y },
      projected,
    ].filter(candidate => isInsideCorridors(candidate, corridors, actorRadius, blockers));
    if (candidates.length === 0) continue;
    const distanceToDesired2 = candidate => (
      (candidate.x - desired.x) ** 2 + (candidate.y - desired.y) ** 2
    );
    candidates.sort((left, right) => distanceToDesired2(left) - distanceToDesired2(right));
    current = candidates[0];
  }
  return current;
}

export function projectPolylineProgress(point, polyline) {
  finitePoint(point, 'position');
  if (!Array.isArray(polyline) || polyline.length < 2) throw new Error('polyline requires at least two points');
  let best = null;
  for (let index = 1; index < polyline.length; index += 1) {
    const from = { ...polyline[index - 1], halfWidth: 1 };
    const to = { ...polyline[index], halfWidth: 1 };
    finitePoint(from, 'polyline point'); finitePoint(to, 'polyline point');
    const candidate = segmentConstraint(point, from, to, 0);
    const distance2 = (point.x - candidate.center.x) ** 2 + (point.y - candidate.center.y) ** 2;
    if (!best || distance2 < best.distance2) best = { progress: index - 1 + candidate.t, distance2 };
  }
  return best.progress;
}

export function facingForVector(vector, fallback = 'down', hysteresis = 0.15) {
  finitePoint(vector, 'facing vector');
  if (Math.hypot(vector.x, vector.y) < EPSILON) return fallback;
  const horizontalFallback = fallback === 'left' || fallback === 'right';
  const verticalFallback = fallback === 'up' || fallback === 'down';
  const ax = Math.abs(vector.x), ay = Math.abs(vector.y);
  const tieBand = Math.max(ax, ay) * hysteresis;
  const axis = Math.abs(ax - ay) <= tieBand && (horizontalFallback || verticalFallback)
    ? (horizontalFallback ? 'x' : 'y')
    : (ax > ay ? 'x' : 'y');
  if (axis === 'x') return vector.x < 0 ? 'left' : 'right';
  return vector.y < 0 ? 'up' : 'down';
}
