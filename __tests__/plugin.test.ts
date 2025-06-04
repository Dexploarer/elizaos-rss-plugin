import { describe, it, expect } from 'vitest';
import plugin from '../src/plugin';

describe('Plugin Metadata', () => {
  it('should have correct name and description', () => {
    expect(plugin.name).toBe('twitter-rss');
    expect(typeof plugin.description).toBe('string');
  });

  it('should expose actions, providers and services', () => {
    expect(Array.isArray(plugin.actions)).toBe(true);
    expect(Array.isArray(plugin.providers)).toBe(true);
    expect(Array.isArray(plugin.services)).toBe(true);
  });
});
