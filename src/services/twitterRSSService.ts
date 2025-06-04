import { Service, IAgentRuntime, logger } from '@elizaos/core';
import { Scraper } from 'agent-twitter-client';
import fs from 'fs/promises';
import path from 'path';
import { XMLBuilder } from 'fast-xml-parser';

interface TwitterListConfig {
  listId: string;
  name?: string;
  lastProcessedTweetId?: string;
}

interface RawTweetData {
  id?: string;
  text?: string;
  username?: string;
  name?: string;
  isVerified?: boolean;
  timestamp?: number | string;
  isRetweet?: boolean;
  isReply?: boolean;
  inReplyToStatusId?: string;
  retweetedStatus?: any;
  quotedStatus?: any;
  photos?: Array<{ url: string }>;
  likes?: number;
  retweets?: number;
  thread?: RawTweetData[];
  replies?: number;
  [key: string]: any;
}

interface TweetData {
  id: string;
  text: string;
  author: {
    username: string;
    name: string;
    verified?: boolean;
  };
  createdAt: Date;
  url: string;
  isRetweet: boolean;
  isReply: boolean;
  replyToTweetId?: string;
  retweetedTweet?: any;
  quotedTweet?: any;
  media?: Array<{
    type: string;
    url: string;
  }>;
  metrics?: {
    likes: number;
    retweets: number;
    replies: number;
  };
  thread?: TweetData[];
}

interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  guid: string;
  author: string;
  category?: string[];
}

interface RSSFeed {
  title: string;
  description: string;
  link: string;
  lastBuildDate: string;
  items: RSSItem[];
}

export class TwitterRSSService extends Service {
  static serviceType = 'twitter-rss';
  private scraper: Scraper;
  private isLoggedIn = false;
  private twitterLists: TwitterListConfig[] = [];
  private processedTweetIds: Set<string> = new Set();
  private schedulerInterval: NodeJS.Timeout | null = null;

