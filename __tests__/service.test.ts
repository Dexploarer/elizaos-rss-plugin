import { describe, it, expect, vi } from 'vitest';
import { TwitterRSSService } from '../src/plugin';
import { createMockRuntime } from './test-utils';

describe('TwitterRSSService failure cases', () => {
  it('throws when not authenticated', async () => {
    const runtime = createMockRuntime();
    const service = new TwitterRSSService(runtime as any);
    await expect(service.processAllLists()).rejects.toThrow('Twitter authentication required');
  });

  it('continues when fetchListTweets fails', async () => {
    const runtime = createMockRuntime({ getSetting: vi.fn().mockReturnValue('value') });
    const service = new TwitterRSSService(runtime as any);
    // Force authentication state
    (service as any).isLoggedIn = true;
    (service as any).twitterLists = [{ listId: '1' }];
    service.fetchListTweets = vi.fn().mockRejectedValue(new Error('fail')) as any;
    const result = await service.processAllLists();
    expect(result.totalTweets).toBe(0);
  });
});
