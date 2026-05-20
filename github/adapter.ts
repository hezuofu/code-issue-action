import type { PlatformAdapter } from "../adapter";
import type {
  PlatformComment,
  PlatformFile,
  PlatformIssue,
  PlatformPullRequest,
  PlatformReview,
  PlatformReviewComment,
  PlatformUser,
} from "../types";
import { GitHubClient } from "./client";
import { sanitizeContent } from "../claude/sanitizer";

// Raw GitHub REST API response types (subset)
interface GHRUser {
  login: string;
  name?: string | null;
}

interface GHRLabel {
  name: string;
}

interface GHRIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  user: GHRUser | null;
  labels: GHRLabel[] | string[];
}

interface GHRComment {
  id: number;
  body?: string;
  user: GHRUser | null;
  created_at: string;
  updated_at: string;
}

interface GHRPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  user: GHRUser | null;
  base: { ref: string; repo?: { id: number } };
  head: { ref: string; repo?: { id: number } | null };
  labels: GHRLabel[] | string[];
  additions: number;
  deletions: number;
}

interface GHRFile {
  filename: string;
  additions: number;
  deletions: number;
  status: string;
}

interface GHRCommit {
  sha: string;
  commit: { message: string };
}

interface GHRReview {
  id: number;
  user: GHRUser | null;
  body: string | null;
  state: string;
  submitted_at: string | null;
}

interface GHRReviewComment {
  id: number;
  body?: string;
  user: GHRUser | null;
  created_at: string;
  updated_at: string;
  path?: string;
  line?: number | null;
}

interface GHRRepo {
  default_branch: string;
}

function toPlatformUser(u: GHRUser | null): PlatformUser {
  return { login: u?.login ?? "unknown", name: u?.name ?? null };
}

function toLabels(labels: GHRLabel[] | string[]): string[] {
  return labels
    .map((l) => (typeof l === "string" ? l : l.name))
    .filter((n) => typeof n === "string");
}

export class GitHubAdapter implements PlatformAdapter {
  readonly platform = "github" as const;
  readonly serverUrl: string;
  readonly apiBaseUrl: string;
  private client: GitHubClient;

  constructor(token: string, serverUrl?: string, apiBaseUrl?: string) {
    this.serverUrl = serverUrl ?? "https://github.com";
    this.apiBaseUrl = apiBaseUrl ?? "https://api.github.com";
    this.client = new GitHubClient(token, this.apiBaseUrl);
  }

  async getIssue(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformIssue> {
    const data = await this.client.get<GHRIssue>(
      `/repos/${owner}/${repo}/issues/${number}`,
    );
    return {
      number: data.number,
      title: data.title,
      body: data.body,
      author: toPlatformUser(data.user),
      state: data.state,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      labels: toLabels(data.labels),
    };
  }

  async getPullRequest(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformPullRequest> {
    const [pr, files, commits] = await Promise.all([
      this.client.get<GHRPullRequest>(
        `/repos/${owner}/${repo}/pulls/${number}`,
      ),
      this.client.paginate<GHRFile>(
        `/repos/${owner}/${repo}/pulls/${number}/files`,
      ),
      this.client.paginate<GHRCommit>(
        `/repos/${owner}/${repo}/pulls/${number}/commits`,
      ),
    ]);

    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      author: toPlatformUser(pr.user),
      state: pr.state,
      baseRefName: pr.base.ref,
      headRefName: pr.head.ref,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      labels: toLabels(pr.labels),
      isCrossRepository:
        pr.head.repo?.id !== pr.base.repo?.id && pr.head.repo !== null,
      additions: pr.additions,
      deletions: pr.deletions,
      commits: commits.map((c) => ({
        oid: c.sha,
        message: c.commit.message,
      })),
      changedFiles: files.map((f) => ({
        path: f.filename,
        additions: f.additions,
        deletions: f.deletions,
        changeType:
          f.status === "added"
            ? ("ADDED" as const)
            : f.status === "removed"
              ? ("DELETED" as const)
              : f.status === "renamed"
                ? ("RENAMED" as const)
                : ("MODIFIED" as const),
      })),
    };
  }

  async getIssueComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformComment[]> {
    const data = await this.client.paginate<GHRComment>(
      `/repos/${owner}/${repo}/issues/${number}/comments`,
    );
    return data.map((c) => ({
      id: c.id,
      body: sanitizeContent(c.body ?? ""),
      author: toPlatformUser(c.user),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  }

  async getPullRequestComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformComment[]> {
    return this.getIssueComments(owner, repo, number);
  }

  async getPullRequestFiles(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformFile[]> {
    const data = await this.client.paginate<GHRFile>(
      `/repos/${owner}/${repo}/pulls/${number}/files`,
    );
    return data.map((f) => ({
      path: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      changeType:
        f.status === "added"
          ? ("ADDED" as const)
          : f.status === "removed"
            ? ("DELETED" as const)
            : f.status === "renamed"
              ? ("RENAMED" as const)
              : ("MODIFIED" as const),
    }));
  }

  async getPullRequestReviews(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformReview[]> {
    const reviews = await this.client.paginate<GHRReview>(
      `/repos/${owner}/${repo}/pulls/${number}/reviews`,
    );

    const result: PlatformReview[] = [];
    for (const r of reviews) {
      const comments = await this.client.paginate<GHRReviewComment>(
        `/repos/${owner}/${repo}/pulls/${number}/reviews/${r.id}/comments`,
      );

      const reviewComments: PlatformReviewComment[] = comments.map((c) => ({
        id: c.id,
        body: sanitizeContent(c.body ?? ""),
        author: toPlatformUser(c.user),
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        path: c.path ?? "",
        line: c.line ?? null,
      }));

      result.push({
        id: r.id,
        author: toPlatformUser(r.user),
        body: r.body ?? "",
        state: r.state,
        submittedAt: r.submitted_at!,
        comments: reviewComments,
      });
    }

    return result;
  }

  async createComment(
    owner: string,
    repo: string,
    number: number,
    body: string,
  ): Promise<{ id: number }> {
    const data = await this.client.post<GHRComment>(
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      { body },
    );
    return { id: data.id };
  }

  async updateComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<void> {
    await this.client.patch(
      `/repos/${owner}/${repo}/issues/comments/${commentId}`,
      { body },
    );
  }

  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[],
  ): Promise<{ number: number; url: string }> {
    const data = await this.client.post<GHRIssue & { html_url: string }>(
      `/repos/${owner}/${repo}/issues`,
      { title, body, labels },
    );
    return { number: data.number, url: data.html_url };
  }

  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string,
  ): Promise<{ number: number; url: string }> {
    const data = await this.client.post<GHRPullRequest & { html_url: string }>(
      `/repos/${owner}/${repo}/pulls`,
      { title, body, head, base },
    );
    return { number: data.number, url: data.html_url };
  }

  async getRepo(
    owner: string,
    repo: string,
  ): Promise<{ defaultBranch: string }> {
    const data = await this.client.get<GHRRepo>(`/repos/${owner}/${repo}`);
    return { defaultBranch: data.default_branch };
  }

  async getUser(login: string): Promise<PlatformUser> {
    const data = await this.client.get<GHRUser>(`/users/${login}`);
    return toPlatformUser(data);
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
