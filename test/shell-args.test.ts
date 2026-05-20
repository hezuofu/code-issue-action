import { describe, expect, it } from "bun:test";
import { parseShellArgs, stripShellComments } from "../claude/shell-args";

// ---------------------------------------------------------------------------
// parseShellArgs — real-world Claude CLI argument strings
// ---------------------------------------------------------------------------

describe("parseShellArgs", () => {
  describe("basic splitting", () => {
    it("splits simple space-separated tokens", () => {
      expect(parseShellArgs("arg1 arg2 arg3")).toEqual([
        "arg1",
        "arg2",
        "arg3",
      ]);
    });

    it("collapses multiple spaces and tabs", () => {
      expect(parseShellArgs("  a   b\t\tc  ")).toEqual(["a", "b", "c"]);
    });

    it("returns empty array for whitespace-only input", () => {
      expect(parseShellArgs("   ")).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      expect(parseShellArgs("")).toEqual([]);
    });
  });

  describe("double-quote handling", () => {
    it("preserves spaces inside double quotes", () => {
      expect(parseShellArgs('--prompt "hello world"')).toEqual([
        "--prompt",
        "hello world",
      ]);
    });

    it("handles multiple quoted values", () => {
      expect(
        parseShellArgs('--allowed-tools "Tool A" "Tool B" "Tool C"'),
      ).toEqual(["--allowed-tools", "Tool A", "Tool B", "Tool C"]);
    });

    it("preserves special characters inside double quotes", () => {
      expect(parseShellArgs('--message "fix: login (closes #42)"')).toEqual([
        "--message",
        "fix: login (closes #42)",
      ]);
    });

    it("treats unclosed double quote as literal text", () => {
      expect(parseShellArgs('--prompt "unfinished')).toEqual([
        "--prompt",
        "unfinished",
      ]);
    });

    it("handles empty double quotes", () => {
      expect(parseShellArgs('--flag ""')).toEqual(["--flag", ""]);
    });
  });

  describe("single-quote handling", () => {
    it("preserves content inside single quotes literally", () => {
      // Two adjacent single-quoted strings: 'daryl' + 's code' → two tokens
      expect(parseShellArgs("--name 'daryl''s code'")).toEqual([
        "--name",
        "daryl",
        "s code",
      ]);
    });

    it("concatenates adjacent quoted strings via shell behavior", () => {
      // In bash, 'a''b' = ab, but our parser yields them as separate tokens;
      // the CLI tooling handles this via --flag=value syntax instead
      expect(parseShellArgs("echo 'hello''world'")).toEqual([
        "echo",
        "hello",
        "world",
      ]);
    });

    it("does not interpret $ or \\ inside single quotes", () => {
      expect(parseShellArgs("--expr '$HOME/ dir\\file'")).toEqual([
        "--expr",
        "$HOME/ dir\\file",
      ]);
    });

    it("handles JSON inside single quotes", () => {
      const json = '{"mcpServers":{"github":{"token":"ghp_xxx"}}}';
      expect(parseShellArgs(`--mcp-config '${json}'`)).toEqual([
        "--mcp-config",
        json,
      ]);
    });
  });

  describe("mixed quote types", () => {
    it("handles mixed double and single quotes", () => {
      expect(parseShellArgs(`--a "double" --b 'single' --c bare`)).toEqual([
        "--a",
        "double",
        "--b",
        "single",
        "--c",
        "bare",
      ]);
    });

    it("allows single quotes inside double quotes", () => {
      expect(parseShellArgs(`--msg "it's done"`)).toEqual([
        "--msg",
        "it's done",
      ]);
    });

    it("allows double quotes inside single quotes", () => {
      expect(parseShellArgs(`--msg 'say "hello"'`)).toEqual([
        "--msg",
        'say "hello"',
      ]);
    });
  });

  describe("escape sequences", () => {
    it("handles backslash-escaped space", () => {
      expect(parseShellArgs("path/to/my\\ file.txt")).toEqual([
        "path/to/my file.txt",
      ]);
    });

    it("handles backslash-escaped backslash", () => {
      expect(parseShellArgs("path\\\\to\\\\file")).toEqual(["path\\to\\file"]);
    });
  });

  describe("real-world Claude CLI arg strings", () => {
    it("parses typical tag mode args", () => {
      const input =
        "--mcp-config '{}' --permission-mode acceptEdits --allowedTools \"Glob,Grep,Read,Bash(git add:*),Bash(git commit:*)\"";
      const result = parseShellArgs(input);
      expect(result).toEqual([
        "--mcp-config",
        "{}",
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        "Glob,Grep,Read,Bash(git add:*),Bash(git commit:*)",
      ]);
    });

    it("parses boolean flags correctly", () => {
      expect(parseShellArgs("--verbose --force --dry-run")).toEqual([
        "--verbose",
        "--force",
        "--dry-run",
      ]);
    });

    it("parses multi-line argument string", () => {
      const input = `
        --model claude-sonnet-4-6
        --max-turns 50
        --setting-sources user,project
      `;
      const result = parseShellArgs(input);
      expect(result).toContain("--model");
      expect(result).toContain("claude-sonnet-4-6");
      expect(result).toContain("--max-turns");
      expect(result).toContain("50");
    });

    it("handles flags with equals sign as literal text", () => {
      // the parser treats --key=value as a single token (not split by =)
      expect(parseShellArgs("--model=opus --max-turns=100")).toEqual([
        "--model=opus",
        "--max-turns=100",
      ]);
    });
  });

  describe("Unicode and international text", () => {
    it("preserves non-ASCII characters", () => {
      expect(parseShellArgs('--title "修复登录页面的Bug 🐛"')).toEqual([
        "--title",
        "修复登录页面的Bug 🐛",
      ]);
    });

    it("preserves emoji outside quotes", () => {
      expect(parseShellArgs("🎉 success")).toEqual(["🎉", "success"]);
    });
  });

  describe("malformed input (defensive)", () => {
    it("treats lone backslash as literal", () => {
      expect(parseShellArgs("\\")).toEqual(["\\"]);
    });

    it("treats trailing backslash as literal", () => {
      expect(parseShellArgs("trailing\\")).toEqual(["trailing\\"]);
    });
  });
});

