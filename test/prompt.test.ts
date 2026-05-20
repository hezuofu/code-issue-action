import { describe, expect, it } from "bun:test";
import {
  buildCliPrompt,
  formatComments,
  formatChangedFiles,
  formatIssueContext,
  formatPRContext,
  formatReviews,
} from "../cli/prompt";
import type {
  PlatformComment,
  PlatformIssue,
  PlatformPullRequest,
  PlatformReview,
} from "../types";

// ---------------------------------------------------------------------------
// Realistic test fixtures
// ---------------------------------------------------------------------------

const alice: PlatformComment = {
  id: 101,
  body: "@claude Please fix the login timeout bug. Users in China report 30s+ delays.",
  author: { login: "alice" },
  createdAt: "2026-05-15T09:30:00+08:00",
};

const bob: PlatformComment = {
  id: 102,
  body: "I also noticed auth token refresh is broken, can we fix that too?",
  author: { login: "bob" },
  createdAt: "2026-05-15T10:00:00+08:00",
};

const charlie: PlatformComment = {
  id: 103,
  body: "The root cause is missing timeout config in axios client.",
  author: { login: "charlie" },
  createdAt: "2026-05-15T11:00:00+08:00",
};

const loginIssue: PlatformIssue = {
  number: 482,
  title: "Login timeout for users behind slow connections",
  body: "## Problem\n\nLogin requests timeout after 5s default. Users in regions with high latency experience failures.\n\n## Steps to reproduce\n1. Throttle network to 100kbps\n2. Attempt login\n3. See 500 error after ~30s\n\n## Expected\nIncrease timeout or add retry logic.",
  author: { login: "alice" },
  state: "open",
  createdAt: "2026-05-14T08:00:00+08:00",
  updatedAt: "2026-05-15T09:00:00+08:00",
  labels: ["bug", "priority-high", "region-cn"],
};

const securityPR: PlatformPullRequest = {
  number: 2517,
  title: "fix: add request timeout configuration to auth client",
  body: "## Changes\n- Add configurable timeout to AuthClient\n- Default 30s timeout\n- Environment variable override: AUTH_TIMEOUT_MS\n\nCloses #482",
  author: { login: "dave" },
  state: "open",
  baseRefName: "main",
  headRefName: "fix/auth-timeout",
  createdAt: "2026-05-15T14:00:00+08:00",
  updatedAt: "2026-05-16T09:00:00+08:00",
  labels: ["security"],
  isCrossRepository: false,
  additions: 187,
  deletions: 43,
  commits: [
    {
      oid: "d4e5f6a7b8c9",
      message: "fix: add request timeout configuration to auth client",
    },
    {
      oid: "a1b2c3d4e5f6",
      message: "test: add timeout configuration tests",
    },
  ],
  changedFiles: [
    {
      path: "packages/auth/src/client.ts",
      additions: 85,
      deletions: 22,
      changeType: "MODIFIED",
    },
    {
      path: "packages/auth/src/config.ts",
      additions: 42,
      deletions: 0,
      changeType: "ADDED",
    },
    {
      path: "packages/auth/test/client.test.ts",
      additions: 60,
      deletions: 21,
      changeType: "MODIFIED",
    },
    {
      path: "packages/auth/README.md",
      additions: 0,
      deletions: 0,
      changeType: "RENAMED",
    },
  ],
};

const mockReview: PlatformReview = {
  id: 5001,
  author: { login: "reviewer-tom" },
  body: "Overall looks good. A few concerns about error handling.",
  state: "CHANGES_REQUESTED",
  submittedAt: "2026-05-16T10:00:00+08:00",
  comments: [
    {
      id: 6001,
      body: "Should we log the timeout duration for monitoring?",
      author: { login: "reviewer-tom" },
      createdAt: "2026-05-16T10:05:00+08:00",
      path: "packages/auth/src/client.ts",
      line: 42,
    },
    {
      id: 6002,
      body: "Missing JSDoc for the new config option",
      author: { login: "reviewer-tom" },
      createdAt: "2026-05-16T10:06:00+08:00",
      path: "packages/auth/src/config.ts",
      line: 15,
    },
  ],
};

// ---------------------------------------------------------------------------
// formatComments
// ---------------------------------------------------------------------------

