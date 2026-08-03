# Edu-RPG agent workflow and token budget

This is the planning and delegation contract for Quest of Knowledge. It applies
to Claude Code orchestration and Codex-native orchestration, with one transport
difference: Claude can select Luna/Terra/Sol through `codex exec`; Codex native
collaboration chooses the available model and cannot promise those names.

## 1. Lead plans before execution

The lead/session model owns product judgment, the stage map, task partitioning,
integration, destructive or release decisions, and final acceptance. Before
the first dispatch, it publishes one table covering every requested item:

| Track | One outcome | Inputs and owned files | Depends on | Tier | Failable check | Integration order |
|---|---|---|---|---|---|---|

The plan must identify disjoint ownership or make workers read-only. It must
include the render/simulator gate for visual work and account for each named
user item. If the work cannot be described in bounded tracks, the lead plans
further before dispatching.

The lead does not perform bulk reading, asset generation, mechanical editing,
or exploratory forensics inline. It may keep final assembly, whole-task
judgment, shared-file integration, protected Git/release actions, and trivial
single edits.

## 2. Route work to the lowest safe tier

Claude Code resolves tier names through `~/.claude/hooks/model-tiers.json`:

| Tier | Current role | Use for |
|---|---|---|
| `light` / Luna | mechanical worker | exact single-file edits, rename/copy/resize/convert, manifests, inventories, deterministic checks |
| `standard` / Terra | default worker | bounded implementation, multi-file fixes, one asset-generation batch, research/census, rendered QA |
| `escalation` / Sol | surgical consultant | a focused `NEEDS-CONSULT`, unresolved root cause, or exceptional high-risk review |
| session model | lead | planning, product choices, integration, authorization, final acceptance |

Default to Luna only when the pattern and pass condition are explicit. Default
all other bounded execution to Terra. Do not give Sol bulk execution merely
because a brief is vague; improve the brief or ask Sol one small question.

The Claude dispatch hook rejects missing or unregistered model ids in the
prescribed direct `codex exec` command form, including fresh review dispatches.
Do not wrap dispatches in nested shells or alternate command launchers. Codex
native agents use the same task split and return contract but cannot guarantee a
named model, so do not claim Terra/Luna routing there.

## 3. Every worker gets a small brief

Pass paths, not pasted file contents. A brief contains only:

1. One atomic outcome and explicit non-goals.
2. Exact files/sections and skills to read.
3. Owned files or read-only scope.
4. Known constraints and authority boundaries.
5. Concrete checks that can fail.
6. Return contract: stage status, files changed, exact check results, evidence
   paths, risks, and `NEEDS-CONSULT` questions.

Substantive Luna/Terra workers read the compact Fable block. Do not give a
worker the full project runbook, whole handoff corpus, source dumps, or raw
simulator/accessibility trees. Large results go to a file; the return contains
only a short summary and pointer.

## 4. Image batches have hard context boundaries

Image quality stays high through locked visual anchors and acceptance criteria,
not through an endlessly resumed conversation.

- The lead planning task does not call image generation.
- One worker owns one named asset family or coherent batch.
- Provisional default batch size is four final assets. Review and hand off after eight
  image-generation calls, after two failed retries on one asset, when the asset
  family changes, or when the batch is accepted—whichever happens first.
- Use only the locked style anchors and the current target as visual inputs.
  Reference local paths directly; do not attach the full roster, rejected
  history, or prior batch outputs.
- Luna handles deterministic post-processing and inventory work. Terra handles
  generation, comparison, and a fresh rendered QA pass.
- Never use `codex exec resume` or continue the same Codex task after a batch
  boundary.

Always start a fresh parent task at a review checkpoint or task-class change
(for example generation to mockup or asset creation to game integration). When
usage telemetry is visible, also treat eight user turns, ten turn contexts,
75K latest-call input, 60K cached input, or a 2M-token child as advisory reset
signals. These are provisional context-control defaults derived from the audited
long NPC run, not billing claims; recalibrate them when better telemetry exists.

At the boundary, write a handoff of at most 2 KB with:

- immutable style block and locked anchor paths;
- accepted output paths;
- rejected failure modes in one line each;
- dimensions, alpha, naming, and provenance requirements;
- integration and verification status;
- exact next batch and nothing else.

Start a fresh task using only that handoff, the anchors, `AGENTS.md`, and the
specific manifest slice. A roster such as `edu-rpg/design/npc-sprites-v2/prompt-manifest.json`
must be sharded; never paste or regenerate the entire manifest in every brief.

## 5. Integrate and verify

Worker summaries are claims. The lead inspects the changed files and combined
diff, resolves overlap, runs integration checks, and reads rendered evidence.
The author of a visual change does not provide the only verdict; use a fresh
Terra reviewer by default. `PASS` requires reaching and proving the exact state;
otherwise return `FAIL`, `DEFERRED`, or `UNVERIFIED` with the blocker.

Finish a wave with one compact user summary. If another asset family or major
milestone remains, create a handoff and recommend a fresh task instead of
carrying the full conversation forward.
