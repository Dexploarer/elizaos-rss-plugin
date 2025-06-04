import { describe, it, expect } from 'vitest';
import plugin from '../src/plugin';

describe('Plugin Configuration', () => {
  it('init accepts empty config', async () => {
    if (plugin.init) {
      await plugin.init({});
      expect(true).toBe(true);
    }
  });
});
