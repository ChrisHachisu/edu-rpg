---
date: 2026-07-18
type: handoff
project: edu-rpg
milestone: act1-port-lock-sunken-clockwise-entrance-owner-review
status: complete
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "24"
relay_task_title: Edu-RPG Relay 24 — Port Lock + Sunken Clockwise Entrance
relay_status: complete-successor-delegated
relay_predecessor_sequence: "23"
relay_successor_thread_id: 019f75c3-5d4d-78d0-9d48-a68f226a3092
subagents_drained: true
background_sessions_drained: true
---

# Port lock and Sunken clockwise-entrance owner review

## Outcome

Relay 24 preserves the approved Port bridge/sea candidate as an immutable exact-hash lock and
builds the owner-approved clockwise Sunken entrance-C geometry under:

`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-port-lock-sunken-rotation-r24/`

Port is closed and locked:

- owner-approved art SHA-256 `a1b02803c94a4c52aae73ccac90cc563054e5c842a005bb1ad47977e1be223d2`;
- canonical changed-pixel mask SHA-256
  `799511ec1feb3e89f500ec4dfb11e2e47e6574a2b96ab5754b3f26899fb23162`;
- 87,194 changed pixels inside `[264,995,626,1323)`, exact Relay 20 identity outside;
- visual channel runs `97/100/100/100` pixels for the largest visible ship;
- water stays player-blocked, and west/north/southeast remain three pairwise-disconnected entrances.

Sunken is **owner-approved for the exact displayed geometry**. The candidate rotates the rejected
vector `(53,-41)` exactly 90 degrees clockwise to `(41,53)`, from entrance C `(370,2495)` to
`(411,2548)`, using the current 11x11 straight corridor. It passes actor radius 4, maximum substep
2, all retained routes/probes/anchors, blockers, semantic roles, and exact collision reconstruction.
The owner directly inspected the byte-locked art and generated overlay and replied, “looks good.
please continue,” accepting the displayed rocky apron as the visual entrance approach.

This approval does not include the unshown `(421,2561)` extension, an off-ray bend, or any Sunken
art change. The earlier independent visual NO-GO is retained as historical advisory evidence but
is superseded by the narrow owner decision. The candidate is eligible for later separately
authorized promotion; the proposed diff remains design evidence and is not applied here.

## Completion and successor

All required Relay 24 gates passed against the exact approved geometry. The next safe design-only
slice is Relay 25, documented at
`docs/handoffs/2026-07-19-act1-full-map-route-hidden-ground-mask-relay.md` and assigned to the
existing Sol task `019f75c3-5d4d-78d0-9d48-a68f226a3092`. No duplicate task was created and no
runtime files were promoted.

## Verification

- Relay 24 confined deterministic rebuild: PASS.
- Owner-decision focused Python rebuild/lock/mask suite: PASS.
- Owner-decision focused JavaScript consumer suite: PASS, seven routes / 81 waypoints.
- Relay 24 focused Python and JavaScript consumers: PASS, seven routes / 81 waypoints.
- Relay 21 movement candidate: PASS.
- Relay 21 promotion audit: expected negative baseline, exactly 53 retained conflicts.
- Relay 22 movement and promotion-preservation audits: PASS, zero conflicts.
- Current polygon, painted-path, and runtime-override suites: PASS.
- Temporary Bun/TypeScript map-engine compile and four retained suites: PASS.
- Shipped replay, runtime snapshot, and runtime override checks: PASS.
- Preserved Act 1 baseline and eight-request static smoke: PASS.
- Protected Relay 20/21/22/23 hashes and all three runtime geometry twins: PASS.
- Fresh movement/preservation review: PASS.
- Corrected fresh static/code review: PASS.
- Historical fresh native art/mask review: Port PASS; Sunken advisory FAIL.
- Historical Sol endpoint advice: NO-GO; retained and superseded by owner inspection.
- Owner inspection of byte-locked Sunken art and displayed overlay: APPROVED for exact
  `(370,2495)` to `(411,2548)` geometry and current 11x11 corridor.

Current Relay 24 hashes:

- candidate geometry `864e076900c7143725522e9bf2b965803d92f2444bfea9764ebbe6d352076b25`;
- proposed geometry `6ff5b7be0b1763df66f039f19964a1b9d0dffa524843ec17360c7d8b666b376f`;
- inventory `44f418787df9d0adfa6a0416b1fc4c1300a64ec1218b6e2eabe1316c42f5d952`;
- visual ledger `06315aa9d17641becc3347e2575d129d55ec82df72ac840c87d661b08c2dbc64`;
- Port lock `259f2764da23d49411bae2fbb5c6f33f0c2c1ad48b04fe6f91825b17b0731526`.

## Boundaries preserved

No runtime/public/dist, manifest, compositor, adapter, route source, trigger, save, accepted art,
preserved artifact, full-map mask, Vite/npm source build, legacy bundle, branch/worktree, commit,
push, deploy, release, TestFlight, or App Store Connect action occurred. Relay 20/21/22/23 evidence
was not edited. The shared dirty checkout and branch/HEAD were preserved.
