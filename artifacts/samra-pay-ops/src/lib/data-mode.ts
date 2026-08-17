// Data mode boundary — reads VITE_SAMRA_OPS_DATA_MODE at build time.
// Only "mock" and "api" are valid. An invalid explicit value fails closed:
// it must never cause an accidental fall back to synthetic financial data.

export type DataMode = 'mock' | 'api';

export function parseOperationsEnabled(raw: string | undefined): boolean {
  if (!raw || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new Error(`[ops-portal] VITE_SAMRA_OPERATIONS_ENABLED must be "true" or "false"; received "${raw}".`);
}

export function parseDataMode(raw: string | undefined): DataMode {
  if (raw === 'api') return 'api';
  if (raw === 'mock' || !raw) return 'mock';
  throw new Error(`[ops-portal] VITE_SAMRA_OPS_DATA_MODE must be "mock" or "api"; received "${raw}".`);
}

export const DATA_MODE: DataMode = parseDataMode(import.meta.env.VITE_SAMRA_OPS_DATA_MODE);
export const IS_MOCK = DATA_MODE === 'mock';
export const IS_API = DATA_MODE === 'api';
export const OPERATIONS_ENABLED = parseOperationsEnabled(import.meta.env.VITE_SAMRA_OPERATIONS_ENABLED);

export function parseApiOrigin(raw: string | undefined, mode: DataMode): string | null {
  if (!raw) {
    if (mode === 'api') {
      throw new Error('[ops-portal] VITE_SAMRA_API_ORIGIN is required in API mode.');
    }
    return null;
  }

  const value = raw.replace(/\/+$/, '');
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('[ops-portal] VITE_SAMRA_API_ORIGIN must use http or https.');
  }
  return value;
}

export const API_ORIGIN = parseApiOrigin(import.meta.env.VITE_SAMRA_API_ORIGIN, DATA_MODE);
