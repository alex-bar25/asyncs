# Sample asyncs review

Real, unedited output from the asyncs pipeline reviewing its own change set, generated with:

```bash
OPENAI_API_KEY=... bun run apps/action/src/smoke.ts 43dbad8 HEAD
```

Provider: OpenAI `gpt-5.5` · Mode: `low-noise`. The coordinator planned the review, specialist agents ran in parallel, and their findings were merged through the consensus engine. In a GitHub Action run the summary below is posted as a PR comment and each anchored finding becomes an inline comment.

> Note: the very first finding is a real latent bug the reviewer caught in this change set — empty-string API keys short-circuiting the environment fallback.

---

# asyncs review

Findings: 7
Deduplicated findings: 0
Suppressed noisy findings: 0

### Backend - Empty API key options prevent environment fallback

Severity: medium
Confidence: high
Location: `apps/action/src/action-entry.ts:41`

Why this matters:
The new key wiring treats an empty string as an explicit API key option. `runActionEntry` forwards `openAIApiKey`/`anthropicApiKey` whenever the environment property is defined, while `resolveProvider` uses nullish coalescing to choose the option before `process.env`. If the action/input layer supplies an empty string for an optional key, the resolver will not fall back to `process.env.OPENAI_API_KEY` or `process.env.ANTHROPIC_API_KEY`; it will throw `MissingApiKeyError` instead. That breaks the intended option-to-environment fallback behavior for API keys.

Evidence:
`action-entry.ts` builds resolve options with `...(env.OPENAI_API_KEY === undefined ? {} : { openAIApiKey: env.OPENAI_API_KEY })` and the same pattern for Anthropic. In `apps/action/src/provider.ts`, `resolveOpenAIProvider` does `const apiKey = options.openAIApiKey ?? process.env.OPENAI_API_KEY;` and then throws when `apiKey.length === 0`; Anthropic uses the same pattern.

Recommendation:
Treat blank key values as absent before passing them into `resolveProvider`, or normalize inside the resolver, e.g. `const apiKey = nonEmpty(options.openAIApiKey) ?? nonEmpty(process.env.OPENAI_API_KEY)`, and apply the same rule for Anthropic.

### Security - README example omits least-privilege GITHUB_TOKEN permissions

Severity: medium
Confidence: high
Location: `README.md:53`

Why this matters:
The usage example relies on the action's default `github-token` (`github.token`) but does not show a `permissions` block. Users copying this workflow will inherit their repository/org default token permissions, which may be broader than the action needs for reading contents and posting PR review comments.

Evidence:
The README workflow snippet shows `- uses: alex-bar25/asyncs/apps/action@v1` with `openai-api-key`, `mode`, and `agents`, but no `permissions:` block. In `apps/action/action.yml`, `github-token` defaults to `${{ github.token }}` and is passed as `GITHUB_TOKEN` to the action.

Recommendation:
Add a least-privilege permissions block to the documented workflow, for example `permissions: { contents: read, pull-requests: write }` (and any additional permission only if required by the comment implementation).

### Testing - Action input-to-resolver mapping is not regression tested

Severity: medium
Confidence: high
Location: `apps/action/src/action-entry.ts:39`

Why this matters:
The provider migration added a new integration seam between the GitHub Action YAML inputs and `resolveProvider`, but the changed tests exercise `resolveProvider` directly rather than the action-entry environment mapping. `action.yml` now maps `inputs.provider`, `inputs.openai-api-key`, and `inputs.anthropic-api-key` into `ASYNCS_PROVIDER_INPUT`, `OPENAI_API_KEY`, and `ANTHROPIC_API_KEY`; `runActionEntry` then translates those raw env values into `resolveOptions`. A regression in this mapping would not be caught by the current provider tests because they call `resolveProvider({ openAIApiKey: "test-key" })` and `resolveProvider({ provider: "anthropic", anthropicApiKey: "test-key" })` directly.

Evidence:
`runActionEntry` builds `resolveOptions` from `ASYNCS_PROVIDER_INPUT`, `OPENAI_API_KEY`, and `ANTHROPIC_API_KEY`, while `apps/action/test/provider.test.ts` only invokes `resolveProvider` directly with already-normalized option names. `apps/action/action.yml` is also changed to provide those env vars from YAML inputs.

