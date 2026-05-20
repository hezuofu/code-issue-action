/** Raw response types from GitCode v5 REST API. Field names match actual API responses. */

export interface GitCodeUser {
  id: number | string;
  login: string;
  name: string;
  avatar_url?: string;
  html_url?: string;
  email?: string;
}

export interface GitCodeLabel {
  id: number;
  name: string;
  color: string;
  title?: string;
}

export interface GitCodeIssue {
  id: number;
  number: string;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  finished_at?: string;
  user: GitCodeUser;
  assignees?: GitCodeUser[];
  labels: GitCodeLabel[];
  html_url: string;
  comments: number;
  issue_state?: string;
  issue_type?: string;
}

export interface GitCodeComment {
  id: number;
  body: string;
  user: GitCodeUser;
  created_at: string;
  updated_at: string;
  comment_type?: string;
}

export interface GitCodePRHead {
  label: string;
  ref: string;
  sha: string;
  user: GitCodeUser;
  repo: {
    id: number;
    full_name: string;
    name: string;
    path: string;
    html_url: string;
    owner: GitCodeUser;
  };
}

export interface GitCodePR {
  id: number;
  iid: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  user: GitCodeUser;
  head: GitCodePRHead;
  base: GitCodePRHead;
  target_branch: string;
  source_branch: string;
  labels: GitCodeLabel[];
  html_url: string;
  web_url?: string;
  added_lines: number;
  removed_lines: number;
  notes: number;
  mergeable: boolean | null;
  draft?: boolean;
}

export interface GitCodeFile {
  sha: string;
  filename: string;
  additions: number;
  deletions: number;
  status: string;
  blob_id?: string;
  raw_url?: string;
  patch?: { diff: string } | null;
}

export interface GitCodeCommit {
  sha: string;
  commit: {
    message: string;
    author?: {
      name: string;
      email: string;
      date: string;
    };
  };
  author?: GitCodeUser;
}

export interface GitCodeBranch {
  name: string;
  commit: {
    sha: string;
    url?: string;
  };
}

export interface GitCodeReviewComment {
  id: number;
  body: string;
  user: GitCodeUser;
  created_at: string;
  updated_at: string;
  path?: string;
  position?: number | null;
  line?: number | null;
  commit_id?: string;
  comment_type?: string;
}
