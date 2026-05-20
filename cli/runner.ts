import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdir, writeFile } from "fs/promises";
import { $ } from "bun";
import { createAdapter } from "../registry";
import { buildCliPrompt } from "./prompt";
import { validateEnvironmentVariables } from "../claude/validate-env";
import { preparePrompt } from "../claude/prepare-prompt";
import { runClaude } from "../claude/run-claude";
import { withRetry, isRetryableError } from "../claude/retry";
import type { CliArgs } from "../types";
import type { PlatformAdapter } from "../adapter";
import type {
  PlatformComment,
  PlatformPullRequest,
  PlatformIssue,
  PlatformReview,
  PlatformFile,
} from "../types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GIT_PUSH_WRAPPER = join(__dirname, "..", "scripts", "git-push.sh");

export type { CliArgs };

/** Configure git user and remote auth so Claude can commit/push. */
async function configureGit(
  adapter: PlatformAdapter,
  args: CliArgs,
): Promise<void> {
  const serverHost = new URL(adapter.serverUrl).hostname;
  const [owner, repo] = args.repo.split("/");

  const botName = "claude-code-cli";
  const noreplyDomain =
    serverHost === "github.com"
      ? "users.noreply.github.com"
      : `users.noreply.${serverHost}`;

  console.log("Configuring git authentication...");
  await $`git config user.name "${botName}"`;
  await $`git config user.email "${botName}@${noreplyDomain}"`;

  // Update remote URL with token for push access
  const remoteUrl = `https://x-access-token:${args.token}@${serverHost}/${owner}/${repo}.git`;
  await $`git remote set-url origin ${remoteUrl}`;

  console.log("Git authentication configured");
}

/** Checkout PR head and fetch base ref so git diff origin/<base>...HEAD works. */
async function setupPRBranch(pr: PlatformPullRequest): Promise<void> {
  await $`git fetch origin ${pr.headRefName}:refs/remotes/origin/${pr.headRefName}`.nothrow();
  await $`git checkout -B ${pr.headRefName} origin/${pr.headRefName}`.nothrow();
  await $`git fetch origin ${pr.baseRefName}:refs/remotes/origin/${pr.baseRefName}`.nothrow();
  console.log(
    `PR branch: ${pr.headRefName}, base ${pr.baseRefName} ready for diff`,
  );
}

function filterCommentsByActor<T extends { author: { login: string } }>(
  comments: T[],
  include?: string,
  exclude?: string,
): T[] {
  const inc = include
    ? include.split(",").map((s) => s.trim().toLowerCase())
    : [];
  const exc = exclude
    ? exclude.split(",").map((s) => s.trim().toLowerCase())
    : [];
  if (inc.length === 0 && exc.length === 0) return comments;
  return comments.filter((c) => {
    const login = c.author.login.toLowerCase();
    if (exc.length > 0 && exc.includes(login)) return false;
    if (inc.length > 0 && !inc.includes(login)) return false;
    return true;
  });
}

interface FetchedData {
  entityNumber: number;
  isPR: boolean;
  issue?: PlatformIssue;
  pr?: PlatformPullRequest;
  comments: PlatformComment[];
  reviews: PlatformReview[];
  files: PlatformFile[];
  entityUrl: string;
  triggerComment?: PlatformComment;
}