Recommendation:
Add an action-entry-level test, or extract and test the env-to-resolver-options helper, covering at least default OpenAI input mapping, explicit `provider: anthropic` with `ANTHROPIC_API_KEY`, empty optional input strings, and model forwarding.

### Testing - OpenAI tests miss empty and incomplete Responses API outputs

Severity: medium
Confidence: high
Location: `packages/providers/src/openai.ts:106`

Why this matters:
The OpenAI provider parser has behavior for missing output that is not covered: `extractOutputText` iterates `response.output` and returns `texts.join("")`, so an empty output, non-message output, or message without `output_text` becomes an empty string. The current tests always create a completed message with one `output_text` item and `incomplete_details: null`; the JSON parse failure test uses a normal text output of `"not json"`, not an empty/incomplete API response. This leaves the provider’s behavior on incomplete Responses API results unpinned.

Evidence:
`fakeOpenAIResponse` in `packages/providers/test/openai.test.ts` always sets `incomplete_details: null`, `error: null`, and `output` to a completed assistant message containing `{ type: "output_text", text: outputText }`; `extractOutputText` in `packages/providers/src/openai.ts` silently returns an empty string when no such content is present.

Recommendation:
Add tests for `response.output: []`, output items without `output_text`, and responses with `incomplete_details` or `error` populated. Assert the intended contract explicitly, preferably that incomplete/empty model responses fail with a diagnostic error rather than being treated as a valid empty result.

### Testing - Provider precedence and error branches are only partially covered

Severity: medium
Confidence: high
Location: `apps/action/test/provider.test.ts:31`

Why this matters:
The resolver tests cover the happy paths for default OpenAI, explicit Anthropic, model precedence, and `ASYNCS_PROVIDER` fallback, but newly added error and precedence branches are not pinned. `provider.ts` introduces `UnknownProviderError`, option-vs-env provider selection, and a separate Anthropic missing-key branch; the supplied test file does not exercise invalid provider input, explicit `options.provider` overriding `ASYNCS_PROVIDER`, or `provider: "anthropic"` without an Anthropic key.

Evidence:
`apps/action/src/provider.ts` throws `UnknownProviderError` from `resolveProviderKind` for unsupported providers and selects `options.provider ?? process.env.ASYNCS_PROVIDER ?? "openai"`. The changed `provider.test.ts` includes tests for missing default OpenAI key, OpenAI default, Anthropic requested, model option/env, and `ASYNCS_PROVIDER` fallback, but no invalid-provider, explicit-provider-over-env, or missing-Anthropic-key test.

Recommendation:
Extend `provider.test.ts` with focused cases for unsupported provider names, explicit provider taking precedence over `ASYNCS_PROVIDER`, and missing API key errors for the Anthropic branch.

### DevOps - CI installs an unpinned Bun version

Severity: medium
Confidence: high
Location: `.github/workflows/ci.yml:16`

Why this matters:
The new CI workflow uses `bun-version: latest`, so every run can pick up a different Bun release. Because the workflow also enforces `bun install --frozen-lockfile` and runs the repository-wide check command, a Bun runtime change could break otherwise unchanged commits or make failures hard to reproduce locally.

Evidence:
`.github/workflows/ci.yml` configures `uses: oven-sh/setup-bun@v2` with `bun-version: latest`, then runs `bun install --frozen-lockfile` and `bun run check`.

Recommendation:
Pin Bun to a specific known-good version, or to a version sourced from a checked-in tool/version file, and update it deliberately in its own PR.

### Security - CI workflow uses mutable third-party action tags

Severity: low
Confidence: high
Location: `.github/workflows/ci.yml:12`

Why this matters:
The new CI workflow executes external actions by version tags rather than immutable commit SHAs. If a referenced tag is moved or the upstream action is compromised, CI will execute unexpected code with the workflow's token context.

Evidence:
`.github/workflows/ci.yml` uses `actions/checkout@v4` and `oven-sh/setup-bun@v2`. These are tag references, not pinned commit SHAs. The workflow does limit `GITHUB_TOKEN` to `contents: read`, which reduces impact but does not provide action-code integrity.

Recommendation:
Pin third-party actions to full commit SHAs, and use Dependabot/Renovate to keep those pins updated.
