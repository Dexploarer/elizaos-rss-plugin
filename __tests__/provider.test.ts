import { describe, it, expect } from 'vitest';
import plugin from '../src/plugin';
import { createMockRuntime, createMockMessage, createMockState } from './test-utils';

const provider = plugin.providers?.find(p => p.name === 'TWITTER_LIST_PROVIDER');

describe('Twitter List Provider', () => {
  it('should exist', () => {
    expect(provider).toBeDefined();
  });

  it('should return list info', async () => {
    if (!provider) throw new Error('provider missing');
    const runtime = createMockRuntime();
    const msg = createMockMessage('info');
    const state = createMockState();
    const result = await provider.get(runtime, msg, state);
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('values');
  });
});
