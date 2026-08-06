#!/usr/bin/env python3
"""Seed localStorage['edu-rpg-save'] straight into the iOS Simulator's WebView store.

WHY
    The in-app WebView has no URL bar, so public/act1-hifi/verify/seed.html -- which is how
    the WEB build seeds a save -- cannot be reached inside the real app. And walking to
    content is impractical: Port Sapphire is a long trek, and the 18 dungeon floors are not
    reachable on foot at all in a fresh save.

HOW
    WebKit keeps localStorage in a plain sqlite3 database inside the app's DATA container,
    keyed by origin (capacitor://localhost). Writing there while the app is terminated is
    equivalent to the page having run setItem().

TWO TRAPS
    1. Values are UTF-16LE blobs, not UTF-8 text. "en" is four bytes. Writing a Python str
       yields a value the page reads as garbage.
    2. `xcrun simctl install` mints a NEW data container, so the seed dies on every
       reinstall. Always seed AFTER installing. Symptom when you get it wrong: the title
       screen offers only "New Game", and a tap aimed at "Continue" lands on "New Game".

USAGE
    python3 scripts/seed_ios_save.py --map portSapphire
    python3 scripts/seed_ios_save.py --map overworld --x 130 --y 292
    python3 scripts/seed_ios_save.py --map sunkenCellar --floor 3 --gold 5000 --level 20
    python3 scripts/seed_ios_save.py --list-maps
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "dist" / "assets" / "index-BhoGQRaA.js"
APPID = "app.chalkmap.questofknowledge"
SAVE_KEY = "edu-rpg-save"
# The shipped save format. Bumping this without the bundle agreeing makes the title screen
# silently refuse the save -- AGENTS.md calls out SAVE_VERSION=4 as part of the shipped
# game's identity.
SAVE_VERSION = 4


def shipped_map_ids() -> list[str]:
    """Read the valid map ids out of the SHIPPED bundle, not src/.

    src/data/maps.ts is part of the stale reconstruction that AGENTS.md forbids building;
    it is not authoritative for what the running game accepts.
    """
    if not BUNDLE.is_file():
        return []
    text = BUNDLE.read_text(encoding="utf-8", errors="replace")
    return sorted(set(re.findall(r'"map\.([A-Za-z0-9_]+)"', text)))


def dungeon_spawn(map_id: str, floor: int) -> tuple[int, int] | None:
    """Centre-most walkable cell of a dungeon floor, or None if not a known dungeon.

    Without this, --map sunkenCellar --floor 3 inherits the OVERWORLD default of (130, 292),
    which is off the edge of a 48x31 dungeon: the hero is nowhere, the camera shows solid
    rock, and the floor looks broken when it is fine. Observed on 2026-08-03.

    public/act1-dungeon-floors.json documents its own encoding: "48 world px per cell.
    rows: # = rock, everything else walkable." Save positions are in CELLS, matching the
    overworld connections in the shipped bundle (fromX/fromY are tile coordinates).
    """
    floors_path = ROOT / "public" / "act1-dungeon-floors.json"
    if not floors_path.is_file():
        return None
    floors = json.loads(floors_path.read_text(encoding="utf-8")).get("floors", {})
    entry = floors.get(f"{map_id}-f{floor}")
    if not entry:
        return None
    rows = entry["rows"]
    cy, cx = len(rows) / 2, len(rows[0]) / 2
    best = None
    for y, row in enumerate(rows):
        for x, cell in enumerate(row):
            if cell == "#":
                continue
            d = (x - cx) ** 2 + (y - cy) ** 2
            if best is None or d < best[0]:
                best = (d, x, y)
    return (best[1], best[2]) if best else None


def booted_udid() -> str:
    out = subprocess.run(["xcrun", "simctl", "list", "devices", "booted"],
                         capture_output=True, text=True).stdout
    found = re.findall(r"\(([0-9A-F-]{36})\) \(Booted\)", out)
    if not found:
        sys.exit("no booted simulator; boot one with: xcrun simctl boot <udid>")
    if len(found) > 1:
        sys.exit(f"{len(found)} simulators booted; pass --udid explicitly: {found}")
    return found[0]


def localstorage_db(udid: str) -> Path:
    container = subprocess.run(
        ["xcrun", "simctl", "get_app_container", udid, APPID, "data"],
        capture_output=True, text=True)
    if container.returncode != 0:
        sys.exit(f"{APPID} is not installed on {udid} -- install the .app first")
    hits = glob.glob(os.path.join(
        container.stdout.strip(), "Library/WebKit", APPID,
        "WebsiteData/Default/*/*/LocalStorage/localstorage.sqlite3"))
    if not hits:
        sys.exit("no localstorage.sqlite3 yet -- launch the app once so WebKit creates it")
    return Path(hits[0])


def build_save(args: argparse.Namespace) -> dict:
    return {
        "version": SAVE_VERSION,
        "timestamp": args.timestamp,
        "player": {
            "name": args.name, "heroColor": "gray",
            "level": args.level, "exp": 0, "expToNext": 17,
            "hp": args.hp, "maxHp": args.hp,
            "atk": 15, "def": 5, "spd": 6,
            "equipment": {k: None for k in
                          ("weapon", "armor", "shield", "helmet", "accessory")},
            "inventory": [{"itemId": "herb", "quantity": 3}],
            "gold": args.gold,
            "position": {"mapId": args.map, "x": args.x, "y": args.y, "floor": args.floor},
            "storyFlags": {}, "activeQuests": [], "completedQuests": [], "questProgress": {},
            "timerEnabled": True, "quizDifficulty": args.difficulty, "locale": args.locale,
            "soundEnabled": True, "masterVolume": 0.7, "kanjiMode": False,
        },
        "playtime": 0,
        "quizStats": {"totalAsked": 0, "totalCorrect": 0, "byCategory": {}},
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--map", default="overworld", help="map id (see --list-maps)")
    # Sentinel defaults: an explicit --x/--y always wins, otherwise the spawn is derived
    # per map so a dungeon never inherits overworld coordinates.
    ap.add_argument("--x", type=int, default=None)
    ap.add_argument("--y", type=int, default=None)
    ap.add_argument("--floor", type=int, default=1)
    ap.add_argument("--gold", type=int, default=500)
    ap.add_argument("--level", type=int, default=1)
    ap.add_argument("--hp", type=int, default=40)
    ap.add_argument("--name", default="Hero")
    # quizDifficulty is a GradeLevel ('k' | '1'..'6', src/utils/types.ts), NOT a free string:
    # the Settings row looks up `grade.<value>` and the bundle's Z() renders a missing key as
    # the literal `[grade.<value>]`. This used to be hardcoded to "Hero" -- a copy-paste of
    # --name's default -- which is why a seeded save showed "[grade.Hero]". `choices` is the
    # guard that keeps an unrenderable value from being seeded again.
    ap.add_argument("--difficulty", default="3",
                    choices=["k", "1", "2", "3", "4", "5", "6"],
                    help="GradeLevel written to player.quizDifficulty")
    ap.add_argument("--locale", default="en", choices=["en", "ja"])
    ap.add_argument("--timestamp", type=int, default=1785654759442,
                    help="fixed by default so repeated seeds are byte-identical")
    ap.add_argument("--udid", help="defaults to the only booted simulator")
    ap.add_argument("--list-maps", action="store_true")
    args = ap.parse_args()

    ids = shipped_map_ids()
    if args.list_maps:
        print(f"{len(ids)} map ids in the shipped bundle:")
        for i in ids:
            print(" ", i)
        return 0
    if ids and args.map not in ids:
        sys.exit(f"unknown map id {args.map!r}; run --list-maps ({len(ids)} available)")

    if args.x is None or args.y is None:
        spawn = dungeon_spawn(args.map, args.floor)
        if spawn:
            args.x, args.y = spawn
            print(f"  (derived spawn for {args.map} f{args.floor}: {args.x}, {args.y})")
        else:
            # Overworld default: one step south of the Port Sapphire entrance
            # (connections[0] is fromX=130, fromY=290 in the shipped bundle).
            args.x = 130 if args.x is None else args.x
            args.y = 292 if args.y is None else args.y

    udid = args.udid or booted_udid()
    subprocess.run(["xcrun", "simctl", "terminate", udid, APPID], capture_output=True)

    db = localstorage_db(udid)
    payload = json.dumps(build_save(args), separators=(",", ":")).encode("utf-16-le")
    con = sqlite3.connect(db)
    con.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
                (SAVE_KEY, sqlite3.Binary(payload)))
    con.commit()
    # WebKit reads through the WAL; without a checkpoint the app can still see the old value.
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    con.close()

    # Read back through a fresh connection: proves the bytes survived the round trip in the
    # encoding the page will actually use.
    con = sqlite3.connect(db)
    raw = con.execute("SELECT value FROM ItemTable WHERE key=?", (SAVE_KEY,)).fetchone()[0]
    con.close()
    back = json.loads(bytes(raw).decode("utf-16-le"))
    pos = back["player"]["position"]
    print(f"SEEDED {udid}")
    print(f"  map={pos['mapId']} x={pos['x']} y={pos['y']} floor={pos['floor']} "
          f"gold={back['player']['gold']} level={back['player']['level']}")
    print("  launch with: xcrun simctl launch %s %s" % (udid, APPID))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
