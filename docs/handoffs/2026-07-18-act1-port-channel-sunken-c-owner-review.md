---
date: 2026-07-18
type: handoff
project: edu-rpg
milestone: act1-port-channel-sunken-c-owner-review
status: active
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "23"
relay_task_title: Edu-RPG Relay 23 — Port Channel + Sunken C Owner Revisions
relay_status: owner-review
relay_predecessor_sequence: "22"
relay_successor_thread_id: null
subagents_drained: true
background_sessions_drained: true
---

# Port channel and Sunken C owner review

## Outcome

Relay 23 implements the owner's exact follow-up decisions in a new design-only directory:

`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-owner-revisions-r23/`

- Port: a bounded sibling art candidate replaces the fuzzy southern crossing with a crisp raised
  bridge and an uninterrupted visual water channel for the largest visible ship. Water remains
  player-blocked; Port's mask, semantic roles, collision, and three disconnected entrances are
  unchanged from Relay 22.
- Sunken: entrance C `(370,2495)` is the sole actor-safe approach. It connects to the visible path,
  closes the obsolete structure opening, preserves both named blockers, and changes no Sunken art.

Nothing was promoted. No runtime, public/dist, route source, trigger, save, adapter, manifest,
compositor, preserved artifact, Relay 20/21/22 evidence, branch, commit, push, build, deploy, release,
TestFlight, or App Store Connect action occurred.

## Verification

- Exact owner substitutions: four; exact Relay 21 entries preserved: 49.
- Radius `4`, maximum substep `2`; seven routes / 80 review waypoints complete.
- Port west/north/southeast gates actor-safe and pairwise unreachable; all three interior probes blocked.
- Port water-role pixels remain blocked; Port mask/roles/collision byte-identical to Relay 22.
- Port art diff: 87,194 pixels within `[264,995,626,1323)`; outside-mask bytes identical to Relay 20.
- Minimum uninterrupted measured channel: 97 pixels; required 96.
- Mask/collision mismatch: zero; role mismatch: zero.
- Deterministic whole-directory rebuild: byte-identical.
- Relay 21 movement, Relay 22 movement/preservation, current polygon/path/runtime suites, temporary
  map-engine compile and retained suites, shipped replay/snapshot/override, preserved baseline, and
  static smoke: pass. Relay 21's exact 53-conflict promotion audit remains the expected negative baseline.
- Fresh independent visual, movement/preservation, and static/code reviews: pass.

Hashes:

- Port candidate art `a1b02803c94a4c52aae73ccac90cc563054e5c842a005bb1ad47977e1be223d2`;
- adapter-ready geometry `d12d36602ca838584a80b74360fc0a43a54e7df16d5be07d1435bc9cd374a5e6`;
- proposed geometry `9fa81ae3270859392c9520cbb35c59f86b183ebda18bee03c5b031a59c4fc123`;
- unified inventory `2a8d9fd8cd4671b29209c44cd696f639dc2180755ce5c852d3181d9d8bc39484`.

## Owner-review stop

Review the full Port candidate, the bridge before/after/delta, and the Sunken C overlay. Approve or
reject this exact combined candidate. Do not apply `PROPOSED-PROMOTION.diff` and do not create a
successor promotion task before that decision.
