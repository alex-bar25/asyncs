# AGENTS.md

# asyncs

> Open-source sub-agent driven AI PR review harness.

asyncs is an open-source AI code review tool that reviews pull requests using a swarm of specialized agents.

Instead of one generic AI reviewer, asyncs detects what changed in a PR, selects the right specialist agents, runs them in parallel, merges their findings, removes noise, and produces a focused review.

asyncs is designed as:

- a sub-agent driven review harness (core library)
- a GitHub Action for teams (the product surface)
- a plugin-driven rule system
- a learning project for AI tooling, agent harnesses, and code review automation

The project is not meant to be a closed SaaS product.

It is meant to be:

- open source
- hackable
- free to use
- provider agnostic
- extensible
- developer-first

---

# Core Idea

Most AI PR review tools behave like one general reviewer.

asyncs behaves like a team.

A PR can be reviewed by:

- Backend Agent
- Frontend Agent
- Security Agent
- Architecture Agent
- Testing Agent
- Performance Agent
- DevOps Agent
- Custom user-defined agents

Each agent focuses only on its domain.

The final output is produced by a consensus layer that combines, ranks, and filters findings.

---

# Product Positioning

asyncs is:

```txt
sub-agent driven PR review harness
+
core orchestration library
+
GitHub Action for teams
+
plugin system
```

The library is the engine. The GitHub Action is the product.

The common workflow — "review every PR automatically" — is owned by the GitHub Action. There is no CLI: nobody wants to remember to run one after every push, and the engine stays the focus without a second surface to maintain.

For local debugging of the harness itself, run the action's smoke script directly (`bun run apps/action/src/smoke.ts`).

Distribution priorities, in order:

1. **Core library** — the orchestration engine, agents, consensus, formatter, plugin system. This is the value.
2. **GitHub Action** — the only product surface. Drops asyncs into PR workflows with one YAML block.
3. **GitHub App** — later, if it makes sense (lets organizations install asyncs without per-repo YAML).

---

# Personal Goal

This project exists to learn and demonstrate:

- AI tooling
- agent harness design
- sub-agent orchestration
- LLM provider abstraction
- prompt architecture
- review pipelines
- GitHub integrations
- plugin systems
- rule engines
- consensus systems
- context management
- open-source devtool engineering

The project should be impressive on a CV because it shows:

- modern AI engineering
- backend/tooling architecture
- TypeScript systems design
- GitHub workflow knowledge
- extensible open-source architecture
- practical developer tooling

---

# Tech Stack

## Language

TypeScript.

## Runtime

Bun.

Bun is preferred because asyncs is:

- TypeScript-first
- tooling-heavy
- AI SDK-heavy
- plugin-driven
- open-source devtool focused
- file/diff processing heavy

Bun gives:

- runtime
- package manager
- test runner
- bundler
- TypeScript support
- fast developer experience

Code should still avoid unnecessary Bun-only lock-in when possible, so future Node compatibility remains achievable.

---

# Recommended Packages

## GitHub

- octokit

## AI

- ai
- openai
- @anthropic-ai/sdk

## Validation

- zod

## Process / Git

- execa
- simple-git

## Orchestration

- p-queue

## Logging

- pino

## Config

- cosmiconfig

## Testing

- bun test
- vitest if needed later

## Formatting

- prettier
- eslint

---

# High-Level Architecture

```txt
GitHub Action / GitHub App
                    ↓
              PR Loader (octokit or simple-git)
                    ↓
            Context Collector
                    ↓
            Coordinator Agent
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
       GitHub Comments / Report
```

The same pipeline drives every entry point. The Action and (future) GitHub App are thin shells around the same orchestration core.

---

# Main Apps

## 1. Core Library

The orchestration engine. Lives in `packages/`. Coordinates the review swarm:

- coordinator agent planning
- parallel specialist execution
- consensus and noise filtering
- formatting
- plugin loading
- provider abstraction

