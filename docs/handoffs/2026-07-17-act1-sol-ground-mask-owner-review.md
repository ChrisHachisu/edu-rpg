---
date: 2026-07-17
type: handoff
project: edu-rpg
milestone: act1-sol-ground-mask-owner-review
status: owner-review
supersedes: docs/handoffs/2026-07-17-act1-visual-mask-sol-owner-review-relay.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "11"
relay_status: owner-review
owner_review_result: revision-required
owner_confirmation_pending: act1-boundary-revision-contract
relay_predecessor_thread_id: 019f6d09-27da-7d41-83d9-ba69831a9964
subagents_drained: true
background_sessions_drained: true
---

# Act 1 Sol ground mask requires town and bridge revision

## Outcome

Relay 11 classified the complete clean `2368 x 2912` Act 1 collision reference,
but the owner rejected its town and bridge boundary judgments. The owner also
identified a missing design decision: Port Sapphire must read as a landmark
with three explicit entry/exit pairs, not ordinary overworld settlement ground.
The owner then identified additional failures: Coral Reef lacks an entrance,
the first southern town and dungeon have incorrect boundaries, the dungeon does
not initially read clearly as a dungeon, and the road past Millbrook is
disconnected. The owner then confirmed the pair as Greenhollow and Sunken Ruin
and accepted Sunken Ruin's existing visual appearance. Its boundary/entrance
still requires revision; its landmark artwork does not.

The current mask and overlay remain preserved as revision evidence. They are
not an approved geometry baseline. Accepted art, collision, and runtime data
have not been changed in response to this feedback.

The review record, original U1–U8 ledger, and revision status are in:

`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/ground-mask-sol-r11/SOL-GROUND-MASK-R11-OWNER-REVIEW.md`

The proposed Port Sapphire W/N/SE gate contract is in:

`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/ground-mask-sol-r11/PORT-SAPPHIRE-3-GATE-DECISION.md`

The complete B1–B6 boundary revision ledger is in:

`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/ground-mask-sol-r11/ACT1-BOUNDARY-REVISION-LEDGER.md`

Stop here for exact owner confirmation. This is not authorization to edit the
accepted painting, revise the mask, derive polygons, or reintegrate collision.

## Verification

- clean reference: `8cdc9b24a3418f4dcd9417df21987e5e84403bc08e965f1f905a70ea8a731b85`;
- final three-class mask: `b92aba8f5ceba8700a522752123d05460cf7790d32811b1e28b6d0aee8dfba67`;
- final native overlay: `b6ba5c4b1651ca680dee872e3011b57ea556daae460e3f8e85acd04fcbde594f`;
- mask dimensions/classes: PASS, exactly `2368 x 2912`, values `0/127/255` only;
- overlapping coverage: PASS, 12 native `1024 x 1024` tiles, no source gap;
- deterministic rerender: PASS for mask, overlay, overview, mask inventory, and tile inventory;
- accepted-art preservation: PASS, all 18 inventory inputs byte-identical;
- manifest revision/hash: PASS, revision 8 / `2e79b677…06a3d`;
- Python syntax and `git diff --check`: PASS;
- prohibited Vite/build/release/git/branch/worktree actions: none performed.

## Current state

- Existing branch and dirty tree are preserved at HEAD `c4f97d5e30762b8a16deff36602252759decce31`.
- Accepted art bytes, route semantics, saves, adapter, collision integration,
  retained landmarks, and later acts are unchanged.
- The rejected route-first geometry remains only as inherited failure evidence;
  it was not inspected during classification.
- New work is isolated to the Relay 11 builder, ground-mask review directory,
  this handoff, and the required append-only Codex inbox capture.
- The review-only `port-sapphire-3-gate-proposal.png` annotation does not replace
  or modify any accepted art input.

## Owner revision direction

- Trees/forest, water, cliff/mountain faces, structures/landmark bodies, Port
  ships/piers, and bridge drop-offs are non-walkable.
