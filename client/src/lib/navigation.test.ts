import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './navigation';

describe('safeInternalPath', () => {
  it('accepts app-relative routes and rejects external or malformed paths', () => {
    expect(safeInternalPath('/events/17')).toBe('/events/17');
    expect(safeInternalPath('//example.com')).toBeNull();
    expect(safeInternalPath('https://example.com/events/17')).toBeNull();
    expect(safeInternalPath('/\\example.com')).toBeNull();
  });
});