Every other entry point (Action, GitHub App) wraps the core library. The library is the value of the project.

## 2. GitHub Action

Primary distribution surface. Teams drop asyncs into CI with a single YAML block.

```yaml
name: asyncs review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: alex-bar25/asyncs/apps/action@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: low-noise
          agents: backend,security,architecture,testing
```

The Action handles auth via repo secrets, posts a summary comment plus inline comments via the GitHub API, and runs the core review pipeline.

## 3. GitHub App (future)

If the Action proves out, the GitHub App lets organizations install asyncs once instead of per-repo YAML. Same engine underneath.

---

# Repository Structure

```txt
asyncs/
├── apps/
│   ├── action/
│   │   └── src/
│   │
│   └── github-app/
│       └── src/
│
├── packages/
│   ├── core/
│   ├── agents/
│   ├── orchestration/
│   ├── routing/
│   ├── consensus/
│   ├── providers/
│   ├── plugins/
│   ├── github/
│   ├── formatter/
│   ├── config/
│   └── shared/
│
├── plugins/
│   ├── backend/
│   ├── frontend/
│   ├── security/
│   ├── architecture/
│   ├── testing/
│   └── examples/
│
├── docs/
├── examples/
├── templates/
├── asyncs.config.ts
├── AGENTS.md
├── CLAUDE.md
└── README.md
```

---

# Core Packages

## packages/core

Owns shared domain models:

- PullRequest
- ReviewContext
- ChangedFile
- AgentFinding
- ReviewReport
- ReviewMode
- Severity
- Confidence
- AgentDefinition
- RuleDefinition

---

## packages/github

Owns GitHub integration:

- auth
- PR fetching
- diff fetching
- file loading
- comment posting
- review summary posting
- repository selection (for the Action / GitHub App, not interactive UX)

---

## Coordinator Agent

Swarm planning is agent-driven, not a hardcoded language database.

The Coordinator Agent is the leader/planner for the review swarm.

The Coordinator Agent receives:

- changed file paths
- patch excerpts
- repository manifests
- available specialist agents
- user config and plugin rules

It returns structured output such as:

```ts
type ReviewPlan = {
  labels: string[];
  assignments: AgentAssignment[];
  confidence: "low" | "medium" | "high";
  reasoning: string[];
};

type AgentAssignment = {
  agent: AgentKind;
  purpose: string;
  files: string[];
  focusAreas: string[];
  context: string;
};
```

The Coordinator Agent decides the swarm plan. The orchestrator executes the swarm plan.

Avoid adding a deterministic language-heuristics package that tries to enumerate every language, framework, file extension, or backend ecosystem. Repo-specific knowledge should come from manifests, config, plugins, and the coordinator model context.

Flow:

```txt
Context Collector
        ↓
Coordinator Agent
        ↓
Orchestrator
        ↓
Specialist Review Agents
```

---

## packages/routing

Chooses which agents should run.

Routing priority:

1. Explicit user-selected agents from Action inputs/config.
2. Coordinator Agent assignments when available.
3. Safe mode defaults.

The router maps selected agent kinds to known agent definitions. The orchestrator owns runtime concerns such as execution, cancellation, retries, and result collection.

Example:

```txt
If PR touches:
- src/api/*
- src/services/*
- prisma/*
- Dockerfile

Run:
- Backend Agent
- Security Agent
- Architecture Agent
- DevOps Agent
```

---

## packages/agents

Defines built-in specialist agents.

Agents should have:

- name
- purpose
- input schema
- output schema
- file filters
- prompt
- tools
- severity preferences
- noise threshold

---

## packages/orchestration

Plans and runs the review swarm.

Responsibilities:

- consume Coordinator Agent assignments
- build the review run plan
- parallel execution
- timeouts
- cancellation
- retry strategy
- provider selection
- result collection
- error handling

---

## packages/consensus

Merges findings from agents.

Responsibilities:

- deduplicate comments
- merge similar findings
- rank severity
- rank confidence
- suppress low-value comments
- group findings by theme

