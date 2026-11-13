#!/usr/bin/env python3
"""Write public/acts-hifi/manifest.json (the index public/acts-hifi/acts-runtime.js reads) and each
installed act's public/act{N}-hifi/plate.json.

    python3 scripts/acts/install_runtime.py <export root>     # first: the art and the packs
    python3 scripts/build_acts_hifi_manifest.py               # then: this
    python3 scripts/acts/check_world.py                       # then: the gate (must print PASS)

Inputs (all tracked or installed):
  owner-terrain.json + land-mask.npy   through scripts/acts/acts_common.world(): which act owns a cell
  public/act{N}-hifi/manifest.json     the landmark cells and gate sides AS PAINTED (the art is the
                                       authority for where a door is, not the owner's table)
  public/act{N}-hifi/collision.bin     the pixel pack the hero's soles are tested against
  BUNDLE below                         lifted from the frozen bundle (Xt.overworld.connections and
                                       every interior's targetMap:"overworld" row). maps.ts is NOT
                                       the authority: it disagrees with the bundle for
                                       scorchedRuins, shadowCave and magmaTunnels.
  public/acts-hifi/towns.json          hi-fi towns installed under act1-hifi/town/ and the texts of
                                       a town the bundle has no map for (scripts/acts/install_towns.py)

Only the OVERWORLD side of a connection moves (the Act 1 rule): interiors keep their toX/toY.
Every exit cell, the `reach` raster and the plates are decided with the TIGHT model of
scripts/acts/world_lib.py, which blocks at least what the game blocks.
"""
import json, os, sys
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts/acts'))
os.environ.setdefault('ACTS_VARIANT', 'C')     # the painted world: Act 3's rows win the Act 3/4 overlap
import acts_common as A  # noqa: E402
import world_lib as W    # noqa: E402

OUT = os.path.join(ROOT, 'public/acts-hifi/manifest.json')
TOWNS = os.path.join(ROOT, 'public/acts-hifi/towns.json')
CHUNK_CELLS = 16          # 512 px chunks at 32 px/cell, the Act 1 base grid

# owner landmark name -> (mapId, door tile, old overworld door (bundle fromX,fromY), arrival inside
# (toX,toY,toFloor), old overworld return cell (bundle interior->overworld toX,toY))
BUNDLE = {
    'Crystal Cave (Act 2 side)': ('crystalCave', 15, (172, 305), (50, 99, 5), (172, 306)),
    'Ironkeep': ('ironkeep', 6, (200, 320), (8, 14, None), (200, 321)),
    'Iron Mine': ('ironMine', 7, (185, 335), (50, 1, None), (185, 336)),
    'Storm Nest': ('stormNest', 7, (280, 295), (50, 99, None), (280, 296)),
    'Frostwatch': ('frostwatch', 6, (222, 262), (8, 14, None), (222, 263)),
    'Frozen Lake': ('frozenLake', 7, (200, 265), (50, 1, None), (200, 266)),
    'Haunted Forest': ('hauntedForest', 7, (238, 248), (12, 24, None), (238, 249)),
    'Haunted Forest (second entrance)': ('hauntedForest', 7, (242, 248), (12, 24, 5), (242, 249)),
    'Ravenhollow': ('hauntedVillage', 6, (252, 242), (8, 14, None), (252, 243)),
    'Shadow Cave': ('shadowCave', 7, (260, 234), (50, 1, None), (260, 235)),
    'Shadow Cave (Act 3 side)': ('shadowCave', 7, (260, 198), (50, 66, 5), (260, 197)),
    'Ruins Camp': ('ruinsCamp', 6, (270, 120), (8, 14, None), (270, 121)),
    'Bandit Hideout': ('banditHideout', 7, (298, 130), (50, 1, None), (298, 131)),
    'Oasis Haven': ('oasisHaven', 6, (220, 150), (8, 14, None), (220, 151)),
    'Oasis Depths': ('oasisDepths', 7, (225, 160), (50, 1, None), (225, 161)),
    'Desert Tomb': ('desertTomb', 7, (250, 140), (50, 1, None), (250, 141)),
    'Scorched Ruins': ('scorchedRuins', 7, (208, 120), (50, 1, None), (208, 121)),
    'Magma Tunnels': ('magmaTunnels', 7, (242, 93), (50, 1, None), (242, 94)),
    'Magma Tunnels (Act 4 side)': ('magmaTunnels', 7, (242, 81), (50, 1, 5), (242, 80)),
    "Ember's Rest": ('embersRest', 6, (195, 80), (8, 14, None), (195, 81)),
    'Obsidian Cavern': ('obsidianCavern', 7, (185, 48), (50, 1, None), (185, 49)),
    'Ember Mines': ('emberMines', 7, (202, 48), (50, 1, None), (202, 49)),
    'Volcanic Forge': ('volcanicForge', 7, (172, 110), (50, 1, None), (172, 111)),
    'Volcanic Forge (Act 5 side)': ('volcanicForge', 7, (148, 110), (50, 78, 7), (148, 111)),
    'Last Bastion': ('lastBastion', 6, (100, 150), (8, 14, None), (100, 151)),
    "Haven's Edge": ('havensEdge', 6, (70, 100), (8, 14, None), (70, 101)),
    'Demon Barracks': ('demonBarracks', 7, (80, 60), (50, 1, None), (80, 61)),
    'Void Rift': ('voidRift', 7, (120, 70), (50, 1, None), (120, 71)),
    'Demon Castle': ('demonCastle', 7, (85, 30), (50, 99, None), (85, 31)),
    'Portal - Stormreach Isles': ('stormreachIsles', 7, (40, 50), (20, 38, None), (40, 50)),
    'Portal - Frostfall Peaks': ('frostfallPeaks', 7, (130, 40), (20, 38, None), (130, 40)),
    'Portal - Sunken Temple': ('sunkenTempleIsle', 7, (50, 130), (20, 38, None), (50, 130)),
    'Portal - Twilight Realm': ('twilightRealm', 7, (120, 140), (20, 38, None), (120, 140)),
}


