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
import { GitCodeClient } from "./client";
import type {
  GitCodeComment,
  GitCodeFile,
  GitCodeIssue,
  GitCodePR,
  GitCodeReviewComment,
  GitCodeUser,
} from "./types";
import { sanitizeContent } from "../claude/sanitizer";

function cleanBody(html: string): string {
  // Strip HTML tags, then apply full sanitization
  const plain = html.replace(/<[^>]*>/g, "").trim();
  return sanitizeContent(plain);
}

function toPlatformUser(u: GitCodeUser): PlatformUser {
  return { login: u.login, name: u.name || null };
}

function toPlatformIssue(i: GitCodeIssue): PlatformIssue {
  return {
    number: Number(i.number),
    title: i.title,
    body: i.body,
    author: toPlatformUser(i.user),
    state: i.state,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    labels: i.labels?.map((l) => l.name) ?? [],
  };
}

function toPlatformComment(c: GitCodeComment): PlatformComment {
  const body = cleanBody(c.body);
  return {
    id: c.id,
    body,
    author: toPlatformUser(c.user),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

function toPlatformFile(f: GitCodeFile): PlatformFile {
  const changeType =
    f.status === "added"
      ? ("ADDED" as const)
      : f.status === "removed"
        ? ("DELETED" as const)
        : f.status === "renamed"
          ? ("RENAMED" as const)
          : ("MODIFIED" as const);
  return {
    path: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    changeType,
  };
}

export class GitCodeAdapter implements PlatformAdapter {
  readonly platform = "gitcode" as const;
  readonly serverUrl: string;
  readonly apiBaseUrl: string;
  private client: GitCodeClient;

  constructor(token: string, serverUrl?: string, apiBaseUrl?: string) {
    this.serverUrl = serverUrl ?? "https://gitcode.com";
    this.apiBaseUrl = apiBaseUrl ?? "https://api.gitcode.com/api/v5";
    this.client = new GitCodeClient(token, this.apiBaseUrl);
  }

  async getIssue(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformIssue> {
    const data = await this.client.get<GitCodeIssue>(
      `/repos/${owner}/${repo}/issues/${number}`,
    );
    return toPlatformIssue(data);
  }

  async getPullRequest(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformPullRequest> {
    const data = await this.client.get<GitCodePR>(
      `/repos/${owner}/${repo}/pulls/${number}`,
    );

    const [files, commits] = await Promise.all([
      this.getPullRequestFiles(owner, repo, number),
      this.client
        .get<
          Array<{ sha: string; commit: { message: string } }>
        >(`/repos/${owner}/${repo}/pulls/${number}/commits`)
        .catch(() => [] as Array<{ sha: string; commit: { message: string } }>),
    ]);

    // Cast commits to ensure correct type after catch fallback
    const commitsData = commits as Array<{
      sha: string;
      commit: { message: string };
    }>;

    return {
      number: data.number,
      title: data.title,
      body: data.body,
      author: toPlatformUser(data.user),
      state: data.state,
      baseRefName: data.target_branch || data.base.ref,
      headRefName: data.source_branch || data.head.ref,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      labels: data.labels?.map((l) => l.name) ?? [],
      isCrossRepository:
        data.head.repo?.full_name !== data.base.repo?.full_name,
      additions: data.added_lines ?? 0,
      deletions: data.removed_lines ?? 0,
      commits: commitsData.map((c) => ({
        oid: c.sha,
        message: c.commit.message,
      })),
      changedFiles: files,
    };
  }

  async getIssueComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformComment[]> {
    const data = await this.client.getAll<GitCodeComment>(
      `/repos/${owner}/${repo}/issues/${number}/comments`,
    );
    return data.map(toPlatformComment);
  }

  async getPullRequestComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformComment[]> {
    const data = await this.client.getAll<GitCodeComment>(
      `/repos/${owner}/${repo}/pulls/${number}/comments`,
    );
    return data.map(toPlatformComment);
  }

  async getPullRequestFiles(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformFile[]> {
    const data = await this.client.getAll<GitCodeFile>(
      `/repos/${owner}/${repo}/pulls/${number}/files`,
    );
    return data.map(toPlatformFile);
  }

  async getPullRequestReviews(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformReview[]> {
    // GitCode v5 does not have a structured "reviews" endpoint like GitHub.
    // PR inline review comments with a path/position field are used instead.
    const allComments = await this.client.getAll<GitCodeReviewComment>(
      `/repos/${owner}/${repo}/pulls/${number}/comments`,
    );

    const reviewComments = allComments
      .filter((c) => c.path || c.position)
      .map(
        (c): PlatformReviewComment => ({
          id: c.id,
          body: cleanBody(c.body),
          author: toPlatformUser(c.user),
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          path: c.path ?? "",
          line: c.line ?? c.position ?? null,
        }),
      );

    if (reviewComments.length === 0) return [];
    return [
      {
        id: 0,
        author: reviewComments[0]!.author,
        body: "",
        state: "COMMENTED",
        submittedAt: reviewComments[0]!.createdAt,
        comments: reviewComments,
      },
    ];
  }

  async createComment(
    owner: string,
    repo: string,
    number: number,
    body: string,
  ): Promise<{ id: number }> {
    const data = await this.client.post<GitCodeComment>(
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
    await this.client.request(
      "PATCH",
      `/repos/${owner}/${repo}/issues/comments/${commentId}`,
      { body },
    );
  }

  async getRepo(
    owner: string,
    repo: string,
  ): Promise<{ defaultBranch: string }> {
    const data = await this.client.get<{ default_branch: string }>(
      `/repos/${owner}/${repo}`,
    );
    return { defaultBranch: data.default_branch || "master" };
  }

  async getUser(login: string): Promise<PlatformUser> {
    const data = await this.client.get<GitCodeUser>(`/users/${login}`);
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
