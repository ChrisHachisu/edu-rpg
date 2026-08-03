const EPSILON = 1e-7;
const SWEEP_ITERATIONS = 24;

function finitePoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} must be a finite point`);
  }
}

function samePoint(left, right) {
  return Math.abs(left.x - right.x) <= EPSILON
    && Math.abs(left.y - right.y) <= EPSILON;
}

function ringVertices(ring) {
  if (!Array.isArray(ring)) return ring;
  return ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : ring;
}

function eachRingEdge(ring, visit) {
  const points = ringVertices(ring);
  for (let index = 0; index < points.length; index += 1) {
    visit(points[index], points[(index + 1) % points.length], index);
  }
}

export function closestPointOnSegment(point, from, to) {
  finitePoint(point, 'position'); finitePoint(from, 'segment start'); finitePoint(to, 'segment end');
  const dx = to.x - from.x, dy = to.y - from.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 <= EPSILON
    ? 0
    : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length2));
  return { x: from.x + dx * t, y: from.y + dy * t, t };
}

export function distanceToSegment(point, from, to) {
  const nearest = closestPointOnSegment(point, from, to);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

export function polygonSignedArea(ring) {
  const points = ringVertices(ring);
  if (!Array.isArray(points) || points.length < 3) return 0;
  let twiceArea = 0;
  eachRingEdge(points, (from, to) => {
    twiceArea += from.x * to.y - to.x * from.y;
  });
  return twiceArea / 2;
}

function pointOnRing(point, ring) {
  let onBoundary = false;
  eachRingEdge(ring, (from, to) => {
    if (distanceToSegment(point, from, to) <= EPSILON) onBoundary = true;
  });
  return onBoundary;
}

export function pointInRing(point, ring, includeBoundary = true) {
  finitePoint(point, 'position');
  const points = ringVertices(ring);
  if (!Array.isArray(points) || points.length < 3) throw new Error('polygon ring requires at least three points');
  if (pointOnRing(point, points)) return includeBoundary;

  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const from = points[previous], to = points[index];
    const crosses = (from.y > point.y) !== (to.y > point.y)
      && point.x < (to.x - from.x) * (point.y - from.y) / (to.y - from.y) + from.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function ringClearance(point, ring) {
  let clearance = Infinity;
  eachRingEdge(ring, (from, to) => {
    clearance = Math.min(clearance, distanceToSegment(point, from, to));
  });
  return clearance;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function between(value, first, second) {
  return value >= Math.min(first, second) - EPSILON && value <= Math.max(first, second) + EPSILON;
}

function pointOnSegment(point, from, to) {
  return Math.abs(orientation(from, to, point)) <= EPSILON
    && between(point.x, from.x, to.x)
    && between(point.y, from.y, to.y);
}

function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c), abD = orientation(a, b, d);
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return (Math.abs(abC) <= EPSILON && pointOnSegment(c, a, b))
    || (Math.abs(abD) <= EPSILON && pointOnSegment(d, a, b))
    || (Math.abs(cdA) <= EPSILON && pointOnSegment(a, c, d))
    || (Math.abs(cdB) <= EPSILON && pointOnSegment(b, c, d));
}

function validateRing(ring, label, bounds) {
  const points = ringVertices(ring);
  if (!Array.isArray(points) || points.length < 3) throw new Error(`${label} requires at least three points`);
  for (const [index, point] of points.entries()) {
    finitePoint(point, `${label} point ${index}`);
    if (bounds && (
      point.x < bounds.minX || point.x > bounds.maxX
      || point.y < bounds.minY || point.y > bounds.maxY
    )) {
      throw new Error(`${label} point ${index} is outside source bounds`);
    }
    const next = points[(index + 1) % points.length];
    if (samePoint(point, next)) throw new Error(`${label} has a zero-length edge at ${index}`);
    for (let other = index + 1; other < points.length; other += 1) {
      if (samePoint(point, points[other])) throw new Error(`${label} repeats a vertex at ${index}/${other}`);
    }
  }
  if (Math.abs(polygonSignedArea(points)) <= EPSILON) throw new Error(`${label} must have non-zero area`);

  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (left === right || leftNext === right || rightNext === left) continue;
      if (segmentsIntersect(points[left], points[leftNext], points[right], points[rightNext])) {
        throw new Error(`${label} self-intersects at edges ${left}/${right}`);
      }
    }
  }
  return points;
}

function ringsIntersect(left, right) {
  let intersects = false;
  eachRingEdge(left, (a, b) => {
    eachRingEdge(right, (c, d) => {
      if (segmentsIntersect(a, b, c, d)) intersects = true;
    });
  });
  return intersects;
}

function sourceBounds(data) {
  if (!data) return null;
  if (Number.isFinite(data.width) && Number.isFinite(data.height)) {
    return { minX: 0, minY: 0, maxX: data.width, maxY: data.height };
  }
  const candidate = data.source || data.bounds;
  if (!candidate) return null;
  let minX = 0, minY = 0, maxX, maxY;
  if (Array.isArray(candidate)) {
    if (candidate.length === 2) [maxX, maxY] = candidate;
    else if (candidate.length === 4) [minX, minY, maxX, maxY] = candidate;
  } else if (Number.isFinite(candidate.width) && Number.isFinite(candidate.height)) {
    minX = candidate.x ?? candidate.minX ?? 0;
    minY = candidate.y ?? candidate.minY ?? 0;
    maxX = minX + candidate.width;
    maxY = minY + candidate.height;
  } else {
    minX = candidate.minX;
    minY = candidate.minY;
    maxX = candidate.maxX;
    maxY = candidate.maxY;
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) {
    throw new Error('walkable geometry source bounds must be finite and positive');
  }
  return { minX, minY, maxX, maxY };
}

export function validateWalkableGeometry(data) {
  if (!data || typeof data !== 'object') throw new Error('walkable geometry data is required');
  if (!Array.isArray(data.regions) || data.regions.length === 0) {
    throw new Error('walkable geometry requires at least one region');
  }
  const bounds = sourceBounds(data);
  const ids = new Set();
  for (const [regionIndex, region] of data.regions.entries()) {
    if (!region || typeof region.id !== 'string' || region.id.trim() === '') {
      throw new Error(`walkable region ${regionIndex} requires a non-empty id`);
    }
    if (ids.has(region.id)) throw new Error(`duplicate walkable geometry id ${region.id}`);
    ids.add(region.id);
    if (typeof region.role !== 'string' || region.role.trim() === '') {
      throw new Error(`walkable region ${region.id} requires a non-empty role`);
    }
    const outer = validateRing(region.outer, `walkable region ${region.id} outer`, bounds);
    const holes = region.holes || [];
    if (!Array.isArray(holes)) throw new Error(`walkable region ${region.id} holes must be an array`);
    const validatedHoles = holes.map((hole, holeIndex) => (
      validateRing(hole, `walkable region ${region.id} hole ${holeIndex}`, bounds)
    ));
    for (const [holeIndex, hole] of validatedHoles.entries()) {
      if (!pointInRing(hole[0], outer, false) || ringsIntersect(outer, hole)) {
        throw new Error(`walkable region ${region.id} hole ${holeIndex} must be strictly inside its outer ring`);
      }
      for (let other = 0; other < holeIndex; other += 1) {
        if (ringsIntersect(hole, validatedHoles[other])
          || pointInRing(hole[0], validatedHoles[other], true)
          || pointInRing(validatedHoles[other][0], hole, true)) {
          throw new Error(`walkable region ${region.id} holes ${other}/${holeIndex} overlap`);
        }
      }
    }
  }

  const streamingAffinity = data.streamingAffinity || [];
  if (!Array.isArray(streamingAffinity)) throw new Error('streaming affinity must be an array');
  const affinityKeys = new Set();
  for (const [index, affinity] of streamingAffinity.entries()) {
    if (!affinity || typeof affinity.regionId !== 'string' || affinity.regionId.trim() === '') {
      throw new Error(`streaming affinity ${index} requires a non-empty region id`);
    }
    if (typeof affinity.routeId !== 'string' || affinity.routeId.trim() === '') {
      throw new Error(`streaming affinity ${index} requires a non-empty route id`);
    }
    const key = `${affinity.regionId}\u0000${affinity.routeId}`;
    if (affinityKeys.has(key)) throw new Error(`duplicate streaming affinity ${affinity.regionId}/${affinity.routeId}`);
    affinityKeys.add(key);
    for (const field of [
      'preloadMinProgress', 'preloadMaxProgress', 'drawMinProgress', 'drawMaxProgress',
    ]) {
      if (affinity[field] !== undefined && !Number.isFinite(affinity[field])) {
        throw new Error(`streaming affinity ${affinity.regionId}/${affinity.routeId} ${field} must be finite`);
      }
    }
    if (affinity.forcePreload !== undefined && typeof affinity.forcePreload !== 'boolean') {
      throw new Error(`streaming affinity ${affinity.regionId}/${affinity.routeId} forcePreload must be boolean`);
    }
    if (affinity.forcePreload && affinity.preloadMinProgress === undefined) {
      throw new Error(`streaming affinity ${affinity.regionId}/${affinity.routeId} forced preload needs a minimum progress`);
    }
    if (affinity.forcePreload && (!Number.isFinite(affinity.retainMargin) || affinity.retainMargin < 0)) {
      throw new Error(`streaming affinity ${affinity.regionId}/${affinity.routeId} forced preload needs a non-negative retain margin`);
    }
    if (affinity.preloadMinProgress !== undefined && affinity.drawMinProgress !== undefined
      && affinity.preloadMinProgress > affinity.drawMinProgress) {
      throw new Error(`streaming affinity ${affinity.regionId}/${affinity.routeId} preload must begin no later than draw`);
    }
    if (affinity.preloadMaxProgress !== undefined && affinity.drawMaxProgress !== undefined
      && affinity.preloadMaxProgress < affinity.drawMaxProgress) {
      throw new Error(`streaming affinity ${affinity.regionId}/${affinity.routeId} preload must end no earlier than draw`);
    }
  }

  const staticObstacles = data.staticObstacles || [];
  if (!Array.isArray(staticObstacles)) throw new Error('static obstacles must be an array');
  for (const [index, obstacle] of staticObstacles.entries()) {
    if (!obstacle || typeof obstacle.id !== 'string' || obstacle.id.trim() === '') {
      throw new Error(`static obstacle ${index} requires a non-empty id`);
    }
    if (ids.has(obstacle.id)) throw new Error(`duplicate walkable geometry id ${obstacle.id}`);
    ids.add(obstacle.id);
    if (typeof obstacle.kind !== 'string' || obstacle.kind.trim() === '') {
      throw new Error(`static obstacle ${obstacle.id} requires a non-empty kind`);
    }
    validateRing(obstacle.polygon, `static obstacle ${obstacle.id}`, bounds);
  }

  const blockers = data.dynamicBlockers || [];
  if (!Array.isArray(blockers)) throw new Error('dynamic blockers must be an array');
  for (const [index, blocker] of blockers.entries()) {
    if (!blocker || typeof blocker.id !== 'string' || blocker.id.trim() === '') {
      throw new Error(`dynamic blocker ${index} requires a non-empty id`);
    }
    if (ids.has(blocker.id)) throw new Error(`duplicate walkable geometry id ${blocker.id}`);
    ids.add(blocker.id);
    finitePoint(blocker.from, `dynamic blocker ${blocker.id} start`);
    finitePoint(blocker.to, `dynamic blocker ${blocker.id} end`);
    if (bounds && [blocker.from, blocker.to].some(point => (
      point.x < bounds.minX || point.x > bounds.maxX
      || point.y < bounds.minY || point.y > bounds.maxY
    ))) throw new Error(`dynamic blocker ${blocker.id} is outside source bounds`);
    if (!Number.isFinite(blocker.halfWidth) || blocker.halfWidth < 0) {
      throw new Error(`dynamic blocker ${blocker.id} half-width must be finite and non-negative`);
    }
  }

  const actorRadius = data.actorFootRadius ?? 0;
  const maxSubstep = data.maxSubstep ?? 2;
  if (!Number.isFinite(actorRadius) || actorRadius < 0) {
    throw new Error('actor foot radius must be finite and non-negative');
  }
  if (!Number.isFinite(maxSubstep) || maxSubstep <= 0) {
    throw new Error('max substep must be finite and positive');
  }
  return true;
}

function openIdSet(openGateIds) {
  if (openGateIds === undefined) return new Set();
  if (openGateIds instanceof Set) return openGateIds;
  if (!Array.isArray(openGateIds)) throw new Error('open gate ids must be an array or Set');
  return new Set(openGateIds);
}

function diskFitsRegion(point, region, actorRadius) {
  if (!pointInRing(point, region.outer, true) || ringClearance(point, region.outer) + EPSILON < actorRadius) {
    return false;
  }
  for (const hole of region.holes || []) {
    if (pointInRing(point, hole, true) || ringClearance(point, hole) + EPSILON < actorRadius) return false;
  }
  return true;
}

function outsideActiveBlockers(point, data, actorRadius, openIds) {
  return (data.dynamicBlockers || []).every(blocker => (
    openIds.has(blocker.id)
    || distanceToSegment(point, blocker.from, blocker.to) > blocker.halfWidth + actorRadius + EPSILON
  ));
}

function outsideStaticObstacles(point, data, actorRadius) {
  return (data.staticObstacles || []).every(obstacle => (
    !pointInRing(point, obstacle.polygon, true)
    && ringClearance(point, obstacle.polygon) + EPSILON >= actorRadius
  ));
}

function validateMovementOptions(data, options) {
  const actorRadius = options.actorRadius ?? data.actorFootRadius ?? 0;
  const maxSubstep = options.maxSubstep ?? data.maxSubstep ?? 2;
  if (!Number.isFinite(actorRadius) || actorRadius < 0) {
    throw new Error('actor radius must be finite and non-negative');
  }
  if (!Number.isFinite(maxSubstep) || maxSubstep <= 0) {
    throw new Error('max substep must be finite and positive');
  }
  return { actorRadius, maxSubstep, openIds: openIdSet(options.openGateIds) };
}

function isInsideWithOptions(point, data, actorRadius, openIds) {
  return data.regions.some(region => diskFitsRegion(point, region, actorRadius))
    && outsideStaticObstacles(point, data, actorRadius)
    && outsideActiveBlockers(point, data, actorRadius, openIds);
}

export function isInsideWalkable(point, data, options = {}) {
  finitePoint(point, 'position');
  const { actorRadius, openIds } = validateMovementOptions(data, options);
  return isInsideWithOptions(point, data, actorRadius, openIds);
}

function interpolate(from, to, t) {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function sweepToValid(from, to, data, actorRadius, openIds) {
  if (isInsideWithOptions(to, data, actorRadius, openIds)) return to;
  let low = 0, high = 1;
  for (let iteration = 0; iteration < SWEEP_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    if (isInsideWithOptions(interpolate(from, to, middle), data, actorRadius, openIds)) low = middle;
    else high = middle;
  }
  return interpolate(from, to, low);
}

function normalizedTangent(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length <= EPSILON ? null : { x: dx / length, y: dy / length };
}

function nearbyTangents(point, data, actorRadius, openIds, searchRadius) {
  const candidates = [];
  let order = 0;
  for (const region of data.regions) {
    for (const ring of [region.outer, ...(region.holes || [])]) {
      eachRingEdge(ring, (from, to) => {
        const distance = distanceToSegment(point, from, to);
        if (distance <= actorRadius + searchRadius + EPSILON) {
          const tangent = normalizedTangent(from, to);
          if (tangent) candidates.push({ tangent, distance, order });
        }
        order += 1;
      });
    }
  }
  for (const obstacle of data.staticObstacles || []) {
    eachRingEdge(obstacle.polygon, (from, to) => {
      const distance = distanceToSegment(point, from, to);
      if (distance <= actorRadius + searchRadius + EPSILON) {
        const tangent = normalizedTangent(from, to);
        if (tangent) candidates.push({ tangent, distance, order });
      }
      order += 1;
    });
  }
  for (const blocker of data.dynamicBlockers || []) {
    if (openIds.has(blocker.id)) continue;
    const nearest = closestPointOnSegment(point, blocker.from, blocker.to);
    const distance = Math.hypot(point.x - nearest.x, point.y - nearest.y);
    if (distance <= blocker.halfWidth + actorRadius + searchRadius + EPSILON) {
      const lineTangent = normalizedTangent(blocker.from, blocker.to);
      if (lineTangent) candidates.push({ tangent: lineTangent, distance, order });
      const radialLength = Math.hypot(point.x - nearest.x, point.y - nearest.y);
      if (radialLength > EPSILON) {
        candidates.push({
          tangent: { x: -(point.y - nearest.y) / radialLength, y: (point.x - nearest.x) / radialLength },
          distance,
          order: order + 1,
        });
      }
    }
    order += 2;
  }
  candidates.sort((left, right) => left.distance - right.distance || left.order - right.order);
  return candidates;
}

function slideSubstep(current, desired, data, actorRadius, openIds) {
  if (isInsideWithOptions(desired, data, actorRadius, openIds)) return desired;
  const contact = sweepToValid(current, desired, data, actorRadius, openIds);
  const remaining = { x: desired.x - contact.x, y: desired.y - contact.y };
  const remainingLength = Math.hypot(remaining.x, remaining.y);
  if (remainingLength <= EPSILON) return contact;

  let best = contact;
  let bestDistance2 = (contact.x - desired.x) ** 2 + (contact.y - desired.y) ** 2;
  for (const { tangent } of nearbyTangents(contact, data, actorRadius, openIds, remainingLength + EPSILON)) {
    const along = remaining.x * tangent.x + remaining.y * tangent.y;
    const projected = { x: tangent.x * along, y: tangent.y * along };
    if (Math.hypot(projected.x, projected.y) <= EPSILON) continue;
    const candidate = sweepToValid(
      contact,
      { x: contact.x + projected.x, y: contact.y + projected.y },
      data,
      actorRadius,
      openIds,
    );
    const distance2 = (candidate.x - desired.x) ** 2 + (candidate.y - desired.y) ** 2;
    if (distance2 < bestDistance2 - EPSILON) {
      best = candidate;
      bestDistance2 = distance2;
    }
  }
  return best;
}

export function constrainWalkableMovement(position, delta, data, options = {}) {
  finitePoint(position, 'position'); finitePoint(delta, 'movement delta');
  const { actorRadius, maxSubstep, openIds } = validateMovementOptions(data, options);
  if (!isInsideWithOptions(position, data, actorRadius, openIds)) {
    throw new Error('movement must start inside walkable geometry');
  }

  const distance = Math.hypot(delta.x, delta.y);
  const steps = Math.max(1, Math.ceil(distance / maxSubstep));
  const step = { x: delta.x / steps, y: delta.y / steps };
  let current = { ...position };
  for (let index = 0; index < steps; index += 1) {
    current = slideSubstep(
      current,
      { x: current.x + step.x, y: current.y + step.y },
      data,
      actorRadius,
      openIds,
    );
  }
  return current;
}