# A town the frozen bundle has no map for is entered as its HOST's engine map (shop stock, healer
# price and save semantics are the host's) while the adapter shows its own plate, people and exit.
HOSTED = {'Cinderwatch': ('cinderwatch', 'embersRest', 6, (8, 14, None))}
TILE_OPEN, TILE_WATER, TILE_RAISED = 0, 2, 4


def doors_from_art(manifests):
    rows, missing = [], []
    for n in (2, 3, 4, 5):
        m = manifests[n]
        if not m: continue
        for L in m.get('landmarks', []):
            name, at, gate = L['name'], list(L['cell']), L.get('gate', 'south')
            if name in BUNDLE:
                map_id, tile, old_from, (tx, ty, tf), old_ret = BUNDLE[name]
                row = {'act': n, 'name': name, 'mapId': map_id, 'tile': tile, 'at': at, 'gate': gate,
                       'toX': tx, 'toY': ty, 'oldFrom': list(old_from), 'oldReturn': list(old_ret)}
            elif name in HOSTED:
                vid, host, tile, (tx, ty, tf) = HOSTED[name]
                row = {'act': n, 'name': name, 'mapId': host, 'virtual': vid, 'tile': tile, 'at': at, 'gate': gate,
                       'toX': tx, 'toY': ty}
            else:
                missing.append(name); continue
            if tf is not None: row['toFloor'] = tf
            rows.append(row)
    return rows, missing


def pick_exit(F, lab, L):
    """The cell an interior puts the hero back on: W.exit_for(), or the nearest cell whose standing
    point is free and in the same walkable component as the point where the door answers."""
    fx, fy = W.fire_px(L['at'], L['gate'])
    comp = int(lab[fy, fx]) if F[fy, fx] else 0
    want = W.exit_for(L['at'], L['gate'])
    sgn = 1 if L['gate'] != 'north' else -1
    cands = [want] + [[L['at'][0] + dx, L['at'][1] + sgn * dy] for dy in (1, 2, 3, 4) for dx in (0, -1, 1, -2, 2)]
    for c in cands:
        if not (0 <= c[0] < W.GW and 0 <= c[1] < W.GH): continue
        sx, sy = W.stand(*c)
        if F[sy, sx] and (comp == 0 or int(lab[sy, sx]) == comp):
            return c, (comp or int(lab[sy, sx]))
    return None, comp


def plate_for(n, m, cell, cls, bits, doors):
    x0, y0, x1, y1 = m['bounds']
    w, h = x1 - x0 + 1, y1 - y0 + 1
    frac = bits[:h * W.P, :w * W.P].reshape(h, W.P, w, W.P).mean(axis=(1, 3))
    wet = np.isin(cls[y0:y1 + 1, x0:x1 + 1], (A.WATER, A.SEA))
    tiles = np.where(frac >= 1.0, np.where(wet, TILE_WATER, TILE_RAISED), TILE_OPEN).astype(np.int64)
    tiles[cell[y0:y1 + 1, x0:x1 + 1] != n] = -1                  # another pack answers there (Act 1's rectangle included)
    for L in doors:
        for c, t in ((L['at'], L['tile']), (L.get('exit'), TILE_OPEN)):
            if c and x0 <= c[0] <= x1 and y0 <= c[1] <= y1 and tiles[c[1] - y0, c[0] - x0] != -1:
                tiles[c[1] - y0, c[0] - x0] = t
    rows = [''.join('.' if t < 0 else np.base_repr(int(t), 36).lower() for t in r) for r in tiles]
    return {'act': n, 'bounds': m['bounds'], 'legend': "'.' = not this act's cell, else base-36 engine tile", 'rows': rows}


