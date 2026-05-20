import { withRetry, isRetryableError } from "../claude/retry";

/** Thin GitHub REST API client using fetch(). Replaces @octokit/rest dependency. */

export class GitHubClient {
  constructor(
    private token: string,
    private baseUrl: string = "https://api.github.com",
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `GitHub API ${res.status} ${method} ${path}: ${text.slice(0, 500)}`,
      );
    }

    if (res.status === 204) return undefined as T;
    return res.json() as T;
  }

  async get<T>(path: string): Promise<T> {
    return withRetry(() => this.request<T>("GET", path), {
      shouldRetry: isRetryableError,
    });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(() => this.request<T>("POST", path, body), {
      shouldRetry: isRetryableError,
    });
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(() => this.request<T>("PATCH", path, body), {
      shouldRetry: isRetryableError,
    });
  }

  /** Fetch all pages from a paginated GitHub REST endpoint. */
  async paginate<T>(path: string, perPage: number = 100): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    while (true) {
      const sep = path.includes("?") ? "&" : "?";
      const pagedPath = `${path}${sep}per_page=${perPage}&page=${page}`;
      const data = await withRetry(() => this.get<T[]>(pagedPath), {
        shouldRetry: isRetryableError,
      });
      if (!Array.isArray(data) || data.length === 0) break;
      results.push(...data);
      if (data.length < perPage) break;
      page++;
    }
    return results;
  }
}
