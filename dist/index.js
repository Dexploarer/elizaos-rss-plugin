// src/index.ts
import {
  logger as logger2
} from "@elizaos/core";

// src/plugin.ts
import {
  Service,
  logger
} from "@elizaos/core";
import { z } from "zod";
import { Scraper } from "agent-twitter-client";
import fs from "fs/promises";
import path from "path";
import { XMLBuilder } from "fast-xml-parser";
import express from "express";
import cors from "cors";
var configSchema = z.object({
  TWITTER_USERNAME: z.string().min(1, "Twitter username is required").optional(),
  TWITTER_PASSWORD: z.string().min(1, "Twitter password is required").optional(),
  TWITTER_EMAIL: z.string().email("Valid Twitter email is required").optional(),
  TWITTER_LISTS: z.string().min(1, "At least one Twitter list ID is required").optional(),
  RSS_UPDATE_INTERVAL: z.string().transform((val) => parseInt(val || "30")).optional(),
  MAX_TWEETS_PER_LIST: z.string().transform((val) => parseInt(val || "50")).optional(),
  RSS_FEED_TITLE: z.string().optional().default("Twitter Lists RSS Feed"),
  RSS_FEED_DESCRIPTION: z.string().optional().default("Aggregated tweets from monitored Twitter lists"),
  RSS_OUTPUT_DIR: z.string().optional().default("./rss-feeds"),
  RSS_SERVER_PORT: z.string().transform((val) => parseInt(val || "3001")).optional(),
  FILTER_RETWEETS: z.string().transform((val) => val === "true").optional(),
  FILTER_REPLIES: z.string().transform((val) => val === "true").optional(),
  MIN_TWEET_LENGTH: z.string().transform((val) => parseInt(val || "10")).optional(),
  MAX_RSS_ENTRIES: z.string().transform((val) => parseInt(val || "500")).optional()
});
var TwitterRSSService = class _TwitterRSSService extends Service {
  constructor(runtime) {
    super(runtime);
    this.runtime = runtime;
    this.scraper = new Scraper();
    this.initializeLists();
  }
  static serviceType = "twitter-rss";
  scraper;
  isLoggedIn = false;
  twitterLists = [];
  processedTweetIds = /* @__PURE__ */ new Set();
  schedulerInterval = null;
  capabilityDescription = "Twitter RSS service that monitors Twitter lists and generates RSS feeds.";
  initializeLists() {
    const listIds = process.env.TWITTER_LISTS?.split(",") || [];
    this.twitterLists = listIds.map((id) => ({
      listId: id.trim(),
      name: `List ${id.trim()}`
    }));
  }
  static async start(runtime) {
    logger.info("*** Starting Twitter RSS service ***");
    const service = new _TwitterRSSService(runtime);
    await service.initialize();
    return service;
  }
  static async stop(runtime) {
    logger.info("*** Stopping Twitter RSS service ***");
    const service = runtime.getService(_TwitterRSSService.serviceType);
    if (service instanceof _TwitterRSSService) {
      await service.stop();
    }
  }
  async initialize() {
    try {
      if (!process.env.TWITTER_USERNAME || !process.env.TWITTER_PASSWORD || !process.env.TWITTER_EMAIL) {
        logger.warn("Twitter credentials not configured, Twitter RSS service will be disabled");
        return;
      }
      logger.info("Attempting Twitter authentication...");
      if (process.env.PROXY_URL) {
        logger.info("Using proxy for Twitter connection:", process.env.PROXY_URL);
      }
      await this.scraper.login(
        process.env.TWITTER_USERNAME,
        process.env.TWITTER_PASSWORD,
        process.env.TWITTER_EMAIL
      );
      this.isLoggedIn = await this.scraper.isLoggedIn();
      if (this.isLoggedIn) {
        logger.info("\u2705 Twitter authentication successful");
        await this.loadProcessedTweetIds();
        this.startScheduler();
      } else {
        logger.warn("\u274C Twitter authentication failed - service will run in limited mode");
      }
    } catch (error) {
      logger.error("\u274C Twitter authentication failed:", error.message);
      logger.warn("Twitter RSS service will run in limited mode. Consider:");
      logger.warn("1. Using a proxy (set PROXY_URL in .env)");
      logger.warn("2. Trying again later (Twitter may be rate limiting)");
      logger.warn("3. Checking if your IP is blocked by Twitter/Cloudflare");
    }
  }
  async stop() {
    logger.info("*** Stopping Twitter RSS service instance ***");
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    await this.saveProcessedTweetIds();
  }
  async loadProcessedTweetIds() {
    try {
      const outputDir = process.env.RSS_OUTPUT_DIR || "./rss-feeds";
      const cacheFile = path.join(outputDir, "processed_tweets.json");
      const data = await fs.readFile(cacheFile, "utf-8");
      const processedIds = JSON.parse(data);
      this.processedTweetIds = new Set(processedIds);
    } catch (error) {
      this.processedTweetIds = /* @__PURE__ */ new Set();
    }
  }
  async saveProcessedTweetIds() {
    try {
      const outputDir = process.env.RSS_OUTPUT_DIR || "./rss-feeds";
      await fs.mkdir(outputDir, { recursive: true });
      const cacheFile = path.join(outputDir, "processed_tweets.json");
      const processedIds = Array.from(this.processedTweetIds);
      await fs.writeFile(cacheFile, JSON.stringify(processedIds, null, 2));
    } catch (error) {
      logger.error("Failed to save processed tweet IDs:", error);
    }
  }
  startScheduler() {
    if (!this.isLoggedIn) {
      logger.warn("Skipping RSS scheduler - Twitter authentication not available");
      return;
    }
    const intervalMinutes = parseInt(process.env.RSS_UPDATE_INTERVAL || "30");
    const intervalMs = intervalMinutes * 60 * 1e3;
    logger.info(`Starting RSS scheduler with ${intervalMinutes}-minute intervals`);
    this.schedulerInterval = setInterval(async () => {
      try {
        logger.info("Scheduled RSS update starting...");
        const result = await this.processAllLists();
        logger.info(`Scheduled update completed: ${result.totalTweets} tweets processed`);
      } catch (error) {
        logger.error("Scheduled RSS update failed:", error);
      }
    }, intervalMs);
    setTimeout(async () => {
      try {
        logger.info("Running initial RSS update...");
        const result = await this.processAllLists();
        logger.info(`Initial update completed: ${result.totalTweets} tweets processed`);
      } catch (error) {
        logger.error("Initial RSS update failed:", error);
      }
    }, 5e3);
  }
  async fetchListTweets(listId, maxTweets = 50) {
    try {
      const tweets = await this.scraper.fetchListTweets(listId, maxTweets);
      return tweets.filter((tweet) => tweet && tweet.id && !this.processedTweetIds.has(tweet.id)).map(this.transformTweet.bind(this)).filter(this.applyFilters.bind(this));
    } catch (error) {
      logger.error(`Failed to fetch tweets from list ${listId}:`, error);
      return [];
    }
  }
  transformTweet(tweet) {
    if (!tweet.id) {
      throw new Error("Tweet missing required ID field");
    }
    return {
      id: tweet.id,
      text: tweet.text || "",
      author: {
        username: tweet.username || "unknown",
        name: tweet.name || "Unknown User",
        verified: tweet.isVerified || false
      },
      createdAt: new Date(tweet.timestamp || Date.now()),
      url: `https://twitter.com/${tweet.username || "unknown"}/status/${tweet.id}`,
      isRetweet: tweet.isRetweet || false,
      isReply: tweet.isReply || false,
      replyToTweetId: tweet.inReplyToStatusId,
      retweetedTweet: tweet.retweetedStatus,
      quotedTweet: tweet.quotedStatus,
      media: tweet.photos?.map((photo) => ({
        type: "image",
        url: photo.url
      })) || [],
      metrics: {
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        replies: tweet.replies || 0
      }
    };
  }
  applyFilters(tweet) {
    if (process.env.FILTER_RETWEETS === "true" && tweet.isRetweet) {
      return false;
    }
    if (process.env.FILTER_REPLIES === "true" && tweet.isReply) {
      return false;
    }
    const minLength = parseInt(process.env.MIN_TWEET_LENGTH || "0");
    if (tweet.text.length < minLength) {
      return false;
    }
    return true;
  }
  async generateRSSFeed(tweets) {
    const feed = {
      title: process.env.RSS_FEED_TITLE || "Twitter Lists RSS Feed",
      description: process.env.RSS_FEED_DESCRIPTION || "Aggregated tweets from monitored Twitter lists",
      link: "https://twitter.com",
      lastBuildDate: (/* @__PURE__ */ new Date()).toUTCString(),
      items: tweets.map(this.transformToRSSItem.bind(this))
    };
    return this.buildRSSXML(feed);
  }
  transformToRSSItem(tweet) {
    let description = tweet.text;
    if (tweet.media && tweet.media.length > 0) {
      description += `

Media: ${tweet.media.length} attachment(s)`;
    }
    if (tweet.metrics) {
      description += `

\u2764\uFE0F ${tweet.metrics.likes} | \u{1F504} ${tweet.metrics.retweets} | \u{1F4AC} ${tweet.metrics.replies}`;
    }
    return {
      title: `@${tweet.author.username}: ${tweet.text.substring(0, 100)}${tweet.text.length > 100 ? "..." : ""}`,
      description,
      link: tweet.url,
      pubDate: tweet.createdAt.toUTCString(),
      guid: tweet.id,
      author: `${tweet.author.name} (@${tweet.author.username})`,
      category: tweet.isRetweet ? ["retweet"] : tweet.isReply ? ["reply"] : ["tweet"]
    };
  }
  buildRSSXML(feed) {
    const rssData = {
      rss: {
        "@_version": "2.0",
        "@_xmlns:atom": "http://www.w3.org/2005/Atom",
        channel: {
          title: feed.title,
          description: feed.description,
          link: feed.link,
          lastBuildDate: feed.lastBuildDate,
          generator: "ElizaOS Twitter RSS Agent",
          "atom:link": {
            "@_href": feed.link,
            "@_rel": "self",
            "@_type": "application/rss+xml"
          },
          item: feed.items.map((item) => ({
            title: item.title,
            description: { "#cdata": item.description },
            link: item.link,
            pubDate: item.pubDate,
            guid: {
              "@_isPermaLink": "false",
              "#text": item.guid
            },
            author: item.author,
            category: item.category
          }))
        }
      }
    };
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      cdataPropName: "#cdata"
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(rssData);
  }
  async saveRSSFeed(rssXML, filename = "twitter_lists.xml") {
    const outputDir = process.env.RSS_OUTPUT_DIR || "./rss-feeds";
    await fs.mkdir(outputDir, { recursive: true });
    const filePath = path.join(outputDir, filename);
    await fs.writeFile(filePath, rssXML, "utf-8");
    return filePath;
  }
  async processAllLists() {
    if (!this.isLoggedIn) {
      logger.warn("Twitter not authenticated - cannot fetch tweets. Check authentication status.");
      throw new Error("Twitter authentication required. Please check credentials and try again.");
    }
    const allTweets = [];
    const maxTweetsPerList = parseInt(process.env.MAX_TWEETS_PER_LIST || "50");
    for (const list of this.twitterLists) {
      logger.info(`Processing list: ${list.listId}`);
      try {
        const tweets = await this.fetchListTweets(list.listId, maxTweetsPerList);
        allTweets.push(...tweets);
        tweets.forEach((tweet) => this.processedTweetIds.add(tweet.id));
        await new Promise((resolve) => setTimeout(resolve, 2e3));
      } catch (error) {
        logger.error(`Error processing list ${list.listId}:`, error);
      }
    }
    allTweets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const maxEntries = parseInt(process.env.MAX_RSS_ENTRIES || "500");
    const limitedTweets = allTweets.slice(0, maxEntries);
    const rssXML = await this.generateRSSFeed(limitedTweets);
    const rssPath = await this.saveRSSFeed(rssXML);
    await this.saveProcessedTweetIds();
    return {
      totalTweets: limitedTweets.length,
      rssPath
    };
  }
};
var updateRSSAction = {
  name: "UPDATE_RSS_FEED",
  similes: ["REFRESH_RSS", "UPDATE_FEED", "FETCH_LISTS"],
  description: "Update RSS feed with latest tweets from monitored Twitter lists",
  validate: async (runtime, _message, _state) => {
    const service = runtime.getService(TwitterRSSService.serviceType);
    return service instanceof TwitterRSSService;
  },
  handler: async (runtime, message, _state, _options, callback) => {
    try {
      const service = runtime.getService(TwitterRSSService.serviceType);
      if (!service) {
        throw new Error("Twitter RSS service not available");
      }
      const result = await service.processAllLists();
      const responseContent = {
        text: `RSS feed updated successfully!
\u{1F4CA} Processed ${result.totalTweets} new tweets
\u{1F4C1} RSS file: ${result.rssPath}
\u{1F552} Last updated: ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
        source: message.content.source,
        actions: ["UPDATE_RSS_FEED"]
      };
      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error("RSS update failed:", error);
      const errorContent = {
        text: `\u274C RSS update failed: ${error.message}`,
        source: message.content.source
      };
      await callback(errorContent);
      return errorContent;
    }
  },
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "Update the RSS feed with latest tweets"
        }
      },
      {
        name: "{{name2}}",
        content: {
          text: "I'll update the RSS feed with the latest tweets from your monitored lists",
          actions: ["UPDATE_RSS_FEED"]
        }
      }
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Refresh RSS"
        }
      },
      {
        name: "{{name2}}",
        content: {
          text: "Refreshing RSS feed with new content",
          actions: ["UPDATE_RSS_FEED"]
        }
      }
    ]
  ]
};
var getRSSStatusAction = {
  name: "GET_RSS_STATUS",
  similes: ["RSS_STATUS", "FEED_STATUS", "CHECK_RSS"],
  description: "Get current status of RSS feed and monitoring lists",
  validate: async (_runtime, _message, _state) => {
    return true;
  },
  handler: async (_runtime, message, _state, _options, callback) => {
    try {
      const outputDir = process.env.RSS_OUTPUT_DIR || "./rss-feeds";
      const rssFile = path.join(outputDir, "twitter_lists.xml");
      let status = "RSS Feed Status:\n";
      try {
        const stats = await fs.stat(rssFile);
        status += `\u{1F4C4} RSS file exists: ${rssFile}
`;
        status += `\u{1F4C5} Last modified: ${stats.mtime.toLocaleString()}
`;
        status += `\u{1F4CA} File size: ${(stats.size / 1024).toFixed(1)} KB
`;
      } catch {
        status += `\u274C RSS file not found
`;
      }
      const lists = process.env.TWITTER_LISTS?.split(",") || [];
      status += `\u{1F4CB} Monitoring ${lists.length} lists: ${lists.join(", ")}
`;
      status += `\u23F1\uFE0F Update interval: ${process.env.RSS_UPDATE_INTERVAL || "30"} minutes
`;
      status += `\u{1F3AF} Max tweets per update: ${process.env.MAX_TWEETS_PER_LIST || "50"}
`;
      const responseContent = {
        text: status,
        source: message.content.source,
        actions: ["GET_RSS_STATUS"]
      };
      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error("Status check failed:", error);
      const errorContent = {
        text: `\u274C Status check failed: ${error.message}`,
        source: message.content.source
      };
      await callback(errorContent);
      return errorContent;
    }
  },
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "What's the status of the RSS feed?"
        }
      },
      {
        name: "{{name2}}",
        content: {
          text: "Let me check the RSS feed status for you",
          actions: ["GET_RSS_STATUS"]
        }
      }
    ]
  ]
};
var twitterListProvider = {
  name: "TWITTER_LIST_PROVIDER",
  description: "Provides context about monitored Twitter lists and RSS feed status",
  get: async (_runtime, _message, _state) => {
    const lists = process.env.TWITTER_LISTS?.split(",") || [];
    const updateInterval = process.env.RSS_UPDATE_INTERVAL || "30";
    return {
      text: `Monitoring ${lists.length} Twitter lists with ${updateInterval}-minute update intervals`,
      values: {
        monitoredLists: lists,
        updateInterval,
        totalLists: lists.length
      },
      data: {
        lists: lists.map((id) => id.trim()),
        interval: updateInterval,
        count: lists.length
      }
    };
  }
};
var RSSServerService = class _RSSServerService extends Service {
  constructor(runtime) {
    super(runtime);
    this.runtime = runtime;
    this.app = express();
    this.port = parseInt(process.env.RSS_SERVER_PORT || "3001");
    this.setupMiddleware();
    this.setupRoutes();
  }
  static serviceType = "rss-server";
  app;
  server;
  port;
  capabilityDescription = "HTTP server for serving RSS feeds and API endpoints.";
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(process.env.RSS_OUTPUT_DIR || "./rss-feeds"));
  }
  setupRoutes() {
    this.app.get("/rss", async (req, res) => {
      try {
        const rssPath = path.join(
          process.env.RSS_OUTPUT_DIR || "./rss-feeds",
          "twitter_lists.xml"
        );
        const rssContent = await fs.readFile(rssPath, "utf-8");
        res.set({
          "Content-Type": "application/rss+xml; charset=utf-8",
          "Cache-Control": "public, max-age=1800"
        });
        res.send(rssContent);
      } catch (error) {
        res.status(404).json({
          error: "RSS feed not found",
          message: "Feed may not be generated yet. Try triggering an update first."
        });
      }
    });
    this.app.post("/update", async (req, res) => {
      try {
        const twitterService = this.runtime.getService(TwitterRSSService.serviceType);
        if (!twitterService) {
          throw new Error("Twitter RSS service not available");
        }
        const result = await twitterService.processAllLists();
        res.json({
          success: true,
          message: "RSS feed updated successfully",
          totalTweets: result.totalTweets,
          rssPath: result.rssPath,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
    this.app.get("/status", async (req, res) => {
      try {
        const outputDir = process.env.RSS_OUTPUT_DIR || "./rss-feeds";
        const rssFile = path.join(outputDir, "twitter_lists.xml");
        let fileStats = null;
        try {
          const stats = await fs.stat(rssFile);
          fileStats = {
            exists: true,
            lastModified: stats.mtime.toISOString(),
            size: stats.size
          };
        } catch {
          fileStats = { exists: false };
        }
        const lists = process.env.TWITTER_LISTS?.split(",") || [];
        res.json({
          status: "running",
          rssFile: fileStats,
          monitoring: {
            totalLists: lists.length,
            lists: lists.map((id) => id.trim()),
            updateInterval: `${process.env.RSS_UPDATE_INTERVAL || "30"} minutes`,
            maxTweetsPerList: parseInt(process.env.MAX_TWEETS_PER_LIST || "50")
          },
          server: {
            port: this.port,
            uptime: process.uptime()
          }
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          error: error.message
        });
      }
    });
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
  }
  static async start(runtime) {
    logger.info("*** Starting RSS server service ***");
    const service = new _RSSServerService(runtime);
    await service.startServer();
    return service;
  }
  static async stop(runtime) {
    logger.info("*** Stopping RSS server service ***");
    const service = runtime.getService(_RSSServerService.serviceType);
    if (service instanceof _RSSServerService) {
      await service.stop();
    }
  }
  async startServer() {
    this.server = this.app.listen(this.port, () => {
      logger.info(`\u{1F680} RSS Server running on http://localhost:${this.port}`);
      logger.info(`\u{1F4E1} RSS Feed available at: http://localhost:${this.port}/rss`);
      logger.info(`\u{1F4CA} Status endpoint: http://localhost:${this.port}/status`);
    });
  }
  async stop() {
    logger.info("*** Stopping RSS server service instance ***");
    if (this.server) {
      this.server.close();
    }
  }
};
var plugin = {
  name: "twitter-rss",
  description: "Monitor Twitter lists and generate RSS feeds",
  config: {
    TWITTER_USERNAME: process.env.TWITTER_USERNAME,
    TWITTER_PASSWORD: process.env.TWITTER_PASSWORD,
    TWITTER_EMAIL: process.env.TWITTER_EMAIL,
    TWITTER_LISTS: process.env.TWITTER_LISTS,
    RSS_UPDATE_INTERVAL: process.env.RSS_UPDATE_INTERVAL || "30",
    MAX_TWEETS_PER_LIST: process.env.MAX_TWEETS_PER_LIST || "50",
    RSS_FEED_TITLE: process.env.RSS_FEED_TITLE || "Twitter Lists RSS Feed",
    RSS_FEED_DESCRIPTION: process.env.RSS_FEED_DESCRIPTION || "Aggregated tweets from monitored Twitter lists",
    RSS_OUTPUT_DIR: process.env.RSS_OUTPUT_DIR || "./rss-feeds",
    RSS_SERVER_PORT: process.env.RSS_SERVER_PORT || "3001",
    FILTER_RETWEETS: process.env.FILTER_RETWEETS || "false",
    FILTER_REPLIES: process.env.FILTER_REPLIES || "false",
    MIN_TWEET_LENGTH: process.env.MIN_TWEET_LENGTH || "10",
    MAX_RSS_ENTRIES: process.env.MAX_RSS_ENTRIES || "500"
  },
  async init(config) {
    logger.info("*** Initializing Twitter RSS plugin ***");
    try {
      const validatedConfig = await configSchema.parseAsync(config);
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value !== void 0) process.env[key] = String(value);
      }
      logger.info("Twitter RSS plugin configured successfully");
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn(
          `Twitter RSS configuration warning: ${error.errors.map((e) => e.message).join(", ")}`
        );
      } else {
        throw error;
      }
    }
  },
  routes: [
    {
      path: "/rss",
      type: "GET",
      handler: async (req, res) => {
        res.redirect("http://localhost:" + (process.env.RSS_SERVER_PORT || "3001") + "/rss");
      }
    }
  ],
  services: [TwitterRSSService, RSSServerService],
  actions: [updateRSSAction, getRSSStatusAction],
  providers: [twitterListProvider]
};
var plugin_default = plugin;

