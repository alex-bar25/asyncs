# CLAUDE.md

This file is Claude Code's working context for the asyncs repo. For the full product spec, see [AGENTS.md](./AGENTS.md). For active design docs, see [docs/superpowers/specs/](./docs/superpowers/specs/) and [docs/superpowers/plans/](./docs/superpowers/plans/).

---

## What asyncs is

Open-source sub-agent driven AI PR review harness. Instead of one generic AI reviewer, asyncs routes a PR's diff to specialized agents (backend, frontend, security, architecture, testing, performance, devops, plus user-defined), runs them in parallel, merges their findings via a consensus layer, filters noise, and produces a focused review.

Not a SaaS product. Open source, hackable, provider-agnostic, plugin-first.

---

## Product positioning

The library is the engine. The GitHub Action is the product.

The common workflow — "review every PR automatically" — is owned by the **GitHub Action**. There is no CLI: nobody wants to remember to run one after every push, and the engine stays the focus without a second surface to maintain. For local debugging, run `bun run apps/action/src/smoke.ts` with an Anthropic key.

Distribution priorities:

1. **Core library** (`packages/`) — orchestration engine, agents, consensus, formatter, plugin system. This is the value.
2. **GitHub Action** (`apps/action`) — the only product surface for teams. One YAML block in CI.
3. **GitHub App** — later, if it makes sense.

Every entry point wraps the same core. Same engine, different surfaces.

---

## Architecture (one diagram)

```txt
GitHub Action / GitHub App
                    ↓
              PR Loader (octokit or simple-git)
                    ↓
            Context Collector
                    ↓
            Coordinator Agent  ← agent-driven planning, no language heuristics
                    ↓
              Orchestrator
                    ↓
       Parallel Specialist Agents
                    ↓
             Consensus Engine
                    ↓
              Noise Filter
                    ↓
            Review Formatter
                    ↓
       GitHub Comments
```

---

## Repository layout

```txt
asyncs/
├── apps/
│   ├── action/      GitHub Action (composite action, event parsing, comment posting)
│   └── github-app/  GitHub App (future)
├── packages/
│   ├── core/         types, constants, zod schemas, guards
│   ├── agents/       built-in agent defs, prompts, runners, JSON schemas
│   ├── orchestration/  plan creation, parallel execution, pipeline composition
│   ├── routing/      mode-based defaults + explicit override
│   ├── consensus/    dedup, noise filter, severity/confidence sort
│   ├── providers/    interface + concrete impls (Anthropic done; OpenAI later)
│   ├── formatter/    markdown rendering
│   ├── diff/         local git diff loading (working tree, staged, commit range)
│   ├── plugins/      (future) user-defined rules + agents
│   ├── github/       (future) PR loader, comment poster
│   └── config/       (future) cosmiconfig + asyncs.config.ts
├── docs/superpowers/
│   ├── specs/       design specs from brainstorming
│   └── plans/       implementation plans from writing-plans
├── AGENTS.md        full product spec (canonical)
└── CLAUDE.md        this file
```

Each package follows the same shape: `src/index.ts` (re-exports), `src/types.ts` (types only), `src/constants.ts`, plus topic files; `test/` for `bun:test` files.

---

## Tech stack

