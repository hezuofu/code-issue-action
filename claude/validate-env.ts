/** Validates env vars for the selected AI provider. Same logic as base-action. */
export function validateEnvironmentVariables(): void {
  const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === "1";
  const useVertex = process.env.CLAUDE_CODE_USE_VERTEX === "1";
  const useFoundry = process.env.CLAUDE_CODE_USE_FOUNDRY === "1";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const claudeCodeOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  const errors: string[] = [];

  const activeProviders = [useBedrock, useVertex, useFoundry].filter(Boolean);
  if (activeProviders.length > 1) {
    errors.push(
      "Cannot use multiple providers simultaneously. Please set only one of: CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_USE_VERTEX, or CLAUDE_CODE_USE_FOUNDRY.",
    );
  }

  if (!useBedrock && !useVertex && !useFoundry) {
    if (!anthropicApiKey && !claudeCodeOAuthToken) {
      errors.push(
        "Either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN is required when using direct Anthropic API.",
      );
    }
  } else if (useBedrock) {
    const awsRegion = process.env.AWS_REGION;
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;

    if (!awsRegion) {
      errors.push("AWS_REGION is required when using AWS Bedrock.");
    }
    const hasAccessKeyCredentials = awsAccessKeyId && awsSecretAccessKey;
    if (!hasAccessKeyCredentials && !awsBearerToken) {
      errors.push(
        "Either AWS_BEARER_TOKEN_BEDROCK or both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when using AWS Bedrock.",
      );
    }
  } else if (useVertex) {
    if (!process.env.ANTHROPIC_VERTEX_PROJECT_ID)
      errors.push(
        "ANTHROPIC_VERTEX_PROJECT_ID is required when using Google Vertex AI.",
      );
    if (!process.env.CLOUD_ML_REGION)
      errors.push("CLOUD_ML_REGION is required when using Google Vertex AI.");
  } else if (useFoundry) {
    if (
      !process.env.ANTHROPIC_FOUNDRY_RESOURCE &&
      !process.env.ANTHROPIC_FOUNDRY_BASE_URL
    ) {
      errors.push(
        "Either ANTHROPIC_FOUNDRY_RESOURCE or ANTHROPIC_FOUNDRY_BASE_URL is required when using Microsoft Foundry.",
      );
    }
  }

  if (errors.length > 0) {
    const msg = `Environment variable validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    throw new Error(msg);
  }
}
