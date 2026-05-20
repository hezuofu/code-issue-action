import { parseShellArgs, stripShellComments } from "./shell-args";
import type { Options as SdkOptions } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeOptions } from "./run-claude";

export type ParsedSdkOptions = {
  sdkOptions: SdkOptions;
  showFullOutput: boolean;
  hasJsonSchema: boolean;
};

const ACCUMULATING_FLAGS = new Set([
  "allowedTools",
  "allowed-tools",
  "disallowedTools",
  "disallowed-tools",
  "mcp-config",
]);

const ACCUMULATE_DELIMITER = "\x00";

type McpConfig = { mcpServers?: Record<string, unknown> };

function mergeMcpConfigs(configValues: string[]): string {
  const merged: McpConfig = { mcpServers: {} };
  let lastFilePath: string | null = null;

  for (const config of configValues) {
    const trimmed = config.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as McpConfig;
        if (parsed.mcpServers) {
          Object.assign(merged.mcpServers!, parsed.mcpServers);
        }
      } catch {
        lastFilePath = trimmed;
      }
    } else {
      lastFilePath = trimmed;
    }
  }

  if (Object.keys(merged.mcpServers!).length === 0 && lastFilePath) {
    return lastFilePath;
  }
  return JSON.stringify(merged);
}

function parseClaudeArgsToExtraArgs(
  claudeArgs?: string,
): Record<string, string | null> {
  if (!claudeArgs?.trim()) return {};

  const result: Record<string, string | null> = {};
  const args = parseShellArgs(stripShellComments(claudeArgs)).filter(
    (arg): arg is string => typeof arg === "string",
  );

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--")) {
      const flag = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        if (ACCUMULATING_FLAGS.has(flag)) {
          const values: string[] = [];
          while (i + 1 < args.length && !args[i + 1]?.startsWith("--")) {
            i++;
            values.push(args[i]!);
          }
          const joinedValues = values.join(ACCUMULATE_DELIMITER);
          result[flag] = result[flag]
            ? `${result[flag]}${ACCUMULATE_DELIMITER}${joinedValues}`
            : joinedValues;
        } else {
          result[flag] = nextArg;
          i++;
        }
      } else {
        result[flag] = null;
      }
    }
  }
  return result;
}

export function parseSdkOptions(options: ClaudeOptions): ParsedSdkOptions {
  const isDebugMode = process.env.ACTIONS_STEP_DEBUG === "true";
  const showFullOutput = options.showFullOutput === "true" || isDebugMode;

  const extraArgs = parseClaudeArgsToExtraArgs(options.claudeArgs);
  const hasJsonSchema = "json-schema" in extraArgs;

  // Merge allowedTools
  const allowedToolsValues = [
    extraArgs["allowedTools"],
    extraArgs["allowed-tools"],
  ]
    .filter(Boolean)
    .join(ACCUMULATE_DELIMITER);
  const extraArgsAllowedTools = allowedToolsValues
    ? allowedToolsValues
        .split(ACCUMULATE_DELIMITER)
        .flatMap((v) => v.split(","))
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const directAllowedTools = options.allowedTools
    ? options.allowedTools.split(",").map((t) => t.trim())
    : [];
  const mergedAllowedTools = [
    ...new Set([...extraArgsAllowedTools, ...directAllowedTools]),
  ];
  delete extraArgs["allowedTools"];
  delete extraArgs["allowed-tools"];

  // Merge disallowedTools
  const disallowedToolsValues = [
    extraArgs["disallowedTools"],
    extraArgs["disallowed-tools"],
  ]
    .filter(Boolean)
    .join(ACCUMULATE_DELIMITER);
  const extraArgsDisallowedTools = disallowedToolsValues
    ? disallowedToolsValues
        .split(ACCUMULATE_DELIMITER)
        .flatMap((v) => v.split(","))
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const directDisallowedTools = options.disallowedTools
    ? options.disallowedTools.split(",").map((t) => t.trim())
    : [];
  const mergedDisallowedTools = [
    ...new Set([...extraArgsDisallowedTools, ...directDisallowedTools]),
  ];
  delete extraArgs["disallowedTools"];
  delete extraArgs["disallowed-tools"];

  // Merge MCP configs
  if (extraArgs["mcp-config"]) {
    const mcpConfigValues = extraArgs["mcp-config"].split(ACCUMULATE_DELIMITER);
    if (mcpConfigValues.length > 1) {
      extraArgs["mcp-config"] = mergeMcpConfigs(mcpConfigValues);
    }
  }

  // Build env for SDK
  const env: Record<string, string | undefined> = { ...process.env };
  env.CLAUDE_CODE_ENTRYPOINT = "claude-code-standalone-cli";

  // Build system prompt
  let systemPrompt: SdkOptions["systemPrompt"];
  if (options.systemPrompt) {
    systemPrompt = options.systemPrompt;
  } else if (options.appendSystemPrompt) {
    systemPrompt = {
      type: "preset",
      preset: "claude_code",
      append: options.appendSystemPrompt,
    };
  } else {
    systemPrompt = { type: "preset", preset: "claude_code" };
  }

  const sdkOptions: SdkOptions = {
    model: options.model,
    maxTurns: options.maxTurns ? parseInt(options.maxTurns, 10) : undefined,
    allowedTools:
      mergedAllowedTools.length > 0 ? mergedAllowedTools : undefined,
    disallowedTools:
      mergedDisallowedTools.length > 0 ? mergedDisallowedTools : undefined,
    systemPrompt,
    fallbackModel: options.fallbackModel,
    pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable,
    extraArgs,
    env,
    settingSources: extraArgs["setting-sources"]
      ? (extraArgs["setting-sources"].split(
          ",",
        ) as SdkOptions["settingSources"])
      : ["user", "project", "local"],
  };

  delete extraArgs["setting-sources"];

  return { sdkOptions, showFullOutput, hasJsonSchema };
}
