import { describe, expect, it } from "vitest";
import { normalizeWaitlistPhone } from "./waitlist-phone";

describe("waitlist phone formatting", () => {
  it("normalizes US, Ethiopian and other international formats", () => {
    expect(normalizeWaitlistPhone("(202) 555-0123", "US")).toBe("+12025550123");
    expect(normalizeWaitlistPhone("+1 202 555 0123", "US")).toBe(
      "+12025550123",
    );
    expect(normalizeWaitlistPhone("091 123 4567", "ET")).toBe("+251911234567");
    expect(normalizeWaitlistPhone("+251 911 234 567", "ET")).toBe(
      "+251911234567",
    );
    expect(normalizeWaitlistPhone("+44 7700 900123", "international")).toBe(
      "+447700900123",
    );
    expect(normalizeWaitlistPhone("  ", "ET")).toBe("");
  });
  it("rejects ambiguous, mismatched, short and extended phone numbers", () => {
    expect(normalizeWaitlistPhone("07700 900123", "international")).toBeNull();
    expect(normalizeWaitlistPhone("+251911234567", "US")).toBeNull();
    expect(normalizeWaitlistPhone("2025550123 ext 2", "US")).toBeNull();
    expect(normalizeWaitlistPhone("123", "ET")).toBeNull();
    expect(normalizeWaitlistPhone("+01234567890", "international")).toBeNull();
    expect(
      normalizeWaitlistPhone("+1234567890123456", "international"),
    ).toBeNull();
  });
});
