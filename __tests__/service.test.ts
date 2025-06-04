import { describe, it, expect, vi } from 'vitest';
import { TwitterRSSService } from '../src/services/twitterRSSService';
import { createMockRuntime } from './test-utils';

describe('TwitterRSSService failure cases', () => {
  it('throws when not authenticated', async () => {
    const runtime = createMockRuntime();
    const service = new TwitterRSSService(runtime as any);
    await expect(service.processAllLists()).rejects.toThrow(
      'Twitter authentication required'
    );
  });

  it('continues when fetchListTweets fails', async () => {
    const runtime = createMockRuntime({
      getSetting: vi.fn().mockReturnValue('value'),
    });
    const service = new TwitterRSSService(runtime as any);
    // Force authentication state
    (service as any).isLoggedIn = true;
    (service as any).twitterLists = [{ listId: '1' }];
    service.fetchListTweets = vi
      .fn()
      .mockRejectedValue(new Error('fail')) as any;
    const result = await service.processAllLists();
    expect(result.totalTweets).toBe(0);
  });

  it('fetches tweet threads when enabled', async () => {
    const runtime = createMockRuntime({
      getSetting: vi.fn((key: string) => {
        if (key === 'FETCH_TWEET_THREADS') return 'true';
        if (key === 'MIN_TWEET_LENGTH') return '0';
        return undefined;
      }),
    });
    const service = new TwitterRSSService(runtime as any);
    (service as any).scraper.fetchListTweets = vi
      .fn()
      .mockResolvedValue([{ id: '1', text: 'hi' }]);
    (service as any).scraper.getTweet = vi
      .fn()
      .mockResolvedValue({ id: '1', thread: [{ id: '2', text: 'reply' }] });
    const tweets = await service.fetchListTweets('1');
    expect((service as any).scraper.getTweet).toHaveBeenCalledWith('1');
    expect(tweets[0].thread?.length).toBe(1);
  });
});
