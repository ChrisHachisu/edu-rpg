#!/usr/bin/env python3
"""World gate for the Acts 2-5 overworld as installed (plan section 5; run after
scripts/build_acts_hifi_manifest.py, must print PASS).

    python3 scripts/acts/check_world.py [--json <file>]

It reads what the game reads (public/acts-hifi/manifest.json, each act's collision.bin and
plate.json, Act 1's forest-collision.bin and plate rows) and models the hero's sole disc with
scripts/acts/world_lib.py. Two models, because the two claims need opposite errors:

  TIGHT (blocks at least what the game blocks)
    1. every door answers from a place the hero can stand, and its exit cell is standable and
       connected to that place
    2. every SEGMENT below is ONE walkable component: all its doors are mutually reachable on foot
    3. every exit cell is marked reachable in the index (so a town exit is never "relocated")
  LOOSE (blocks at most what the game blocks)
    4. no two segments share a walkable component, and none shares one with Act 1: the only way
       from one to the next is through the dungeon that joins them
    5. the four story gates, named: Crystal 1->2, Shadow 2->3, Magma 3->4 (variant C: the tunnel is
       the only way into Act 4's north), Volcanic 4->5

Plus data checks: 6. each door cell carries its door tile in the plate of the act that answers for
it; 7. the index's `pack`/`owner`/`reach` rasters decode to 320 x 400.
"""
import json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_lib as W  # noqa: E402

# The walkable segments of the painted world and the doors each must hold. A two-mouth dungeon is
# the only link between the segments its two mouths sit in.
SEGMENTS = {
    'act2-west': ['Crystal Cave (Act 2 side)', 'Ironkeep', 'Iron Mine', 'Storm Nest', 'Frostwatch', 'Frozen Lake', 'Haunted Forest'],
    'act2-north': ['Haunted Forest (second entrance)', 'Ravenhollow', 'Shadow Cave'],
    # Variant C: Act 3's rows win the Act 3/4 overlap, so Act 4's SOUTH (Ember's Rest, Obsidian Cavern)
    # is walked into from the desert, and Act 4's NORTH is entered through Magma Tunnels alone.
    'act3+act4-south': ['Shadow Cave (Act 3 side)', 'Ruins Camp', 'Bandit Hideout', 'Oasis Haven', 'Oasis Depths', 'Desert Tomb',
                        'Scorched Ruins', 'Magma Tunnels', "Ember's Rest", 'Obsidian Cavern'],
    'act4-north': ['Magma Tunnels (Act 4 side)', 'Ember Mines', 'Volcanic Forge', 'Cinderwatch'],
    'act5': ['Volcanic Forge (Act 5 side)', 'Last Bastion', "Haven's Edge", 'Demon Barracks', 'Void Rift', 'Demon Castle',
             'Portal - Stormreach Isles', 'Portal - Frostfall Peaks', 'Portal - Sunken Temple', 'Portal - Twilight Realm'],
}
GATES = [('Crystal 1->2', 'act1', 'act2-west'), ('Haunted Forest (inside Act 2)', 'act2-west', 'act2-north'),
         ('Shadow 2->3', 'act2-north', 'act3+act4-south'), ('Magma 3->4 (north)', 'act3+act4-south', 'act4-north'),
         ('Volcanic 4->5', 'act4-north', 'act5')]
OPTIONAL = {'Cinderwatch'}                      # listed only once its town plate is installed


