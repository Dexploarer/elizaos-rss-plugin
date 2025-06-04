import { describe, it, expect } from 'vitest';
import { RSSServerService } from '../src/plugin';

describe('Service Stop Handling', () => {
  it('should handle missing service gracefully', async () => {
    const runtime = { getService: () => null } as any;
    await RSSServerService.stop(runtime);
    expect(true).toBe(true); // no throw
  });
});
