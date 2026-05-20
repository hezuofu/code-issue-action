import type { CliArgs, Platform } from "../types";

const USAGE = `
Usage: bun run standalone/entrypoint.ts [options]

Options:
  --platform=<github|gitcode>   Target Git platform (default: github)
  --repo=<owner/repo>           Repository full name (required)
  --issue=<number>              Issue number (tag mode)
  --pr=<number>                 Pull request number (tag mode)
  --token=<string>              Platform access token (required)
  --anthropic-api-key=<key>     Anthropic API key for Claude
  --prompt=<string>             Direct prompt (agent mode, skips issue/PR fetching)
  --trigger-phrase=<string>     Trigger phrase for tag mode (default: @claude)
  --trigger-user=<string>       Username whose comment triggered the run
  --model=<string>              Claude model override
  --verbose                     Show full Claude output
  --claude-args=<string>        Additional Claude CLI arguments
  --server-url=<url>            Override platform web URL
  --api-base-url=<url>          Override platform API base URL
  --help                        Show this help
`;

export function parseArgs(argv: string[]): CliArgs | { help: true } {
  const raw: Record<string, string> = {};

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg === "--verbose") {
      raw["verbose"] = "true";
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 0) {
      const key = arg.slice(0, eq);
      const val = arg.slice(eq + 1);
      raw[key] = val;
    }
  }

  const repo = raw["--repo"];
  if (!repo) {
    console.error("Error: --repo is required");
    console.error(USAGE);
    process.exit(1);
  }

  const platform = (raw["--platform"] ?? "github") as Platform;
  if (platform !== "github" && platform !== "gitcode") {
    console.error("Error: --platform must be 'github' or 'gitcode'");
    process.exit(1);
  }

  const token = raw["--token"];
  if (!token) {
    console.error("Error: --token is required");
    process.exit(1);
  }

  const issueNum = raw["--issue"] ? parseInt(raw["--issue"], 10) : undefined;
  const prNum = raw["--pr"] ? parseInt(raw["--pr"], 10) : undefined;
  const prompt = raw["--prompt"];

  if (!prompt && issueNum === undefined && prNum === undefined) {
    console.error("Error: one of --prompt, --issue, or --pr must be specified");
    console.error(USAGE);
    process.exit(1);
  }

  return {
    platform,
    repo,
    issue: issueNum,
    pr: prNum,
    token,
    anthropicApiKey: raw["--anthropic-api-key"],
    prompt,
    triggerPhrase: raw["--trigger-phrase"] ?? "@claude",
    triggerUser: raw["--trigger-user"],
    model: raw["--model"],
    verbose: raw["verbose"] === "true",
    claudeArgs: raw["--claude-args"],
    includeCommentsByActor: raw["--include-comments-by-actor"],
    excludeCommentsByActor: raw["--exclude-comments-by-actor"],
    serverUrl: raw["--server-url"],
    apiBaseUrl: raw["--api-base-url"],
  };
}