def main():
    cls, act_of, _land = A.world()
    order = ['1', '2', '4', '5', '3'] if os.environ['ACTS_VARIANT'] in ('A', 'C') else A.ORDER
    manifests = {n: W.act_manifest(n) for n in (2, 3, 4, 5)}
    cell = W.cell_raster(act_of, manifests)
    doors, missing = doors_from_art(manifests)
    B = W.stitch(cell, True)
    F = W.free_space(B, True)
    lab = W.label(F, True)
    bad = []
    for L in doors:
        L['exit'], L['_comp'] = pick_exit(F, lab, L)
        if not L['exit']: bad.append(L['name'])
    door_comps = sorted({L['_comp'] for L in doors if L['_comp']})
    ys, xs = np.mgrid[0:W.GH, 0:W.GW]
    sy, sx = np.minimum(ys * W.P + 16 + W.SOLE_DY, W.GH * W.P - 1), xs * W.P + 16
    reach = (F[sy, sx] > 0) & np.isin(lab[sy, sx], door_comps)
    reach[cell == 1] = 0                                         # Act 1 relocates its own (act1-world-map.js)
    acts = []
    for n in (2, 3, 4, 5):
        m = manifests[n]
        if not m: continue
        x0, y0, x1, y1 = m['bounds']
        bits = W.read_bin(os.path.join(W.act_dir(n), 'collision.bin'))
        plate = plate_for(n, m, cell, cls, bits, doors)
        json.dump(plate, open(os.path.join(W.act_dir(n), 'plate.json'), 'w'), separators=(',', ':'))
        acts.append({'act': n, 'bounds': m['bounds'], 'origin': [x0, y0],
                     'cols': -(-(x1 - x0 + 1) // CHUNK_CELLS), 'rows': -(-(y1 - y0 + 1) // CHUNK_CELLS),
                     'drawRank': order.index(str(n)), 'runtime': f'act{n}-hifi/',
                     'underpaint': m.get('underpaint'), 'placeholder': bool(m.get('placeholder'))})
    for L in doors: L.pop('_comp', None)
    towns = json.load(open(TOWNS)) if os.path.isfile(TOWNS) else {'towns': [], 'strings': {}}
    overrides = []
    odir = os.path.join(ROOT, 'public/acts-hifi/overrides')
    for oid in sorted(os.listdir(odir)) if os.path.isdir(odir) else []:
        meta_p = os.path.join(odir, oid, 'override.json')
        if os.path.isfile(meta_p):
            meta = json.load(open(meta_p)); meta['path'] = f'acts-hifi/overrides/{oid}/'; overrides.append(meta)
    manifest = {'schema': 'qok-acts-hifi-v2', 'revision': 2,
                'placeholder': any(a['placeholder'] for a in acts),
                'note': 'Generated by scripts/build_acts_hifi_manifest.py. Act 1 is NOT listed: '
                        'act1-hifi/ + act1-world-map.js own it unchanged.',
                'pixelsPerCell': W.P, 'chunkCells': CHUNK_CELLS, 'compositeOrder': order, 'variant': os.environ['ACTS_VARIANT'],
                'sole': {'dy': W.SOLE_DY, 'r': W.DISC_R, 'closeR': W.CLOSE_R, 'footDy': W.FOOT_DY},
                'streaming': {'preloadCells': 4, 'maxResident': 12},
                'acts': acts, 'landmarks': doors, 'unmapped': missing,
                'owner': W.rle(act_of), 'pack': W.rle(cell), 'reach': W.rle(reach.astype(np.uint8)),
                'overrides': overrides,
                'towns': [t for t in towns.get('towns', []) if t not in [h[0] for h in HOSTED.values()]],
                'hosted': [t for t in towns.get('towns', []) if t in [h[0] for h in HOSTED.values()]],
                'strings': towns.get('strings', {})}
    if not manifest['hosted']:                                   # its plate is not installed: no door
        manifest['landmarks'] = [L for L in doors if not L.get('virtual')]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
        f.write('\n')
    print(f'wrote {OUT}: {len(acts)} acts, {len(manifest["landmarks"])} doors, unmapped={missing}, '
          f'reach cells {int(reach.sum())}, walkable components holding a door: {len(door_comps)}')
    for L in manifest['landmarks']:
        print(f"  act{L['act']} {L['name'][:34]:34s} {L['mapId']:16s} at {L['at']} {L['gate']:5s} exit {L['exit']}")
    if bad:
        print('NO STANDABLE EXIT:', bad); sys.exit(1)


if __name__ == '__main__':
    main()
