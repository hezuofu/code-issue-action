import { describe, expect, it } from "bun:test";
import type { PlatformAdapter } from "../adapter";
import type {
  PlatformComment,
  PlatformFile,
  PlatformIssue,
  PlatformPullRequest,
  PlatformReview,
  PlatformUser,
} from "../types";

// ---------------------------------------------------------------------------
// Mock adapter for interface contract testing
// ---------------------------------------------------------------------------

class MockAdapter implements PlatformAdapter {
  readonly platform = "github" as const;
  readonly serverUrl = "https://github.com";
  readonly apiBaseUrl = "https://api.github.com";

  async getIssue(
    _owner: string,
    _repo: string,
    _number: number,
  ): Promise<PlatformIssue> {
    return {
      number: 1,
      title: "Test",
      body: "body",
      author: { login: "test" },
      state: "open",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      labels: [],
    };
  }
  async getPullRequest(
    _owner: string,
    _repo: string,
    _number: number,
  ): Promise<PlatformPullRequest> {
    return {
      number: 1,
      title: "PR",
      body: "body",
      author: { login: "test" },
      state: "open",
      baseRefName: "main",
      headRefName: "feat/x",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      labels: [],
      isCrossRepository: false,
      additions: 10,
      deletions: 5,
      commits: [],
      changedFiles: [],
    };
  }
  async getIssueComments(
    _owner: string,
    _repo: string,
    _number: number,
  ): Promise<PlatformComment[]> {
    return [];
  }
  async getPullRequestComments(
    _owner: string,
    _repo: string,
    _number: number,
  ): Promise<PlatformComment[]> {
    return [];
  }
  async getPullRequestFiles(
    _owner: string,
    _repo: string,
    _number: number,
  ): Promise<PlatformFile[]> {
    return [];
  }
  async getPullRequestReviews(
    _owner: string,
    _repo: string,
    _number: number,
  ): Promise<PlatformReview[]> {
    return [];
  }
  async createComment(
    _owner: string,
    _repo: string,
    _number: number,
    _body: string,
  ): Promise<{ id: number }> {
    return { id: 1 };
  }
  async updateComment(
    _owner: string,
    _repo: string,
    _commentId: number,
    _body: string,
  ): Promise<void> {}
  async getRepo(
    _owner: string,
    _repo: string,
  ): Promise<{ defaultBranch: string }> {
    return { defaultBranch: "main" };
  }
  async getUser(_login: string): Promise<PlatformUser> {
    return { login: _login, name: "Test User" };
  }
  getEntityUrl(
    owner: string,
    repo: string,
    number: number,
    isPR: boolean,
  ): string {
    const entity = isPR ? "pull" : "issues";
    return `${this.serverUrl}/${owner}/${repo}/${entity}/${number}`;
  }
}

// ---------------------------------------------------------------------------
// Interface contract tests — verify adapter interface is implementable
// ---------------------------------------------------------------------------

describe("PlatformAdapter interface contract", () => {
  const adapter = new MockAdapter();

  it("getIssue returns canonical PlatformIssue shape", async () => {
    const issue = await adapter.getIssue("o", "r", 1);
    expect(issue.number).toBe(1);
    expect(issue.title).toBeString();
    expect(issue.author.login).toBeString();
    expect(issue.labels).toBeArray();
  });

  it("getPullRequest returns canonical PlatformPullRequest shape", async () => {
    const pr = await adapter.getPullRequest("o", "r", 1);
    expect(pr.baseRefName).toBeString();
    expect(pr.headRefName).toBeString();
    expect(pr.commits).toBeArray();
    expect(pr.changedFiles).toBeArray();
  });

  it("getIssueComments returns array", async () => {
    const comments = await adapter.getIssueComments("o", "r", 1);
    expect(comments).toBeArray();
  });

  it("createComment and updateComment form a write pair", async () => {
    const { id } = await adapter.createComment("o", "r", 1, "test");
    expect(id).toBe(1);
    await expect(
      adapter.updateComment("o", "r", id, "updated"),
    ).resolves.toBeUndefined();
  });

  it("getEntityUrl generates correct URLs for issues", () => {
    const url = adapter.getEntityUrl("owner", "repo", 42, false);
    expect(url).toBe("https://github.com/owner/repo/issues/42");
  });

  it("getEntityUrl generates correct URLs for PRs", () => {
    const url = adapter.getEntityUrl("owner", "repo", 100, true);
    expect(url).toBe("https://github.com/owner/repo/pull/100");
  });

  it("platform property is correct", () => {
    expect(adapter.platform).toBe("github");
  });
});

// ---------------------------------------------------------------------------
// verify platform types are structurally compatible across adapters
// ---------------------------------------------------------------------------

describe("Platform type compatibility", () => {
  it("PlatformIssue allows null body", () => {
    const issue: PlatformIssue = {
      number: 1,
      title: "T",
      body: null,
      author: { login: "x" },
      state: "open",
      createdAt: "",
      updatedAt: "",
      labels: [],
    };
    expect(issue.body).toBeNull();
  });

  it("PlatformPullRequest includes cross-repo flag", () => {
    const pr: PlatformPullRequest = {
      number: 1,
      title: "T",
      body: "",
      author: { login: "x" },
      state: "open",
      baseRefName: "main",
      headRefName: "feat",
      createdAt: "",
      updatedAt: "",
      labels: [],
      isCrossRepository: true,
      additions: 0,
      deletions: 0,
      commits: [],
      changedFiles: [],
    };
    expect(pr.isCrossRepository).toBe(true);
  });

  it("PlatformFile supports all four change types", () => {
    const types = ["ADDED", "MODIFIED", "DELETED", "RENAMED"] as const;
    for (const t of types) {
      const f: PlatformFile = {
        path: "a.ts",
        additions: 1,
        deletions: 0,
        changeType: t,
      };
      expect(f.changeType).toBe(t);
    }
  });

  it("PlatformReview supports multiple inline comments", () => {
    const review: PlatformReview = {
      id: 1,
      author: { login: "rev" },
      body: "LGTM",
      state: "APPROVED",
      submittedAt: "2026-01-01T00:00:00Z",
      comments: [
        {
          id: 1,
          body: "nit",
          author: { login: "rev" },
          createdAt: "",
          path: "a.ts",
          line: 10,
        },
      ],
    };
    expect(review.comments).toHaveLength(1);
    expect(review.comments[0]!.line).toBe(10);
  });
});
