# AGENTS.md

# asyncs

> Open-source sub-agent driven AI PR review harness.

asyncs is an open-source AI code review tool that reviews pull requests using a swarm of specialized agents.

Instead of one generic AI reviewer, asyncs detects what changed in a PR, selects the right specialist agents, runs them in parallel, merges their findings, removes noise, and produces a focused review.

asyncs is designed as:

- an interactive CLI
- a GitHub PR review tool
- a multi-agent orchestration harness
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
sub-agent driven PR review
+
interactive CLI
+
plugin system
+
open-source AI review harness
```

It should feel like:

```txt
Codex-style terminal experience
but focused on reviewing pull requests
with specialist agents
```

Users should be able to run:

```bash
asyncs
```

and interactively:

- select a repository
- view open PRs
- pick a PR
- choose review mode
- choose agents
- run the review
- inspect findings
- post comments to GitHub
- export a report

Example:

```bash
asyncs pr review 3213
asyncs pr review 3213 --agents backend,security,architecture
asyncs pr review 3213 --dry-run
asyncs pr review 3213 --post-comments
asyncs pr review 3213 --mode low-noise
```

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
- CLI/tooling-heavy
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

## CLI

- commander
- ink
- react
- @inkjs/ui

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
Interactive CLI / GitHub Action / GitHub App
                    ↓
              PR Loader
                    ↓
            Repository Analyzer
                    ↓
        Deterministic Preclassifier
                    ↓
             Classifier Agent
                    ↓
              Agent Router
                    ↓
       Parallel Specialist Agents
                    ↓
             Consensus Engine
                    ↓
              Noise Filter
                    ↓
            Review Formatter
                    ↓
       CLI Output / GitHub Comments / Report
```

---

# Main Apps

## 1. Interactive CLI

The CLI is the main developer experience.

It should allow users to:

```txt
1. Authenticate with GitHub
2. Select repository
3. List open PRs
4. Pick PR by number
5. Preview changed files
6. Select review mode
7. Select agents
8. Run review
9. Inspect findings
10. Post comments or export report
```

Example interactive screen:

```txt
asyncs

Open PRs:
> #3213 Add payment retry orchestration
  #3214 Refactor checkout UI
  #3215 Update auth middleware

Review mode:
> Low-noise
  Full
  Security only
  Architecture only

Agents:
[x] Backend
[x] Security
[x] Architecture
[x] Testing
[ ] Frontend
[ ] DevOps
```

---

## 2. GitHub Action

Users should be able to add asyncs to CI.

Example:

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
      - uses: asyncs/action@v1
        with:
          mode: low-noise
          agents: backend,security,architecture,testing
```

---

## 3. GitHub App

Future direction.

The GitHub App can:

- listen for PR events
- run asyncs automatically
- post review comments
- support repo-level configuration
- support organization rules

---

# Repository Structure

```txt
asyncs/
├── apps/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── app.tsx
│   │   │   ├── commands/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── main.ts
│   │   └── package.json
│   │
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
- repository selection

---

## Classifier Agent

Classification is agent-driven, not a hardcoded language database.

The Classifier Agent performs the first model-assisted pass over a PR before specialist review agents run.

The Classifier Agent receives:

- changed file paths
- patch excerpts
- repository manifests
- user config and plugin rules

It returns structured output such as:

```ts
type ClassificationResult = {
  labels: string[];
  suggestedAgents: AgentKind[];
  confidence: "low" | "medium" | "high";
  reasoning: string[];
};
```

The Classifier Agent does not run the review swarm directly.

Avoid adding a deterministic classifier package that tries to enumerate every language, framework, file extension, or backend ecosystem. Repo-specific knowledge should come from manifests, config, plugins, and the classifier model context.

Flow:

```txt
Classifier Agent
        ↓
Agent Router
        ↓
Specialist Review Agents
```

---

## packages/routing

Chooses which agents should run.

Routing priority:

1. Explicit user-selected agents from CLI/config.
2. Classifier Agent recommendations when available.
3. Safe mode defaults.

The router should keep orchestration separate: it selects agents, but it does not run them.

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

Runs selected agents.

Responsibilities:

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
- custom classifiers
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

# CLI Commands

```bash
asyncs
asyncs auth login
asyncs repo select
asyncs pr list
asyncs pr review 3213
asyncs pr review 3213 --agents backend,security
asyncs pr review 3213 --mode low-noise
asyncs pr review 3213 --dry-run
asyncs pr review 3213 --post-comments
asyncs plugins list
asyncs plugins create payment-idempotency
asyncs config init
```

---

# Example CLI Flow

```txt
$ asyncs

Welcome to asyncs

? Select repository:
> alex/checkout-api
  alex/payment-service
  alex/frontend-app

? Select PR:
> #3213 Add payment retry orchestration
  #3214 Refactor checkout UI
  #3215 Update auth middleware

? Select review mode:
> Low-noise
  Full
  Security only
  Architecture only

? Select agents:
[x] Backend
[x] Security
[x] Architecture
[x] Testing
[ ] Frontend
[ ] DevOps

Running review...

Backend Agent      complete
Security Agent     complete
Architecture Agent complete
Testing Agent      complete

Findings:
- 1 high severity
- 2 medium severity
- 1 low severity

? Post comments to GitHub?
> Yes
  Export only
```

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

## Local Review Mode

Review local diffs without GitHub:

```bash
asyncs review --local
asyncs review --staged
```

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
- a terminal-first developer tool
- an open-source alternative to closed AI review tools

The core differentiator is:

```txt
Sub-agent driven development concepts applied to PR reviews.
```

---

# Potential CV Description

Built asyncs, an open-source sub-agent driven AI PR review harness that routes pull request diffs to specialized reviewers for backend, frontend, security, testing, architecture, and performance analysis, with an interactive Bun/TypeScript CLI, GitHub integration, and plugin system for custom engineering rules.

---

# End Goal

A developer should be able to run:

```bash
asyncs pr review 3213
```

and feel like a small team of specialized reviewers analyzed the PR carefully, filtered out noise, and only commented when something actually mattered.
