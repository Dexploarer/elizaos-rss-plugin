import { describe, it, expect, vi } from 'vitest';
import plugin from '../src/plugin';
import { createMockRuntime, createMockMessage, createMockState } from './test-utils';

const updateAction = plugin.actions?.find(a => a.name === 'UPDATE_RSS_FEED');
const statusAction = plugin.actions?.find(a => a.name === 'GET_RSS_STATUS');

describe('RSS Plugin Actions', () => {
  it('should expose UPDATE_RSS_FEED and GET_RSS_STATUS', () => {
    expect(updateAction).toBeDefined();
    expect(statusAction).toBeDefined();
  });

  it('should execute UPDATE_RSS_FEED handler', async () => {
    if (!updateAction) throw new Error('UPDATE_RSS_FEED missing');
    const processAllLists = vi.fn().mockResolvedValue({ totalTweets: 1, rssPath: 'rss.xml' });
    const runtime = createMockRuntime({ getService: vi.fn().mockReturnValue({ processAllLists }) });
    const msg = createMockMessage('update');
    const state = createMockState();
    const cb = vi.fn();
    await updateAction.handler(runtime, msg, state, {}, cb);
    expect(runtime.getService).toHaveBeenCalled();
    expect(processAllLists).toHaveBeenCalled();
    expect(cb).toHaveBeenCalled();
  });

  it('should execute GET_RSS_STATUS handler', async () => {
    if (!statusAction) throw new Error('GET_RSS_STATUS missing');
    const runtime = createMockRuntime();
    const msg = createMockMessage('status');
    const state = createMockState();
    const cb = vi.fn();
    await statusAction.handler(runtime, msg, state, {}, cb);
    expect(cb).toHaveBeenCalled();
  });
});
