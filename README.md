# Twitter RSS Agent - ElizaOS Plugin
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/Dexploarer/elizaos-rss-plugin?utm_source=oss&utm_medium=github&utm_campaign=Dexploarer%2Felizaos-rss-plugin&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

An ElizaOS-powered agent that monitors Twitter lists and generates RSS feeds using the `agent-twitter-client` library. No Twitter API keys required!

## 🎯 Features

- 🐦 **Monitor Multiple Twitter Lists**: Track unlimited Twitter lists simultaneously
- 📰 **Generate RSS Feeds**: Clean XML feeds with metadata and engagement metrics
- ⏰ **Scheduled Updates**: Automatic refresh every 30 minutes (configurable)
- 🔄 **Manual Triggers**: Update feeds on-demand via chat commands
- 🌐 **HTTP Server**: Built-in server for RSS feed access
- 📊 **Status Monitoring**: Real-time metrics and monitoring dashboard
- 🎯 **Content Filtering**: Remove retweets, replies, set minimum lengths
- 🤖 **ElizaOS Integration**: Full Actions, Providers, and Services architecture

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Edit `.env` with your credentials:

```env
# Twitter Account (REQUIRED - no API keys needed!)
TWITTER_USERNAME=your_twitter_handle
TWITTER_PASSWORD=your_twitter_password
TWITTER_EMAIL=your_email@example.com

# AI Provider (REQUIRED - choose one)
OPENAI_API_KEY=sk-your_openai_key

# Twitter Lists (REQUIRED)
TWITTER_LISTS=1234567890,9876543210,1111111111
```

### 3. Get Twitter List IDs
1. Visit any Twitter list: `https://twitter.com/i/lists/[LIST_ID]`
2. Copy the number from the URL (that's the List ID)
3. Add multiple IDs to `TWITTER_LISTS` separated by commas

### 4. Start the Agent
```bash
npm run build
npm start
```

### 5. Access Your RSS Feed
- **RSS Feed**: http://localhost:3001/rss
- **Status Dashboard**: http://localhost:3001/status
- **Manual Update**: POST http://localhost:3001/update

## 📋 Required Accounts & API Keys

### Twitter Account (REQUIRED)
- **What**: Your regular Twitter account credentials
- **Where**: Use existing account or create at https://twitter.com
- **Why**: No Twitter API keys needed - uses web scraping

### AI Model Provider (REQUIRED - Choose ONE)
- **OpenAI**: Get API key from https://platform.openai.com/api-keys
- **Anthropic**: Get API key from https://console.anthropic.com/  
- **Groq**: Get API key from https://console.groq.com/ (has free tier)

## 🎛️ Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWITTER_USERNAME` | ✅ | - | Your Twitter username |
| `TWITTER_PASSWORD` | ✅ | - | Your Twitter password |
| `TWITTER_EMAIL` | ✅ | - | Your Twitter email |
| `TWITTER_LISTS` | ✅ | - | Comma-separated list IDs |
| `OPENAI_API_KEY` | ✅* | - | OpenAI API key |
| `RSS_UPDATE_INTERVAL` | ❌ | 30 | Update interval (minutes) |
| `MAX_TWEETS_PER_LIST` | ❌ | 50 | Max tweets per list |
| `RSS_API_TOKEN` | ❌ | - | Bearer token required for HTTP API |
| `RSS_SERVER_PORT` | ❌ | 3001 | HTTP server port |
| `FILTER_RETWEETS` | ❌ | false | Filter out retweets |
| `FILTER_REPLIES` | ❌ | false | Filter out replies |

*Required: One AI provider API key

## 🤖 ElizaOS Integration

### Available Actions
- `UPDATE_RSS_FEED`: Manually trigger RSS updates
- `GET_RSS_STATUS`: Check feed status and statistics

### Providers
- `TWITTER_LIST_PROVIDER`: Supplies context about monitored lists

### Services
- `TwitterRSSService`: Core RSS generation and Twitter monitoring
- `RSSServerService`: HTTP server for feed access

## 📡 HTTP API Endpoints

All endpoints (except `/health`) require an `Authorization: Bearer` token if `RSS_API_TOKEN` is set.

- `GET /rss` - Main RSS feed
- `GET /status` - Monitoring dashboard with statistics
- `POST /update` - Trigger manual RSS update
- `GET /health` - Health check endpoint

## 🔧 Usage Examples

### Chat Commands
```
"Update my RSS feed"           → Triggers RSS update
"What's the RSS feed status?"  → Shows current status
"How many tweets processed?"   → Displays statistics
"Refresh RSS"                  → Manual update trigger
```

### HTTP API
```bash
# Get RSS feed
curl http://localhost:3001/rss

# Check status
curl http://localhost:3001/status

# Manual update
curl -X POST http://localhost:3001/update
```

## 🛠️ How It Works

1. **Authentication**: Uses your Twitter credentials (cached for efficiency)
2. **List Monitoring**: Fetches tweets from specified lists using `fetchListTweets()`
3. **Content Processing**: Filters tweets based on your preferences
4. **RSS Generation**: Creates clean XML with metadata and engagement metrics
5. **HTTP Serving**: Provides feeds via built-in HTTP server
6. **Duplicate Prevention**: Tracks processed tweets to avoid duplicates

## 📊 Monitoring & Status

The agent provides detailed monitoring:
- Last update timestamp
- Total tweets processed
- RSS file size and location
- List monitoring status
- Server uptime and health

## 🔍 Troubleshooting

**Authentication Issues**
- Verify Twitter credentials in `.env`
- Check username (no @ symbol needed)
- Ensure email matches your Twitter account

**No Tweets Found**
- Verify List IDs are correct numbers
- Check if lists are public
- Ensure lists contain active accounts

**RSS Feed Empty**
- Run manual update: `POST /update`
- Check `/status` endpoint for errors
- Verify `TWITTER_LISTS` environment variable

## 🎯 Advanced Configuration

### Custom Filtering
```env
FILTER_RETWEETS=true      # Remove retweets
FILTER_REPLIES=true       # Remove replies
MIN_TWEET_LENGTH=20       # Minimum tweet length
MAX_RSS_ENTRIES=1000      # Maximum feed entries
```

### RSS Customization
```env
RSS_FEED_TITLE=My Custom Feed
RSS_FEED_DESCRIPTION=Curated tweets from my lists
RSS_OUTPUT_DIR=./custom-feeds
```

## 📝 Scripts

- `npm start` - Start the TwitterRSSAgent
- `npm run dev` - Development mode with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm test` - Run tests
- `npm run lint` - Format code

## 🏗️ Project Structure

```
src/
├── plugin.ts           # Main ElizaOS plugin implementation
├── index.ts            # TwitterRSSAgent character & project config
__tests__/              # Test files
e2e/                    # End-to-end tests
rss-feeds/              # Generated RSS files
.elizadb/               # Agent database
```

## 📄 License

MIT License - Feel free to modify and distribute

---

## 🎉 Ready to Use!

Your Twitter RSS Agent is now configured and ready to:
- Monitor your chosen Twitter lists automatically
- Generate clean RSS feeds for feed readers
- Provide HTTP endpoints for easy access
- Integrate seamlessly with ElizaOS ecosystem

**Just configure your `.env` file and run `npm start`!**
