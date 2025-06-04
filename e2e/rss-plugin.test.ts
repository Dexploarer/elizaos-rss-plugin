import { v4 as uuidv4 } from 'uuid';
import plugin from '../src/plugin';

interface TestSuite {
  name: string;
  description: string;
  tests: Array<{ name: string; fn: (runtime: any) => Promise<any> }>;
}

interface Memory {
  entityId: string;
  roomId: string;
  content: { text: string; source: string; actions?: string[] };
}

interface State { values: Record<string, any>; data: Record<string, any>; text: string }

interface Content { text: string; actions?: string[]; source?: string }

export class RSSPluginSuite implements TestSuite {
  name = 'rss';
  description = 'E2E tests for the RSS plugin';

  tests = [
    {
      name: 'Update RSS action produces response',
      fn: async () => {
        const action = plugin.actions?.find(a => a.name === 'UPDATE_RSS_FEED');
        if (!action) throw new Error('Action not found');

        const runtime: any = {
          getService: () => ({ processAllLists: async () => ({ totalTweets: 1, rssPath: 'rss.xml' }) })
        };
        const message: any = {
          entityId: uuidv4(),
          roomId: uuidv4(),
          content: { text: 'update', source: 'test' }
        };
        const state: any = { values: {}, data: {}, text: '' };

        let received = false;
        await action.handler(runtime as any, message as any, state as any, {}, () => {
          received = true;
        });

        if (!received) throw new Error('No response from action');
      }
    }
  ];
}

export default new RSSPluginSuite();