async function fetchTagData(
  adapter: PlatformAdapter,
  args: CliArgs,
): Promise<FetchedData | null> {
  const [owner, repo] = args.repo.split("/");
  if (!owner || !repo)
    throw new Error("Invalid --repo format. Expected owner/repo");

  const entityNumber = args.pr ?? args.issue;
  if (entityNumber === undefined) return null;
  const isPR = args.pr !== undefined;

  const entityUrl = adapter.getEntityUrl(owner, repo, entityNumber, isPR);
  let issue: PlatformIssue | undefined;
  let pr: PlatformPullRequest | undefined;
  let comments: PlatformComment[] = [];
  let reviews: PlatformReview[] = [];
  const files: PlatformFile[] = [];
  let triggerComment: PlatformComment | undefined;

  if (isPR) {
    pr = await adapter.getPullRequest(owner, repo, entityNumber);
    const [prComments, prReviews, prFiles] = await Promise.all([
      adapter.getPullRequestComments(owner, repo, entityNumber),
      adapter.getPullRequestReviews(owner, repo, entityNumber),
      adapter.getPullRequestFiles(owner, repo, entityNumber),
    ]);
    comments = filterCommentsByActor(
      prComments,
      args.includeCommentsByActor,
      args.excludeCommentsByActor,
    );
    reviews = prReviews;
    files.push(...prFiles);

    const userLogin = args.triggerUser;
    triggerComment = userLogin
      ? comments.find(
          (c) =>
            c.author.login === userLogin && c.body.includes(args.triggerPhrase),
        )
      : comments.find((c) => c.body.includes(args.triggerPhrase));
  } else {
    issue = await adapter.getIssue(owner, repo, entityNumber);
    const rawComments = await adapter.getIssueComments(
      owner,
      repo,
      entityNumber,
    );
    comments = filterCommentsByActor(
      rawComments,
      args.includeCommentsByActor,
      args.excludeCommentsByActor,
    );

    const userLogin = args.triggerUser;
    triggerComment = userLogin
      ? comments.find(
          (c) =>
            c.author.login === userLogin && c.body.includes(args.triggerPhrase),
        )
      : comments.find((c) => c.body.includes(args.triggerPhrase));
  }

  return {
    entityNumber,
    isPR,
    issue,
    pr,
    comments,
    reviews,
    files,
    entityUrl,
    triggerComment,
  };
}

