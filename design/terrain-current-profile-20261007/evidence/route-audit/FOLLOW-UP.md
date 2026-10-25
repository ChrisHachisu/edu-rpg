# Follow-up: collision-aware static route audit

This addendum updates the route status section in the frozen full-region visual/static review. That earlier report was written before the bounded collision-aware route audit completed. Its generated-output, alpha, collision, geometry, and visual findings remain separately scoped.

The frozen classifier reports 40 target records (20 per hero) across 11 unique target cells. For each selectable hero, 11 target records passed, 5 tested center anchors were blocked, and 4 searches reached the 200,000-node cap. The independent reviewer also replayed 10 unique saved passing path traces for both heroes; that is a different denominator from the target records.

The audit is **inconclusive for route acceptance**. A blocked tested anchor does not prove its surrounding area is unreachable, and an expansion cap is inconclusive. In particular, Crystal Cave entry is unresolved because the current transition wrapper and door path may bypass the closed-side `canMove` predicate. No static result establishes intended progression gating, dynamic cave entry/return, or native movement.

Exact per-target statuses, coordinates, paths, and first-rejected edges are in `ROUTE-AUDIT.json` and `route-paths.json`; the interpretation is in `ROUTE-AUDIT-CLASSIFICATION.md`. Keep route, cave, resume, and runtime movement checks pending for the prepared QA candidate.
