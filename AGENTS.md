# Quest of Knowledge — agent entrypoint

Read this file fully. It is the small, always-on safety core for work in this
repository. Load detailed history only when the task needs it.

## Start here

- Multi-step, delegated, or image-asset work: read
  `docs/AGENT-WORKFLOW.md` before the first dispatch.
- Architecture, UI internals, shipping, and incident history: read only the
  relevant section of `docs/PROJECT-RUNBOOK.md`.
- Newest project state: read the latest date-prefixed file in `docs/handoffs/`
  first; do not preload older handoffs.
- Preserve the dirty worktree. Do not commit, push, deploy, publish, or mutate
  App Store Connect unless the user explicitly authorizes that action.

## Non-negotiable safety core

1. The checked-in TypeScript source is older than the shipped game. Never run
   `npm run build`, `npx vite build`, `npm run dev`, or `npx vite`; they can
   replace the 320x400, SAVE_VERSION=4 game with the old 120x160 build.
2. Serve only the preserved artifact:
   `npx serve -s dist -l 5174 --no-clipboard`.
3. The healthy shipped bundle is about 4.99 MB and contains 75 monsters. A
   roughly 2.4 MB bundle is a regressed source rebuild. Check size and content
   before any copy or release.
4. Prefer additive overrides in `public/` and keep their `dist/` twins exactly
   synchronized. Preserve external hero, monster, terrain, prop, and UI assets.
5. For a rare bundle edit: read once, write a new temporary file, assert a
   4.5–5.5 MB result, inspect the diff, then copy. Never read and write the same
   bundle path or run the patch script twice.
6. Never add or remove seeded `h()` calls in dungeon generation. Consume and
   ignore when necessary. Never modify Crystal Cave generation.
7. Do not use `WorldMapScene.loadMap()` from the console to verify a dungeon;
   use a seeded save and the real entry path.
8. Keep English, Japanese, and Japanese-kanji text in sync, then review changed
   Japanese for natural JRPG phrasing.
9. Never use broad destructive Git operations on `gh-pages`, including
   `git checkout <commit> -- .`, `git add -A`, or deleting the whole `assets/`
   tree. Protected monster sprites must survive every release operation.
10. Deployment requires explicit authorization and an isolated temporary
    worktree. A code-change request alone does not authorize deployment.

## Verification contract

- Source review is not proof because runtime override layers repaint and
  reroute the game. Verify the rendered behavior.
- UI/gameplay changes require the static `dist/` artifact plus the relevant
  Playwright harness or the canonical iPhone simulator. Inspect screenshots;
  use video for motion.
- A worker returns `UNVERIFIED` when it cannot reach the exact state. The lead
  treats that as open work, not a pass.
- Run the narrowest failable check first, then inspect the combined diff and
  perform integration-level verification after worker returns.

## Architecture in one minute

- `dist/assets/index-BhoGQRaA.js`: preserved compiled game; source does not
  reproduce it.
- `public/ui-overhaul.{js,css}`: DOM UI overlay and input bridge.
- `public/hero-override.js`: hero texture and device behavior overrides.
- `public/dq-tiles.js`, `public/owprops/`, `public/props/`: additive terrain and
  prop layers.
- `dist/`: what web and Capacitor ship; keep it synchronized deliberately.
- `.eduharness/`: local Playwright verification toolkit; never deploy it.

## Task-specific references

| Task | Read |
|---|---|
| Delegation or image batches | `docs/AGENT-WORKFLOW.md` |
| Build, iOS, or web release | `docs/BUILD-AND-SHIP.md` and the release section of `docs/PROJECT-RUNBOOK.md` |
| Current milestone | latest `docs/handoffs/YYYY-MM-DD-*.md` |
| UI overlay or touch | UI/gotchas sections of `docs/PROJECT-RUNBOOK.md` |
| Dungeon or map work | installed edu-rpg reference files plus the map/generation sections of the runbook |
| Art direction | `docs/hero-walk-art-contract.md`, relevant design manifest, and locked anchor images only |

Project facts belong in repository docs. Codex writes shared-brain captures only
to the append-only `_codex-inbox/` path required by the parent `AGENTS.md`.
