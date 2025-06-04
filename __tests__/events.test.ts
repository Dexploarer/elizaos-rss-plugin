import { describe, it, expect } from 'vitest';
import plugin from '../src/plugin';

describe('Plugin Events', () => {
  it('should not define events', () => {
    expect(plugin.events).toBeUndefined();
  });
});
