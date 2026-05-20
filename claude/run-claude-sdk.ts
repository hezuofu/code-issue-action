import { readFile, access } from "fs/promises";
import { dirname, join } from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ParsedSdkOptions } from "./parse-sdk-options";
import { writeExecutionFile } from "./execution-file";

export type ClaudeRunResult = {
  executionFile?: string;
  sessionId?: string;
  conclusion: "success" | "failure";
  structuredOutput?: string;
  responseText?: string;
};

const USER_REQUEST_FILENAME = "claude-user-request.txt";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function createPromptConfig(
  promptPath: string,
  showFullOutput: boolean,
): Promise<string | AsyncIterable<SDKUserMessage>> {
  const promptContent = await readFile(promptPath, "utf-8");
  const userRequestPath = join(dirname(promptPath), USER_REQUEST_FILENAME);
  const hasUserRequest = await fileExists(userRequestPath);

  if (!hasUserRequest) return promptContent;

  const userRequest = await readFile(userRequestPath, "utf-8");
  if (showFullOutput) {
    console.log("Using multi-block message with user request:", userRequest);
  } else {
    console.log("Using multi-block message with user request (content hidden)");
  }

  async function* createMultiBlockMessage(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: "user",
      session_id: "",
      message: {
        role: "user",
        content: [
          { type: "text", text: promptContent },
          { type: "text", text: userRequest },
        ],
      },
      parent_tool_use_id: null,
    };
  }

  return createMultiBlockMessage();
}

function sanitizeSdkOutput(
  message: SDKMessage,
  showFullOutput: boolean,
): string | null {
  if (showFullOutput) return JSON.stringify(message, null, 2);

  if (message.type === "system" && message.subtype === "init") {
    return JSON.stringify(
      {
        type: "system",
        subtype: "init",
        message: "Claude Code initialized",
        model: "model" in message ? message.model : "unknown",
      },
      null,
      2,
    );
  }

  if (message.type === "result") {
    const resultMsg = message as SDKResultMessage;
    return JSON.stringify(
      {
        type: "result",
        subtype: resultMsg.subtype,
        is_error: resultMsg.is_error,
        duration_ms: resultMsg.duration_ms,
        num_turns: resultMsg.num_turns,
        total_cost_usd: resultMsg.total_cost_usd,
        permission_denials_count: resultMsg.permission_denials?.length ?? 0,
      },
      null,
      2,
    );
  }

  return null;
}

/** Extract Claude's assistant text responses from SDK messages into a single report. */
function extractAssistantText(messages: SDKMessage[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.type !== "assistant") continue;
    const content = (msg as { message?: { content?: unknown } }).message
      ?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        parts.push(block.text);
      }
    }
  }
  return parts.join("\n\n").trim();
}

export async function runClaudeWithSdk(
  promptPath: string,
  { sdkOptions, showFullOutput, hasJsonSchema }: ParsedSdkOptions,
): Promise<ClaudeRunResult> {
  const prompt = await createPromptConfig(promptPath, showFullOutput);

  if (!showFullOutput) {
    console.log(
      "Running Claude Code via SDK (full output hidden for security)...",
    );
  }

  console.log(`Running Claude with prompt from file: ${promptPath}`);
  const { env, extraArgs, ...optionsToLog } = sdkOptions;
  console.log("SDK options:", JSON.stringify(optionsToLog, null, 2));

  const messages: SDKMessage[] = [];
  let resultMessage: SDKResultMessage | undefined;

  try {
    for await (const message of query({ prompt, options: sdkOptions })) {
      messages.push(message);
      const sanitized = sanitizeSdkOutput(message, showFullOutput);
      if (sanitized) console.log(sanitized);

      if (message.type === "result") {
        resultMessage = message as SDKResultMessage;
      }
    }
  } catch (error) {
    console.error("SDK execution error:", error);
    await writeExecutionFile(messages);
    throw new Error(`SDK execution error: ${error}`);
  }

  const result: ClaudeRunResult = { conclusion: "failure" };
  const executionFile = await writeExecutionFile(messages);
  if (executionFile) result.executionFile = executionFile;

  // Extract Claude's text response from assistant messages for the final report
  result.responseText = extractAssistantText(messages);

  const initMessage = messages.find(
    (m) => m.type === "system" && "subtype" in m && m.subtype === "init",
  );
  if (initMessage && "session_id" in initMessage && initMessage.session_id) {
    result.sessionId = initMessage.session_id as string;
    console.log(`Session ID: ${result.sessionId}`);
  }

  if (!resultMessage) {
    throw new Error("No result message received from Claude");
  }

  const isSuccess = resultMessage.subtype === "success";
  result.conclusion = isSuccess ? "success" : "failure";

  if (hasJsonSchema) {
    if (
      isSuccess &&
      "structured_output" in resultMessage &&
      resultMessage.structured_output
    ) {
      result.structuredOutput = JSON.stringify(resultMessage.structured_output);
      console.log(
        `Structured output with ${Object.keys(resultMessage.structured_output as object).length} field(s)`,
      );
    } else {
      throw new Error(
        `--json-schema was provided but Claude did not return structured_output. Result subtype: ${resultMessage.subtype}`,
      );
    }
  }

  if (!isSuccess) {
    const errors =
      "errors" in resultMessage && resultMessage.errors
        ? resultMessage.errors.join(", ")
        : "unknown error";
    throw new Error(`Claude execution failed: ${errors}`);
  }

  return result;
}
