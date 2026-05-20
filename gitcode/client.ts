import { withRetry, isRetryableError } from "../claude/retry";

/** Thin HTTP client for GitCode v5 REST API. */

export class GitCodeClient {
  constructor(
    private token: string,
    private baseUrl: string = "https://api.gitcode.com/api/v5",
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `GitCode API error ${res.status} ${method} ${path}: ${text.slice(0, 500)}`,
      );
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    return res.json() as T;
  }

  get<T>(path: string): Promise<T> {
    return withRetry(() => this.request<T>("GET", path), {
      shouldRetry: isRetryableError,
    });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(() => this.request<T>("POST", path, body), {
      shouldRetry: isRetryableError,
    });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(() => this.request<T>("PUT", path, body), {
      shouldRetry: isRetryableError,
    });
  }

  /** Fetch all pages for a paginated endpoint. */
  async getAll<T>(path: string, perPage: number = 100): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    while (true) {
      const sep = path.includes("?") ? "&" : "?";
      const pagedPath = `${path}${sep}page=${page}&per_page=${perPage}`;
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
