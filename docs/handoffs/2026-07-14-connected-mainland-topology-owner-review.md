---
date: 2026-07-14
type: handoff
status: rejected-history
project: edu-rpg
milestone: connected-mainland-topology
branch: codex/map-engine-semantic-data
supersedes: docs/handoffs/2026-07-14-pure-retained-adapter-contract-locked.md
superseded-by: docs/handoffs/2026-07-14-preservation-first-mainland-locked.md
---

# REJECTED — connected-mainland topology owner review

> **Rejected 2026-07-14.** Do not implement this macro redesign or its shape,
> spacing, crop, and coordinate-migration proposals. The preservation-first
> handoff keeps the current 320×400 geography and changes only three
> Act-separating water-gap corridors.

## Rejected outcome (history)

The overworld direction has been reopened before production lock. Owner direction
now requires one generally land-connected mainland whose five Acts are organic
progression regions, not separate square landmasses or visible rectangular maps.
Exactly four portal lands remain geographically separate and portal-only.

The approved Act 1 Braided Pilgrim Trail progression graph is retained, but its
30×24 fixture coordinates, rectangular geometry, and production spacing are
superseded. The northwest fixture corner contains no authored semantics and is a
candidate inward coastline/forest notch. That cut is topology-safe only; legacy
save migration remains blocked without revision-scoped area/anchor provenance.

## Rejected review artifact (history)

- `design/review/connected-mainland-topology/connected-mainland-direction.png`
  — rendered 1600×1000 macro-layout board.
- `design/review/connected-mainland-topology/connected-mainland-direction.svg`
  — editable vector source.
- `design/review/connected-mainland-topology/README.md` — owner direction,
  evidence, proposed pacing, semantic implications, and validation gates.

The board shows an irregular continuous continent, an Act 1 northwest notch,
the retained Act 1 route graph, a candidate Crystal Range passage, organic Act
regions, and four detached portal lands. It locks no final coordinates, region
sizes, later-Act landmarks, or portal-anchor positions.

## Rejected direction (history)

- One retained `overworld` map ID and one global mainland coordinate system.
- Acts are region membership, not map identity.
- Rectangular terrain/chunk arrays may remain an invisible storage envelope;
  visible coastline must keep a water collar so the player never sees a hard
  square edge.
- Geographic land connectivity and open player-route connectivity are separate
  gates. Mountain ranges may keep the continent continuous while a dungeon/pass
  controls progression.
- Exactly four shipped portal-land identities remain separate maps: Stormreach
  Isles, Frostfall Peaks, Sunken Temple Isle, and Twilight Realm.
- The approximately 20-hour target must come mostly from authored quests,
  lessons, encounters, towns, and dungeons, not empty walking distance.
- No source topology, schema, runtime, saves, dungeon generation, or Crystal Cave
  implementation changes are authorized by this review artifact.

## Rejected pacing proposal (history)

The recommendation is about 20 hours for typical completion, with a roughly
17-hour critical path and side content supplying the remainder. A non-overlapping
phase budget totals exactly 20 hours: Act 1 3h; Act 2 3h30m; Acts 3 and 4 3h
each; Act 5 mainland 2h30m; four portal lands 4h; final castle/ending 1h.

Act 1 production route targets are 28–60 cells for required legs and 12–30 cells
for branches, corresponding to roughly 1–6 first-visit minutes depending on the
leg. These values are proposals until owner approval and median playtest data.

## Rejected owner questions (do not answer)

1. Does “about 20 hours” mean typical completion (recommended), critical path,
   or completionist play?
2. Coastal Reef currently feeds the shipped main gate through `drakeCargo`.
   Keep it main/soft-main (recommended) or change progression so it is optional?
3. Keep all four portal lands mandatory before the final battle (matches shipped
   behavior and recommended), or move them to post-game?
4. Should completed act-connecting passages stay traversable both directions,
   and when should fast travel unlock?
5. Should the level endpoints near 6/12/18/24/30 remain and be rebalanced across
   20 hours?
6. Approve or revise the macro mainland silhouette and Act 1 northwest notch.

## Rejected architecture consequences (history)

The future full-world semantic model needs a region-membership layer and a
world-topology graph above per-map semantics. Legacy coordinates cannot identify
new regions; migration needs independent retained-area/landmark provenance.
Current selective routing is map-ID based, so cutover/rollback is whole-mainland
atomic. Region-by-region rollout requires a separately approved region-aware
selector and verified cross-engine boundary anchors.

Crystal Cave remains excluded from generation/topology changes. It can be the
candidate Act 1→2 macro passage only if its unchanged retained two-mouth
entry/exit behavior is verified.

## Historical verification

- SVG XML validation: PASS.
- PNG: true 1600×1000 RGB, inspected at original resolution.
- Three independent design/architecture/canon reviews completed; all reported
  findings were corrected and focused re-reviews passed.
- `pnpm run test:map-engine`: PASS, including retained adapter and re-entry
  planner tests.
- `pnpm run verify:runtime` and `git diff --check`: PASS.
- Preserved bundle: 4,987,581 bytes; monster PNG count: 75.

## Rejected roadmap instruction (history)

Seven forward roadmap stages remain: partial/reopened Stage 4 plus Stages 5–10.
Do not begin the full overworld, production terrain art, or semantic coordinate
rewrite until owner shape and pacing decisions are recorded.

## Do not resume

This handoff is non-actionable history. Follow
`docs/handoffs/2026-07-14-preservation-first-mainland-locked.md`.
