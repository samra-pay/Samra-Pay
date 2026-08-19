import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CustomerAcquisitionSessionStore } from "@workspace/samra-client/acquisition";

export interface AcquisitionKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const ACQUISITION_SESSION_KEY = "samra.mobile.acquisition.session.v1";
const SESSION_PATTERN = /^acq_[0-9a-f]{32}$/;

export function createMobileAcquisitionSessionStore(
  storage: AcquisitionKeyValueStorage = AsyncStorage,
): CustomerAcquisitionSessionStore {
  return Object.freeze({
    async get(): Promise<string | null> {
      const value = await storage.getItem(ACQUISITION_SESSION_KEY);
      return value && SESSION_PATTERN.test(value) ? value : null;
    },
    async set(sessionId: string): Promise<void> {
      if (!SESSION_PATTERN.test(sessionId)) {
        throw new Error("Refusing to persist an invalid acquisition session.");
      }
      await storage.setItem(ACQUISITION_SESSION_KEY, sessionId);
    },
  });
}
