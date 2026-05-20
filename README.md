# ClaudeLoop

A self-contained CLI tool that lets [Claude Code](https://claude.ai/code) respond to `@claude` mentions on GitHub and GitCode — no GitHub Actions required.

## How It Works

```
User comments @claude on an Issue/PR
        │
        ▼
┌─ Watch ──────────────────────────────────────┐
│  Detect trigger phrase in comments/body       │
└──────────────────────────────────────────────┘
        │
        ▼
┌─ Think ──────────────────────────────────────┐
│  Fetch full context (issue, comments,         │
│  reviews, changed files)                      │
│  Build structured prompt with trigger         │
│  isolation                                     │
│  Run Claude Agent SDK                         │
└──────────────────────────────────────────────┘
        │
        ▼
┌─ Act ────────────────────────────────────────┐
│  Claude edits files, runs tests               │
│  git add → git commit → git push              │
│  (secure wrapper, no flag injection)          │
└──────────────────────────────────────────────┘
        │
        ▼
┌─ Report ─────────────────────────────────────┐
│  Claude's analysis posted back to the         │
│  tracking comment                              │
└──────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- An Anthropic API key (or Bedrock / Vertex / Foundry credentials)
- A Git platform access token (GitHub PAT or GitCode private token)
- Git installed and configured

### Install

```bash
# Copy standalone/ to wherever you want
cp -r standalone /opt/claude-loop
cd /opt/claude-loop

# Install the one dependency
bun install
```

### Run

```bash
# Tag mode — respond to @claude on an issue
bun run entrypoint.ts \
  --platform=gitcode \
  --repo=myteam/backend \
  --issue=42 \
  --token=<gitcode-token> \
  --anthropic-api-key=sk-ant-xxx

# Tag mode — respond on a PR
bun run entrypoint.ts \
  --platform=github \
  --repo=myorg/myrepo \
  --pr=100 \
  --token=ghp_xxx \
  --anthropic-api-key=sk-ant-xxx

# Agent mode — run Claude with a direct prompt
bun run entrypoint.ts \
  --platform=github \
  --repo=myorg/myrepo \
  --prompt="Review error handling in all services" \
  --token=ghp_xxx \
  --anthropic-api-key=sk-ant-xxx
```

## Modes

### Tag Mode

Pass `--issue=N` or `--pr=N` to run in tag mode. The tool:

1. Fetches the entity + all comments + reviews + changed files
2. Checks for the trigger phrase (default `@claude`)
3. Creates a tracking comment ("Claude is analyzing...")
4. Builds a prompt isolating the trigger comment from other context
5. Runs Claude with full file-editing and git capabilities
6. Posts Claude's response back to the tracking comment

### Agent Mode

Pass `--prompt="..."` to run in agent mode. Claude gets your prompt directly with repository context.

## CLI Reference

### Required

| Flag                         | Description                         |
| ---------------------------- | ----------------------------------- |
| `--platform=github\|gitcode` | Target platform (default: `github`) |
| `--repo=owner/repo`          | Repository full name                |
| `--token=<string>`           | Platform access token               |
| `--anthropic-api-key=<key>`  | Anthropic API key                   |

One of `--issue`, `--pr`, or `--prompt` is required.

### Optional

| Flag                          | Default   | Description                             |
| ----------------------------- | --------- | --------------------------------------- |
| `--trigger-phrase`            | `@claude` | Trigger phrase to detect in comments    |
| `--trigger-user`              | —         | Only consider comments from this user   |
| `--model`                     | —         | Claude model (e.g. `claude-sonnet-4-6`) |
| `--verbose`                   | `false`   | Show full Claude execution output       |
| `--claude-args`               | —         | Additional Claude CLI arguments         |
| `--include-comments-by-actor` | —         | Comma-separated usernames to include    |
| `--exclude-comments-by-actor` | —         | Comma-separated usernames to exclude    |
| `--server-url`                | auto      | Override platform web URL               |
| `--api-base-url`              | auto      | Override API base URL                   |

## Platform Tokens

### GitHub

[Personal Access Token](https://github.com/settings/tokens) with:

- `repo` (for private repos) or `public_repo`
- `issues: read/write`

### GitCode

[Private Token](https://gitcode.com/-/profile/account) with:

- `issues` read/write
- `pulls` read/write

## Architecture

```
entrypoint.ts          CLI entry, arg parsing
    │
cli/runner.ts           Orchestrator: configure git, fetch data,
    │                   build prompt, run Claude, update comment
    ├── registry.ts     Adapter factory (createAdapter)
    ├── cli/prompt.ts   Prompt builder (formatters + template)
    └── cli/args.ts     CLI argument parser
    │
adapter.ts              PlatformAdapter interface
    ├── github/         GitHub adapter (REST via native fetch)
    └── gitcode/        GitCode adapter (v5 REST API)
    │
claude/                 Claude execution runtime
    ├── run-claude.ts   Entry point
    ├── run-claude-sdk.ts  Agent SDK stream processor
    ├── parse-sdk-options.ts  SDK option builder
    ├── validate-env.ts AI provider env validation
    ├── prepare-prompt.ts    Prompt file preparation
    ├── execution-file.ts    Execution output writer
    ├── retry.ts        Exponential backoff
    ├── sanitizer.ts    Content sanitization
    └── shell-args.ts   Shell argument parser
```

## Security

- **git-push wrapper**: Only `origin <ref>`, rejects all flags (prevents `--receive-pack` RCE)
- **Content sanitization**: Strips HTML comments, invisible characters (zero-width, bidi overrides), hidden attributes, and redacts API tokens
- **Trigger isolation**: Trigger comment is extracted and placed in its own `<trigger_comment>` tag so Claude only acts on that instruction
- **Token redaction**: GitHub PATs and Anthropic API keys are automatically redacted from comment bodies
- **Retry with backoff**: API calls retry on network errors, rate limits, and 5xx responses

## Limitations (v1)

- No MCP servers — Claude's full output is posted after completion, not streamed
- No image downloading from comments
- No branch creation — works on the current branch (issues) or PR head ref (PRs)
- No SSH/API commit signing
- CLI-triggered only — no webhook receiver

## Test Suite

```bash
bun test
# 127 tests, 0 failures, 236 assertions
```

## Dependencies

Exactly 1: `@anthropic-ai/claude-agent-sdk`

Everything else — GitHub REST client, shell argument parser, content sanitizer, retry logic — is implemented in the module.
