#!/usr/bin/env python3
"""Run ONE codex image generation for a solid-battle-icon candidate, and prove what came back.

WHY A DRIVER AND NOT A BARE `codex exec`
    Two failures are already on record in this repo and both are silent:

    1. Codex has been caught generating an image and then OVERWRITING it with ImageMagick draw
       calls, so the file on disk is not the file the model produced. The defence is to take the
       artefact out of ~/.codex/generated_images/<session>/ -- which the tool writes and the
       shell does not -- and to record its md5, so `cmp` can prove later that the committed
       source is that artefact and nothing else.

    2. ~/.codex/generated_images is SHARED across sessions. Adopting "the newest png" without
       knowing which run made it is how a harbour village was nearly shipped as cave rock
       (design/DUNGEON-ASSET-PROMPTS.md). So this snapshots the directory BEFORE the call and
       accepts only a session directory that did not exist beforehand.

    Everything downstream of the raw png is a scripted transformation
    (scripts/build_battle_icons.py), so the whole chain stays reproducible from one archived file.

USAGE
    python3 design/ui-overhaul/battle-icons/solid/gen.py --candidate a-cast-iron
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[4]
SOLID = ROOT / "design" / "ui-overhaul" / "battle-icons" / "solid"
ANCHOR = ROOT / "design" / "ui-overhaul" / "battle-icons" / "source-generated.png"
GENDIR = pathlib.Path.home() / ".codex" / "generated_images"
# The ChatGPT.app bundled binary. The npm-global `codex` on PATH is XProtect-quarantined and
# dies with ENOENT (memory: reference_codex_consult.md).
CODEX = "/Applications/ChatGPT.app/Contents/Resources/codex"
MODEL = "gpt-5.6-terra"     # same model as the tab-icon and battle-icon families


def md5(p: pathlib.Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def adopt(candidate: str, spec: str) -> int:
    """Re-adopt a NAMED image from a session this candidate already ran.

    One codex run can emit several images, and the first version of this driver took the last one
    BY NAME. Names are uuids, so that ordering is arbitrary: it silently adopted the OLDEST frame
    for two of the three candidates. Sorting by mtime would fix the ordering but not the question,
    because the run's last frame is not automatically the right one -- candidate C's last frame
    overshot the requested stroke weight and added a second rim line to the shield, drifting from
    the construction the brief asked for, while an earlier frame hit the target cleanly.

    So selection is a JUDGEMENT recorded in PROVENANCE.md, and this makes the judgement executable:
    name the session and the image, and the adoption is md5-proved against the file codex actually
    wrote. Re-generating to fix the bookkeeping is not an option -- a fresh call returns fresh
    pixels -- and hand-copying would assert provenance rather than establish it.
    """
    session, _, image = spec.partition("/")
    sdir = GENDIR / session
    src = sdir / image
    if not src.is_file():
        sys.exit(f"no such generated image: {src}")

    rec_path = SOLID / f"record-{candidate}.json"
    if not rec_path.is_file():
        sys.exit(f"{candidate}: no prior record; --adopt only re-picks within a run this "
                 f"candidate already made")
    rec = json.loads(rec_path.read_text())
    if rec["codexSession"] != session:
        sys.exit(f"{candidate}: REFUSING -- recorded session is {rec['codexSession']}, not "
                 f"{session}. That image belongs to some other run.")

    dest = SOLID / f"source-{candidate}.png"
    shutil.copy2(src, dest)
    digest = md5(dest)
    if digest != md5(src):
        sys.exit("copy is not byte-identical to the generated file")
    subprocess.run(["cmp", str(src), str(dest)], check=True)

    rec["supersededImage"], rec["supersededMd5"] = rec["codexImage"], rec["md5"]
    rec["codexImage"], rec["md5"] = src.name, digest
    rec["generatedFile"] = str(src)
    rec["adoptedBy"] = "--adopt (see PROVENANCE.md for why this frame)"
    rec_path.write_text(json.dumps(rec, indent=1) + "\n")
    print(f"ADOPTED {dest.relative_to(ROOT)}\n  session {session}  image {src.name}"
          f"\n  md5 {digest}  (cmp clean)  supersedes {rec['supersededImage']}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidate", required=True,
                    help="basename of prompt-<candidate>.txt in the solid/ folder")
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--adopt", metavar="SESSION/IMAGE.png",
                    help="do not generate; re-adopt a NAMED image from a session this candidate "
                         "already ran, and rewrite its record. See adopt() for why this exists.")
    args = ap.parse_args()

    if args.adopt:
        return adopt(args.candidate, args.adopt)

    prompt_file = SOLID / f"prompt-{args.candidate}.txt"
    if not prompt_file.is_file():
        sys.exit(f"missing prompt: {prompt_file}")
    if not ANCHOR.is_file():
        sys.exit(f"missing reference image: {ANCHOR}")

    before = {d.name for d in GENDIR.iterdir()} if GENDIR.is_dir() else set()
    prompt = prompt_file.read_text()

    print(f"generating {args.candidate} on {MODEL} ...", flush=True)
    t0 = time.time()
    r = subprocess.run(
        [CODEX, "exec", "-m", MODEL, "--skip-git-repo-check", prompt, "-i", str(ANCHOR)],
        cwd=ROOT, capture_output=True, text=True, timeout=args.timeout)
    print(f"  codex rc={r.returncode} in {time.time() - t0:.0f}s")

    after = {d.name for d in GENDIR.iterdir()} if GENDIR.is_dir() else set()
    fresh = sorted(after - before)
    if not fresh:
        print("---- stdout ----\n" + (r.stdout or "")[-3000:])
        print("---- stderr ----\n" + (r.stderr or "")[-1500:])
        sys.exit("NO NEW SESSION DIRECTORY -- nothing was generated. Refusing to adopt an "
                 "existing image; it would belong to some other run.")
    if len(fresh) > 1:
        sys.exit(f"ambiguous: {len(fresh)} new session dirs ({fresh}). Run candidates SERIALLY.")

    session = fresh[0]
    sdir = GENDIR / session
    imgs = sorted(p for p in sdir.iterdir() if p.suffix.lower() == ".png")
    if not imgs:
        sys.exit(f"session {session} produced no png")
    # A run can emit several attempts. Order them by MTIME, never by name: the names are uuids,
    # so `sorted()` picks an arbitrary frame, and it picked the oldest one for two of the three
    # candidates on the first pass here. The newest is the run's final answer and the right
    # DEFAULT -- but it is only a default. Whether it is the frame to keep is a judgement about
    # the drawing, so review the whole session and use --adopt when an earlier frame is better.
    imgs.sort(key=lambda p: p.stat().st_mtime)
    src = imgs[-1]
    if len(imgs) > 1:
        print(f"  session emitted {len(imgs)} images; taking the newest ({src.name}). "
              f"Review the others before accepting: {[p.name for p in imgs[:-1]]}")
    dest = SOLID / f"source-{args.candidate}.png"
    shutil.copy2(src, dest)

    digest = md5(dest)
    if digest != md5(src):
        sys.exit("copy is not byte-identical to the generated file")
    subprocess.run(["cmp", str(src), str(dest)], check=True)

    rec = {"candidate": args.candidate, "model": MODEL, "codexSession": session,
           "codexImage": src.name, "generatedFile": str(src), "md5": digest,
           "images_in_session": [p.name for p in imgs],
           "reference": str(ANCHOR.relative_to(ROOT)), "rc": r.returncode}
    (SOLID / f"record-{args.candidate}.json").write_text(json.dumps(rec, indent=1) + "\n")

    print(f"WROTE {dest.relative_to(ROOT)}  {dest.stat().st_size:,} B")
    print(f"  session {session}  image {src.name}  md5 {digest}  (cmp clean)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
