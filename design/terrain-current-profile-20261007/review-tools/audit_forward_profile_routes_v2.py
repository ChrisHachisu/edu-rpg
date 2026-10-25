#!/usr/bin/env python3
"""Bounded static route audit for the current Act 1 terrain profile.

This is a secondary, source-bound translation of the live overworld collision
contract in public/dq-tiles.js. It never edits game/runtime files. Paths are
searched only inside the current painted Act 1 region, using 6 px graph edges
and live movement checks at <= 1.2 canonical px (runtime maximum 1/0.7 px).
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import heapq
import json
import math
import re
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


PROFILE = "act1-forward-20261007-v1"
BOUNDS = (16, 218, 163, 399)
TILE = 48
OW_SCALE = 0.7
HERO_SCALE = 1.0125
MAX_STEP = 1.0 / OW_SCALE
GRID = 6
FOOT = 12.0
LEAN = 4.0
CHAMFER = 3.0
FIELD_OWNED = {2, 4, 5}
BASE_BUNDLE_SHA256 = "ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456"


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def jsround(v: float) -> int:
    return math.floor(v + 0.5)


def parse_json_assignment(source: str, name: str):
    m = re.search(r"\bvar\s+" + re.escape(name) + r"\s*=\s*(\[.*?\]|\{.*?\});", source, re.S)
    if not m:
        raise ValueError(f"current map authority has no {name} JSON assignment")
    return json.loads(m.group(1))


def make_stencil(path: Path):
    image = Image.open(path).convert("RGBA")
    if image.size != (768, 64):
        raise ValueError(f"unexpected selectable hero sheet dimensions {path}: {image.size}")
    alpha = np.asarray(image)[:, :, 3]
    points = set()
    for frame in range(12):
        frame_alpha = alpha[:, frame * 64:(frame + 1) * 64]
        yy, xx = np.nonzero(frame_alpha > 8)
        for x, y in zip(xx.tolist(), yy.tolist()):
            dx = jsround(((x + 0.5) - 32.0) * HERO_SCALE / OW_SCALE * 32 / 48)
            dy = jsround(((y + 0.5) - 32.0) * HERO_SCALE / OW_SCALE * 32 / 48)
            points.add((dx, dy))
    if not points:
        raise ValueError(f"empty runtime stencil from {path}")
    arr = np.asarray(sorted(points), dtype=np.int16)
    minx, miny = arr.min(axis=0).tolist()
    maxx, maxy = arr.max(axis=0).tolist()
    opaque_rows = np.where(alpha > 8)[0]
    last_row = int(opaque_rows.max()) if len(opaque_rows) else 63
    foot_dy = ((last_row + 0.5) - 32.0) * HERO_SCALE / OW_SCALE
    return {"points": arr, "bounds": (minx, miny, maxx, maxy), "footDy": foot_dy,
            "sourceSha256": sha(path), "stencilPoints": int(len(arr)),
            "lastAlphaRow": last_row}


class Authority:
    def __init__(self, repo: Path, output: Path):
        self.repo = repo
        self.output = output
        self.receipt_path = output / "output-receipt.json"
        self.receipt = json.loads(self.receipt_path.read_text())
        if self.receipt.get("profileId") != PROFILE or not self.receipt.get("fullWorldComplete"):
            raise ValueError("frozen output receipt is not complete for the requested profile")
        if self.receipt.get("gateReady"):
            raise ValueError("audit expects the pre-install fail-closed output receipt")
        self.dq_path = repo / "public/dq-tiles.js"
        self.map_path = repo / "public/act1-world-map.js"
        self.bundle_path = repo / "dist/assets/index-BhoGQRaA.js"
        self.dq = self.dq_path.read_text()
        self.map_source = self.map_path.read_text()
        self.bundle_sha = sha(self.bundle_path)
        if self.bundle_sha != BASE_BUNDLE_SHA256:
            raise ValueError("preserved base bundle changed; refresh canMove authority review before audit")
        # Bind the non-field-owned tile rule to the actual base scene.canMove and
        # the current DQ table; the two consumable exceptions require empty new-game
        # inventory, as established by the requested Greenhollow new-game route.
        if 'if (o.type === "overworld" || o.type === "portal-overworld")' not in self.bundle_path.read_text():
            raise ValueError("preserved base bundle has no expected overworld canMove branch")
        bundle_text = self.bundle_path.read_text()
        canmove_start = bundle_text.index('if (o.type === "overworld" || o.type === "portal-overworld")')
        canmove_end = bundle_text.index(';\n            else if (o.type === "town")', canmove_start)
        self.base_canmove_branch = bundle_text[canmove_start:canmove_end + 1]
        if not all(s in self.base_canmove_branch for s in (
                "i !== 2", "i !== 4", "i !== 6", "i !== 21",
                "i === 13 &&", "windbreakerStone", "i === 21 &&", "flameCloak")):
            raise ValueError("base overworld canMove branch changed; re-review semantics before audit")
        self.ow_block = self._parse_ow_block(self.dq)
        if self.ow_block != {2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21}:
            raise ValueError("current DQ OW_BLOCK changed; re-review field/canMove ownership")
        if self.map_source.count("function blocked(tile){ return tile===2||tile===3||tile===4||tile>=6; }") != 1:
            raise ValueError("current map blocked() predicate changed; re-review route derivation")
        self.map_revision = int(re.search(r"var REVISION\s*=\s*(\d+)", self.map_source).group(1))
        bounds = parse_json_assignment(self.map_source, "BOUNDS")
        if tuple(bounds) != BOUNDS:
            raise ValueError(f"current map bounds changed: {bounds}")
        self.landmarks = parse_json_assignment(self.map_source, "LANDMARKS")
        self.gate = parse_json_assignment(self.map_source, "GATE")
        map_path = output.parents[2] / "route-audit" / "plated-map.json"
        self.rows = json.loads(map_path.read_text())["rows"]
        self.map_data = np.asarray(self.rows, dtype=np.uint8)
        if self.map_data.shape != (400, 320):
            raise ValueError(f"plated map has wrong dimensions {self.map_data.shape}")
        map_record = json.loads(map_path.read_text())
        self.map_record = map_record
        if map_record.get("platedSha256") != "175f8f5dc486e4b4d2bed660924999dca72c0c6516f396e195752debfc92a215":
            raise ValueError("current plated map hash does not match the DQ bake authority")
        if hashlib.sha256(self.map_data.tobytes()).hexdigest() != map_record["platedSha256"]:
            raise ValueError("plated-map.json rows do not match the emitted current-map digest")
        rows_match = re.search(r"\bvar\s+ROWS\s*=\s*(\[.*?\]);", self.map_source, re.S)
        if not rows_match:
            raise ValueError("current map authority has no ROWS array")
        plate_rows = ast.literal_eval(rows_match.group(1))
        plate_tiles = np.asarray([[int(ch, 36) for ch in row] for row in plate_rows], dtype=np.uint8)
        x0, y0, x1, y1 = bounds
        if plate_tiles.shape != (y1 - y0 + 1, x1 - x0 + 1) or not np.array_equal(
                self.map_data[y0:y1 + 1, x0:x1 + 1], plate_tiles):
            raise ValueError("emitted full map differs from current map authority's active Act 1 rows")
        self.bounds = tuple(bounds)
        self.qok_path = output / "public/act1-hifi/forest-collision.bin"
        self.qok_raw = self.qok_path.read_bytes()
        self.qok = self._read_qok(self.qok_raw)
        self.alpha_path = output / "evidence/final-visible-raised-alpha.png"
        if sha(self.alpha_path) != self.receipt["sourceAlpha"]["sha256"]:
            raise ValueError("final alpha changed since the frozen receipt")
        if self.qok["sourceSha256"] != self.receipt["sourceAlpha"]["sha256"]:
            raise ValueError("QOK source alpha identity does not match the final display alpha")
        if sha(self.qok_path) != self.receipt["collisionPack"]["sha256"]:
            raise ValueError("QOK output changed since the frozen receipt")
        self.field_path = repo / "public/act1-overworld-walk.bin"
        self.field_raw = self.field_path.read_bytes()
        self.field = self._read_a1ow(self.field_raw)
        a1ow_proof_path = repo / "design/terrain-current-profile-20261007/evidence/a1ow-v2-independent-review/independent-a1ow-v2-recomputation.json"
        a1ow_map_proof_path = repo / "design/terrain-current-profile-20261007/evidence/a1ow-v2-independent-review/baked-final-map.json"
        a1ow_proof = json.loads(a1ow_proof_path.read_text())
        if (a1ow_proof.get("status") != "PASS_A1OW_V2_IDENTITY_AND_BODY"
                or a1ow_proof.get("inputs", {}).get("v2Sha256") != sha(self.field_path)
                or a1ow_proof.get("inputs", {}).get("dqTilesSha256") != sha(self.dq_path)
                or a1ow_proof.get("inputs", {}).get("mapProofSha256") != sha(a1ow_map_proof_path)
                or a1ow_proof.get("payload", {}).get("byteIdentical") is not True
                or a1ow_proof.get("payload", {}).get("v2BodySha256") != self.field["payloadSha256"]
                or a1ow_proof.get("v2Header") != self.field["proofHeader"]
                or a1ow_proof.get("semantics", {}).get("sha256") != self.field["semanticsSha256"]
                or a1ow_proof.get("support", {}).get("sha256") != self.field["supportSha256"]
                or a1ow_proof.get("support", {}).get("fnv32") != self.field["supportFNV32"]):
            raise ValueError("A1OW v2 bytes/source/map/body do not match the pinned independent proof")
        self.a1ow_proof_path = a1ow_proof_path
        self.a1ow_map_proof_path = a1ow_map_proof_path
        self.a1ow_proof = a1ow_proof
        self.hero_paths = {
            "g3": repo / "public/assets/hero/hero-g3-walk.png",
            "male": repo / "public/assets/hero/hero-male-walk.png",
        }
        self.heroes = {k: make_stencil(v) for k, v in self.hero_paths.items()}
        if self.heroes["g3"]["sourceSha256"] != "070a8a452c3dda775bd6c8593a66d57a5a13d97b9fb33378ea5b2bb0e1fded3c":
            raise ValueError("G3 hero source changed since live guard receipt")
        if self.heroes["male"]["sourceSha256"] != "88cbed8f9d707b216ada01e108eedd5822c6bcfc69c8dd22af2457f231dc0976":
            raise ValueError("male hero source changed since live guard receipt")
        self.mask = self._unpack_qok(self.qok)
        self.field_blocks: dict[int, memoryview] = {}
        self.position_cache = {}
        self.edge_cache = {}
        self.queries = {k: {"positionChecks": 0, "edgeChecks": 0, "expandedNodes": 0}
                        for k in self.heroes}

    @staticmethod
    def _parse_ow_block(dq: str):
        match = re.search(r"var OW_BLOCK=\{([^}]*)\};", dq)
        if not match:
            raise ValueError("current dq-tiles.js has no OW_BLOCK")
        return {int(key) for key in re.findall(r"(\d+):1", match.group(1))}

    @staticmethod
    def _read_qok(raw: bytes):
        if raw[:8] != b"QOKF8COL":
            raise ValueError("QOK magic mismatch")
        version, header, width, height, ppc = struct.unpack_from("<HHIII", raw, 8)
        source = raw[24:56].hex()
        if (version, header, width, height, ppc) != (1, 64, 4736, 5824, 32):
            raise ValueError("unsupported QOK geometry/header")
        if len(raw) != header + (width * height + 7) // 8:
            raise ValueError("QOK byte length mismatch")
        return {"raw": raw, "header": header, "width": width, "height": height,
                "ppc": ppc, "sourceSha256": source}

    @staticmethod
    def _read_a1ow(raw: bytes):
        # v2 uses a 96-byte support-bound header. The distance body remains byte-identical
        # to the independently verified frozen v1 body; route sampling still reads the
        # same uint16 cell IDs and 48x48 distance blocks from the v2 offsets.
        if len(raw) < 96 or raw[:4] != b"A1OW":
            raise ValueError("A1OW v2 shorter than header or bad magic")
        version, n, mw, mh, far, header = struct.unpack_from("<HHHHHH", raw, 4)
        nb, support_fnv = struct.unpack_from("<II", raw, 16)
        reserved_a, reserved_b = struct.unpack_from("<II", raw, 24)
        semantics_sha, support_sha = raw[32:64].hex(), raw[64:96].hex()
        cells = mw * mh
        payload = raw[header:]
        payload_sha = hashlib.sha256(payload).hexdigest()
        expected = (2, 48, 320, 400, 255, 96, 4094, 4271507709,
                    "a6e6e7f228d040381539618d99f03e774a16dd7cadbaf8cc76a115934d324f67",
                    "eeaf65c08cda239ea8755a3af0026ed0ca61e19a2683cafc10610b5c4027914a",
                    "05be9638d04a692668c3a1c8b4bd3d809216bcede2e090a74a0712cb5467498c")
        if (version, n, mw, mh, far, header, nb, support_fnv, semantics_sha, support_sha, payload_sha) != expected:
            raise ValueError("A1OW v2 header/support/payload differs from the reviewed runtime contract")
        if reserved_a != 0 or reserved_b != 0 or len(raw) != header + cells * 2 + nb * n * n:
            raise ValueError("A1OW v2 reserved bytes or length are invalid")
        ids = np.frombuffer(raw, dtype="<u2", count=cells, offset=header).reshape((mh, mw))
        blocks = memoryview(raw)[header + cells * 2:]
        return {"raw": raw, "width": mw, "height": mh, "far": far, "blockCount": nb,
                "supportFNV32": support_fnv, "semanticsSha256": semantics_sha,
                "supportSha256": support_sha, "payloadSha256": payload_sha,
                "proofHeader": {"magic": "A1OW", "version": version, "headerBytes": header,
                                "pixelsPerCell": n, "mapCells": [mw, mh], "far": far,
                                "reservedBytesZero": reserved_a == 0 and reserved_b == 0,
                                "blocks": nb, "exactLength": len(raw)},
                "ids": ids, "blocks": blocks, "blockSize": n * n}

    @staticmethod
    def _unpack_qok(qok):
        packed = np.frombuffer(qok["raw"], dtype=np.uint8, offset=qok["header"])
        return np.unpackbits(packed, bitorder="little", count=qok["width"] * qok["height"]).reshape(
            (qok["height"], qok["width"]))

    def targets(self):
        targets: dict[str, dict] = {}
        for mark in self.landmarks:
            mid = mark["mapId"]
            ex = mark.get("exit") or mark.get("at")
            if ex:
                targets[f"exit:{mid}"] = {"mapId": mid, "cell": (int(ex["x"]), int(ex["y"])), "kind": "exit"}
            door = mark.get("at") or mark.get("exit")
            if door:
                x, y = int(door["x"]), int(door["y"])
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if self.seed_walkable(nx, ny):
                        key = f"approach:{mid}:{nx},{ny}"
                        targets[key] = {"mapId": mid, "cell": (nx, ny), "kind": "approach"}
        # The start is a required route and one of the live Greenhollow approaches.
        targets["new-game-start:greenhollow"] = {"mapId": "greenhollow", "cell": (69, 256), "kind": "start"}
        return targets

    def seed_walkable(self, x: int, y: int) -> bool:
        x0, y0, x1, y1 = self.bounds
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            return False
        tile = int(self.map_data[y, x])
        if tile in (2, 3, 4) or tile >= 6:
            return False
        return not any(int(p["x"]) == x and int(p["y"]) == y for p in self.gate.get("closedSide", []))

    def qok_block(self, hero, x: float, y: float):
        pts = hero["points"]
        cx = jsround((x - 16 * TILE) * 32 / 48)
        cy = jsround((y - 218 * TILE) * 32 / 48)
        px = cx + pts[:, 0].astype(np.int32)
        py = cy + pts[:, 1].astype(np.int32)
        margin = math.ceil(32 / (48 * OW_SCALE))
        for dx, dy in ((0, 0), (-margin, 0), (margin, 0), (0, -margin), (0, margin)):
            qx, qy = px + dx, py + dy
            inside = (qx >= 0) & (qy >= 0) & (qx < 4736) & (qy < 5824)
            if np.any(self.mask[qy[inside], qx[inside]]):
                j = int(np.flatnonzero(inside)[np.flatnonzero(self.mask[qy[inside], qx[inside]])[0]])
                return {"rule": "QOK visible-alpha stencil", "source": "forest-collision.bin",
                        "worldPx": [round(x, 3), round(y, 3)], "collisionPx": [int(qx[j]), int(qy[j])],
                        "stencilOffset": [int(pts[j, 0]), int(pts[j, 1])], "padding": [dx, dy]}
        return None

    def field_distance(self, x: int, y: int) -> int:
        tx, ty = x // TILE, y // TILE
        ids = self.field["ids"]
        if not (0 <= tx < self.field["width"] and 0 <= ty < self.field["height"]):
            raise ValueError("A1OW lookup outside map")
        block_id = int(ids[ty, tx])
        if block_id == 0xFFFF:
            return 255
        if block_id == 0xFFFE:
            return 0
        if block_id == 0xFFFD:
            return 0 if (16 <= tx <= 163 and 218 <= ty <= 399) else 255
        if not (0 <= block_id < self.field["blockCount"]):
            raise ValueError(f"invalid A1OW block index {block_id}")
        block = self.field["blocks"][block_id * self.field["blockSize"]:(block_id + 1) * self.field["blockSize"]]
        return int(block[(y % TILE) * TILE + (x % TILE)])

    def position_free(self, hero_name: str, x: float, y: float):
        hx, hy = round(x * 5), round(y * 5)
        key = (hero_name, hx, hy)
        if key in self.position_cache:
            return self.position_cache[key]
        self.queries[hero_name]["positionChecks"] += 1
        hero = self.heroes[hero_name]
        failure = self.qok_block(hero, x, y)
        if failure:
            self.position_cache[key] = failure
            return failure
        wx = x
        wy = y + hero["footDy"]
        gx, gy = int(wx), int(wy)
        tile_x, tile_y = math.floor(wx / TILE), math.floor(wy / TILE)
        if not (0 <= tile_x < 320 and 0 <= tile_y < 400):
            failure = {"rule": "A1OW/map bounds", "source": "dq-tiles.js:a1mFree", "worldPx": [round(x, 3), round(y, 3)]}
            self.position_cache[key] = failure
            return failure
        tile = int(self.map_data[tile_y, tile_x])
        # Runtime a1mFree reads the baked chamfer first, then live canMove for all
        # non-field-owned cells; its Act 1 wrapper blocks closed Crystal Cave entry.
        d = self.field_distance(gx, gy)
        left, right = self.field_distance(gx - 1, gy), self.field_distance(gx + 1, gy)
        up, down = self.field_distance(gx, gy - 1), self.field_distance(gx, gy + 1)
        nx, ny = right - left, down - up
        norm = math.hypot(nx, ny)
        need = (FOOT / OW_SCALE) * CHAMFER
        if norm >= 1e-6:
            need += (LEAN / OW_SCALE) * CHAMFER * (1 + ny / norm) * 0.5
        # This is the overworld branch: its dungeon-mouth exemption is inapplicable.
        if d < need:
            failure = {"rule": "A1OW water-distance clearance", "source": "act1-overworld-walk.bin",
                       "worldPx": [round(x, 3), round(y, 3)], "footPx": [round(wx, 3), round(wy, 3)],
                       "fieldPixel": [gx, gy], "distanceThirds": d, "requiredThirds": round(need, 4), "tile": tile}
            self.position_cache[key] = failure
            return failure
        terrain_required = 16 <= math.floor(x / TILE) <= 163 and 218 <= math.floor(y / TILE) <= 399
        if tile not in FIELD_OWNED:
            if tile == 3 and terrain_required:
                result = True  # current wrapper routes tree proxy through exact QOK union above
                self.position_cache[key] = result
                return result
            if tile in self.ow_block or (tile == 3 and terrain_required):
                failure = {"rule": "current map canMove/OW_BLOCK", "source": "act1-world-map.js + dq-tiles.js",
                           "worldPx": [round(x, 3), round(y, 3)], "footPx": [round(wx, 3), round(wy, 3)],
                           "tileCell": [tile_x, tile_y], "tile": tile,
                           "gateClosed": [tile_x, tile_y] in [
                               [int(p["x"]), int(p["y"])] for p in self.gate.get("closedSide", [])]}
                self.position_cache[key] = failure
                return failure
        self.position_cache[key] = True
        return True

    def edge_free(self, hero_name: str, p: tuple[int, int], q: tuple[int, int]):
        k = (hero_name, p, q) if p <= q else (hero_name, q, p)
        if k in self.edge_cache:
            return self.edge_cache[k]
        self.queries[hero_name]["edgeChecks"] += 1
        length = math.hypot(q[0] - p[0], q[1] - p[1])
        n = max(1, math.ceil(length / MAX_STEP))
        # Include both ends, spacing is <= 1.2 px for a six-pixel graph edge.
        for i in range(n + 1):
            f = i / n
            result = self.position_free(hero_name, p[0] + (q[0] - p[0]) * f,
                                        p[1] + (q[1] - p[1]) * f)
            if result is not True:
                self.edge_cache[k] = result
                return result
        self.edge_cache[k] = True
        return True

    def find_route(self, hero_name: str, start_cell, target_cell, expansion_cap=200000):
        start = (start_cell[0] * TILE + TILE // 2, start_cell[1] * TILE + TILE // 2)
        goal = (target_cell[0] * TILE + TILE // 2, target_cell[1] * TILE + TILE // 2)
        if start[0] % GRID or start[1] % GRID or goal[0] % GRID or goal[1] % GRID:
            raise ValueError("route anchors do not align to the six-pixel audit lattice")
        if self.position_free(hero_name, *start) is not True:
            return {"status": "blocked-at-start", "start": start, "failure": self.position_free(hero_name, *start)}
        if self.position_free(hero_name, *goal) is not True:
            return {"status": "blocked-at-target", "target": goal, "failure": self.position_free(hero_name, *goal)}
        open_heap = []
        start_key = (start[0] // GRID, start[1] // GRID)
        goal_key = (goal[0] // GRID, goal[1] // GRID)
        def heuristic(node):
            return abs(node[0] - goal_key[0]) + abs(node[1] - goal_key[1])
        heapq.heappush(open_heap, (heuristic(start_key), 0, start_key))
        came = {}
        gscore = {start_key: 0}
        closed = set()
        last_failure = None
        expanded = 0
        while open_heap and expanded < expansion_cap:
            _, g, node = heapq.heappop(open_heap)
            if node in closed or g != gscore.get(node):
                continue
            closed.add(node)
            expanded += 1
            if node == goal_key:
                path = [node]
                while node in came:
                    node = came[node]
                    path.append(node)
                path.reverse()
                route = [(x * GRID, y * GRID) for x, y in path]
                self.queries[hero_name]["expandedNodes"] += expanded
                return {"status": "pass", "start": start, "target": goal, "nodes": len(route),
                        "distanceCanonicalPx": (len(route) - 1) * GRID, "path": route}
            x, y = node[0] * GRID, node[1] * GRID
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nxt = (node[0] + dx, node[1] + dy)
                nx, ny = nxt[0] * GRID, nxt[1] * GRID
                cellx, celly = math.floor(nx / TILE), math.floor(ny / TILE)
                if not (BOUNDS[0] <= cellx <= BOUNDS[2] and BOUNDS[1] <= celly <= BOUNDS[3]):
                    continue
                if nxt in closed:
                    continue
                check = self.edge_free(hero_name, (x, y), (nx, ny))
                if check is not True:
                    if last_failure is None:
                        last_failure = {"from": [x, y], "to": [nx, ny], **check}
                    continue
                score = g + 1
                if score >= gscore.get(nxt, 1 << 60):
                    continue
                came[nxt] = node
                gscore[nxt] = score
                heapq.heappush(open_heap, (score + heuristic(nxt), score, nxt))
        self.queries[hero_name]["expandedNodes"] += expanded
        return {"status": "search-exhausted" if not open_heap else "expansion-cap",
                "start": start, "target": goal, "expanded": expanded, "firstRejectedEdge": last_failure,
                "limitation": "No route found within the painted Act 1 bounds and configured expansion cap."}

    def context_image(self, hero_name: str, result: dict, dest: Path):
        f = result.get("failure") or result.get("firstRejectedEdge") or {}
        world = f.get("footPx", f.get("worldPx", result.get("target", (0, 0))))
        if len(world) != 2:
            world = [0, 0]
        wx, wy = world
        cx = jsround((wx - 16 * TILE) * 32 / 48)
        cy = jsround((wy - 218 * TILE) * 32 / 48)
        radius = 128
        im = Image.new("RGBA", (2 * radius, 2 * radius), (30, 38, 48, 255))
        alpha = Image.open(self.alpha_path).convert("RGBA")
        l, t = max(0, cx - radius), max(0, cy - radius)
        r, b = min(4736, cx + radius), min(5824, cy + radius)
        crop = alpha.crop((l, t, r, b))
        tint = Image.new("RGBA", crop.size, (235, 120, 30, 0))
        tint.putalpha(crop.getchannel("A"))
        im.alpha_composite(tint, (l - (cx - radius), t - (cy - radius)))
        d = ImageDraw.Draw(im)
        px, py = radius, radius
        d.line((px - 9, py, px + 9, py), fill=(255, 60, 60, 255), width=2)
        d.line((px, py - 9, px, py + 9), fill=(255, 60, 60, 255), width=2)
        d.rectangle((1, 1, 2 * radius - 2, 2 * radius - 2), outline=(200, 210, 220, 255))
        im.convert("RGB").save(dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--evidence", type=Path, required=True)
    args = ap.parse_args()
    repo, output, evidence = args.repo.resolve(), args.output.resolve(), args.evidence.resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    authority = Authority(repo, output)
    targets = authority.targets()
    if len([k for k in targets if k.startswith("approach:")]) != 11:
        raise ValueError("live current map no longer has exactly 11 walkable cardinal approaches")
    results = {}
    start = (69, 256)
    ordered = sorted(targets.items(), key=lambda kv: (kv[1]["cell"] != start,
                        abs(kv[1]["cell"][0] - start[0]) + abs(kv[1]["cell"][1] - start[1]), kv[0]))
    for hero_name in ("g3", "male"):
        results[hero_name] = {}
        route_cache = {}
        for target_id, target in ordered:
            cell = target["cell"]
            if cell == start:
                route = {"status": "pass", "start": [start[0] * TILE + 24, start[1] * TILE + 24],
                         "target": [start[0] * TILE + 24, start[1] * TILE + 24], "nodes": 1,
                         "distanceCanonicalPx": 0, "path": [[start[0] * TILE + 24, start[1] * TILE + 24]]}
            elif cell in route_cache:
                route = dict(route_cache[cell])
            else:
                route = authority.find_route(hero_name, start, cell)
                route_cache[cell] = route
            route.update({"targetId": target_id, "mapId": target["mapId"], "cell": list(cell), "kind": target["kind"]})
            results[hero_name][target_id] = route
            progress_path = evidence / "route-progress.json"
            partial = {"profileId": PROFILE, "status": "running", "currentHero": hero_name,
                       "completedNamedTargets": {h: sorted(v) for h, v in results.items()},
                       "completedTargetCount": sum(len(v) for v in results.values()),
                       "totalNamedTargetCount": len(targets) * len(authority.heroes)}
            tmp_progress = progress_path.with_suffix(".json.tmp")
            tmp_progress.write_text(json.dumps(partial, indent=2, sort_keys=True) + "\n")
            tmp_progress.replace(progress_path)
            print(f"completed {hero_name} {target_id}: {route['status']}", flush=True)
    failures = [(hero, rid, r) for hero, group in results.items() for rid, r in group.items() if r["status"] != "pass"]
    inconclusive = any(r["status"] in {"search-exhausted", "expansion-cap"}
                       for _, _, r in failures)
    blocked_anchors = any(r["status"] in {"blocked-at-start", "blocked-at-target"}
                          for _, _, r in failures)
    first_context = None
    if failures:
        hero, rid, result = failures[0]
        first_context = evidence / f"first-failure-{hero}-{re.sub('[^a-zA-Z0-9_-]', '-', rid)}.png"
        authority.context_image(hero, result, first_context)
    path_data = {
        "schema": 1, "profileId": PROFILE,
        "sourceInputs": {
            "outputReceipt": {"path": str(authority.receipt_path), "sha256": sha(authority.receipt_path)},
            "preservedBaseBundle": {"path": str(authority.bundle_path), "sha256": authority.bundle_sha},
            "activeOutputManifest": {"path": str(output / "public/act1-hifi/manifest.json"), "sha256": sha(output / "public/act1-hifi/manifest.json")},
            "qok": {"path": str(authority.qok_path), "sha256": sha(authority.qok_path)},
            "finalAlpha": {"path": str(authority.alpha_path), "sha256": sha(authority.alpha_path)},
            "a1ow": {"path": str(authority.field_path), "sha256": sha(authority.field_path)},
            "a1owV2IndependentProof": {"path": str(authority.a1ow_proof_path), "sha256": sha(authority.a1ow_proof_path)},
            "a1owV2MapProof": {"path": str(authority.a1ow_map_proof_path), "sha256": sha(authority.a1ow_map_proof_path)},
            "dqTiles": {"path": str(authority.dq_path), "sha256": sha(authority.dq_path)},
            "currentWorldMap": {"path": str(authority.map_path), "sha256": sha(authority.map_path)},
            "platedMap": {"path": str(output.parents[2] / "route-audit/plated-map.json"), "sha256": sha(output.parents[2] / "route-audit/plated-map.json")},
            "heroes": {k: {"path": str(v), "sha256": sha(v)} for k, v in authority.hero_paths.items()},
        },
        "authority": {
            "runtimeSource": "public/dq-tiles.js: a1fBuildStencil/a1fHeroFree/a1fRequiredAt/a1mFootDy/a1mNeed/a1mFree/a1mStep/owmBakeParse/owmAssemble",
            "mapSource": "public/act1-world-map.js: BOUNDS/ROWS/LANDMARKS/GATE/seedWalkableAt/canMove wrapper",
            "baseCanMoveSource": "dist/assets/index-BhoGQRaA.js: WorldMapScene.canMove overworld branch (hash pinned); default empty new-game inventory, so conditional tile-13/tile-21 item exceptions do not apply",
            "baseCanMoveBranchSha256": hashlib.sha256(authority.base_canmove_branch.encode()).hexdigest(),
            "dqOwBlock": sorted(authority.ow_block),
            "heroScale": HERO_SCALE, "overworldScale": OW_SCALE, "movementStepMaxCanonicalPx": MAX_STEP,
            "routeGraphStepCanonicalPx": GRID, "edgeSamplesMaxGapCanonicalPx": GRID / math.ceil(GRID / MAX_STEP),
            "routeStartCell": list(start), "routeStartAnchor": "tile center (x*48+24,y*48+24)",
            "closedCrystalCaveGate": authority.gate["requiredFlag"], "currentGateState": "closed/default story flag absent",
            "regionBoundsInclusive": list(BOUNDS), "collisionAuthorities": ["QOKF8COL visible-alpha stencil", "unchanged A1OW water field", "current map canMove/OW_BLOCK/gate"],
            "qokTest": "all alpha>8 pixels across all 12 sheet frames, transformed with runtime scale/origin; center plus cardinal one-pixel padding",
            "fieldTest": "production a1mFootDy plus chamfer-3/4 clearance and current A1OW sampled at every continuous substep",
            "edgeSampling": "inclusive endpoints at <= 1.2 canonical px; runtime maximum is 1/0.7 = 1.4286",
        },
        "targetCount": len(targets), "heroResults": results,
        "solverCounts": authority.queries,
        "status": "inconclusive" if inconclusive else "blocked-anchor" if blocked_anchors else "pass",
        "statusMeaning": "Expansion/search caps are inconclusive; blocked-at-target means only the tested tile-center anchor failed the static collision predicate, not that transition interaction is impossible.",
        "limitations": [
            "Static source translation only; it does not invoke Phaser or prove frame-by-frame movement, input, transitions, streaming, or native behavior.",
            "Search is bounded to the current painted Act 1 rectangle; a route that would have to leave that rectangle is reported as not found within scope.",
            "Route starts and targets use tile-center anchors because live route/start authorities provide cells, not persisted subcell coordinates.",
            "Production's axis and tangent-slide fallbacks can follow paths outside this cardinal search graph; the audit does not assume those fallback moves.",
            "The current guard's stale historical proof is not used; current exits/approaches are derived from current map source and validated against actual emitted collision artifacts.",
            "The current map declares Crystal Cave gate flag boss.giantToad.defeated, but wrapCheckTransition returns its ENTRY unconditionally and a1mDoor calls checkTransition directly after a blocked movement; the flag's actual entry-gating behavior is unresolved, so no Crystal Cave progression/locked-state claim is made.",
            "New-game default assumes no inventory items; base WorldMapScene.canMove has conditional tile 13/21 item exceptions, which are not used to claim later-state reachability.",
        ],
    }
    path_json = evidence / "route-paths.json"
    path_json.write_text(json.dumps(path_data, indent=2, sort_keys=True) + "\n")
    summary = {k: v for k, v in path_data.items() if k not in ("heroResults",)}
    summary["heroResults"] = {hero: {rid: {key: val for key, val in route.items() if key != "path"}
                                    for rid, route in group.items()} for hero, group in results.items()}
    summary["pathDataSha256"] = sha(path_json)
    if first_context:
        summary["firstFailureContextImage"] = str(first_context)
    report = evidence / "ROUTE-AUDIT.json"
    report.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status": path_data["status"], "report": str(report), "pathData": str(path_json),
                      "targetCount": len(targets), "heroResults": summary["heroResults"],
                      "firstFailureContextImage": str(first_context) if first_context else None}, indent=2))
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
