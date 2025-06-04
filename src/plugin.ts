import { Plugin, IAgentRuntime, logger } from '@elizaos/core';
import { z } from 'zod';
import { TwitterRSSService } from './services/twitterRSSService';
import { RSSServerService } from './services/rssServerService';
import { updateRSSAction } from './actions/updateRSS';
import { getRSSStatusAction } from './actions/getRSSStatus';
import { twitterListProvider } from './providers/twitterList';

const configSchema = z.object({
  TWITTER_USERNAME: z.string().min(1, 'Twitter username is required').optional(),
  TWITTER_PASSWORD: z.string().min(1, 'Twitter password is required').optional(),
  TWITTER_EMAIL: z.string().email('Valid Twitter email is required').optional(),
  TWITTER_LISTS: z
    .string()
    .min(1, 'At least one Twitter list ID is required')
    .optional(),
  RSS_UPDATE_INTERVAL: z.string().transform((val) => parseInt(val || '30')).optional(),
  MAX_TWEETS_PER_LIST: z.string().transform((val) => parseInt(val || '50')).optional(),
  RSS_API_TOKEN: z.string().optional(),
  RSS_FEED_TITLE: z.string().optional().default('Twitter Lists RSS Feed'),
  RSS_FEED_DESCRIPTION: z
    .string()
    .optional()
    .default('Aggregated tweets from monitored Twitter lists'),
  RSS_OUTPUT_DIR: z.string().optional().default('./rss-feeds'),
  RSS_SERVER_PORT: z.string().transform((val) => parseInt(val || '3001')).optional(),
  FILTER_RETWEETS: z.string().transform((val) => val === 'true').optional(),
  FILTER_REPLIES: z.string().transform((val) => val === 'true').optional(),
  MIN_TWEET_LENGTH: z.string().transform((val) => parseInt(val || '10')).optional(),
  MAX_RSS_ENTRIES: z.string().transform((val) => parseInt(val || '500')).optional(),
  FETCH_TWEET_THREADS: z.string().transform((val) => val === 'true').optional(),
});

export function setupGracefulShutdown(runtime: IAgentRuntime) {
  const shutdown = async () => {
    await TwitterRSSService.stop(runtime);
    await RSSServerService.stop(runtime);
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const plugin: Plugin = {
  name: 'twitter-rss',
  description: 'Monitor Twitter lists and generate RSS feeds',
  config: {
    TWITTER_USERNAME: process.env.TWITTER_USERNAME,
    TWITTER_PASSWORD: process.env.TWITTER_PASSWORD,
    TWITTER_EMAIL: process.env.TWITTER_EMAIL,
    TWITTER_LISTS: process.env.TWITTER_LISTS,
    RSS_UPDATE_INTERVAL: process.env.RSS_UPDATE_INTERVAL || '30',
    MAX_TWEETS_PER_LIST: process.env.MAX_TWEETS_PER_LIST || '50',
    RSS_API_TOKEN: process.env.RSS_API_TOKEN,
    RSS_FEED_TITLE: process.env.RSS_FEED_TITLE || 'Twitter Lists RSS Feed',
    RSS_FEED_DESCRIPTION:
      process.env.RSS_FEED_DESCRIPTION || 'Aggregated tweets from monitored Twitter lists',
    RSS_OUTPUT_DIR: process.env.RSS_OUTPUT_DIR || './rss-feeds',
    RSS_SERVER_PORT: process.env.RSS_SERVER_PORT || '3001',
    FILTER_RETWEETS: process.env.FILTER_RETWEETS || 'false',
    FILTER_REPLIES: process.env.FILTER_REPLIES || 'false',
    MIN_TWEET_LENGTH: process.env.MIN_TWEET_LENGTH || '10',
    MAX_RSS_ENTRIES: process.env.MAX_RSS_ENTRIES || '500',
    FETCH_TWEET_THREADS: process.env.FETCH_TWEET_THREADS || 'false',
  },

  async init(config: Record<string, string>) {
    logger.info('*** Initializing Twitter RSS plugin ***');
    try {
      const validatedConfig = await configSchema.parseAsync(config);
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value !== undefined) process.env[key] = String(value);
      }
      Object.assign(plugin.config as Record<string, string>, validatedConfig);
      logger.info('Twitter RSS plugin configured successfully');
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn(`Twitter RSS configuration warning: ${error.errors.map((e) => e.message).join(', ')}`);
      } else {
        throw error;
      }
    }
  },

  routes: [
    {
      path: '/rss',
      type: 'GET',
      handler: async (req: any, res: any) => {
        const port = plugin.config.RSS_SERVER_PORT || '3001';
        const protocol = req.protocol || 'http';
        const host = req.hostname || 'localhost';
        res.redirect(`${protocol}://${host}:${port}/rss`);
      },
    },
  ],

  services: [TwitterRSSService, RSSServerService],
  actions: [updateRSSAction, getRSSStatusAction],
  providers: [twitterListProvider],
};

export default plugin;
