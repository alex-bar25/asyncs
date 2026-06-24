# asyncs

[![CI](https://github.com/alex-bar25/asyncs/actions/workflows/ci.yml/badge.svg)](https://github.com/alex-bar25/asyncs/actions/workflows/ci.yml)

Open-source sub-agent driven AI PR review harness.

Instead of one generic AI reviewer, asyncs reviews pull requests like a team. A coordinator agent reads the diff and plans the review, specialist agents (backend, security, architecture, testing, and more) run in parallel on their own slices, and a consensus layer merges their findings, drops duplicates, and filters out noise before anything reaches your PR.

The result: a summary comment plus inline comments anchored to the exact changed lines — only where something actually matters.

## How it works

```mermaid
flowchart TD
    Action[GitHub Action] --> Diff[Diff Loader]
    Diff --> Coordinator[Coordinator Agent]
    Coordinator -->|review plan| Orchestrator
    Orchestrator --> Backend[Backend Agent]
    Orchestrator --> Security[Security Agent]
    Orchestrator --> Architecture[Architecture Agent]
    Orchestrator --> Testing[Testing Agent]
    Backend --> Consensus[Consensus Engine]
    Security --> Consensus
    Architecture --> Consensus
    Testing --> Consensus
    Consensus -->|dedup, noise filter, rank| Formatter[Review Formatter]
    Formatter --> Comments[Summary + Inline PR Comments]
```

Every finding ships with evidence and a recommendation, or it does not ship at all.

## Quick start: review every PR with the GitHub Action

Add one workflow file and one secret:

```yaml
name: asyncs review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: alex-bar25/asyncs/apps/action@v1
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          mode: low-noise
          agents: backend,security,architecture,testing
```

Set `OPENAI_API_KEY` in the repository secrets and asyncs reviews every PR from then on. The action provisions its own Bun runtime, so the repository it reviews can be written in any language.

### Action inputs

| Input               | Required | Default        | Description                                                                                  |
| ------------------- | -------- | -------------- | -------------------------------------------------------------------------------------------- |
| `provider`          | no       | `openai`       | Review provider: `openai` or `anthropic`.                                                    |
| `openai-api-key`    | no       | —              | OpenAI API key used when `provider` is `openai`.                                             |
| `anthropic-api-key` | no       | —              | Anthropic API key used when `provider` is `anthropic`.                                       |
| `github-token`      | no       | `github.token` | Token used to post review comments.                                                          |
| `model`             | no       | asyncs default | Model id override.                                                                           |
| `mode`              | no       | `low-noise`    | Review mode: `low-noise`, `full`, `security`, `architecture`, or `testing`.                  |
| `agents`            | no       | mode-based     | Comma-separated agent kinds to run, overriding mode-based routing (e.g. `backend,security`). |

### What gets posted

- One summary comment per PR, updated in place on every push.
- One inline comment per finding, anchored to the changed file and line, recreated on every run so they always match the latest review.
- Findings that cannot be anchored to the diff stay in the summary.

The changed code is read from the checked-out git commit range (`base..head`), which is why the workflow needs `actions/checkout` with `fetch-depth: 0`. Comments are posted through the GitHub pull request review API. Inline anchors must land on lines inside the PR diff hunks; anything outside the diff falls back to the summary.

## Example output

asyncs reviewing its own change set with OpenAI `gpt-5.5` in `low-noise` mode — the coordinator planned the review, specialist agents ran in parallel, and the consensus engine merged their findings. One of the seven findings (a real latent bug it caught in this very change set):

> **Backend — Empty API key options prevent environment fallback** _(medium severity, high confidence — `apps/action/src/action-entry.ts`)_
>
> An empty-string key option is treated as explicit, so `resolveProvider`'s `options.openAIApiKey ?? process.env.OPENAI_API_KEY` never falls back to the environment and throws `MissingApiKeyError` instead. _Recommendation: treat blank key values as absent before resolving._

See [`examples/sample-review.md`](examples/sample-review.md) for the full, unedited run.

## Architecture

| Package                  | Responsibility                                                             |
| ------------------------ | -------------------------------------------------------------------------- |
| `packages/core`          | Domain types, constants, zod schemas, type guards                          |
| `packages/agents`        | Built-in specialist agents, coordinator prompts, structured output schemas |
| `packages/orchestration` | Review planning, parallel execution, retries, timeouts, pipeline engine    |
| `packages/routing`       | Mode-based agent defaults and explicit overrides                           |
| `packages/consensus`     | Deduplication, noise filtering, severity and confidence ranking            |
| `packages/providers`     | Provider interface plus the OpenAI and Anthropic implementations           |
| `packages/formatter`     | Markdown review rendering                                                  |
| `packages/diff`          | Local git diff loading: working tree, staged, commit range                 |
| `apps/action`            | GitHub Action: event parsing, review run, comment posting                  |

## Development

```bash
bun install
bun run check   # typecheck + lint + format check + tests
```

## Principles

- Evidence-based findings only: every comment carries evidence and a recommendation.
- Low noise by default: one strong comment beats five weak ones.
- Provider agnostic: vendor-specific code stays behind a small provider interface.
- Hackable and open source: the engine is a library; the Action is a thin shell around it.

## License

[MIT](LICENSE) © Vlad Alex Barbatescu
