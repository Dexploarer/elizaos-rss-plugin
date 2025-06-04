import { describe, it, expect } from 'vitest';
import plugin from '../src/plugin';

describe('Plugin Models', () => {
  it('should not define models', () => {
    expect(plugin.models).toBeUndefined();
  });
});
