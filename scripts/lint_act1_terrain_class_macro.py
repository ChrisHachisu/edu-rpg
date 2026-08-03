#!/usr/bin/env python3
"""Failable mechanical checks for the Act 1 Gate-1 terrain-class artifact."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np

from act1_terrain_class_lib import (
    BLOCKERS, CODE, CRYSTAL_GATE, GATEWAYS, HEIGHT, LANDMARKS, OUTPUT,
    ROUTES, WIDTH, connected_components, distribution, grid_from_output,
    load_land, reachable,
)


def hull_area(points: list[tuple[int, int]]) -> float:
    """Twice-area monotonic-chain hull without a geometry dependency."""
    ordered = sorted(set(points))
    if len(ordered) < 3:
        return float(len(ordered))
    def cross(a, b, c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lower = []
    for point in ordered:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0: lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(ordered):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0: upper.pop()
        upper.append(point)
    ring = lower[:-1] + upper[:-1]
    return abs(sum(ring[i][0]*ring[(i+1)%len(ring)][1]-ring[(i+1)%len(ring)][0]*ring[i][1] for i in range(len(ring)))) / 2


def max_axis_boundary_run(grid: np.ndarray, land: np.ndarray) -> int:
    """Longest horizontal/vertical run of the same non-coast class transition."""
    maximum = 0
    for horizontal in (True, False):
        outer = HEIGHT if horizontal else WIDTH
        inner = WIDTH - 1 if horizontal else HEIGHT - 1
        for outer_i in range(outer):
            run = 0; prior = None
            for inner_i in range(inner):
                y, x = (outer_i, inner_i) if horizontal else (inner_i, outer_i)
                ny, nx = (y, x + 1) if horizontal else (y + 1, x)
                pair = tuple(sorted((int(grid[y, x]), int(grid[ny, nx]))))
                # Any edge touching immutable sea is coastline and exempt.
                # Landmark/settlement footprints are explicit local objects,
                # not macro terrain boundaries; all geographic class edges are
                # still tested (including forest, range, river and trail).
                object_codes = {CODE['structure'], CODE['landmarkSolid']}
                active = (land[y, x] and land[ny, nx] and pair[0] != pair[1]
                          and not ({int(grid[y, x]), int(grid[ny, nx])} & object_codes))
                if active and pair == prior:
                    run += 1
                elif active:
                    prior, run = pair, 1
                else:
                    prior, run = None, 0
                maximum = max(maximum, run)
    return maximum


def local_coast_run(grid: np.ndarray, land: np.ndarray, point: tuple[int, int], radius: int = 18) -> dict[str, object]:
    """A contiguous shoreline segment in a landmark-local window, never a global count."""
    x, y = point
    water_touch = np.zeros(grid.shape, bool)
    for py in range(HEIGHT):
        for px in range(WIDTH):
            if grid[py, px] not in {CODE['meadow'], CODE['trail'], CODE['lightForest'], CODE['bridge']}:
                continue
            water_touch[py, px] = any(0 <= nx < WIDTH and 0 <= ny < HEIGHT and not land[ny, nx]
                                      for nx, ny in ((px + 1, py), (px - 1, py), (px, py + 1), (px, py - 1)))
    yy, xx = np.indices(grid.shape)
    local = water_touch & ((xx - x) ** 2 + (yy - y) ** 2 <= radius * radius)
    runs = connected_components(local)
    longest = max((len(run) for run in runs), default=0)
    return {'longestRun': longest, 'componentCount': len(runs), 'radius': radius, 'pass': longest >= 3}


def mountain_cliff_halo(grid: np.ndarray) -> dict[str, object]:
    mountain = grid == CODE['mountain']; cliff = grid == CODE['cliff']; ringed = []
    for component in connected_components(mountain):
        outer = set()
        for x, y in component:
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < WIDTH and 0 <= ny < HEIGHT and not mountain[ny, nx]: outer.add((nx, ny))
        if outer and all(cliff[py, px] for px, py in outer): ringed.append(len(component))
    return {'pass': not ringed, 'fullyCliffRingedMountainComponents': ringed}


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument('--output', type=Path, default=OUTPUT); args = parser.parse_args()
    output = args.output; grid = grid_from_output(output); land = load_land()
    overlay = np.load(output / 'bridge-overlay.npy')
    # Guidance trails have no collision contribution. Every gateway/guard flood
    # fill therefore uses the pre-trail walkable union, not trail paint.
    nav = np.load(output / 'collision-grid.npy').astype(np.uint8); nav[overlay] = CODE['bridge']
    report: dict[str, object] = {'schema': 'act1-terrain-class-g1-linter-v2', 'checks': {}}
    checks: dict[str, dict[str, object]] = report['checks']  # type: ignore[assignment]
    max_run = max_axis_boundary_run(grid, land)
    checks['1-axis-aligned-boundaries'] = {'pass': max_run <= 3, 'maxRun': max_run, 'limit': 3}
    systems = {
        'Crystal Range': ((grid == CODE['mountain']) | (grid == CODE['cliff'])) & (np.indices(grid.shape)[1] >= 116) & (np.indices(grid.shape)[0] <= 112),
        'Darkfang Highlands': ((grid == CODE['mountain']) | (grid == CODE['cliff'])) & (np.indices(grid.shape)[1] >= 80) & (np.indices(grid.shape)[1] <= 122) & (np.indices(grid.shape)[0] <= 58),
        'Millbrook River': (grid == CODE['water']) & land,
    }
    widths = {}
    for name, mask in systems.items():
        samples = [int(row.sum()) for row in mask if int(row.sum()) > 0]
        if not samples: samples = [0]
        ratio = max(samples) / max(1, min(samples)); widths[name] = {'min': min(samples), 'max': max(samples), 'ratio': ratio}
    checks['2-variable-blocker-width'] = {'pass': all(value['ratio'] >= 1.5 for value in widths.values()), 'systems': widths, 'minimumRatio': 1.5}
    blocker = np.isin(grid, list(BLOCKERS)); components = []
    for component in connected_components(blocker):
        if len(component) < 12: continue
        xs, ys = zip(*component); fill = len(component) / ((max(xs)-min(xs)+1)*(max(ys)-min(ys)+1)); components.append(fill)
    checks['3-blocker-component-rectangularity'] = {'pass': bool(components) and max(components) < .7, 'maxFillRatio': max(components, default=1), 'componentCount': len(components), 'limit': .7}
    memberships = np.load(output / 'basin-membership.npy'); solidities = {}
    for basin_id, name in enumerate(('greenhollow-vale','millbrook-floodplain','port-sapphire-basin'), 1):
        cells = [(int(x), int(y)) for y, x in zip(*np.where((memberships == basin_id) & land))]
        solidities[name] = len(cells) / max(1.0, hull_area(cells))
    checks['4-non-convex-basins'] = {'pass': all(v < .9 for v in solidities.values()), 'solidities': solidities, 'limit': .9}
    throat_data = np.load(output / 'gateway-throats.npz'); gateway_results = {}
    for name, info in GATEWAYS.items():
        throat = throat_data[name].astype(bool)
        width = int(throat.sum())
        # Remove the authored formation: it must be a true cut-edge for its named endpoints.
        sole = not reachable(nav, info['a'], info['b'], throat)
        gateway_results[name] = {'cells': width, 'minimum': info['min'], 'maximum': info['max'], 'soleAperture': sole,
                                 'pass': info['min'] <= width <= info['max'] and sole}
    checks['5-gateway-throats-and-sole-apertures'] = {'pass': all(v['pass'] for v in gateway_results.values()), 'gateways': gateway_results}
    landmark_ok = {name: all(nav[y, x] in {CODE['meadow'], CODE['trail'], CODE['lightForest'], CODE['bridge']} for x, y in (info['at'], info['approach'])) for name, info in LANDMARKS.items()}
    routes = {name: reachable(nav, points[0], points[-1]) for name, points in ROUTES.items()}
    def cut_reach(a, b, gateway): return reachable(nav, a, b, throat_data[gateway].astype(bool))
    guards = {
        'ReefOnlyViaPort': {
            'normalReefToPort': reachable(nav, LANDMARKS['Coastal Reef']['approach'], LANDMARKS['Port Sapphire']['approach']),
            'causewayCutBlocksReefToPort': not cut_reach(LANDMARKS['Coastal Reef']['approach'], LANDMARKS['Port Sapphire']['approach'], 'port-reef-causeway'),
        },
        'WhisperingNoDirectDarkfang': {
            'normalReachableThroughProgression': reachable(nav, LANDMARKS['Whispering Woods Cave']['approach'], LANDMARKS['Darkfang Grotto']['approach']),
            'millbrookPassCutBlocksReach': not cut_reach(LANDMARKS['Whispering Woods Cave']['approach'], LANDMARKS['Darkfang Grotto']['approach'], 'millbrook-port-pass'),
        },
        'DarkfangNoDirectCrystal': {
            'normalReachableThroughPort': reachable(nav, LANDMARKS['Darkfang Grotto']['approach'], LANDMARKS['Crystal Cave']['approach']),
            'darkfangGateCutBlocksReach': not cut_reach(LANDMARKS['Darkfang Grotto']['approach'], LANDMARKS['Crystal Cave']['approach'], 'port-darkfang-gap'),
            'crystalGateCutBlocksReach': not cut_reach(LANDMARKS['Darkfang Grotto']['approach'], LANDMARKS['Crystal Cave']['approach'], 'port-crystal-seal-gate'),
        },
    }
    guard_pass = all(all(bool(value) for value in guard.values()) for guard in guards.values())
    checks['6-landmarks-routes-and-guards'] = {'pass': all(landmark_ok.values()) and all(routes.values()) and guard_pass, 'landmarks': landmark_ok, 'routes': routes, 'guards': guards}
    dist = distribution(grid, land); percentages = dist['percentages']; targets = dist['targets']; within = {key: targets[key][0] <= percentages[key] <= targets[key][1] for key in targets}
    checks['7-distribution'] = {'pass': all(within.values()), 'percentages': percentages, 'withinTargets': within, 'targets': targets}
    closed = nav.copy(); closed[CRYSTAL_GATE[1], CRYSTAL_GATE[0]] = CODE['mountain']
    checks['8-crystal-closed-open'] = {'pass': reachable(nav, GATEWAYS['port-crystal-seal-gate']['a'], GATEWAYS['port-crystal-seal-gate']['b']) and not reachable(closed, GATEWAYS['port-crystal-seal-gate']['a'], GATEWAYS['port-crystal-seal-gate']['b']), 'open': True, 'closedBlocksCrystal': not reachable(closed, GATEWAYS['port-crystal-seal-gate']['a'], GATEWAYS['port-crystal-seal-gate']['b'])}
    port_coast = local_coast_run(nav, land, LANDMARKS['Port Sapphire']['approach'])
    reef_coast = local_coast_run(nav, land, LANDMARKS['Coastal Reef']['approach'])
    checks['10-coast-contact'] = {'pass': bool(port_coast['pass']) and bool(reef_coast['pass']), 'port': port_coast, 'reef': reef_coast}
    checks['11-cliff-halo'] = mountain_cliff_halo(grid)
    determinism = json.loads((output / 'determinism.json').read_text(encoding='utf-8')) if (output / 'determinism.json').exists() else {'pass': False}
    checks['9-determinism'] = {'pass': determinism['pass'], 'runs': determinism.get('runs', [])}
    report['pass'] = all(value['pass'] is True for value in checks.values())
    (output / 'linter-report.json').write_text(json.dumps(report, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2)); sys.exit(0 if report['pass'] else 1)

if __name__ == '__main__': main()
