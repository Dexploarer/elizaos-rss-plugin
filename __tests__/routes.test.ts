import { describe, it, expect, vi } from 'vitest';
import plugin from '../src/plugin';

describe('Plugin Routes', () => {
  const route = plugin.routes?.find(r => r.path === '/rss');
  it('should have /rss route', () => {
    expect(route).toBeDefined();
    expect(route?.type).toBe('GET');
  });

  it('should redirect using request host', async () => {
    if (!route) throw new Error('route missing');
    const req: any = { protocol: 'https', hostname: 'example.com' };
    const res = { redirect: vi.fn() } as any;
    await route.handler(req, res);
    expect(res.redirect).toHaveBeenCalledWith('https://example.com:3001/rss');
  });
});
