import { describe, expect, it } from "vitest";
import { isInvalidGrant } from "@/lib/errors";

describe("isInvalidGrant", () => {
  it("Google のトークン失効エラーを見分ける", () => {
    expect(isInvalidGrant({ response: { data: { error: "invalid_grant" } } })).toBe(true);
    expect(isInvalidGrant(new Error("invalid_grant"))).toBe(true);
    expect(isInvalidGrant({ code: 404, message: "Not Found" })).toBe(false);
    expect(isInvalidGrant(null)).toBe(false);
  });
});

describe("isInsufficientScope", () => {
  it("権限不足の 403 を見分ける", async () => {
    const { isInsufficientScope } = await import("@/lib/errors");
    expect(isInsufficientScope({ code: 403, message: "Request had insufficient authentication scopes." })).toBe(true);
    expect(isInsufficientScope({ code: 403, errors: [{ reason: "insufficientPermissions" }] })).toBe(true);
    expect(isInsufficientScope({ code: 403, message: "Rate Limit Exceeded" })).toBe(false);
    expect(isInsufficientScope({ code: 404, message: "insufficient authentication scopes" })).toBe(false);
  });
});
