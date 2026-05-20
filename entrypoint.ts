#!/usr/bin/env bun

/**
 * Standalone CLI entrypoint for the Claude Code multi-platform Git tool.
 *
 * Usage:
 *   bun run standalone/entrypoint.ts --platform=gitcode --repo=owner/repo --issue=42 --token=xxx --anthropic-api-key=yyy
 *   bun run standalone/entrypoint.ts --platform=github --repo=owner/repo --pr=100 --token=xxx --anthropic-api-key=yyy
 *   bun run standalone/entrypoint.ts --platform=github --repo=owner/repo --prompt="Review this code" --token=xxx --anthropic-api-key=yyy
 */

import { parseArgs } from "./cli/args";
import { runStandalone } from "./cli/runner";

if (import.meta.main) {
  const parsed = parseArgs(process.argv.slice(2));

  if ("help" in parsed) {
    // parseArgs already printed usage
    process.exit(0);
  }

  runStandalone(parsed)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(
        "Fatal error:",
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    });
}
