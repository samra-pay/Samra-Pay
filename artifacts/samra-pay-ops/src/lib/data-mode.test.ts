import { describe, expect, it } from 'vitest';
import {
  parseApiOrigin,
  parseDataMode,
  parseOperationsEnabled,
} from './data-mode';

describe('operations deployment configuration', () => {
  it('supports an explicit same-origin API proxy without enabling mock mode', () => {
    expect(parseApiOrigin('same-origin', 'api')).toBe('');
    expect(parseDataMode('api')).toBe('api');
  });

  it('still requires an explicit API origin in API mode', () => {
    expect(() => parseApiOrigin(undefined, 'api')).toThrow(/required/);
  });

  it('rejects unsafe API protocols and invalid operations flags', () => {
    expect(() => parseApiOrigin('file:///tmp/api', 'api')).toThrow(/http or https/);
    expect(() => parseOperationsEnabled('yes')).toThrow(/true.*false/);
  });
});
