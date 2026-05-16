# Project Skeleton Design

## Problem Summary

asyncs needs a small, runnable project foundation before review agents, GitHub integration, routing, or consensus logic are added. The first slice should prove that the repository can be installed, type-checked, linted, formatted, tested, and invoked as a CLI while preserving the intended monorepo boundaries from `AGENTS.md`.

## Proposed Flow

The initial developer flow should be:

1. Install dependencies with Bun.
2. Run `bun test` to execute package tests.
3. Run `bun run typecheck` to verify TypeScript.
4. Run `bun run lint` to catch static issues.
5. Run `bun run format:check` to verify formatting.
6. Run the CLI entry locally and see a small help screen.

This first slice does not fetch pull requests, run agents, call AI providers, or post GitHub comments.

## Main Components

### Root Workspace

The root package owns workspace-level scripts and shared tooling configuration:

- `package.json` defines Bun workspaces, project metadata, and common scripts.
- `tsconfig.json` defines shared strict TypeScript defaults.
- `eslint.config.js` defines a flat ESLint config for TypeScript source and tests.
- `.prettierrc.json` defines formatting rules.
- `.prettierignore` excludes generated and dependency directories.
- `README.md` documents the tiny initial dev loop.

### CLI App

`apps/cli` owns the first user-facing executable:

- `apps/cli/package.json` defines the `asyncs` binary entry.
- `apps/cli/src/main.ts` implements a minimal command dispatcher.
- `apps/cli/test/main.test.ts` verifies help output and default behavior.

The CLI should remain intentionally small. It can expose `--help` and `--version`, plus a default help message that makes it clear the review workflow is not implemented yet.

### Core Package

`packages/core` owns shared domain primitives as they appear:

- `packages/core/package.json` defines an internal workspace package.
- `packages/core/src/index.ts` exports initial project metadata.
- `packages/core/test/index.test.ts` verifies that workspace imports work.

This first slice should not define the full review schema yet. The goal is package wiring, not domain modeling.

## API And CLI Shape

The initial CLI should support:

```bash
asyncs --help
asyncs --version
asyncs
```

Expected behavior:

- `--help` prints the project name, a one-line description, and planned command examples.
- `--version` prints the package version.
- Running without arguments prints help and exits successfully.

No network access, GitHub token, config file, or AI provider key should be required.

## Tooling

Use Bun as the runtime, package manager, and test runner.

Use TypeScript with strict checking. Use ESLint for TypeScript linting and Prettier for formatting. Keep the initial toolchain boring and common:

- `typescript`
- `@types/bun`
- `eslint`
- `typescript-eslint`
- `prettier`

Avoid adding Commander, Ink, React, Octokit, AI SDKs, or provider SDKs in this slice. Those dependencies should arrive with the feature that needs them.

## Error Handling And Edge Cases

The CLI should handle unknown arguments by printing a concise error and help text, then exiting with a non-zero status. Tests should cover this behavior without spawning a separate process if the command logic can be tested directly.

The package scripts should be clear and predictable:

- `bun test`
- `bun run typecheck`
- `bun run lint`
- `bun run format:check`
- `bun run check` to run all verification commands in sequence.

## Testing Strategy

Tests should stay close to the first behavior:

- Core package test verifies exported metadata.
- CLI test verifies help output, version output, default behavior, and unknown argument handling.

The first implementation should avoid snapshot-heavy tests. Assertions should check meaningful strings and exit codes.

## Open Questions And Assumptions

Assumption: the root package can be private while the future published packages are decided later.

Assumption: the CLI package name can start as `asyncs` so the binary name is natural.

Assumption: lint and formatting should be part of the first skeleton, but dependency-heavy CLI frameworks should wait until the interactive CLI work begins.

## Out Of Scope

- Interactive Ink UI.
- GitHub authentication.
- Pull request loading.
- Agent definitions.
- Review finding schemas.
- Provider abstraction.
- Plugin loading.
- GitHub Action or GitHub App scaffolds.
