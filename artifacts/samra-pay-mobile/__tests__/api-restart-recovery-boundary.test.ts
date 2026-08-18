import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const screenSource = readFileSync(
  fileURLToPath(new URL("../components/ApiRemittanceScreen.tsx", import.meta.url)),
  "utf8",
);
const sessionSource = readFileSync(
  fileURLToPath(new URL("../lib/remittance-session.ts", import.meta.url)),
  "utf8",
);

describe("mobile restart recovery trust boundary", () => {
  it("automatically resumes a prepared backend command on launch", () => {
    expect(screenSource).toContain("restored?.transferIdempotencyKey");
    expect(screenSource).toContain("resumePreparedTransfer");
    expect(screenSource).toContain("setTransferId(recovered.id)");
  });

  it("automatically resumes a prepared cancellation only while cancellable", () => {
    expect(screenSource).toContain("resumePreparedCancellation");
    expect(screenSource).toContain("CANCELLABLE_TRANSFER_STATUSES.has");
    expect(screenSource).toContain("session?.cancelIdempotencyKey");
  });

  it("persists recovery locators without a local transfer status or balance", () => {
    const sessionShape = sessionSource.slice(
      sessionSource.indexOf("export type MobileRemittanceSession"),
      sessionSource.indexOf("const SESSION_KEY"),
    );
    expect(sessionShape).toContain("transferId?: string");
    expect(sessionShape).toContain("transferIdempotencyKey?: string");
    expect(sessionShape).not.toMatch(/balance|transferStatus|status:/);
  });

  it("removes invalid local recovery data", () => {
    expect(sessionSource).toContain("await storage.removeItem(SESSION_KEY)");
  });
});
