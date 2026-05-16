# Project Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Bun/TypeScript workspace for asyncs with a minimal CLI, core package, tests, type checking, linting, and formatting.

**Architecture:** The root package owns shared tooling and workspace scripts. `apps/cli` owns the `asyncs` executable and delegates basic command rendering to testable functions. `packages/core` owns shared project metadata for now, leaving review domain models for a later slice.

**Tech Stack:** Bun, TypeScript, Bun test, ESLint flat config, typescript-eslint, Prettier.

---

## File Structure

- Create `package.json`: root workspace metadata, scripts, dev dependencies, Bun workspaces.
- Create `tsconfig.json`: strict shared TypeScript settings across apps and packages.
- Create `eslint.config.js`: flat ESLint config for TypeScript source and test files.
- Create `.prettierrc.json`: shared formatting settings.
- Create `.prettierignore`: ignores dependencies, build outputs, and generated files.
- Modify `.gitignore`: keep local ignores and add standard generated directories while allowing committed docs.
- Create `README.md`: initial project overview and development commands.
- Create `apps/cli/package.json`: CLI package with `asyncs` bin entry.
- Create `apps/cli/src/main.ts`: testable CLI dispatcher and executable entrypoint.
- Create `apps/cli/test/main.test.ts`: CLI behavior tests.
- Create `packages/core/package.json`: internal core package metadata.
- Create `packages/core/src/index.ts`: initial shared metadata exports.
- Create `packages/core/test/index.test.ts`: workspace import tests.

---

### Task 1: Root Tooling And Workspace

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Modify: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Add root workspace metadata and scripts**

Create `package.json`:

```json
{
  "name": "asyncs-workspace",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "check": "bun run typecheck && bun run lint && bun run format:check && bun test",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@eslint/js": "^9.27.0",
    "@types/bun": "^1.2.15",
    "eslint": "^9.27.0",
    "prettier": "^3.5.3",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.32.1"
  }
}
```

- [ ] **Step 2: Add strict TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "Bundler",
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2023",
    "types": ["bun"]
  },
  "include": ["apps/**/*.ts", "packages/**/*.ts"],
  "exclude": ["node_modules", "dist", "coverage"]
}
```

- [ ] **Step 3: Add ESLint flat config**

Create `eslint.config.js`:

```js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules", "dist", "coverage", "bun.lock"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
    },
  },
);
```

- [ ] **Step 4: Add Prettier config**

Create `.prettierrc.json`:

```json
{
  "printWidth": 80,
  "semi": true,
  "trailingComma": "all"
}
```

Create `.prettierignore`:

```txt
node_modules
dist
coverage
bun.lock
```

- [ ] **Step 5: Update git ignores**

Replace `.gitignore` with:

```txt
.DS_Store
.env
.env.*
!.env.example

node_modules/
dist/
coverage/
```

- [ ] **Step 6: Add initial README**

Create `README.md`:

````md
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
````

- [ ] **Step 7: Install dependencies**

Run:

```bash
bun install
```

Expected: `bun.lock` is created and dependencies install successfully.

- [ ] **Step 8: Run formatting**

Run:

```bash
bun run format
```

Expected: Prettier formats the new JSON, Markdown, TypeScript, and JavaScript files.

- [ ] **Step 9: Commit root tooling**

```bash
git add package.json tsconfig.json eslint.config.js .prettierrc.json .prettierignore .gitignore README.md bun.lock
git commit -m "chore: scaffold workspace tooling"
```

---

### Task 2: Core Package

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/test/index.test.ts`

- [ ] **Step 1: Add failing core package test**

Create `packages/core/test/index.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ASYNCS_DESCRIPTION, ASYNCS_PACKAGE_NAME } from "../src/index";

describe("core metadata", () => {
  test("exports asyncs project metadata", () => {
    expect(ASYNCS_PACKAGE_NAME).toBe("asyncs");
    expect(ASYNCS_DESCRIPTION).toContain("sub-agent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/core/test/index.test.ts
```

Expected: FAIL because `packages/core/src/index.ts` does not exist.

- [ ] **Step 3: Add core package metadata**

Create `packages/core/package.json`:

```json
{
  "name": "@asyncs/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

Create `packages/core/src/index.ts`:

```ts
export const ASYNCS_PACKAGE_NAME = "asyncs";

export const ASYNCS_DESCRIPTION =
  "Open-source sub-agent driven AI PR review harness.";
```

- [ ] **Step 4: Run core test to verify it passes**

Run:

```bash
bun test packages/core/test/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run root checks for this slice**

Run:

```bash
bun run typecheck
bun run lint
bun run format:check
```

