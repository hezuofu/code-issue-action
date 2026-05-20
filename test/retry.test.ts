import { describe, expect, it } from "bun:test";
import { withRetry, isRetryableError } from "../claude/retry";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on failure and succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("temporary failure");
        return "recovered";
      },
      { baseDelayMs: 10 },
    );
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("throws after max retries exhausted", async () => {
    let calls = 0;
    const promise = withRetry(
      async () => {
        calls++;
        throw new Error("persistent failure");
      },
      { maxRetries: 3, baseDelayMs: 10 },
    );
    await expect(promise).rejects.toThrow("persistent failure");
    expect(calls).toBe(3);
  });

  it("does not retry when shouldRetry returns false", async () => {
    let calls = 0;
    const promise = withRetry(
      async () => {
        calls++;
        throw new Error("400 Bad Request");
      },
      {
        maxRetries: 3,
        baseDelayMs: 10,
        shouldRetry: () => false,
      },
    );
    await expect(promise).rejects.toThrow("400 Bad Request");
    expect(calls).toBe(1);
  });

  it("retries only on retryable errors", async () => {
    let calls = 0;
    const promise = withRetry(
      async () => {
        calls++;
        // 422 is a client error, not retryable
        throw new Error("HTTP 422 Unprocessable Entity");
      },
      { maxRetries: 3, baseDelayMs: 10, shouldRetry: isRetryableError },
    );
    await expect(promise).rejects.toThrow("422");
    // 422 is not in isRetryableError, so should fail immediately
    expect(calls).toBe(1);
  });

  it("retries on 429 rate limit errors", async () => {
    let calls = 0;
    const promise = withRetry(
      async () => {
        calls++;
        throw new Error("HTTP 429 Too Many Requests");
      },
      { maxRetries: 2, baseDelayMs: 10, shouldRetry: isRetryableError },
    );
    await expect(promise).rejects.toThrow("429");
    expect(calls).toBe(2);
  });

  it("retries on 502/503/504 gateway errors", async () => {
    for (const status of ["502", "503", "504"]) {
      let calls = 0;
      await withRetry(
        async () => {
          calls++;
          if (calls < 2) throw new Error(`HTTP ${status} Bad Gateway`);
          return "ok";
        },
        { baseDelayMs: 10, shouldRetry: isRetryableError },
      );
      expect(calls).toBe(2);
    }
  });

  it("retries on network errors", async () => {
    let calls = 0;
    const promise = withRetry(
      async () => {
        calls++;
        throw new Error("connect ECONNREFUSED");
      },
      { maxRetries: 2, baseDelayMs: 10, shouldRetry: isRetryableError },
    );
    await expect(promise).rejects.toThrow("ECONNREFUSED");
    expect(calls).toBe(2);
  });
});

describe("isRetryableError", () => {
  it("identifies rate limit errors as retryable", () => {
    expect(isRetryableError(new Error("429 rate limit exceeded"))).toBe(true);
  });

  it("identifies server errors as retryable", () => {
    expect(isRetryableError(new Error("502 Bad Gateway"))).toBe(true);
    expect(isRetryableError(new Error("503 Service Unavailable"))).toBe(true);
    expect(isRetryableError(new Error("504 Gateway Timeout"))).toBe(true);
  });

  it("identifies network errors as retryable", () => {
    expect(isRetryableError(new Error("connect ECONNREFUSED"))).toBe(true);
    expect(isRetryableError(new Error("getaddrinfo ENOTFOUND"))).toBe(true);
    expect(isRetryableError(new Error("request timeout"))).toBe(true);
  });

  it("identifies non-retryable errors", () => {
    expect(isRetryableError(new Error("400 Bad Request"))).toBe(false);
    expect(isRetryableError(new Error("401 Unauthorized"))).toBe(false);
    expect(isRetryableError(new Error("403 Forbidden"))).toBe(false);
    expect(isRetryableError(new Error("404 Not Found"))).toBe(false);
    expect(isRetryableError(new Error("422 Unprocessable"))).toBe(false);
  });

  it("handles non-Error objects", () => {
    expect(isRetryableError("string error")).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});