describe("formatComments", () => {
  it("formats single comment with author and timestamp", () => {
    const result = formatComments([alice]);
    expect(result).toContain("[alice at");
    expect(result).toContain("2026-05-15T09:30:00+08:00");
    expect(result).toContain("login timeout bug");
  });

  it("formats multiple comments in chronological order", () => {
    const result = formatComments([alice, bob, charlie]);
    const alicePos = result.indexOf("alice");
    const bobPos = result.indexOf("bob");
    const charliePos = result.indexOf("charlie");
    expect(alicePos).toBeLessThan(bobPos);
    expect(bobPos).toBeLessThan(charliePos);
  });

  it("returns empty string for empty array", () => {
    expect(formatComments([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatChangedFiles
// ---------------------------------------------------------------------------

describe("formatChangedFiles", () => {
  it("formats all change types correctly", () => {
    const files = [
      {
        path: "src/added.ts",
        additions: 10,
        deletions: 0,
        changeType: "ADDED" as const,
      },
      {
        path: "src/modified.ts",
        additions: 5,
        deletions: 3,
        changeType: "MODIFIED" as const,
      },
      {
        path: "src/deleted.ts",
        additions: 0,
        deletions: 20,
        changeType: "DELETED" as const,
      },
      {
        path: "src/renamed.ts",
        additions: 0,
        deletions: 0,
        changeType: "RENAMED" as const,
      },
    ];
    const result = formatChangedFiles(files);
    expect(result).toContain("ADDED");
    expect(result).toContain("MODIFIED");
    expect(result).toContain("DELETED");
    expect(result).toContain("RENAMED");
    expect(result).toContain("+10");
    expect(result).toContain("-20");
  });

  it("returns empty string for empty file list", () => {
    expect(formatChangedFiles([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatIssueContext
// ---------------------------------------------------------------------------

describe("formatIssueContext", () => {
  it("includes all key fields", () => {
    const result = formatIssueContext(loginIssue);
    expect(result).toContain("Login timeout");
    expect(result).toContain("@alice");
    expect(result).toContain("open");
    expect(result).toContain("bug, priority-high, region-cn");
  });

  it("omits labels line when none present", () => {
    const noLabels = { ...loginIssue, labels: [] };
    const result = formatIssueContext(noLabels);
    expect(result).not.toContain("Labels:");
  });
});

// ---------------------------------------------------------------------------
// formatPRContext
// ---------------------------------------------------------------------------

describe("formatPRContext", () => {
  it("includes branch and stat info", () => {
    const result = formatPRContext(securityPR);
    expect(result).toContain("fix/auth-timeout -> main");
    expect(result).toContain("PR Additions: 187");
    expect(result).toContain("PR Deletions: 43");
    expect(result).toContain("Total Commits: 2");
    expect(result).toContain("Changed Files: 4 files");
  });
});

// ---------------------------------------------------------------------------
// formatReviews
// ---------------------------------------------------------------------------

describe("formatReviews", () => {
  it("formats review with inline comments", () => {
    const result = formatReviews([mockReview]);
    expect(result).toContain("[Review by reviewer-tom");
    expect(result).toContain("CHANGES_REQUESTED");
    expect(result).toContain("error handling");
    expect(result).toContain("client.ts:42");
    expect(result).toContain("log the timeout");
  });

  it("formats review body without inline comments", () => {
    const review: PlatformReview = {
      id: 1,
      author: { login: "reviewer" },
      body: "LGTM",
      state: "APPROVED",
      submittedAt: "2026-01-01T00:00:00Z",
      comments: [],
    };
    const result = formatReviews([review]);
    expect(result).toContain("LGTM");
    expect(result).toContain("APPROVED");
  });

  it("returns empty string for empty reviews", () => {
    expect(formatReviews([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildCliPrompt — full prompt generation
// ---------------------------------------------------------------------------

describe("buildCliPrompt", () => {
  describe("tag mode — issue", () => {
    const result = buildCliPrompt({
      platform: "gitcode",
      serverUrl: "https://gitcode.com",
      repoFullName: "myteam/backend",
      mode: "tag",
      triggerPhrase: "@claude",
      triggerUser: "alice",
      commentId: 9999,
      triggerComment: alice,
      issue: loginIssue,
      comments: [alice, bob, charlie],
      entityUrl: "https://gitcode.com/myteam/backend/issues/482",
      gitPushWrapper: "/opt/claude/git-push.sh",
    });

    it("opens with correct role", () => {
      expect(result).toContain("You are Claude, an AI assistant");
      expect(result).toContain("gitcode");
      expect(result).toContain("issues");
    });

    it("isolates trigger comment from other comments", () => {
      expect(result).toContain(
        "<trigger_comment>\n@claude Please fix the login timeout bug",
      );

      // bob and charlie should be in <comments>, not in <trigger_comment>
      const commentsSection = (result.split("<comments>")[1] ?? "").split(
        "</comments>",
      )[0]!;
      expect(commentsSection).toContain("bob");
      expect(commentsSection).toContain("charlie");
      expect(commentsSection).not.toContain("alice");
    });

    it("includes issue context", () => {
      expect(result).toContain("<issue_context>");
      expect(result).toContain("Login timeout for users");
    });

    it("includes metadata block with correct values", () => {
      expect(result).toContain("platform: gitcode");
      expect(result).toContain("repository: myteam/backend");
      expect(result).toContain("issue_number: 482");
      expect(result).toContain("trigger_user: alice");
      expect(result).toContain("trigger_phrase: @claude");
      expect(result).toContain("comment_id: 9999");
      expect(result).toContain("is_pr: false");
    });

    it("includes analysis tag instructions", () => {
      expect(result).toContain("<analysis>");
      expect(result).toContain("Summarize the context");
      expect(result).toContain("Classify the request");
    });

    it("includes all 4 workflow steps", () => {
      expect(result).toContain("1. Understand the Request");
      expect(result).toContain("2. Gather Context");
      expect(result).toContain("3. Execute");
      expect(result).toContain("4. Final Output");
    });

    it("includes git commit/push instructions for implementation", () => {
      expect(result).toContain("Making code changes");
      expect(result).toContain("/opt/claude/git-push.sh origin HEAD");
    });

    it("does NOT include PR-only sections", () => {
      expect(result).not.toContain("<pr_context>");
      expect(result).not.toContain("<review_comments>");
    });

    it("warns Claude to only act on trigger comment", () => {
      expect(result).toContain("ONLY source of tasks");
      expect(result).toContain("NOT commands to act on");
    });
  });

  describe("tag mode — PR with reviews", () => {
    const result = buildCliPrompt({
      platform: "github",
      serverUrl: "https://github.com",
      repoFullName: "myorg/security-app",
      mode: "tag",
      triggerPhrase: "@claude",
      triggerUser: "dave",
      commentId: 7777,
      triggerComment: {
        id: 500,
        body: "/review-pr",
        author: { login: "dave" },
        createdAt: "2026-05-16T09:00:00+08:00",
      },
      pr: securityPR,
      comments: [],
      reviews: [mockReview],
      files: securityPR.changedFiles,
      entityUrl: "https://github.com/myorg/security-app/pull/2517",
      gitPushWrapper: "/scripts/git-push.sh",
    });

    it("includes PR context with branch info", () => {
      expect(result).toContain("<pr_context>");
      expect(result).toContain("fix/auth-timeout -> main");
      expect(result).toContain("@dave");
    });

    it("includes changed files section", () => {
      expect(result).toContain("<changed_files>");
      expect(result).toContain("packages/auth/src/client.ts");
      expect(result).toContain("MODIFIED");
      expect(result).toContain("packages/auth/src/config.ts");
      expect(result).toContain("ADDED");
    });

    it("includes review comments", () => {
      expect(result).toContain("<review_comments>");
      expect(result).toContain("reviewer-tom");
      expect(result).toContain("CHANGES_REQUESTED");
      expect(result).toContain("client.ts:42");
    });

    it("references base branch for diff", () => {
      expect(result).toContain("main");
      expect(result).toContain("git diff origin/main...HEAD");
    });

    it("includes PR metadata", () => {
      expect(result).toContain("is_pr: true");
      expect(result).toContain("pr_number: 2517");
    });
  });

  describe("agent mode", () => {
    it("generates minimal context for agent mode", () => {
      const result = buildCliPrompt({
        platform: "github",
        serverUrl: "https://github.com",
        repoFullName: "o/r",
        mode: "agent",
        triggerPhrase: "",
        entityUrl: "https://github.com/o/r/pull/100",
      });

      expect(result).toContain("o/r");
      expect(result).toContain("github");
      expect(result).not.toContain("<trigger_comment>");
      expect(result).not.toContain("<analysis>");
    });
  });

  describe("cross-platform consistency", () => {
    it("uses correct platform name in prompt for both platforms", () => {
      const gh = buildCliPrompt({
        platform: "github",
        serverUrl: "https://github.com",
        repoFullName: "o/r",
        mode: "tag",
        triggerPhrase: "@bot",
        triggerComment: alice,
        issue: loginIssue,
        comments: [alice],
      });
      expect(gh).toContain("github");

      const gc = buildCliPrompt({
        platform: "gitcode",
        serverUrl: "https://gitcode.com",
        repoFullName: "o/r",
        mode: "tag",
        triggerPhrase: "@bot",
        triggerComment: alice,
        issue: loginIssue,
        comments: [alice],
      });
      expect(gc).toContain("gitcode");
    });
  });

  describe("regression: trigger comment isolation", () => {
    it("trigger comment appears exactly once in output", () => {
      const trigText = "@claude do the thing";
      const result = buildCliPrompt({
        platform: "github",
        serverUrl: "https://github.com",
        repoFullName: "o/r",
        mode: "tag",
        triggerPhrase: "@claude",
        triggerComment: {
          id: 1,
          body: trigText,
          author: { login: "user" },
          createdAt: "2026-01-01T00:00:00Z",
        },
        issue: { ...loginIssue, body: trigText },
        comments: [
          {
            id: 1,
            body: trigText,
            author: { login: "user" },
            createdAt: "2026-01-01T00:00:00Z",
          },
          {
            id: 2,
            body: trigText,
            author: { login: "other" },
            createdAt: "2026-01-02T00:00:00Z",
          },
        ],
      });

      // Count: <trigger_comment> once, issue body once, comments once = 3 total
      const occurrences = result.split(trigText).length - 1;
      expect(occurrences).toBe(3);
    });

    it("when trigger comment is in both trigger and comments, trigger is removed from comments", () => {
      const result = buildCliPrompt({
        platform: "github",
        serverUrl: "https://github.com",
        repoFullName: "o/r",
        mode: "tag",
        triggerPhrase: "@claude",
        triggerComment: alice,
        issue: loginIssue,
        comments: [alice, bob],
      });

      const commentsBlock = result
        .split("<comments>")[1]!
        .split("</comments>")[0]!;
      expect(commentsBlock).not.toContain("alice");
      expect(commentsBlock).toContain("bob");
    });
  });
});
