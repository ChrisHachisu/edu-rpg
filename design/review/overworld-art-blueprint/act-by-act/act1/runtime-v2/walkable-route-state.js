const EPSILON = 1e-7;

function finitePoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} must be a finite point`);
  }
}

export function projectRoute(point, route) {
  finitePoint(point, 'position');
  if (!route || !Array.isArray(route.points) || route.points.length < 2) {
    throw new Error('route requires at least two points');
  }
  let best = null;
  let distanceAlong = 0;
  for (let index = 1; index < route.points.length; index += 1) {
    const from = route.points[index - 1], to = route.points[index];
    finitePoint(from, 'route point'); finitePoint(to, 'route point');
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const length2 = length * length;
    const t = length2 <= EPSILON
      ? 0
      : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length2));
    const projected = { x: from.x + dx * t, y: from.y + dy * t };
    const distance2 = (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2;
    const candidate = {
      route,
      routeId: route.id,
      point: projected,
      distance2,
      progress: index - 1 + t,
      distanceAlong: distanceAlong + length * t,
      segmentIndex: index - 1,
    };
    if (!best || distance2 < best.distance2 - EPSILON) best = candidate;
    distanceAlong += length;
  }
  return best;
}

export function selectActiveRoute(
  point,
  input,
  routes,
  currentRouteId,
  { lookahead = 12, hysteresis = 12, maxSwitchDistance = 96 } = {},
) {
  finitePoint(point, 'position'); finitePoint(input, 'movement input');
  if (!Array.isArray(routes) || routes.length === 0) throw new Error('at least one route is required');
  if (![lookahead, hysteresis, maxSwitchDistance].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error('route selection distances must be finite and non-negative');
  }

  const inputLength = Math.hypot(input.x, input.y);
  const sample = inputLength <= EPSILON
    ? point
    : {
        x: point.x + input.x / inputLength * lookahead,
        y: point.y + input.y / inputLength * lookahead,
      };
  const projections = routes.map(route => projectRoute(sample, route));
  projections.sort((left, right) => (
    left.distance2 - right.distance2
    || routes.indexOf(left.route) - routes.indexOf(right.route)
  ));
  const nearest = projections[0];
  const current = projections.find(candidate => candidate.routeId === currentRouteId);
  if (!current) return projectRoute(point, nearest.route);
  if (nearest.routeId === current.routeId) return projectRoute(point, current.route);

  const nearestDistance = Math.sqrt(nearest.distance2);
  const currentDistance = Math.sqrt(current.distance2);
  const ambiguousAlternative = projections.some(candidate => (
    candidate.routeId !== nearest.routeId
    && candidate.routeId !== current.routeId
    && Math.abs(Math.sqrt(candidate.distance2) - nearestDistance) <= hysteresis
  ));
  if (ambiguousAlternative) return projectRoute(point, current.route);
  if (nearestDistance > maxSwitchDistance || currentDistance <= nearestDistance + hysteresis) {
    return projectRoute(point, current.route);
  }
  return projectRoute(point, nearest.route);
}

export function updateForcedAffinity(unlocked, key, progress, affinity, nearRetainArea) {
  if (!(unlocked instanceof Set)) throw new Error('forced-affinity state must be a Set');
  if (typeof key !== 'string' || key === '') throw new Error('forced-affinity key is required');
  if (!Number.isFinite(progress)) throw new Error('forced-affinity progress must be finite');
  const triggered = progress >= affinity.preloadMinProgress
    && (affinity.preloadMaxProgress === undefined || progress <= affinity.preloadMaxProgress);
  if (triggered) unlocked.add(key);
  else if (!nearRetainArea) unlocked.delete(key);
  return triggered || (nearRetainArea && unlocked.has(key));
}
