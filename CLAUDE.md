# Claude Code project rules

Read `AGENTS.md` first; its safety rules override stale historical prose.

For every substantive task, read `docs/AGENT-WORKFLOW.md`, publish the stage map
before dispatch, and keep the session model as planner/integrator. Claude Code
delegates through the Claude Agent tool with an explicit tier model from
`~/.claude/hooks/model-tiers.json` (ADR-0066); `codex exec` is used only for
image/video generation.

Do not preload `docs/PROJECT-RUNBOOK.md`, old handoffs, or whole reference
folders. Read only the section named by `AGENTS.md` for the current task.

For image work, the planning task never generates assets. End each accepted
batch with the compact handoff required by `docs/AGENT-WORKFLOW.md`, then start
a fresh worker task; never resume a completed asset batch.
