import { v4 as uuidv4 } from 'uuid';

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
      fn: async (runtime: any) => {
        const message: Memory = {
          entityId: uuidv4(),
          roomId: uuidv4(),
          content: { text: 'update', source: 'test', actions: ['UPDATE_RSS_FEED'] }
        };
        const state: State = { values: {}, data: {}, text: '' };
        let received = false;
        await runtime.processActions(message, [], state, async (content: Content) => {
          if (content.actions?.includes('UPDATE_RSS_FEED')) received = true;
          return [];
        });
        if (!received) throw new Error('No response from action');
      }
    }
  ];
}

export default new RSSPluginSuite();
