import { describe, it, expect } from 'vitest';

describe('Basic sanity checks', () => {
  it('arithmetic is correct', () => {
    expect(2 + 2).toBe(4);
  });

  it('string operations work', () => {
    const tag = `v${'1.0.0'}`;
    expect(tag).toBe('v1.0.0');
  });
});
