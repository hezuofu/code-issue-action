/** Platform-agnostic canonical types. All adapters map their API responses to these. */

export type Platform = "github" | "gitcode";

export interface PlatformUser {
  login: string;
  name?: string | null;
}

export interface PlatformComment {
  id: number;
  body: string;
  author: PlatformUser;
  createdAt: string;
  updatedAt?: string;
}

export interface PlatformFile {
  path: string;
  additions: number;
  deletions: number;
  changeType: "ADDED" | "MODIFIED" | "DELETED" | "RENAMED";
}

export interface PlatformCommit {
  oid: string;
  message: string;
}

export interface PlatformIssue {
  number: number;
  title: string;
  body: string | null;
  author: PlatformUser;
  state: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
}

export interface PlatformPullRequest {
  number: number;
  title: string;
  body: string | null;
  author: PlatformUser;
  state: string;
  baseRefName: string;
  headRefName: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  isCrossRepository: boolean;
  additions: number;
  deletions: number;
  commits: PlatformCommit[];
  changedFiles: PlatformFile[];
}

export interface PlatformReviewComment extends PlatformComment {
  path: string;
  line: number | null;
}

export interface PlatformReview {
  id: number;
  author: PlatformUser;
  body: string;
  state: string;
  submittedAt: string;
  comments: PlatformReviewComment[];
}

export type TriggerSource =
  | { type: "issue_comment"; comment: PlatformComment }
  | { type: "pr_comment"; comment: PlatformComment }
  | { type: "pr_body"; body: string }
  | { type: "issue_body"; body: string };

export interface CliArgs {
  platform: Platform;
  repo: string;
  issue?: number;
  pr?: number;
  token: string;
  anthropicApiKey?: string;
  prompt?: string;
  triggerPhrase: string;
  triggerUser?: string;
  model?: string;
  verbose: boolean;
  claudeArgs?: string;
  includeCommentsByActor?: string;
  excludeCommentsByActor?: string;
  serverUrl?: string;
  apiBaseUrl?: string;
}
