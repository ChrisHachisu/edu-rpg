# Whole-rock route audit classification

## Result and scope

The v2-bound static solver finished with `inconclusive`, not a global route pass. It evaluated 20 named targets for each hero (40 records total) from new-game start `(69,256)`, with current QOKF8COL, A1OW v2, current map/DQ source, empty inventory and the Crystal Cave flag absent. The graph spacing, continuous edge sampling, hero silhouettes, collision rules and expansion cap are unchanged from the prior route audit.

- Each hero: 11 route passes, 5 blocked-at-target records, 4 expansion-cap records.
- The 40 route result records are exactly equal to the previous QOK route report; all waypoint arrays are byte-for-byte equivalent after JSON decoding. None of the new whole-rock collision pixels changed a named route result or selected path.
- This run does not directly target the approved north-rock interiors or the new F/M join. `[101,232]` is the Whispering Woods/Cave story approach, not proof of reaching the approved north formation. Static source/guard/whole-hero checks remain separate evidence.

## Blocked anchors (same for both heroes)

- Coastal Reef approach and exit at `(145,372)`: `canMove/OW_BLOCK` rejects foot tile `(145,373)` / tile `21` with default empty inventory. The base bundle has an explicit Flame Cloak exception for this tile. This is a state-dependent restriction, not a new raised-art hit; real entry with the relevant progression item remains native/runtime work.
- Crystal Cave side approach `(149,277)`: the hero foot point lands on `(149,278)`, tile `15`; the map declares `boss.giantToad.defeated` as the gate flag and this audit uses its absent/default state. This is consistent with the closed side gate. It does not prove the actual south/front entrance or transition behavior.
- Port Sapphire approach and exit `(133,348)`: the A1OW water-clearance test rejects the target (`distanceThirds=51`, required `53.9391`). This is an unchanged field/anchor result, not caused by the whole-rock change. Treat it as an unresolved native approach check; do not call the anchor harmless based on this static result.

## Expansion caps (same for both heroes)

The four capped records are Crystal Cave approaches `(148,278)`, `(149,279)`, `(150,278)`, and the Crystal Cave exit. Each is `expansion-cap` at the configured search cap. These are inconclusive searches; they do not establish either a blocked route or a valid unlocked route. The gate-present/absent native entrance and round-trip tests remain necessary.

## Evidence identity and limits

- Executed runner: `audit_forward_profile_routes_v2.py` SHA-256 `53d44c20090377f069fa7dc41d5ed500f31bc607fbc38267a4e05808b1dd5d36`.
- The final reviewed W copy adds explicit decoded-header/semantics/support equality checks to the independent A1OW v2 proof; it does not change the route algorithm. A post-run closure records the executed and final runner hashes separately.
- Route report: `ROUTE-AUDIT.json`; waypoint paths: `route-paths.json`; post-run proof binding: `route-audit-v2-binding-closure.json`.
- The audit is static. It does not prove joystick delivery, native movement, transition handling, cave progression, or actual device gameplay.
