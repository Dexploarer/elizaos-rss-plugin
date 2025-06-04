import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { character } from '../src/index';
import plugin from '../src/plugin';

describe('Integration Tests', () => {
  it('source files exist', () => {
    const srcFiles = ['index.ts', 'plugin.ts'];
    for (const f of srcFiles) {
      expect(fs.existsSync(path.join('src', f))).toBe(true);
    }
  });

  it('character initializes with plugin', () => {
    expect(character.plugins).toContain('@elizaos/plugin-sql');
    expect(plugin.name).toBe('twitter-rss');
  });
});
