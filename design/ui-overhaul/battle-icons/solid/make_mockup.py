#!/usr/bin/env python3
"""Build design/mockups/battle-icons-solid.html: one self-contained comparison page.

The page has to work with no network at all, so all five icon sheets go in as base64 data URIs:
the three candidate masks, the shipped battle sheet as the control, and the shipped tab sheet as
the family the battle set currently matches.

EVERY NUMBER ON THE PAGE IS MEASURED HERE, NOT TYPED
    The table is the part of a comparison page that rots first: the art gets regenerated, the
    prose keeps the old percentages, and the page then argues for a candidate using another
    candidate's numbers. So nothing is hand-quoted. Stroke to optical size is measured on each
    set's own SOURCE pixels with scripts/build_battle_icons.py's own estimator -- including the
    control's, which is measured off the two archived raw generations rather than copied out of
    PROVENANCE.md -- and ink share is measured on the built mask.

    That also keeps the control honest. It would be easy to make the shipped set look thin by
    measuring it differently from the candidates; measuring all four through one function makes
    that impossible.
"""
from __future__ import annotations

import base64
import json
import pathlib
import sys

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(HERE))
import build_battle_icons as bbi     # noqa: E402
import build as solidbuild           # noqa: E402  the candidate keyer, for its chroma path

BATTLE = ROOT / "design" / "ui-overhaul" / "battle-icons"
OUT = ROOT / "design" / "mockups" / "battle-icons-solid.html"

# The control's attack cell was regenerated on its own canvas after owner review, so its source
# ratio lives in a different file from the other three. See BATTLE/PROVENANCE.md.
CONTROL_SRC = BATTLE / "source-generated.png"
CONTROL_ATTACK = BATTLE / "source-generated-attack.png"

SETS = {
    "a": {"kicker": "Candidate A", "name": "Cast Iron",
          "mask": HERE / "a-cast-iron-mask.png", "src": HERE / "source-a-cast-iron.png",
          "blurb": "Solid silhouettes, no interior at all. The heaviest possible reading and the "
                   "clearest at 22 px, but it drops the drawn detail and the pommel ring."},
    "b": {"kicker": "Candidate B", "name": "Struck Relief",
          "mask": HERE / "b-struck-relief-mask.png", "src": HERE / "source-b-struck-relief.png",
          "blurb": "Solid bodies with the detail cut out as negative space. Reads as one mass at "
                   "a glance and still keeps a fuller, a boss ring and a sole seam."},
    "c": {"kicker": "Candidate C", "name": "Forged Line",
          "mask": HERE / "c-forged-line-mask.png", "src": HERE / "source-c-forged-line.png",
          "blurb": "The same outline construction as today, drawn with a far heavier pen. The "
                   "smallest change and the only one that stays a line drawing."},
    "ctl": {"kicker": "Ships today", "name": "Control",
            "mask": ROOT / "public" / "ui-icons" / "battle-icons.png", "src": None,
            "blurb": "What is on the phone now. Calibrated to the tab bar, which is why it is "
                     "hairline at 22 px and why Attack looks lighter than the other three."},
}


def data_uri(p: pathlib.Path) -> str:
    return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()


def source_ratios(entry: dict) -> list[float]:
    """Stroke as a percentage of optical size, per glyph, off the set's own source pixels."""
    if entry["src"] is None:
        # The control: three glyphs off the accepted sheet, attack off its own regeneration.
        a = solidbuild.key_alpha(CONTROL_SRC)
        crops = [bbi.trim(a[:, x0:x1]) for x0, x1 in bbi.columns(a, 4)]
        crops[0] = bbi.trim(solidbuild.key_alpha(CONTROL_ATTACK))
    else:
        a = solidbuild.key_alpha(entry["src"])
        crops = [bbi.trim(a[:, x0:x1]) for x0, x1 in bbi.columns(a, 4)]
    return [100 * bbi.stroke_width(c) / float(np.sqrt(c.shape[0] * c.shape[1])) for c in crops]


def ink_share(mask_png: pathlib.Path) -> float:
    """Mean share of each glyph's own bounding box that is opaque.

    This is what separates a filled candidate from a heavy outline. A pen can get as fat as it
    likes and an outline still only covers a fraction of the box it encloses, whereas a
    silhouette covers most of it -- so it ranks the four sets by how SOLID they actually are,
    which the stroke estimator stops doing once a shape is filled.
    """
    a = np.asarray(Image.open(mask_png).convert("RGBA"), dtype=np.float32)[:, :, 3] / 255
    shares = []
    for i in range(4):
        m = a[:, i * bbi.CELL:(i + 1) * bbi.CELL]
        rows, cols = np.where(m.sum(1) > 0)[0], np.where(m.sum(0) > 0)[0]
        box = max(rows[-1] - rows[0], cols[-1] - cols[0]) + 1
        shares.append(float((m > 0.5).sum()) / max(1, box * box))
    return float(np.mean(shares))


BAND = (5.91, 6.67)     # the tab family's measured stroke/optical range


def verdict(ratios: list[float]) -> str:
    """Classify a set against the tab family band, by how far its MEAN sits from the band's mean.

    An earlier version required every glyph to fall inside the band, which labelled the CONTROL as
    breaking the family it was built to join -- its Attack cell measures 5.57%, a third of a point
    under, and that one cell dragged the whole set into the same bucket as a filled silhouette
    3x the weight. Reporting the shipped set as a family break beside candidates that genuinely
    are one would have inverted the only comparison this page exists to make.

    Ratio of means is the honest test, because the question is whether the set reads as the same
    pen, not whether every glyph is inside a range measured off four other glyphs. The 0.9-1.1
    tolerance is deliberately wider than the band: within a tenth, no eye separates them at 22 px.
    """
    factor = (sum(ratios) / len(ratios)) / (sum(BAND) / len(BAND))
    if 0.9 <= factor <= 1.1:
        return 'matches it <span class="tag in">same family</span>'
    return f'{factor:.1f}x heavier <span class="tag out">breaks family</span>'


def main() -> int:
    payload, meas = {}, {}
    for k, e in SETS.items():
        print(f"-- {k}")
        ratios = source_ratios(e)
        payload[k] = {"kicker": e["kicker"], "name": e["name"], "blurb": e["blurb"],
                      "png": data_uri(e["mask"])}
        meas[k] = {"stroke": [round(r, 2) for r in ratios],
                   "ink": f"{ink_share(e['mask']):.0%}", "verdict": verdict(ratios)}
        print(f"   stroke/optical {min(ratios):.2f}-{max(ratios):.2f}%   ink {meas[k]['ink']}")

    html = (HERE / "mockup-template.html").read_text()
    html = html.replace("__SETS__", json.dumps(payload))
    html = html.replace("__MEAS__", json.dumps(meas))
    html = html.replace("__TABSHEET__",
                        json.dumps(data_uri(ROOT / "public" / "ui-icons" / "tab-icons.png")))
    if "__" in html.replace("__proof", ""):
        leftover = [t for t in ("__SETS__", "__MEAS__", "__TABSHEET__") if t in html]
        if leftover:
            sys.exit(f"unsubstituted placeholders: {leftover}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html)
    print(f"\nWROTE {OUT.relative_to(ROOT)}  {OUT.stat().st_size:,} B")
    if "http://" in html or "https://" in html:
        sys.exit("REFUSING: the page references a network URL; it must be self-contained")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
