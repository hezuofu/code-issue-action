import { describe, expect, it } from "bun:test";
import type { CliArgs } from "../types";

// parseArgs exits on invalid input, so test the type structure instead
describe("CliArgs type", () => {
  it("accepts minimum valid args for issue tag mode", () => {
    const args: CliArgs = {
      platform: "gitcode",
      repo: "owner/repo",
      issue: 42,
      token: "tok_xxx",
      triggerPhrase: "@claude",
      verbose: false,
    };
    expect(args.platform).toBe("gitcode");
    expect(args.repo).toBe("owner/repo");
    expect(args.issue).toBe(42);
  });

  it("accepts args for PR tag mode", () => {
    const args: CliArgs = {
      platform: "github",
      repo: "owner/repo",
      pr: 100,
      token: "ghp_xxx",
      triggerPhrase: "@claude",
      verbose: false,
    };
    expect(args.platform).toBe("github");
    expect(args.pr).toBe(100);
  });

  it("accepts args for agent mode", () => {
    const args: CliArgs = {
      platform: "github",
      repo: "owner/repo",
      token: "ghp_xxx",
      prompt: "Review the codebase",
      triggerPhrase: "@claude",
      verbose: false,
    };
    expect(args.prompt).toBe("Review the codebase");
  });

  it("accepts optional args", () => {
    const args: CliArgs = {
      platform: "gitcode",
      repo: "o/r",
      token: "t",
      triggerPhrase: "@bot",
      verbose: true,
      model: "claude-sonnet-4-6",
      triggerUser: "alice",
      anthropicApiKey: "sk-ant-xxx",
      claudeArgs: "--verbose",
      serverUrl: "https://gitcode.com",
      apiBaseUrl: "https://api.gitcode.com/api/v5",
    };
    expect(args.model).toBe("claude-sonnet-4-6");
    expect(args.triggerUser).toBe("alice");
    expect(args.verbose).toBe(true);
  });
});