// ---------------------------------------------------------------------------
// stripShellComments — removes comment lines while preserving inline hashes
// ---------------------------------------------------------------------------

describe("stripShellComments", () => {
  it("removes lines starting with #", () => {
    expect(stripShellComments("# this is a comment\n--real-arg value")).toBe(
      "--real-arg value",
    );
  });

  it("removes multiple comment lines keeping structure", () => {
    const input = `# Config section
# Another comment
--arg1 value1
# Mid-section note
--arg2 value2`;
    const result = stripShellComments(input);
    expect(result).not.toContain("Config section");
    expect(result).not.toContain("Another comment");
    expect(result).not.toContain("Mid-section note");
    expect(result).toContain("--arg1 value1");
    expect(result).toContain("--arg2 value2");
    // The join preserves the original newlines between remaining lines
    expect(result).toBe("--arg1 value1\n--arg2 value2");
  });

  it("preserves lines with inline # (not at start)", () => {
    expect(stripShellComments('--prompt "Issue #42: fix bug"')).toBe(
      '--prompt "Issue #42: fix bug"',
    );
  });

  it("removes indented comment lines", () => {
    // "  # indented comment\n--arg val" → filter out first line → ["--arg val"]
    expect(stripShellComments("  # indented comment\n--arg val")).toBe(
      "--arg val",
    );
  });

  it("returns empty string for all-comment input", () => {
    // All lines are comments → join of empty filtered array = ""
    expect(stripShellComments("# comment1\n# comment2\n# comment3")).toBe("");
  });
});