Expected: all commands pass.

- [ ] **Step 6: Commit core package**

```bash
git add packages/core/package.json packages/core/src/index.ts packages/core/test/index.test.ts
git commit -m "feat: add core workspace package"
```

---

### Task 3: CLI Package

**Files:**

- Create: `apps/cli/package.json`
- Create: `apps/cli/src/main.ts`
- Create: `apps/cli/test/main.test.ts`

- [ ] **Step 1: Add failing CLI behavior tests**

Create `apps/cli/test/main.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { runCli } from "../src/main";

describe("runCli", () => {
  test("prints help when no arguments are provided", () => {
    const result = runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("asyncs");
    expect(result.stdout).toContain("sub-agent driven AI PR review harness");
  });

  test("prints help for --help", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("asyncs pr review 3213");
  });

  test("prints version for --version", () => {
    const result = runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("0.1.0");
  });

  test("rejects unknown arguments", () => {
    const result = runCli(["--wat"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown argument: --wat");
    expect(result.stdout).toContain("Usage:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/cli/test/main.test.ts
```

Expected: FAIL because `apps/cli/src/main.ts` does not exist.

- [ ] **Step 3: Add CLI package metadata**

Create `apps/cli/package.json`:

```json
{
  "name": "asyncs",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "asyncs": "./src/main.ts"
  },
  "dependencies": {
    "@asyncs/core": "workspace:*"
  }
}
```

- [ ] **Step 4: Add minimal CLI implementation**

Create `apps/cli/src/main.ts`:

```ts
#!/usr/bin/env bun

import { ASYNCS_DESCRIPTION, ASYNCS_PACKAGE_NAME } from "@asyncs/core";

const VERSION = "0.1.0";

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export function runCli(args: readonly string[]): CliResult {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return {
      exitCode: 0,
      stdout: renderHelp(),
      stderr: "",
    };
  }

  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    return {
      exitCode: 0,
      stdout: `${VERSION}\n`,
      stderr: "",
    };
  }

  const unknownArgument = args[0] ?? "";

  return {
    exitCode: 1,
    stdout: renderHelp(),
    stderr: `Unknown argument: ${unknownArgument}\n`,
  };
}

function renderHelp(): string {
  return `${ASYNCS_PACKAGE_NAME}
${ASYNCS_DESCRIPTION}

Usage:
  asyncs
  asyncs --help
  asyncs --version

Planned commands:
  asyncs pr review 3213
  asyncs pr review 3213 --agents backend,security
  asyncs pr review 3213 --mode low-noise
`;
}

if (import.meta.main) {
  const result = runCli(Bun.argv.slice(2));

  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  process.exit(result.exitCode);
}
```

- [ ] **Step 5: Run CLI tests to verify they pass**

Run:

```bash
bun test apps/cli/test/main.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the CLI manually**

Run:

```bash
bun apps/cli/src/main.ts --help
bun apps/cli/src/main.ts --version
```

Expected: first command prints help; second prints `0.1.0`.

- [ ] **Step 7: Run root checks**

Run:

```bash
bun run check
```

Expected: typecheck, lint, format check, and tests all pass.

- [ ] **Step 8: Commit CLI package**

```bash
git add apps/cli/package.json apps/cli/src/main.ts apps/cli/test/main.test.ts
git commit -m "feat: add minimal asyncs cli"
```

---

### Task 4: Final Skeleton Verification

**Files:**

- Modify only files required by verification fixes.

- [ ] **Step 1: Inspect final status**

Run:

```bash
git status --short
```

Expected: only intentional uncommitted files remain. If verification changed formatting, inspect and commit those changes.

- [ ] **Step 2: Run complete verification**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Confirm CLI entry still works**

Run:

```bash
bun apps/cli/src/main.ts --help
```

Expected: output includes `asyncs`, `Usage:`, and `asyncs pr review 3213`.

- [ ] **Step 4: Commit final fixes if needed**

No final commit is expected for this task if Tasks 1-3 were committed cleanly.
If Step 1 shows only formatting changes to known skeleton files, inspect them:

```bash
git diff
```

Then stage the concrete files listed by `git status --short` and commit them with:

```bash
git commit -m "chore: verify project skeleton"
```

If Step 1 is clean, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: covers root workspace, CLI app, core package, TypeScript, ESLint, Prettier, Bun tests, and combined checks.
- Scope check: excludes review schemas, GitHub integration, agents, provider SDKs, plugins, GitHub Action, and interactive UI.
- Type consistency: CLI tests call `runCli`, implementation exports `runCli`, and `CliResult` fields match the test assertions.
