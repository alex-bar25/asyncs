# asyncs

Open-source sub-agent driven AI PR review harness.

asyncs is starting as a Bun/TypeScript CLI and package workspace. The first
milestone is a small runnable skeleton before the review engine, GitHub
integration, provider abstraction, and plugin system are added.

## Development

Install dependencies:

```bash
bun install
```

Run all checks:

```bash
bun run check
```

Run the CLI locally:

```bash
bun apps/cli/src/main.ts --help
```