  capabilityDescription =
    'Twitter RSS service that monitors Twitter lists and generates RSS feeds.';

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
    this.scraper = new Scraper();
    this.initializeLists();
  }

  private getConfig(key: string, defaultValue?: string): string | undefined {
    const val = this.runtime.getSetting?.(key) ?? process.env[key];
    return (val as string | undefined) ?? defaultValue;
  }

  private initializeLists(): void {
    const lists = this.getConfig('TWITTER_LISTS');
    const listIds = lists ? lists.split(',') : [];
    this.twitterLists = listIds.map((id) => ({
      listId: id.trim(),
      name: `List ${id.trim()}`,
    }));
  }

  static async start(runtime: IAgentRuntime) {
    logger.info('*** Starting Twitter RSS service ***');
    const service = new TwitterRSSService(runtime);
    await service.initialize();
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** Stopping Twitter RSS service ***');
    const service = runtime.getService(TwitterRSSService.serviceType);
    if (service instanceof TwitterRSSService) {
      await service.stop();
    }
  }

  async initialize(): Promise<void> {
    try {
      const username = this.getConfig('TWITTER_USERNAME');
      const password = this.getConfig('TWITTER_PASSWORD');
      const email = this.getConfig('TWITTER_EMAIL');
      if (!username || !password || !email) {
        logger.warn(
          'Twitter credentials not configured, Twitter RSS service will be disabled'
        );
        return;
      }

      logger.info('Attempting Twitter authentication...');

      const proxy = this.getConfig('PROXY_URL');
      if (proxy) {
        logger.info('Using proxy for Twitter connection:', proxy);
      }

      await this.scraper.login(username, password, email);

      this.isLoggedIn = await this.scraper.isLoggedIn();

      if (this.isLoggedIn) {
        logger.info('✅ Twitter authentication successful');
        await this.loadProcessedTweetIds();
        this.startScheduler();
      } else {
        logger.warn(
          '❌ Twitter authentication failed - service will run in limited mode'
        );
      }
    } catch (error: any) {
      logger.error('❌ Twitter authentication failed:', error.message);
      logger.warn('Twitter RSS service will run in limited mode. Consider:');
      logger.warn('1. Using a proxy (set PROXY_URL in .env)');
      logger.warn('2. Trying again later (Twitter may be rate limiting)');
      logger.warn('3. Checking if your IP is blocked by Twitter/Cloudflare');
    }
  }

  async stop() {
    logger.info('*** Stopping Twitter RSS service instance ***');
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    await this.saveProcessedTweetIds();
  }

  private async loadProcessedTweetIds(): Promise<void> {
    try {
      const outputDir = (this.getConfig('RSS_OUTPUT_DIR', './rss-feeds') as string);
      const cacheFile = path.join(outputDir, 'processed_tweets.json');
      const data = await fs.readFile(cacheFile, 'utf-8');
      const processedIds = JSON.parse(data);
      this.processedTweetIds = new Set(processedIds);
    } catch {
      this.processedTweetIds = new Set();
    }
  }

  private async saveProcessedTweetIds(): Promise<void> {
    try {
      const outputDir = (this.getConfig('RSS_OUTPUT_DIR', './rss-feeds') as string);
      await fs.mkdir(outputDir, { recursive: true });
      const cacheFile = path.join(outputDir, 'processed_tweets.json');
      const processedIds = Array.from(this.processedTweetIds);
      await fs.writeFile(cacheFile, JSON.stringify(processedIds, null, 2));
    } catch (error) {
      logger.error('Failed to save processed tweet IDs:', error);
    }
  }

  private startScheduler(): void {
    if (!this.isLoggedIn) {
      logger.warn(
        'Skipping RSS scheduler - Twitter authentication not available'
      );
      return;
    }

    const intervalMinutes = parseInt(
      (this.getConfig('RSS_UPDATE_INTERVAL', '30') as string)
    );
    const intervalMs = intervalMinutes * 60 * 1000;

    logger.info(
      `Starting RSS scheduler with ${intervalMinutes}-minute intervals`
    );

    this.schedulerInterval = setInterval(async () => {
      try {
        logger.info('Scheduled RSS update starting...');
        const result = await this.processAllLists();
        logger.info(
          `Scheduled update completed: ${result.totalTweets} tweets processed`
        );
      } catch (error) {
        logger.error('Scheduled RSS update failed:', error);
      }
    }, intervalMs);

    setTimeout(async () => {
      try {
        logger.info('Running initial RSS update...');
        const result = await this.processAllLists();
        logger.info(
          `Initial update completed: ${result.totalTweets} tweets processed`
        );
      } catch (error) {
        logger.error('Initial RSS update failed:', error);
      }
    }, 5000);
  }

  async fetchListTweets(listId: string, maxTweets: number = 50): Promise<TweetData[]> {
    try {
      const tweets = await this.scraper.fetchListTweets(listId, maxTweets);
      const filtered = (tweets as RawTweetData[]).filter(
        (tweet: RawTweetData) => tweet && tweet.id && !this.processedTweetIds.has(tweet.id)
      );

      if (this.getConfig('FETCH_TWEET_THREADS') === 'true') {
        for (const tweet of filtered) {
          try {
            const full = await this.scraper.getTweet(tweet.id as string);
            if (full && Array.isArray(full.thread)) {
              tweet.thread = full.thread;
            }
          } catch (err: any) {
            logger.warn(
              `Failed to fetch thread for tweet ${tweet.id}:`,
              err.message
            );
          }
        }
      }

      return filtered
        .map(this.transformTweet.bind(this))
        .filter(this.applyFilters.bind(this));
    } catch (error) {
      logger.error(`Failed to fetch tweets from list ${listId}:`, error);
      return [];
    }
  }

  private transformTweet(tweet: RawTweetData): TweetData {
    if (!tweet.id) {
      throw new Error('Tweet missing required ID field');
    }

    return {
      id: tweet.id,
      text: tweet.text || '',
      author: {
        username: tweet.username || 'unknown',
        name: tweet.name || 'Unknown User',
        verified: tweet.isVerified || false,
      },
      createdAt: new Date(tweet.timestamp || Date.now()),
      url: `https://twitter.com/${tweet.username || 'unknown'}/status/${tweet.id}`,
      isRetweet: tweet.isRetweet || false,
      isReply: tweet.isReply || false,
      replyToTweetId: tweet.inReplyToStatusId,
      retweetedTweet: tweet.retweetedStatus,
      quotedTweet: tweet.quotedStatus,
      media:
        tweet.photos?.map((photo: any) => ({
          type: 'image',
          url: photo.url,
        })) || [],
      metrics: {
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        replies: tweet.replies || 0,
      },
      thread: Array.isArray(tweet.thread)
        ? tweet.thread.map((t: RawTweetData) => this.transformTweet(t))
        : undefined,
    };
  }

  private applyFilters(tweet: TweetData): boolean {
    if (this.getConfig('FILTER_RETWEETS') === 'true' && tweet.isRetweet) {
      return false;
    }

    if (this.getConfig('FILTER_REPLIES') === 'true' && tweet.isReply) {
      return false;
    }

    const minLength = parseInt(
      (this.getConfig('MIN_TWEET_LENGTH', '0') as string)
    );
    if (tweet.text.length < minLength) {
      return false;
    }

    return true;
  }

  async generateRSSFeed(tweets: TweetData[]): Promise<string> {
    const feed: RSSFeed = {
      title: this.getConfig(
        'RSS_FEED_TITLE',
        'Twitter Lists RSS Feed'
      ) as string,
      description: this.getConfig(
        'RSS_FEED_DESCRIPTION',
        'Aggregated tweets from monitored Twitter lists'
      ) as string,
      link: 'https://twitter.com',
      lastBuildDate: new Date().toUTCString(),
      items: tweets.map(this.transformToRSSItem.bind(this)),
    };

    return this.buildRSSXML(feed);
  }

  private transformToRSSItem(tweet: TweetData): RSSItem {
    let description = tweet.text;

    if (tweet.media && tweet.media.length > 0) {
      description += `\n\nMedia: ${tweet.media.length} attachment(s)`;
    }

    if (tweet.metrics) {
      description += `\n\n❤️ ${tweet.metrics.likes} | 🔄 ${tweet.metrics.retweets} | 💬 ${tweet.metrics.replies}`;
    }

    if (tweet.thread && tweet.thread.length > 0) {
      const replies = tweet.thread
        .map((t) => `@${t.author.username}: ${t.text}`)
        .join('\n');
      description += `\n\nThread:\n${replies}`;
    }

    return {
      title: `@${tweet.author.username}: ${tweet.text.substring(0, 100)}${
        tweet.text.length > 100 ? '...' : ''
      }`,
      description,
      link: tweet.url,
      pubDate: tweet.createdAt.toUTCString(),
      guid: tweet.id,
      author: `${tweet.author.name} (@${tweet.author.username})`,
      category: tweet.isRetweet
        ? ['retweet']
        : tweet.isReply
        ? ['reply']
        : ['tweet'],
    };
  }

  private buildRSSXML(feed: RSSFeed): string {
    const rssData = {
      rss: {
        '@_version': '2.0',
        '@_xmlns:atom': 'http://www.w3.org/2005/Atom',
        channel: {
          title: feed.title,
          description: feed.description,
          link: feed.link,
          lastBuildDate: feed.lastBuildDate,
          generator: 'ElizaOS Twitter RSS Agent',
          'atom:link': {
            '@_href': feed.link,
            '@_rel': 'self',
            '@_type': 'application/rss+xml',
          },
          item: feed.items.map((item) => ({
            title: item.title,
            description: { '#cdata': item.description },
            link: item.link,
            pubDate: item.pubDate,
            guid: {
              '@_isPermaLink': 'false',
              '#text': item.guid,
            },
            author: item.author,
            category: item.category,
          })),
        },
      },
    };

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      cdataPropName: '#cdata',
    });

    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(rssData)
    );
  }

  async saveRSSFeed(
    rssXML: string,
    filename: string = 'twitter_lists.xml'
  ): Promise<string> {
    const outputDir = (this.getConfig('RSS_OUTPUT_DIR', './rss-feeds') as string);
    await fs.mkdir(outputDir, { recursive: true });

    const filePath = path.join(outputDir, filename);
    await fs.writeFile(filePath, rssXML, 'utf-8');

    return filePath;
  }

  async processAllLists(): Promise<{ totalTweets: number; rssPath: string }> {
    if (!this.isLoggedIn) {
      logger.warn(
        'Twitter not authenticated - cannot fetch tweets. Check authentication status.'
      );
      throw new Error(
        'Twitter authentication required. Please check credentials and try again.'
      );
    }

    const allTweets: TweetData[] = [];
    const maxTweetsPerList = parseInt(
      (this.getConfig('MAX_TWEETS_PER_LIST', '50') as string)
    );

    for (const list of this.twitterLists) {
      logger.info(`Processing list: ${list.listId}`);

      try {
        const tweets = await this.fetchListTweets(
          list.listId,
          maxTweetsPerList
        );
        allTweets.push(...tweets);
        tweets.forEach((tweet) => this.processedTweetIds.add(tweet.id));
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error(`Error processing list ${list.listId}:`, error);
      }
    }

    allTweets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const maxEntries = parseInt(
      (this.getConfig('MAX_RSS_ENTRIES', '500') as string)
    );
    const limitedTweets = allTweets.slice(0, maxEntries);

    const rssXML = await this.generateRSSFeed(limitedTweets);
    const rssPath = await this.saveRSSFeed(rssXML);

    await this.saveProcessedTweetIds();

    return {
      totalTweets: limitedTweets.length,
      rssPath,
    };
  }
}