---

## packages/plugins

Loads user-defined plugins.

Plugin types:

- custom rules
- custom agents
- custom coordinator context
- custom review modes
- custom formatters

---

## packages/providers

Abstracts AI providers.

Initial providers:

- OpenAI
- Anthropic

Future providers:

- Ollama
- OpenRouter
- Gemini
- local models

---

# Agent Types

## Backend Agent

Focus:

- API design
- DTO misuse
- layering
- transaction boundaries
- error handling
- async mistakes
- retry logic
- idempotency
- event-driven flows
- database interactions
- service boundaries

Should care about:

- production safety
- maintainability
- correctness
- backend architecture

---

## Frontend Agent

Focus:

- React patterns
- component boundaries
- accessibility
- hydration issues
- rendering performance
- state management
- form handling
- API integration
- UI edge cases

Should avoid:

- subjective styling comments
- tiny naming complaints
- preference-only comments

---

## Security Agent

Focus:

- auth bypass
- authorization bugs
- injection risks
- secret leakage
- unsafe deserialization
- insecure defaults
- SSRF
- XSS
- CSRF
- insecure token handling
- permission mistakes

Security comments should be treated as high priority when confidence is high.

---

## Architecture Agent

Focus:

- circular dependencies
- domain leakage
- service boundary violations
- distributed monolith patterns
- coupling
- layering violations
- missing ownership
- bad abstraction boundaries
- unclear responsibility split

Should act like a pragmatic staff engineer.

---

## Testing Agent

Focus:

- missing coverage for changed behavior
- edge cases
- weak assertions
- flaky patterns
- missing integration tests
- missing failure-path tests
- missing regression tests

Should avoid asking for tests for meaningless changes.

---

## Performance Agent

Focus:

- N+1 queries
- blocking operations
- repeated expensive work
- memory risks
- inefficient loops
- cache misuse
- excessive network calls
- unnecessary serialization

---

## DevOps Agent

Focus:

- GitHub Actions
- Dockerfiles
- deployment config
- Kubernetes manifests
- environment variables
- secrets handling
- CI reliability
- infra drift

---

# Review Modes

## low-noise

Default mode.

Only reports:

- meaningful bugs
- security risks
- architecture violations
- missing important tests
- production-impacting issues

## full

More detailed review.

Includes:

- maintainability comments
- smaller improvements
- refactor suggestions

## security

Only security agent and security-related plugins.

## architecture

Only architecture/backend boundary analysis.

## testing

Only testing-related findings.

---

# Plugin System

Plugins are first-class.

Users should be able to create custom rules like:

```ts
import { defineRule } from "asyncs";

export default defineRule({
  name: "payment-idempotency",
  description: "Payment-related flows must define an idempotency strategy.",
  appliesTo: ["backend"],
  severity: "high",

  match(ctx) {
    return ctx.files.some((file) =>
      file.path.toLowerCase().includes("payment"),
    );
  },

  async review(ctx) {
    const hasIdempotency = ctx.diff.toLowerCase().includes("idempotency");

    if (!hasIdempotency) {
      return {
        message:
          "Payment-related changes should define or preserve an idempotency strategy.",
        evidence:
          "The PR touches payment-related files but no idempotency handling was detected.",
        recommendation:
          "Add an idempotency key, deduplication strategy, or document why it is not required.",
      };
    }

    return null;
  },
});
```

---

# User Config

Example `asyncs.config.ts`:

```ts
import { defineConfig } from "asyncs";

export default defineConfig({
  mode: "low-noise",

  agents: {
    backend: true,
    frontend: true,
    security: true,
    architecture: true,
    testing: true,
    performance: false,
    devops: true,
  },

  providers: {
    default: "openai",
    security: "anthropic",
  },

  rules: [
    "./plugins/payment-idempotency.ts",
    "./plugins/no-controller-business-logic.ts",
  ],

  github: {
    postSummaryComment: true,
    postInlineComments: true,
  },
});
```