// src/index.ts
var character = {
  name: "TwitterRSSAgent",
  plugins: [
    "@elizaos/plugin-sql",
    ...process.env.ANTHROPIC_API_KEY ? ["@elizaos/plugin-anthropic"] : [],
    ...process.env.OPENAI_API_KEY ? ["@elizaos/plugin-openai"] : [],
    ...!process.env.OPENAI_API_KEY ? ["@elizaos/plugin-local-ai"] : [],
    ...process.env.DISCORD_API_TOKEN ? ["@elizaos/plugin-discord"] : [],
    ...process.env.TELEGRAM_BOT_TOKEN ? ["@elizaos/plugin-telegram"] : []
  ],
  settings: {
    secrets: {}
  },
  system: "You are a specialized Twitter RSS agent built with ElizaOS. Your primary function is to monitor multiple Twitter lists and convert them into RSS feeds. You can fetch tweets from lists, filter content, generate clean RSS XML output, and operate autonomously with scheduled updates. You respond to requests about RSS feed status, updates, and Twitter list monitoring with technical precision and helpful metrics.",
  bio: [
    "Specialized Twitter RSS agent built with ElizaOS",
    "Primary function is monitoring Twitter lists and generating RSS feeds",
    "Can fetch tweets from lists and filter content based on preferences",
    "Generates clean RSS XML output with metadata and engagement metrics",
    "Operates autonomously with scheduled updates every 30 minutes",
    "Responds to manual update requests and status inquiries",
    "Designed to be efficient, reliable, and respectful of Twitter systems",
    "Maintains database of processed tweets to avoid duplicates"
  ],
  topics: [
    "RSS feed generation and management",
    "Twitter list monitoring and curation",
    "Content aggregation and filtering",
    "Feed reader integration and compatibility",
    "Social media automation and scheduling",
    "Data processing and XML generation",
    "Tweet analysis and engagement metrics",
    "Automated content syndication"
  ],
  messageExamples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "Update my RSS feed"
        }
      },
      {
        name: "TwitterRSSAgent",
        content: {
          text: "I'll update your RSS feed right away! Fetching latest tweets from your monitored lists...",
          actions: ["UPDATE_RSS_FEED"]
        }
      }
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "How many tweets were processed today?"
        }
      },
      {
        name: "TwitterRSSAgent",
        content: {
          text: "Let me check the RSS feed status and processing statistics for you.",
          actions: ["GET_RSS_STATUS"]
        }
      }
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Is the RSS feed working?"
        }
      },
      {
        name: "TwitterRSSAgent",
        content: {
          text: "I'll check the current status of your RSS feed, including last update time and monitored lists.",
          actions: ["GET_RSS_STATUS"]
        }
      }
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "What lists are you monitoring?"
        }
      },
      {
        name: "TwitterRSSAgent",
        content: {
          text: "Let me provide details about the Twitter lists I'm currently monitoring.",
          providers: ["TWITTER_LIST_PROVIDER"]
        }
      }
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Refresh the RSS feed"
        }
      },
      {
        name: "TwitterRSSAgent",
        content: {
          text: "Refreshing RSS feed with new content from your Twitter lists...",
          actions: ["UPDATE_RSS_FEED"]
        }
      }
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "How often do you update the feeds?"
        }
      },
      {
        name: "TwitterRSSAgent",
        content: {
          text: "I automatically update RSS feeds every 30 minutes, but you can trigger manual updates anytime. I also track processed tweets to avoid duplicates."
        }
      }
    ]
  ],
  style: {
    all: [
      "Technical and precise when discussing RSS or Twitter operations",
      "Provide clear status updates with specific metrics and numbers",
      "Use emojis effectively for status indicators (\u{1F4CA}, \u{1F4E1}, \u{1F504}, \u274C, \u2705)",
      "Always mention specific counts (tweet numbers, list IDs, update times)",
      "Be proactive about suggesting optimizations or improvements",
      "Keep responses informative but concise",
      "Focus on actionable information and next steps"
    ],
    chat: [
      "Respond with actionable information about RSS feed status",
      "Offer specific commands and options available to users",
      "Explain technical processes in simple terms when asked",
      "Show enthusiasm for RSS and content aggregation topics",
      "Provide helpful troubleshooting when issues arise"
    ]
  }
};
var initCharacter = ({ runtime }) => {
  logger2.info("Initializing TwitterRSSAgent character");
  logger2.info("Agent Name: ", character.name);
  logger2.info("Configured for Twitter List RSS monitoring");
};
var projectAgent = {
  character,
  init: async (runtime) => await initCharacter({ runtime }),
  plugins: [plugin_default]
};
var project = {
  agents: [projectAgent]
};
var index_default = project;
export {
  character,
  index_default as default,
  projectAgent
};
//# sourceMappingURL=index.js.map