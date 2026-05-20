import type {
  Platform,
  PlatformComment,
  PlatformFile,
  PlatformIssue,
  PlatformPullRequest,
  PlatformReview,
  PlatformUser,
} from "./types";

/** Abstraction over Git platform operations. Each platform provides its own implementation. */
export interface PlatformAdapter {
  readonly platform: Platform;
  readonly serverUrl: string;
  readonly apiBaseUrl: string;

  getIssue(owner: string, repo: string, number: number): Promise<PlatformIssue>;

  getPullRequest(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformPullRequest>;

  getIssueComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformComment[]>;

  getPullRequestComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformComment[]>;

  getPullRequestFiles(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformFile[]>;

  getPullRequestReviews(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PlatformReview[]>;

  createComment(
    owner: string,
    repo: string,
    number: number,
    body: string,
  ): Promise<{ id: number }>;

  updateComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<void>;

  getRepo(owner: string, repo: string): Promise<{ defaultBranch: string }>;

  createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[],
  ): Promise<{ number: number; url: string }>;

  createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string,
  ): Promise<{ number: number; url: string }>;

  getUser(login: string): Promise<PlatformUser>;

  /** Return the sanitized HTML URL for an entity (issue or PR). */
  getEntityUrl(
    owner: string,
    repo: string,
    number: number,
    isPR: boolean,
  ): string;
}
