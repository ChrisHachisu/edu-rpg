---
date: 2026-07-20
type: handoff
project: edu-rpg-map-engine-semantic-data
milestone: act1-region-gateway-checkpoint2-owner-review
status: active
supersedes: docs/handoffs/2026-07-20-act1-relay26-deterministic-atlas-owner-review.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: 27
relay_status: owner-review
relay_predecessor_thread_id: 019f7cec-4971-7872-8847-729793b4fea5
subagents_drained: true
background_sessions_drained: true
---

# Relay 27 handoff: region-and-gateway checkpoint-2 owner review

## Outcome

**PASS for owner review.** Checkpoint 2 has been replaced in a new sibling pack
with five large exploration regions, five 64-world-pixel gateways, named
physical barrier classes, and route guidance that contributes zero pixels to
the walkable mask. Checkpoint 1 and all rejected/previous checkpoint-2 and
checkpoint-3 evidence remain untouched.

The reusable cross-act rule is now authoritative in
`design/OVERWORLD-MOVEMENT-BOUNDARIES.md` and aligned in
`design/ART-DIRECTION.md`: physical barriers own region boundaries, gateways
own the small number of progression apertures, and roads guide only inside
regions.

## Owner-review pack

`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-region-gateway-r27/checkpoint-2-region-gateway/`

Review in this order:

1. `owner-regions-no-routes-native.png` — native route-hidden proof that the
   authority is broad regions rather than a ribbon network.
2. `owner-overview-native.png` — native barriers, gateways, landmarks, and
   semantic guidance overlay.
3. `owner-gateways-locked-phone.png` — all five exact `208 x 371` world
   footprints shown at 320 review pixels wide.
4. `OWNER-REVIEW.md` and `INDEPENDENT-REVIEW.md` — mechanical summary and fresh
   read-only verdict.

## Verification

- Branch/HEAD preserved: `codex/map-engine-semantic-data` /
  `c4f97d5e30762b8a16deff36602252759decce31`.
- Checkpoint-1 SHA-256 unchanged: frame
  `102e11d5d822985e3310487b46d5091224877416951df3314a65a932b48d72bf`;
  land mask
  `7e6ba5845d1db7c9044abfc2d30da4b54bb48a200148c29308f8a94f0def7ffb`.
- Rejected checkpoint-2 SHA-256 unchanged: authority
  `0f39f78ac4c7a2160e8154f0c0c4da1dc692787d1065ac79bab3b5a18f47f91d`;
  mask `99af0c8d632a067132ba304104067d324f7f9a32c9fd45e7f90c11eb27e32940`.
- New authority SHA-256:
  `16ecaf586eec96ad28022f1b0beb4a100e012c3a5366fdd8123cdc0bafc15eae`;
  open-mask SHA-256:
  `4fa933dda9c2e092f4243728fb484cad2cda3daf33cd7051fdb773150c509a80`.
- `python3 build_region_gateway.py --verify-determinism`: **PASS**; two clean
  temporary builds were byte-identical before the checked pack was rebuilt.
- Generated 13-file manifest rehash: **PASS**.
- Native dimensions, `py_compile`, scoped `git diff --check`, and static code
  quality review: **PASS**.
- Open union / radius-4 union: `1 / 1` components. Closed Crystal: `2`
  components; Crystal unreachable; every non-Crystal landmark reachable.
- Five sole-aperture gateway cuts: **PASS**. Six forbidden-shortcut probes:
  **PASS**. Eight approaches and all seven route samples at maximum step `2`:
  **PASS**.
- Gateway-only share: `2.69%`; radius-48 core share: `68.99%`; per-region
  off-road share: `71.75–84.73%`; each region contains an exact radius-4-safe
  `208 x 371` camera footprint.
- Port / Reef coast evidence: `359 / 238` contact pixels and `41 / 33`-pixel
  contiguous contact runs.
- Fresh independent read-only geometry/visual audit: **PASS**, with owner-taste
  caveat only.

## Locked decisions

- Five primary regions: Northwood Basin, Central Highlands, Southern Coast,
  Darkfang Basin, and Eastern March; Crystal Mouth is a gated landmark pocket.
- Five gateways: Northwood Pass, South Cliff Pass, Darkfang Gap, East Ridge
  Pass, and the dynamic Crystal Seal Gateway.
- Eight landmark identities and the reopened checkpoint-2 seven-edge graph are
  preserved. Whispering Woods remains Millbrook-rooted; older TypeScript that
  still says Greenhollow-rooted is deferred runtime debt and was not changed.
- Whispering retains `owlsLesson`; Coastal Reef retains `drakeCargo`; Crystal
  retains own-property-exact-true `boss.giantToad.defeated` semantics.
- Crystal / Act 2 remains fixed at `(2166, 1132)`. Actor-foot radius remains `4`;
  maximum substep remains `2`.

## Scope boundary

No checkpoint-3 artwork, image generation, runtime, collision integration,
route implementation, saves, promotion, npm/Vite build, TestFlight, commit,
push, deploy, release, branch, or worktree action occurred. The schematic
barrier plan is not a claim about final painted terrain fidelity.

## Agent drain ledger

- `relay27_contract_audit`: completed read-only; contract/graph audit; no files
  changed and no child agents.
- `relay27_pattern_audit`: completed read-only; evidence-pattern audit; no files
  changed and no child agents.
- `relay27_final_audit`: completed read-only; independent **PASS**; no files
  changed and no child agents. Its optional extra builder invocation was
  timeboxed and interrupted; it is not cited as a completed determinism run.
- Root determinism session `28596`: completed normally with exit `0`. All earlier
  owned builder sessions completed; no owned server, watcher, recorder,
  compiler, or shell session remains live.
- Final tree recheck: no working, waiting, or idle child/grandchild agent.

## Resume here

Owner reviews the three images above and responds **approve** or with exact
topology/gateway changes. Do not begin checkpoint 3, create a successor, or
promote geometry until explicit approval. `$relay-fresh-sessions` therefore
stops Relay 27 at `owner-review` with no Relay 28 task.

## Conditional kickoff prompt after explicit approval only

`[relay:edu-rpg-act1-overhaul:28]` — **Edu-RPG Relay 28 — Act 1
Region-and-Gateway Checkpoint-3 Art**. Work only in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
on the existing shared dirty checkout. Resume from this handoff. First verify
the owner explicitly approved the Relay 27 region/gateway pack, handoff metadata,
branch/HEAD/dirty state, checkpoint-1 hashes, approved checkpoint-2 authority and
mask hashes, and drain state. Single outcome: begin only the owner-approved
checkpoint-3 art slice against the locked region/gateway authority. Read parent
and project `AGENTS.md`, `$edu-rpg`, `$coding-skill`, `$ponytail`, `$game-design`,
`$orchestrator-pattern`, `$lock-decisions`, `$relay-fresh-sessions`,
`$session-relay`, this handoff, `design/ART-DIRECTION.md`, and
`design/OVERWORLD-MOVEMENT-BOUNDARIES.md` completely before acting. Preserve the
shared dirty checkout and all failure history. No runtime, collision, saves,
promotion, npm/Vite build, TestFlight, commit, push, deploy, release, branch, or
worktree action without separate authority. Use `$relay-fresh-sessions` at the
next verified boundary.

