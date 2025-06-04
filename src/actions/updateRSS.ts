import { Action, Content, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { TwitterRSSService } from '../services/twitterRSSService';
import { logger } from '@elizaos/core';

export const updateRSSAction: Action = {
  name: 'UPDATE_RSS_FEED',
  similes: ['REFRESH_RSS', 'UPDATE_FEED', 'FETCH_LISTS'],
  description: 'Update RSS feed with latest tweets from monitored Twitter lists',

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<boolean> => {
    const service = runtime.getService(TwitterRSSService.serviceType);
    return service instanceof TwitterRSSService;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    try {
      const service = runtime.getService(
        TwitterRSSService.serviceType
      ) as TwitterRSSService;

      if (!service) {
        throw new Error('Twitter RSS service not available');
      }

      const result = await service.processAllLists();

      const responseContent: Content = {
        text: `RSS feed updated successfully!\n📊 Processed ${result.totalTweets} new tweets\n📁 RSS file: ${result.rssPath}\n🕒 Last updated: ${new Date().toLocaleString()}`,
        source: message.content.source,
        actions: ['UPDATE_RSS_FEED'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error: any) {
      logger.error('RSS update failed:', error);

      const errorContent: Content = {
        text: `❌ RSS update failed: ${error.message}`,
        source: message.content.source,
      };

      await callback(errorContent);
      return errorContent;
    }
  },
};
