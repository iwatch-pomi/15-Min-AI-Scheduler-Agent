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
