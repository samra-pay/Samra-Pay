import { describe, expect, it } from "vitest";

import {
  createMobileAcquisitionSessionStore,
  type AcquisitionKeyValueStorage,
} from "./acquisition-session";

function memoryStorage(): AcquisitionKeyValueStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("mobile acquisition session storage", () => {
  it("persists only a validated opaque acquisition reference", async () => {
    const storage = memoryStorage();
    const store = createMobileAcquisitionSessionStore(storage);
    const sessionId = "acq_0123456789abcdef0123456789abcdef";

    await store.set(sessionId);
    expect(await store.get()).toBe(sessionId);
    expect([...storage.values.values()]).toEqual([sessionId]);
  });

  it("ignores poisoned storage and rejects PII-shaped values", async () => {
    const storage = memoryStorage();
    storage.values.set(
      "samra.mobile.acquisition.session.v1",
      "private@example.test",
    );
    const store = createMobileAcquisitionSessionStore(storage);

    expect(await store.get()).toBeNull();
    await expect(store.set("private@example.test")).rejects.toThrow(
      "invalid acquisition session",
    );
  });
});
