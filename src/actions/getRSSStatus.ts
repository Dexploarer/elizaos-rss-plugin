import { Action, Content, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '@elizaos/core';

export const getRSSStatusAction: Action = {
  name: 'GET_RSS_STATUS',
  similes: ['RSS_STATUS', 'FEED_STATUS', 'CHECK_RSS'],
  description: 'Get current status of RSS feed and monitoring lists',

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    try {
      const outputDir =
        runtime.getSetting?.('RSS_OUTPUT_DIR') || process.env.RSS_OUTPUT_DIR || './rss-feeds';
      const rssFile = path.join(outputDir, 'twitter_lists.xml');

      let status = 'RSS Feed Status:\n';

      try {
        const stats = await fs.stat(rssFile);
        status += `📄 RSS file exists: ${rssFile}\n`;
        status += `📅 Last modified: ${stats.mtime.toLocaleString()}\n`;
        status += `📊 File size: ${(stats.size / 1024).toFixed(1)} KB\n`;
      } catch {
        status += `❌ RSS file not found\n`;
      }

      const lists = (
        runtime.getSetting?.('TWITTER_LISTS') || process.env.TWITTER_LISTS || ''
      )
        .split(',')
        .filter(Boolean);
      status += `📋 Monitoring ${lists.length} lists: ${lists.join(', ')}\n`;
      status += `⏱️ Update interval: ${
        runtime.getSetting?.('RSS_UPDATE_INTERVAL') || process.env.RSS_UPDATE_INTERVAL || '30'
      } minutes\n`;
      status += `🎯 Max tweets per update: ${
        runtime.getSetting?.('MAX_TWEETS_PER_LIST') || process.env.MAX_TWEETS_PER_LIST || '50'
      }\n`;

      const responseContent: Content = {
        text: status,
        source: message.content.source,
        actions: ['GET_RSS_STATUS'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error: any) {
      logger.error('Status check failed:', error);

      const errorContent: Content = {
        text: `❌ Status check failed: ${error.message}`,
        source: message.content.source,
      };

      await callback(errorContent);
      return errorContent;
    }
  },
};
