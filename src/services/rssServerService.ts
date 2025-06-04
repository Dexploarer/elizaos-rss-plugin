import { Service, IAgentRuntime, logger } from '@elizaos/core';
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { TwitterRSSService } from './twitterRSSService';

export class RSSServerService extends Service {
  static serviceType = 'rss-server';
  private app: express.Application;
  private server: any;
  private port: number;
  private apiToken?: string;

  capabilityDescription =
    'HTTP server for serving RSS feeds and API endpoints.';

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
    this.app = express();
    this.port = parseInt(
      (this.runtime.getSetting?.('RSS_SERVER_PORT') || process.env.RSS_SERVER_PORT || '3001') as string
    );
    this.apiToken =
      this.runtime.getSetting?.('RSS_API_TOKEN') || process.env.RSS_API_TOKEN;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    const outDir =
      this.runtime.getSetting?.('RSS_OUTPUT_DIR') || process.env.RSS_OUTPUT_DIR || './rss-feeds';
    this.app.use(express.static(outDir));
    this.app.use((req, res, next) => {
      if (!this.apiToken || req.path === '/health') return next();
      const auth = req.headers.authorization || '';
      const token = auth.replace('Bearer ', '');
      if (token === this.apiToken) return next();
      res.status(401).json({ error: 'Unauthorized' });
    });
  }

  private setupRoutes(): void {
    this.app.get('/rss', async (_req, res) => {
      try {
        const rssPath = path.join(
          this.runtime.getSetting?.('RSS_OUTPUT_DIR') || process.env.RSS_OUTPUT_DIR || './rss-feeds',
          'twitter_lists.xml'
        );
        const rssContent = await fs.readFile(rssPath, 'utf-8');
        res.set({
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=1800',
        });
        res.send(rssContent);
      } catch (error) {
        res.status(404).json({
          error: 'RSS feed not found',
          message: 'Feed may not be generated yet. Try triggering an update first.',
        });
      }
    });

    this.app.post('/update', async (_req, res) => {
      try {
        const twitterService = this.runtime.getService(
          TwitterRSSService.serviceType
        ) as TwitterRSSService;

        if (!twitterService) {
          throw new Error('Twitter RSS service not available');
        }

        const result = await twitterService.processAllLists();

        res.json({
          success: true,
          message: 'RSS feed updated successfully',
          totalTweets: result.totalTweets,
          rssPath: result.rssPath,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    this.app.get('/status', async (_req, res) => {
      try {
        const outputDir =
          this.runtime.getSetting?.('RSS_OUTPUT_DIR') || process.env.RSS_OUTPUT_DIR || './rss-feeds';
        const rssFile = path.join(outputDir, 'twitter_lists.xml');

        let fileStats: any = null;
        try {
          const stats = await fs.stat(rssFile);
          fileStats = {
            exists: true,
            lastModified: stats.mtime.toISOString(),
            size: stats.size,
          };
        } catch {
          fileStats = { exists: false };
        }

        const lists = (
          this.runtime.getSetting?.('TWITTER_LISTS') || process.env.TWITTER_LISTS || ''
        )
          .split(',')
          .filter(Boolean);

        res.json({
          status: 'running',
          rssFile: fileStats,
          monitoring: {
            totalLists: lists.length,
            lists: lists.map((id) => id.trim()),
            updateInterval: `${
              this.runtime.getSetting?.('RSS_UPDATE_INTERVAL') || process.env.RSS_UPDATE_INTERVAL || '30'
            } minutes`,
            maxTweetsPerList: parseInt(
              (this.runtime.getSetting?.('MAX_TWEETS_PER_LIST') || process.env.MAX_TWEETS_PER_LIST || '50') as string
            ),
          },
          server: {
            port: this.port,
            uptime: process.uptime(),
          },
        });
      } catch (error: any) {
        res.status(500).json({
          status: 'error',
          error: error.message,
        });
      }
    });

    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
      });
    });
  }

  static async start(runtime: IAgentRuntime) {
    logger.info('*** Starting RSS server service ***');
    const service = new RSSServerService(runtime);
    await service.startServer();
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** Stopping RSS server service ***');
    const service = runtime.getService(RSSServerService.serviceType);
    if (service instanceof RSSServerService) {
      await service.stop();
    }
  }

  async startServer(): Promise<void> {
    this.server = this.app.listen(this.port, () => {
      logger.info(`🚀 RSS Server running on http://localhost:${this.port}`);
      logger.info(
        `📡 RSS Feed available at: http://localhost:${this.port}/rss`
      );
      logger.info(`📊 Status endpoint: http://localhost:${this.port}/status`);
    });
  }

  async stop() {
    logger.info('*** Stopping RSS server service instance ***');
    if (this.server) {
      this.server.close();
    }
  }
}
