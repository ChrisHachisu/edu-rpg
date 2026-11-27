# Taste guide backtest, 2026-11-26 (track G)

Verdict: the test is now valid (no leaked quotes, neutral wording, time split), but it is too small to conclude anything. The guide is not shown to beat no-guide. No area can graduate.

## What was built
- `decisions.jsonl` (v2): 53 rows from the record, each with quote, source, date, `alt_basis` (why the alternatives were on the table). 34 usable, 19 `usable:false` with a reason (alternative not on record, no date, single-mockup verdict, choice only inferred). The 14 v1 rows whose decoys were invented are kept but marked unusable. Rebuild with `build_rows.py`.
- Cut date 2026-11-03: 23 usable rows on or before it (train), 11 after it (held out, 32%). The later rows are the save, defeat, ship-scope, scrolling, hero-redraw, collision, ending and pause decisions of 2026-11-04 to 2026-11-11.
- `guide-train.md`: sections 1-4 with 18 lines/blocks deleted (listed in its header comment): P4, P5, the P14 tail, seven section-2 rows, the Feel checklist, two "how he decides" bullets, plus two trims.
- `run_backtest.py`: neutral options (no value words, described by what the player sees), fixed seeds (A=11; B reverses A's option order and reshuffles question order, seed 22), three predictors x two orders, each a fresh Haiku process that sees only its text and the questions. Results with raw outputs: `backtest-2026-11-26.json`.

## Usable decisions by area (held out in brackets)
overworld-art 12 (1), dungeon-mechanic 7 (0), screens 4 (4), towns 3 (0), puzzle-feel 3 (3), dungeon-layout 2 (0), difficulty 2 (2), direction 1 (1). Audio: 0.

## Results (11 held-out rows, 2 option orders = 22 predictions each)
| Predictor | Order A | Order B | Total |
|---|---|---|---|
| (a) no guide | 9/11 | 10/11 | 19/22 (86%) |
| (b) guide-train | 11/11 | 11/11 | 22/22 |
| (c) full guide 1-4 (contaminated, upper bound) | 11/11 | 11/11 | 22/22 |

Rows where no-guide was wrong or split (G29 scrolling A vs B, wrong in both orders; G30 male-hero fix, wrong in order A): (a) 1/4, (b) 4/4, (c) 4/4.

Lift of (b) over (a): +3 predictions of 22, but only 2 distinct rows differ. That is within noise (11 rows, one run-to-run flip in (a) alone moves it by 4 points). Do not read it as "the guide works"; read it as "no evidence it hurts".

## Why this is weak
1. The no-guide predictor already scores 86%, above the 80% target, so there is almost nothing for the guide to add. Most held-out rows are old-versus-new (5 of 11; 18 of 34 overall) where he took the change, or proposal-versus-his-lock (G24, G26: the question text says the proposal recommended X, and Haiku picked "not X" with 0.8-0.95 confidence). "Pick what differs from the status quo or the proposal" is a base-rate trick that a guide-less model finds. The two genuine A/B previews (G29 scrolling, G32 ending layout) drew only 0.45-0.6 confidence from (a); it got G32 right in both orders and G29 wrong in both.
2. Held-out areas: none has 10 answers (max 4, screens). Per-area graduation (85% over 10 or more) cannot be evaluated.
3. Held-out rows cover only 5 areas; dungeon-mechanic and towns have no held-out rows (all on or before the cut), so the guide's strongest rules (P6, P7, P2) are untested.
4. No misprediction by (b) or (c), so no rule failed; and I cannot say which rule produced a right answer, since the predictors were told to output only picks. G29 right in (b) is unexplained: the train guide has no scrolling row (deleted), so it may be chance or a general rule (P1/P12). G30 plausibly P1 ("never cut, clone or paste paint to patch a problem"; the redo option is the only one that keeps frames whole).
5. Train rows are not used for scoring (the guide was derived from them); the cut is by date, but rule wording was written in v1 after seeing rows up to 2026-11-11, and the deletions are my judgment of "only support is after the cut". Two lines were trimmed because their support is undated.
6. Predictors are Haiku called via `claude -p --tools ""` in an empty directory (the Agent tool was not available to this worker). They saw no repo, memory or quotes, but I did not verify the CLI loads no user-level config. One batch of 11 questions per call, so answers within a batch can influence each other.
7. Several rows pair his answer with "old behaviour" as the alternative. Where the record names only what he rejected, the alternative text comes from his quote (`alt_basis`); a few option descriptions (G31 numbers, G33 gold rays) carry factual detail from the build notes that hints at the answer to a reader.

## Rule proposals
None needed from mispredictions. Gaps worth a rule once more answers exist: "he overrides a written recommendation in some save rows" (overrode it in G24 and G26, took it in G25; 2 of 3 is too few to make a rule); and "accepts the change when old and new are shown side by side" is not a taste rule, it is a base rate.

## How many more answers are needed
Per area, 10 held-out answers with at least 9 of 10 right (85%) and the no-guide predictor not already at that level. Today: screens 4 (needs 6 more), puzzle-feel 3 (7), difficulty 2 (8), overworld-art 1 (9), others 0 (10 each). Realistically these must come from new A/B questions where the options are both live and the guide predicts first (section 6 log), not from more history: the record has run out of rows with a true alternative.