---

# Review Finding Schema

Every finding must contain:

```ts
type ReviewFinding = {
  agent: string;
  title: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: "low" | "medium" | "high";
  file?: string;
  line?: number;
  evidence: string;
  recommendation: string;
};
```

No finding should be posted without evidence.

---

# Noise Filter Rules

Suppress comments that are:

- vague
- subjective
- style-only
- not tied to changed code
- not actionable
- repeated by another agent
- low confidence and low severity

Prefer one strong comment over five weak comments.

---

# Local Debugging

There is no CLI. To run the harness locally against a real diff, use the action's smoke script with a local Anthropic key:

```bash
ANTHROPIC_API_KEY=... bun run apps/action/src/smoke.ts
```

Everything else — auth, repo selection, PR loading — is owned by the Action environment (repo secrets, event payloads, the workflow checkout).

---

# GitHub Comment Style

Comments should be concise, practical, and evidence-based.

Example:

```md
### Backend Agent — Missing idempotency strategy

This PR changes payment retry behavior, but I do not see an idempotency strategy preserved or introduced.

Why this matters:
Duplicate payment retries can create unsafe repeated charge attempts.

Recommendation:
Add an idempotency key or document how duplicate retry events are deduplicated.
```

---

# Agent Prompt Principles

Agents must:

- be specific
- avoid generic filler
- cite evidence
- stay within their domain
- not repeat other agents
- not comment on preferences unless configured
- prioritize production impact

Agents must not:

- invent issues
- assume unseen code
- spam comments
- suggest massive rewrites without reason
- leave comments without evidence

---

# Open Source Philosophy

asyncs should be:

- free
- open source
- hackable
- transparent
- extensible
- contributor-friendly
- provider agnostic

The project should avoid:

- vendor lock-in
- black-box behavior
- forced cloud dependency
- noisy AI comments
- overcomplicated setup

---

# Development Principles

- Strong typing everywhere
- Small modules
- Clear package boundaries
- Good defaults
- Configurable behavior
- Plugin-first design
- Tests for routing and filtering logic
- Deterministic output where possible
- Evidence-based review comments
- Practical engineering over AI hype

---

# Future Ideas

## Architecture Memory

Learn repo-specific conventions:

- service boundaries
- folder conventions
- naming rules
- testing expectations
- architecture rules

## Agent Marketplace

Community plugins:

- Spring Boot reviewer
- .NET reviewer
- React reviewer
- Next.js reviewer
- Kafka reviewer
- Payments reviewer
- Security reviewer
- Terraform reviewer

## Dashboard

Optional dashboard for:

- review history
- agent performance
- false positives
- repository rules
- organization standards

## Multi-Provider Agents

Use different models per agent:

```txt
Security Agent → Claude
Backend Agent → OpenAI
Frontend Agent → Gemini
Local Rules → deterministic plugins
```

## Repo Rules Generator

Generate starter rules from a repository:

```bash
asyncs rules generate
```

---

# What Makes asyncs Cool

asyncs is not just an AI PR reviewer.

It is:

- a review harness
- a swarm orchestrator
- a plugin framework
- an AI tooling learning project
- an open-source alternative to closed AI review tools

The core differentiator is:

```txt
Sub-agent driven development concepts applied to PR reviews.
```

The library is the engine. The Action is the product.

---

# Potential CV Description

Built asyncs, an open-source sub-agent driven AI PR review harness that routes pull request diffs to specialized reviewers for backend, frontend, security, testing, architecture, and performance analysis. Shipped as a TypeScript orchestration library and a GitHub Action for teams, with a coordinator-agent planner and an extensible plugin system for custom engineering rules.

---

# End Goal

A team should be able to add asyncs to a repo with a single Action YAML block, and feel like a small team of specialized reviewers analyzed every PR carefully, filtered out noise, and only commented when something actually mattered.

One engine. One surface. Every PR reviewed.
