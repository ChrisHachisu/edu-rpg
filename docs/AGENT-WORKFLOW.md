# Edu-RPG agent workflow and token budget

This is the planning and delegation contract for Quest of Knowledge. It applies
to Claude Code orchestration and Codex-native orchestration, with one transport
difference: Claude dispatches through the Claude Agent tool with an explicit
tier model (ADR-0066; `codex exec` remains only for image/video generation);
Codex native collaboration chooses the available model and cannot promise tier
names.

For splitting a milestone across *several concurrent sessions* — track
ownership, the merge gate, and the machine limits — see
`docs/PARALLEL-SESSIONS.md`. This document governs one session and the workers
it dispatches; that one governs how sessions coexist.

## 1. Lead plans before execution

The lead/session model owns product judgment, the stage map, task partitioning,
integration, destructive or release decisions, and final acceptance. Before
the first dispatch, it publishes one table covering every requested item:

| Track | One outcome | Inputs and owned files | Depends on | Tier | Failable check | Integration order |
|---|---|---|---|---|---|---|

The plan must identify disjoint ownership or make workers read-only. It must
include the render/simulator gate for visual work and account for each named
user item. The simulator is a single shared machine resource: if another
session holds it, the plan schedules that gate rather than booting a second one.
If the work cannot be described in bounded tracks, the lead plans further before
dispatching.

The lead does not perform bulk reading, asset generation, mechanical editing,
or exploratory forensics inline. It may keep final assembly, whole-task
judgment, shared-file integration, protected Git/release actions, and trivial
single edits.

## 2. Route work to the lowest safe tier

Claude Code resolves tier names through `~/.claude/hooks/model-tiers.json`:

| Tier | Current role | Use for |
|---|---|---|
| `light` | mechanical worker | exact single-file edits, rename/copy/resize/convert, manifests, inventories, deterministic checks |
| `standard` | default worker | bounded implementation, multi-file fixes, one asset-generation batch, research/census, rendered QA |
| `escalation` | surgical consultant | a focused `NEEDS-CONSULT`, unresolved root cause, or exceptional high-risk review |
| session model | lead | planning, product choices, integration, authorization, final acceptance |

Default to the light tier only when the pattern and pass condition are explicit.
Default all other bounded execution to standard. Do not give escalation bulk
execution merely because a brief is vague; improve the brief or ask the
escalation consult one small question.

Use tier names in briefs and skills. Model ids live only in
`~/.claude/hooks/model-tiers.json`; do not copy them into project docs or
dispatch prose.

The Claude dispatch hook rejects missing or unregistered model ids on Agent
dispatches (and on the `codex exec` image-generation form), including fresh
review dispatches. Codex native agents use the same task split and return
contract but cannot guarantee a named model, so do not claim tier routing
there.

## 3. Every worker gets a small brief

Pass paths, not pasted file contents. A brief contains only:

1. One atomic outcome and explicit non-goals.
2. Exact files/sections and skills to read.
3. Owned files or read-only scope.
4. Known constraints and authority boundaries.
5. Concrete checks that can fail.
6. Return contract: stage status, files changed, exact check results, evidence
   paths, risks, and `NEEDS-CONSULT` questions.

Substantive light/standard workers read the compact Fable block. Do not give a
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
- Generation itself runs on Codex (`codex exec` with an explicit `-m`) — the one
  remaining Codex path. Deterministic post-processing and inventory work go to a
  light-tier Claude agent; a fresh standard-tier Claude agent runs the comparison
  and the rendered QA pass.
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
standard-tier reviewer by default. `PASS` requires reaching and proving the
exact state; otherwise return `FAIL`, `DEFERRED`, or `UNVERIFIED` with the
blocker.

The lead runs the final gate itself, on the committed tree; a worker's own
numbers are never the verdict. Only one agent mutates a given worktree at a
time — give concurrent workers separate worktrees or run them serially. When
this session is one of several concurrent tracks, merging is additionally gated
on `docs/PARALLEL-SESSIONS.md` (rebase onto current `main`, re-run the gate
after the rebase, hold the integration token).

Finish a wave with one compact user summary. If another asset family or major
milestone remains, create a handoff and recommend a fresh task instead of
carrying the full conversation forward.
