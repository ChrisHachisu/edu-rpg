---
date: 2026-07-17
type: handoff
project: edu-rpg
milestone: act1-landmark-art-v2-owner-review
status: complete
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "17"
relay_task_title: Edu-RPG Relay 17 — Owner-Locked Landmark Art Promotion
relay_status: complete
owner_review_result: approved
relay_predecessor_thread_id: 019f6ff3-38eb-7b23-baf2-2fc03c2dd16c
relay_current_thread_id: 019f706e-2da2-7470-aa06-9c889ec938d1
subagents_drained: true
background_sessions_drained: true
---

# Act 1 landmark art v2 owner review

Relay 17 promoted the exact owner locks for Port Sapphire, Greenhollow, Sunken
Ruin, Millbrook v4, and Coral Reef into versioned design-only runtime-v2 art
inputs. The five targets are byte-identical to their locked masters and all are
`1254x1254` RGB. The exact Millbrook lock is `b6338f3e…f98190`; v5/v6 were not
used and Millbrook was not redesigned.

## Owner review artifact

Primary one-glance sheet:
`../../design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/landmark-art-promotion-r17/evidence/landmark-art-v2-owner-review-contact-sheet.png`.

Native/map-scale contexts and five-up strips are beside it in `evidence/`.
Detailed provenance and checks:

- `../../design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/landmark-art-promotion-r17/PROVENANCE.md`
- `../../design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/landmark-art-promotion-r17/VERIFICATION.md`
- `../../design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/landmark-art-promotion-r17/landmark-art-v2-inventory.json`

## Locked result

- Port Sapphire: W/N/SE gates, no internal through-road.
- Greenhollow: one south entrance and open surrounding ground.
- Sunken Ruin: accepted identity, blocked west arch, one northeast entrance.
- Millbrook: exact full-frame owner lock, uninterrupted west-east pass-through,
  and a derived outer-west companion that removes the inherited south mismatch
  without touching the lock.
- Coral Reef: already-promoted exact lock retained with coherent Channel/outer
  continuity.

Fresh visual verification passed every native/map-scale context. Twelve
relevant overlaps and macro/style correlations are recorded in the inventory.
The Millbrook south-neighbor mean/p95 delta improved from `24.9209 / 81` to
`4.5752 / 17`.

## Preserved boundaries

HEAD remains `c4f97d5e30762b8a16deff36602252759decce31`; the shared dirty checkout
was preserved. No mask, polygon, collision, trigger, route, save, adapter,
manifest behavior, Vite/build, branch/worktree, commit, push, deploy, release,
TestFlight, or App Store Connect action occurred.

## Owner decision requested

Review the contact sheet and, where needed, the individual native contexts.
Approve or reject the five promoted art inputs and the Millbrook outer-west
neighbor integration as one bounded art-only slice. No successor relay is
created while this owner decision is pending.

## Owner approval — 2026-07-18

The owner responded, “looking good. keep going and build the game.” The five
promoted art inputs and Millbrook outer-west integration are approved exactly
as reviewed. Artwork is closed; Relay 18 may perform the bounded additive
runtime-art cutover without redesigning or regenerating it.

## Drain ledger

- Promotion architecture audit: completed, read-only.
- Locked-overlap audit: completed, read-only.
- Fresh route-hidden visual verification: completed, pass, read-only.
- Code/inventory review and Coral independence recheck: completed, pass,
  read-only.
- Owned builder/verification sessions: completed; none left running.
- Final collaboration-tree and process checks found no inherited or owned live
  agents, builder, verifier, browser, server, or other background session.