def main():
    out_json = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
    M = json.load(open(os.path.join(W.ROOT, 'public/acts-hifi/manifest.json')))
    fails, rows = [], []

    def check(ok, what):
        if not ok: fails.append(what)
        return ok

    check(M.get('schema') == 'qok-acts-hifi-v2', 'index schema')
    cell, owner, reach = W.unrle(M['pack']).astype(np.uint8), W.unrle(M['owner']), W.unrle(M['reach'])
    check(cell.shape == (W.GH, W.GW) and owner.shape == cell.shape and reach.shape == cell.shape, 'raster size')
    doors = {L['name']: L for L in M['landmarks']}
    seg_of = {n: s for s, names in SEGMENTS.items() for n in names}
    for n in doors: check(n in seg_of, f'door {n} is in no segment')
    for s, names in SEGMENTS.items():
        for n in names: check(n in doors or n in OPTIONAL, f'segment {s}: door {n} is not in the index')

    plates = {}
    for a in M['acts']:
        p = json.load(open(os.path.join(W.act_dir(a['act']), 'plate.json'))); plates[a['act']] = p

    def plate_tile(x, y):
        p = plates.get(int(cell[y, x]))
        if not p: return None
        ch = p['rows'][y - p['bounds'][1]][x - p['bounds'][0]]
        return None if ch == '.' else int(ch, 36)

    comp = {}
    for tight in (True, False):
        B = W.stitch(cell, tight)
        F = W.free_space(B, tight)
        lab = W.label(F, tight)
        del B
        key = 'tight' if tight else 'loose'
        for n, L in doors.items():
            fx, fy = W.fire_px(L['at'], L['gate'])
            comp.setdefault(n, {})[key] = int(lab[fy, fx]) if F[fy, fx] else 0
            if tight:
                ex = L.get('exit'); ok_exit = False
                if ex:
                    sx, sy = W.stand(*ex)
                    ok_exit = bool(F[sy, sx]) and int(lab[sy, sx]) == comp[n][key] != 0
                check(comp[n][key] != 0, f'{n}: the hero cannot stand where the door answers {L["at"]}')
                check(ok_exit, f'{n}: exit cell {ex} is not standable or not joined to the door')
                check(ex and reach[ex[1], ex[0]] == 1, f'{n}: exit cell {ex} is not marked reachable')
                check(plate_tile(*L['at']) == L['tile'], f'{n}: plate tile at {L["at"]} is {plate_tile(*L["at"])}, want {L["tile"]}')
        # Act 1: the standing point south of its first town
        _, lms = W.act1_js()
        a1 = next(l for l in lms if l.get('mapId') == 'greenhollow')
        c = [a1['exit']['x'], a1['exit']['y']]
        sx, sy = W.stand(*c)
        hit = np.unique(lab[sy - 40:sy + 41, sx - 40:sx + 41]); hit = hit[hit > 0]
        sizes = {int(h): int((lab[max(0, sy - 2000):sy + 2000, max(0, sx - 2000):sx + 2000] == h).sum()) for h in hit}
        comp.setdefault('__act1__', {})[key] = max(sizes, key=sizes.get) if sizes else 0
        del F, lab

    check(comp['__act1__']['loose'] != 0, 'Act 1 reference point is not standable')
    seg_comp = {'act1': {'tight': {comp['__act1__']['tight']}, 'loose': {comp['__act1__']['loose']}}}
    for s, names in SEGMENTS.items():
        have = [n for n in names if n in doors]
        t = {comp[n]['tight'] for n in have}; l = {comp[n]['loose'] for n in have}
        seg_comp[s] = {'tight': t, 'loose': l}
        one = len(t) == 1 and 0 not in t
        check(one, f'segment {s} is not one walkable component: ' + ', '.join(f'{n}={comp[n]["tight"]}' for n in have))
        rows.append({'segment': s, 'doors': len(have), 'oneComponent': one})
    names = list(seg_comp)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            shared = seg_comp[names[i]]['loose'] & seg_comp[names[j]]['loose'] - {0}
            check(not shared, f'{names[i]} and {names[j]} are joined on foot (no dungeon between them)')
    gates = []
    for label_, a, b in GATES:
        holds = not (seg_comp[a]['loose'] & seg_comp[b]['loose'] - {0})
        gates.append({'gate': label_, 'holds': holds})
    result = {'pass': not fails, 'placeholder': bool(M.get('placeholder')), 'doors': len(doors), 'segments': rows, 'gates': gates,
              'fails': fails}
    for r in rows: print(f"  segment {r['segment']:11s} doors {r['doors']:2d}  one component: {'yes' if r['oneComponent'] else 'NO'}")
    for g in gates: print(f"  gate {g['gate']:32s} {'holds' if g['holds'] else 'BROKEN'}")
    for f in fails: print('  FAIL', f)
    print(('PASS' if not fails else 'FAIL') + f": {len(doors)} doors, {len(rows)} segments" + (' (PLACEHOLDER ART)' if M.get('placeholder') else ''))
    if out_json: json.dump(result, open(out_json, 'w'), indent=1)
    sys.exit(0 if not fails else 1)


if __name__ == '__main__':
    main()
