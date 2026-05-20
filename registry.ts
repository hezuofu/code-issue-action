import type { Platform } from "./types";
import type { PlatformAdapter } from "./adapter";
import { GitHubAdapter } from "./github/adapter";
import { GitCodeAdapter } from "./gitcode/adapter";

export function createAdapter(
  platform: Platform,
  token: string,
  serverUrl?: string,
  apiBaseUrl?: string,
): PlatformAdapter {
  switch (platform) {
    case "github":
      return new GitHubAdapter(
        token,
        serverUrl ?? "https://github.com",
        apiBaseUrl ?? "https://api.github.com",
      );
    case "gitcode":
      return new GitCodeAdapter(
        token,
        serverUrl ?? "https://gitcode.com",
        apiBaseUrl ?? "https://api.gitcode.com/api/v5",
      );
  }
}
