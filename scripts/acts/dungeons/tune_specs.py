#!/usr/bin/env python3
"""Find, for each dungeon whose floors fail validate(), the smallest joint-bearing nudge (and, if
needed, a +-2 canvas nudge) under which EVERY floor validates. Act 1 was hand-tuned the same way
(its spec comments record base/braid changes); this just does the search. Prints the specs.py
edits; does not write them.
"""
import itertools, zlib
import common  # noqa
import build_dungeon_semantic as B
from specs import SPECS


def ok(spec):
    B.ACT = spec["act"]
    for f in range(1, spec["floors"] + 1):
        fl = B.crop_to_content(B.generate_floor(spec, f, zlib.crc32(spec["id"].encode()) + f * 7919))
        if B.validate(fl):
            return False
    return True


import contextlib, io
for spec in SPECS:
    with contextlib.redirect_stdout(io.StringIO()):
        good = ok(spec)
    if good:
        continue
    found = None
    for db, dj in itertools.product([(0, 0), (2, 0), (0, 2), (-2, 0), (2, 2), (-2, -2)],
                                    [0, 3, -3, 6, -6, 9, -9, 12, -12, 15, -15]):
        s = dict(spec, joints=tuple(j + dj for j in spec["joints"]),
                 base=(spec["base"][0] + db[0], spec["base"][1] + db[1]))
        with contextlib.redirect_stdout(io.StringIO()):
            if ok(s):
                found = s; break
    print(spec["id"], "->", (found["joints"], found["base"]) if found else "NONE FOUND")
