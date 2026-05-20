/** Simple shell argument parser — replaces shell-quote dependency. */

export function parseShellArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      // Backslash is literal inside single quotes
      if (quote === "'") {
        current += "\\";
        continue;
      }
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
        // Push on closing quote (even empty string from "")
        args.push(current);
        current = "";
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n") {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  // Trailing backslash: keep as literal
  if (escaped) current += "\\";
  // Push remaining (handle unclosed quotes gracefully)
  if (current || (quote !== null && current === "")) args.push(current);
  return args;
}

/** Strip comment lines (first non-whitespace char is #) from shell args. */
export function stripShellComments(input: string): string {
  return input
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}