- **Language:** TypeScript, strict mode (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` enabled)
- **Runtime:** Bun (runtime, package manager, test runner). Avoid Bun-only lock-in where possible so Node compatibility stays achievable.
- **Validation:** zod v4
- **AI SDKs:** `@anthropic-ai/sdk` (concrete impl in `packages/providers`), `openai` later
- **Process / Git:** `execa`, `simple-git`
- **Orchestration:** `p-queue` for bounded concurrency
- **GitHub:** `octokit`
- **Logging:** `pino` (when added)
- **Config:** `cosmiconfig` (when added)
- **Format / lint:** `prettier`, `eslint`

Workspace deps use `workspace:*`. Run `bun run check` to typecheck + lint + format-check + test.

---

## Code conventions (binding — these are real rules, not suggestions)

### Zero tolerance for `as` typecasts

Use type guards (`value is T`), separate typed Sets, or restructure code. Every `as` gets flagged in review. There is one documented exception in this repo: the cast inside `asObjectJsonSchema` in `packages/agents/src/schemas.ts` — it lives at a runtime-validated boundary because `z.toJSONSchema()` returns a broader type than we accept. Don't add more.

Common ways to avoid `as`:

- For enum-like value checks, build a `ReadonlySet<string>` once and call `.has(value)` (see `packages/core/src/guards.ts`).
- For unknown→typed boundaries (e.g., model output), parse with zod — the return type is narrowed by the schema.
- For discriminated unions out of `.find()` / `.filter()`, use inline type predicates: `(block): block is Anthropic.TextBlock => block.type === "text"`.
- For autocomplete-friendly open string types, use `Foo | (string & {})` (see `ProviderKind` in `packages/providers/src/types.ts`).

### Async/await everywhere

No `.then()` chains. No `execFileSync`. Sync operations block; async keeps the orchestrator responsive (matters when running parallel specialists or interactive prompts in a TUI).

### Static factory methods over side-effectful constructors

If construction does I/O or spawns processes, expose a `Foo.create()` (or `createFoo()`) async factory and keep the constructor field-only. Avoids setTimeout-style hacks for emitting errors after construction.

### Vendor neutrality in `@asyncs/providers`

The provider interface package stays interface-only. Vendor-specific code lives in one file per provider (e.g., `anthropic.ts`). Don't pull SDKs into the interface module.

### File hygiene

- Each file has one clear responsibility.
- Re-export public surface from `src/index.ts`.
- Types-only re-export via `export type * from "./types"`.
- Default to writing no comments. Only add a comment when WHY is non-obvious — never to describe WHAT the code does.

### Test conventions

- TDD for new behavior: write failing test → see it fail → implement → see it pass → commit.
- Tests live in `test/` alongside `src/` per package, use `bun:test`.
- No mocking that hides correctness gaps. The Anthropic provider uses a small `AnthropicMessagesGateway` seam (marked `@internal`) so tests can substitute a fake `messagesCreate` without going to the network.
- Test the contract, not the implementation. Don't tautologically mirror the code.

### Evidence-based review findings

Every `ReviewFinding` must include `evidence` and `recommendation` fields. The whole point of the harness is to surface high-signal review comments — no finding ships without evidence pointing to specific changed code.

---

## Working with Claude in this repo

### Move slowly, piece by piece

One feature at a time. Brainstorm → design → plan → implement → review. No skipping steps. No jumping multiple features ahead.

### Run code reviews after each feature implementation

When a feature is done, run a thorough review (SOLID, code smells, unused code, complexity) before moving to the next piece. The `superpowers:subagent-driven-development` flow handles this per-task; for ad-hoc reviews, ask explicitly.

### Use the superpowers skills properly

Skills are not optional decoration. They override default behavior where they conflict. The standard flow for any non-trivial work:

1. `superpowers:brainstorming` — for any creative work (features, behavior changes, design decisions). Outputs a spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
2. `superpowers:writing-plans` — for multi-step implementations. Outputs a plan to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`.
3. `superpowers:subagent-driven-development` (preferred) or `superpowers:executing-plans` — to execute the plan task-by-task.
4. `superpowers:test-driven-development` — followed implicitly inside each implementation task.
5. `superpowers:verification-before-completion` — before claiming work is done.
6. `superpowers:finishing-a-development-branch` — to wrap up (merge, PR, or discard).

For bugs: start with `superpowers:systematic-debugging`.

### Ask before major decisions

For visual/aesthetic choices (when they come up — currently rare since the only surface is the Action's comment output): always offer multiple-choice options. For architectural choices: surface the trade-offs and recommend before committing.

### Subagent-driven execution conventions

- Fresh subagent per task. The controller (top-level Claude) curates context; subagents don't read the plan file directly — they get the full task text + scene-setting in their prompt.
- Two-stage review per task: spec compliance first, then code quality. Both must pass before moving to the next task.
- After a fix loop: re-run the relevant review. Don't proceed with open issues.
- Use the cheapest model that handles the role (sonnet for mechanical implementer tasks; opus for the final whole-implementation review).

### Branching

- Feature branches for multi-task implementations (e.g., `feat/anthropic-provider`).
- Direct commits to `main` are fine for one-shot docs or small fixes.
- Never push to main with `--force`. Never amend a pushed commit.

### Commits

- One commit per task (or per fix loop iteration).
- Conventional-commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`, `build:`.
- HEREDOC for multi-paragraph messages; include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` when Claude wrote the commit.

---

## Things that are out of scope right now

The product spec in AGENTS.md mentions ideas that aren't built yet and don't need premature implementation:

- Plugin loader / plugin marketplace
- Architecture memory
- Multi-provider per-agent selection
- Dashboard
- GitHub App
- Interactive TUI (no, this got dropped from positioning)

If a task seems to require one of these, surface that gap before building it.

---

## Quick references

- Full spec: [AGENTS.md](./AGENTS.md)
- Active specs: [docs/superpowers/specs/](./docs/superpowers/specs/)
- Active plans: [docs/superpowers/plans/](./docs/superpowers/plans/)
- Check command: `bun run check` (typecheck + lint + format + tests)
- Format command: `bun run format`
