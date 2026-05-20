import { tmpdir } from "os";
import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";

const EXECUTION_FILENAME = "claude-execution-output.json";

function getTempDir(): string {
  return process.env.RUNNER_TEMP || join(tmpdir(), "claude-code-cli");
}

export function getExecutionFilePath(): string {
  return join(getTempDir(), EXECUTION_FILENAME);
}

export async function writeExecutionFile(
  messages: unknown[],
): Promise<string | undefined> {
  const executionFile = getExecutionFilePath();
  try {
    await writeFile(executionFile, JSON.stringify(messages, null, 2));
    console.log(`Log saved to ${executionFile}`);
    return executionFile;
  } catch (error) {
    console.warn(`Failed to write execution file: ${error}`);
    return undefined;
  }
}

export function setExecutionFileOutputIfPresent(): string | undefined {
  const executionFile = getExecutionFilePath();
  if (!existsSync(executionFile)) return undefined;
  return executionFile;
}
