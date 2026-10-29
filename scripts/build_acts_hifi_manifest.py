#!/usr/bin/env python3
"""Write public/acts-hifi/manifest.json -- the Acts 2-5 runtime index read by public/acts-hifi/acts-runtime.js.

PROTOTYPE (2026-10-28, docs/plans/2026-10-28-acts2-5-runtime-wiring.md). Placeholder-only: no
art is referenced until an act's chunks exist, and the runtime is behind a flag that defaults OFF.

Inputs (all tracked):
  owner-terrain.json   acts.N.bounds / landmarks   -- the owner's cells, the art's coordinates
  land-mask.npy        through scripts/acts/acts_common.world() -- composite used for door exits
  BUNDLE_*  below      -- lifted from the frozen bundle (Xt.overworld.connections and every
                          interior's targetMap:"overworld" row). maps.ts is NOT the authority:
                          it disagrees with the bundle for scorchedRuins, shadowCave and magmaTunnels.

Only the OVERWORLD side of a connection moves (the Act 1 rule): interiors keep their toX/toY.
"""
import json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts/acts'))
import acts_common as A  # noqa: E402

OUT = os.path.join(ROOT, 'public/acts-hifi/manifest.json')
CHUNK_CELLS = 16          # 512 px chunks at 32 px/cell, the Act 1 base grid
TINT = {2: '#cfe3f2', 3: '#d9b878', 4: '#8a3b2a', 5: '#3b3740'}

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


def exit_cell(cls, x, y):
    """First walkable cell next to the door, south first (the Act 1 convention), then ring search."""
    for r in range(1, 4):
        for dx, dy in ((0, r), (0, -r), (r, 0), (-r, 0), (r, r), (-r, r), (r, -r), (-r, -r)):
            if 0 <= x + dx < A.GW and 0 <= y + dy < A.GH and cls[y + dy, x + dx] == A.OPEN:
                return [x + dx, y + dy]
    return None


def owner_rle(act_of):
    """The act-ownership raster (which act's art owns each cell, 0 = none), one run-length
    string per row: 'act:len,act:len'. acts-runtime.js picks the collision pack from it."""
    rows = []
    for r in act_of:
        runs, cur, n = [], int(r[0]), 0
        for v in r:
            v = int(v)
            if v == cur:
                n += 1
            else:
                runs.append(f'{cur}:{n}'); cur, n = v, 1
        runs.append(f'{cur}:{n}')
        rows.append(','.join(runs))
    return {'width': int(act_of.shape[1]), 'height': int(act_of.shape[0]), 'rows': rows}


def main():
    owner = A.owner()
    cls, act_of, _land = A.world()
    # ACTS_VARIANT=C (the current art): Act 3's rows win the Act 3/4 overlap, and the Act 4 Magma
    # mouth moves to (187,60) -- acts_common.world()/landmarks() apply both; the draw order follows.
    variant = os.environ.get('ACTS_VARIANT', '')
    order = ['1', '2', '4', '5', '3'] if variant in ('A', 'C') else A.ORDER
    cells = {(L['act'], L['name']): L['cell'] for L in A.landmarks()}
    acts, landmarks, unmapped = [], [], []
    for n in (2, 3, 4, 5):
        a = owner['acts'][str(n)]
        x0, y0, x1, y1 = a['bounds']
        cols = -(-(x1 - x0 + 1) // CHUNK_CELLS)
        rows = -(-(y1 - y0 + 1) // CHUNK_CELLS)
        acts.append({'act': n, 'bounds': a['bounds'], 'origin': [x0, y0], 'cols': cols, 'rows': rows,
                     'drawRank': order.index(str(n)), 'tint': TINT[n],
                     'runtime': None})   # e.g. 'act2-hifi/' once an export (flattened-ground-v0) is installed
        for name in a['landmarks']:
            x, y = cells[(n, name)]
            if name not in BUNDLE:
                unmapped.append({'act': n, 'name': name, 'at': [x, y]})
                continue
            map_id, tile, old_from, (tx, ty, tf), old_ret = BUNDLE[name]
            row = {'act': n, 'name': name, 'mapId': map_id, 'tile': tile, 'at': [x, y],
                   'exit': exit_cell(cls, x, y), 'toX': tx, 'toY': ty,
                   'oldFrom': list(old_from), 'oldReturn': list(old_ret)}
            if tf is not None:
                row['toFloor'] = tf
            landmarks.append(row)
    # fix5: installed art overrides (e.g. overrides/act1-north-seam/, built by scripts/acts/act1_seam_override.py
    # and copied in by the lead). Each drawn by acts-runtime.js overrides(); none listed -> nothing drawn.
    overrides = []
    odir = os.path.join(ROOT, 'public/acts-hifi/overrides')
    for oid in sorted(os.listdir(odir)) if os.path.isdir(odir) else []:
        meta_p = os.path.join(odir, oid, 'override.json')
        if os.path.isfile(meta_p):
            meta = json.load(open(meta_p)); meta['path'] = f'acts-hifi/overrides/{oid}/'; overrides.append(meta)
    manifest = {'schema': 'qok-acts-hifi-v1', 'revision': 1, 'placeholder': True,
                'note': 'Generated by scripts/build_acts_hifi_manifest.py. Act 1 is NOT listed: '
                        'act1-hifi/ + act1-world-map.js own it unchanged.',
                'pixelsPerCell': A.P, 'chunkCells': CHUNK_CELLS, 'compositeOrder': order, 'variant': variant or None,
                'streaming': {'preloadCells': 4, 'maxResident': 12},
                'acts': acts, 'landmarks': landmarks, 'unmapped': unmapped,
                'owner': owner_rle(act_of),
                'overrides': overrides,
                'towns': []}   # hi-fi town ids whose plates are installed under act1-hifi/town/
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(manifest, f, indent=1)
        f.write('\n')
    print(f'wrote {OUT}: {len(acts)} acts, {len(landmarks)} doors, unmapped={[u["name"] for u in unmapped]}')


if __name__ == '__main__':
    main()
