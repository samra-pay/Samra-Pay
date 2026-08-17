// Data mode boundary — reads VITE_SAMRA_OPS_DATA_MODE at build time.
// Only "mock" and "api" are valid. An invalid explicit value fails closed:
// it must never cause an accidental fall back to synthetic financial data.

export type DataMode = 'mock' | 'api';

export function parseDataMode(raw: string | undefined): DataMode {
  if (raw === 'api') return 'api';
  if (raw === 'mock' || !raw) return 'mock';
  throw new Error(
    `[ops-portal] VITE_SAMRA_OPS_DATA_MODE must be "mock" or "api"; received "${raw}".`,
  );
}

export const DATA_MODE: DataMode = parseDataMode(
  import.meta.env.VITE_SAMRA_OPS_DATA_MODE,
);
export const IS_MOCK = DATA_MODE === 'mock';
export const IS_API = DATA_MODE === 'api';
