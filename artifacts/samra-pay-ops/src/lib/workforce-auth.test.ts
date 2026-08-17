import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeWorkforceSession,
  createWorkforceSession,
  loadWorkforceSession,
} from "./workforce-auth";

const session = {
  operatorId: "operator-1",
  displayName: "Synthetic Operator",
  role: "support_readonly",
  expiresAt: "2026-08-17T18:00:00.000Z",
};

describe("workforce session client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses an HttpOnly-cookie compatible credentialed session flow", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(session), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(session), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createWorkforceSession("agent@example.test", "not-a-real-password"),
    ).resolves.toEqual(session);
    await expect(loadWorkforceSession()).resolves.toEqual(session);
    await expect(closeWorkforceSession()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/api/v1/internal/auth/session"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.any(String),
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });

  it("fails closed when no workforce session exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(loadWorkforceSession()).resolves.toBeNull();
  });
});