- Settlement-colored ground inside a town body is not automatically walkable.
- Port Sapphire should have three reciprocal gates: W Mainland, N Crystal, and
  SE Coastal Bridge, pending exact owner confirmation.
- The Port overworld art should remove its internal through-road and retain only
  three short tapered approach stubs; matching W/N/SE exits belong inside town.
- Bridges need a new deck-only and landing-throat review after the art boundary
  contract is settled.
- Coral Reef needs an explicit landward entrance drawn into the accepted art;
  there is currently no visual throat, doorway, dock, or equivalent cue. The
  owner approved a northwest/landward entrance candidate as an isolated B2
  slice; promotion still requires visual review.
- The first southern town and dungeon are confirmed as Greenhollow and Sunken
  Ruin. Their landmark boundaries are not approved, but Sunken Ruin's existing
  visual appearance is owner-approved and must be retained.
- Millbrook must preserve a continuous visible pass-through road/deck/landing;
  the current mask connection is rejected.
- No actor-foot clearance, polygon derivation, route comparison, or runtime
  reintegration occurs until explicit owner approval.

## Remaining work

Single next action: Relay 12 creates the owner-authorized, non-destructive Coral
Reef northwest/landward entrance candidate and stops for visual review. B1 and
B3–B6 remain unresolved and outside that slice.

After confirmation, use `$relay-fresh-sessions` only at the next verified
boundary to create exactly one same-checkout task whose scope is explicitly
authorized. The likely order is a deliberate accepted-art revision first, then
a fresh route-hidden ground-mask review; neither is authorized by this handoff.

## Risks and blockers

The blocker is intentional product judgment across B1–B6, not just Port
Sapphire. The accepted painting must then be revised where it does not show a
legible landmark throat or continuous connection before the mask can be judged
reliably. Mechanical checks on the preserved Relay 11 snapshot still pass.

## Agent drain ledger

- Collaboration tree: root only; no child or grandchild agents existed.
- Owned execution sessions `72052`, `92379`, `8701`, and `48584`: completed.
- No owned server, watcher, recorder, compiler, browser session, or detached
  Codex/Claude process remains.

## Resume here

Read this handoff, `AGENTS.md`, the `edu-rpg`, `handoff`,
`relay-fresh-sessions`, and `session-relay` skills,
`design/OVERWORLD-MOVEMENT-BOUNDARIES.md`, the owner-review record above, and
`ground-mask-inventory.json`. Verify the mask/reference hashes, current dirty
tree, owner decision, and drain state. Do not inspect the rejected overlay or
old polygons.

## Kickoff prompt

`[relay:edu-rpg-act1-overhaul:11-owner-review]` — **Act 1 Relay 11 — Sol Ground
Mask Owner Decision**

Work only in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
Resume from
`docs/handoffs/2026-07-17-act1-sol-ground-mask-owner-review.md` and review
`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/ground-mask-sol-r11/SOL-GROUND-MASK-R11-OWNER-REVIEW.md`.

Verify the owner decision, handoff metadata, dirty tree, clean-reference/mask
hashes, accepted-art identity, and absence of live inherited agents or owned
background sessions. The current mask is explicitly not approved around towns,
dungeons, Coral Reef, Millbrook, or bridges. If the owner has not resolved B1–B6
in `ACT1-BOUNDARY-REVISION-LEDGER.md`, stop without modifying accepted art or
the mask. If the owner has decided, record the decisions, run the drain gate,
and use `$relay-fresh-sessions` at the next verified boundary to create exactly
one same-checkout task with only the newly authorized scope. Do not derive
polygons, apply actor clearance, alter routes/saves/adapter/collision, run Vite,
rebuild legacy source, commit, push, deploy, publish, release, alter TestFlight/
App Store Connect, or create a branch/worktree unless that later task is
explicitly authorized.
