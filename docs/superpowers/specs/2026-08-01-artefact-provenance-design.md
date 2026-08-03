---
date: 2026-08-01
type: spec
tags: [edu-rpg, tooling, provenance, art-pipeline]
status: approved
---

# Artefact provenance and freshness

Owner-approved 2026-08-01. Targets the two failure modes the owner named: **stale derived
outputs** and **dangling references**. Both reduce to one condition — *a declared dependency
stopped holding* — so one mechanism covers both.

## The incidents this exists to prevent

| Date | What happened | Verdict that would have fired |
|---|---|---|
| 2026-08-01 08:27 | `mat-wall.png` replaced by an untraced process; all 18 floor renders silently stale; a composite built on a 07-31 base was presented as current | `MODIFIED` on the material, `STALE` on the renders |
| 2026-07-31 | `temper()` added and `TARGET` tuned — every render invalidated with **no input file changed** | `STALE` via `generatorSha256` |
| 2026-07-31 | Four images mined from the shared `~/.codex/generated_images` and nearly shipped as cave rock | source record pins the codex run id |
| 2026-07-20 → 08-01 | `ART-DIRECTION.md:171` cited `DUNGEON-ASSET-PROMPTS.md`, which never existed here | `refs` reports it as dangling |

## Rejected alternatives

- **Central `ASSET-INDEX.json`** — every session writes one file, which conflicts in this repo's
  shared dirty tree, and any hand-maintained part rots exactly as the dangling citation did.
- **Content-addressed filenames** — makes staleness self-evident, but churns every path in every
  doc, which makes the dangling-reference problem worse.

## 1. The record

At `<dir>/.prov/<filename>.json` — a hidden subdirectory, not a sidecar beside each file, because
`design/act1-dungeon-interiors/` already holds ~50 PNGs. One file per artefact, so concurrent
sessions never write the same path.

```json
{
  "artefact": "sunkenCellar-f3-material.png",
  "sha256": "9f2c…",
  "generator": "scripts/render_dungeon_material_map.py",
  "generatorSha256": "b71e…",
  "command": "render_dungeon_material_map.py --floor sunkenCellar-f3 --scale 1",
  "writtenAt": "2026-08-01T11:02:00+09:00",
  "params": { "theme": "flooded stone cellar", "scale": 1 },
  "inputs": { "design/…/mat-wall.png": "4a10…" }
}
```

`generatorSha256` is load-bearing: **code is an input.** `params` is load-bearing: `--scale 2`
and `--scale 1` produce different output from identical inputs.

## 2. Verdicts

| Verdict | Condition |
|---|---|
| `FRESH` | artefact, every input, and the generator all hash as recorded |
| `STALE` | an input or the generator changed, or a declared input is missing |
| `MODIFIED` | the artefact itself changed since it was stamped |
| `MISSING` | the artefact is gone but its record remains |
| `UNKNOWN` | no record exists |

## 3. Enforcement

1. **Pipeline** — `prov.require_fresh(path)` before reading a derived artefact;
   `prov.stamp(out, inputs, params)` after writing one. Wired into
   `render_dungeon_material_map.py`, `make_dungeon_materials.py`, `make_dungeon_assets.py` only.
   Extension to overworld/town scripts comes after this is proven.
   A refusal must name what changed **and** print the command to re-derive it; `--allow-stale`
   overrides and says so loudly.
2. **Session start** — `freshness.py verify --brief` in the mandatory protocol. Cost is
   proportional to what is stamped, not repo size: `verify` walks `.prov/` directories only and
   never touches the thousands of overworld chunks.
3. **Before showing the owner anything** — `freshness.py verify <path>` on that artefact.

`freshness.py index` prints a generated status table — the single-glance view, with nothing
hand-written to rot.

## 4. Backfill policy — sources only

Everything on disk is `UNKNOWN`. Adopting it all as a baseline would be a lie that makes the
system worthless on day one.

- **Sources** (materials, hero sheets, floor JSONs) are adopted, recorded with `"adopted": true`
  — honest that provenance was reconstructed, not observed.
- **Derived artefacts** (renders, composites, cut sprites) are **not** adopted. They stay
  `UNKNOWN` until something re-derives them.

The first `verify` therefore reports all 18 floor renders as unverifiable, because they are.

## 5. Acceptance

Validated against the known-bad case before being trusted, the way the prop palette gate was:

1. Mutate a declared input → `STALE`, naming the input.
2. Mutate the artefact → `MODIFIED`.
3. **Replay 2026-08-01:** stamp a floor render, swap `mat-wall.png`, run `--composite` → it must
   refuse. If it composites, the system does not work and that gets reported, not shipped.

## 6. Out of scope

Canonical-version identity (which of N approved designs is the real one) and runtime/source
divergence. Both are real, neither was chosen by the owner, and both need human-judgment
machinery rather than hashing.

## 7. Repo invariants

`.prov/` files must be committed to be useful across sessions, but this repo stands under a
**no-commits** invariant. Files are written; committing is the owner's call. Likewise this spec.
