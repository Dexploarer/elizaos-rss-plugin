import { describe, it, expect } from 'vitest';
import { character } from '../src/index';

describe('Character Configuration', () => {
  it('should have correct name', () => {
    expect(character.name).toBe('TwitterRSSAgent');
  });

  it('should include plugin-sql in plugins', () => {
    expect(character.plugins).toContain('@elizaos/plugin-sql');
  });
});
