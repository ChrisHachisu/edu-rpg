"""Shared paths for the Acts 2-5 dungeon pipeline. Everything big goes to the scratch dir."""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SCRIPTS = os.path.join(ROOT, "scripts")
SCRATCH = os.environ.get(
    "ACTS_DUNGEON_SCRATCH",
    "/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad/acts/dungeons")
DESIGN = os.path.join(SCRATCH, "design")          # mirrors design/act1-dungeon-interiors
MATROOT = os.path.join(DESIGN, "materials")
RUNTIME = os.path.join(SCRATCH, "runtime")        # mirrors public/act1-dungeon-art (+ floors json)
PREVIEW = os.environ.get("ACTS_DUNGEON_PREVIEW", "/mnt/project-files/edu-rpg/acts-preview/dungeons/")
ACT1_MATS = os.path.join(ROOT, "design/act1-dungeon-interiors/materials")

for p in (HERE, SCRIPTS):
    if p not in sys.path:
        sys.path.insert(0, p)