export async function runStandalone(args: CliArgs): Promise<void> {
  const adapter = createAdapter(
    args.platform,
    args.token,
    args.serverUrl,
    args.apiBaseUrl,
  );

  const owner = args.repo.split("/")[0]!;
  const repo = args.repo.split("/")[1]!;

  console.log(`Platform: ${adapter.platform}`);
  console.log(`Repository: ${args.repo}`);

  // Configure git authentication so Claude can commit and push
  await configureGit(adapter, args);

  // Inject platform config for scripts Claude can call
  process.env.CLAUDE_LOOP_TOKEN = args.token;
  process.env.CLAUDE_LOOP_API_BASE = adapter.apiBaseUrl;
  process.env.CLAUDE_LOOP_PLATFORM = adapter.platform;

  // Set AI provider env vars
  if (args.anthropicApiKey) {
    process.env.ANTHROPIC_API_KEY = args.anthropicApiKey;
  }
  if (args.model) {
    process.env.ANTHROPIC_MODEL = args.model;
  }

  const mode = args.prompt ? "agent" : "tag";
  console.log(`Mode: ${mode}`);

  let commentId: number | undefined;
  let data: FetchedData | null = null;
  let claudeConclusion: "success" | "failure" | "error" = "error";
  let errorMessage: string | undefined;
  let responseText: string | undefined;

  try {
    let promptContent: string;

    if (mode === "tag") {
      data = await fetchTagData(adapter, args);
      if (!data) throw new Error("No entity data fetched");

      // For PRs: checkout the PR's head branch so Claude works on the right code
      if (data.pr) await setupPRBranch(data.pr);

      // Get trigger user's display name for Co-authored-by
      let triggerName: string | undefined;
      if (data.triggerComment) {
        try {
          const user = await adapter.getUser(data.triggerComment.author.login);
          triggerName = user.name ?? undefined;
        } catch {
          // display name is optional
        }
      }

      // Check for trigger
      const hasTrigger =
        data.comments.some((c) => c.body.includes(args.triggerPhrase)) ||
        data.pr?.body?.includes(args.triggerPhrase) ||
        data.issue?.body?.includes(args.triggerPhrase);

      if (!hasTrigger) {
        console.log(
          `No "${args.triggerPhrase}" trigger found in comments or body. Exiting.`,
        );
        return;
      }
      console.log(`Trigger "${args.triggerPhrase}" found!`);

      // Create tracking comment
      const comment = await withRetry(
        () =>
          adapter.createComment(
            owner,
            repo,
            data!.entityNumber,
            `Claude is analyzing this ${data!.isPR ? "pull request" : "issue"}...`,
          ),
        { shouldRetry: isRetryableError },
      );
      commentId = comment.id;
      console.log(`Created tracking comment #${commentId}`);

      promptContent = buildCliPrompt({
        platform: adapter.platform,
        serverUrl: adapter.serverUrl,
        repoFullName: args.repo,
        mode: "tag",
        triggerPhrase: args.triggerPhrase,
        triggerUser: args.triggerUser ?? data.triggerComment?.author.login,
        triggerName,
        commentId,
        triggerComment: data.triggerComment,
        issue: data.issue,
        pr: data.pr,
        comments: data.comments,
        reviews: data.reviews,
        files: data.files,
        entityUrl: data.entityUrl,
        gitPushWrapper: GIT_PUSH_WRAPPER,
      });
    } else {
      promptContent = buildCliPrompt({
        platform: adapter.platform,
        serverUrl: adapter.serverUrl,
        repoFullName: args.repo,
        mode: "agent",
        triggerPhrase: "",
        gitPushWrapper: GIT_PUSH_WRAPPER,
        entityUrl: args.prompt
          ? undefined
          : adapter.getEntityUrl(
              args.repo.split("/")[0]!,
              args.repo.split("/")[1]!,
              args.pr ?? args.issue ?? 0,
              args.pr !== undefined,
            ),
      });
      if (args.prompt) {
        promptContent += `\n\n## Task\n${args.prompt}`;
      }
    }

    // Write prompt to temp file
    const tempDir = join(tmpdir(), "claude-code-cli");
    await mkdir(tempDir, { recursive: true });
    const promptFile = join(tempDir, "claude-prompt.txt");
    await writeFile(promptFile, promptContent, "utf-8");
    console.log(`Prompt written to: ${promptFile}`);

    // Validate env & run Claude
    validateEnvironmentVariables();

    const promptConfig = await preparePrompt({
      prompt: "",
      promptFile,
    });

    // Build allowed tools — git ops + Issue/PR creation
    const createIssuePath = join(__dirname, "..", "scripts", "create-issue.ts");
    const createPRPath = join(__dirname, "..", "scripts", "create-pr.ts");
    const allowedTools = [
      "Bash(git add:*)",
      "Bash(git commit:*)",
      `Bash(${GIT_PUSH_WRAPPER}:*)`,
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      `Bash(bun run ${createIssuePath}:*)`,
      `Bash(bun run ${createPRPath}:*)`,
    ].join(",");

    console.log("Running Claude...");
    const result = await runClaude(promptConfig.path, {
      claudeArgs: args.claudeArgs,
      allowedTools,
      model: args.model,
      showFullOutput: args.verbose ? "true" : "false",
    });

    claudeConclusion = result.conclusion;
    responseText = result.responseText ?? "";
    console.log(`Claude execution: ${result.conclusion}`);
    if (result.sessionId) console.log(`Session ID: ${result.sessionId}`);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Execution failed:", errorMessage);
  } finally {
    // Always update tracking comment with Claude's actual response or error
    if (commentId) {
      try {
        let body: string;
        if (errorMessage) {
          body = `Claude analysis encountered an error.\n\n\`\`\`\n${errorMessage.slice(0, 500)}\n\`\`\``;
        } else if (responseText) {
          body = responseText;
        } else {
          body = `Claude analysis ${claudeConclusion === "success" ? "completed" : "failed"} (no text output).`;
        }
        await withRetry(
          () => adapter.updateComment(owner, repo, commentId!, body),
          { shouldRetry: isRetryableError },
        );
      } catch (commentErr) {
        console.warn("Failed to update tracking comment:", commentErr);
      }
    }

    if (errorMessage) {
      throw new Error(errorMessage);
    }
  }

  console.log("Done.");
}
