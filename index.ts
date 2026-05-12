import dotenv from 'dotenv';
dotenv.config();

import FirecrawlApp from '@mendable/firecrawl-js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const tools = [
  {
    name: 'scrape_url',
    description: 'Scrape a single URL and return the content in various formats.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to scrape.',
        },
        formats: {
          type: 'array',
          items: { type: 'string' },
          description: 'Formats to extract (e.g., markdown, html, screenshot).',
        },
        onlyMainContent: {
          type: 'boolean',
          description: 'Extract only the main content, excluding headers, navs, footers, etc.',
        },
        includeTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'HTML tags to exclusively include.',
        },
        excludeTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'HTML tags to exclude.',
        },
        waitFor: {
          type: 'number',
          description: 'Time in milliseconds to wait before scraping JS rendered content.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'search',
    description: 'Search the web and return results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return.',
        },
        lang: {
          type: 'string',
          description: 'Language code for search results.',
        },
        country: {
          type: 'string',
          description: 'Country code for geolocated search results.',
        },
        tbs: {
          type: 'string',
          description: 'Time-based search filter (e.g., qdr:d for past day).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'crawl',
    description: 'Start a web crawl of a URL, wait for completion, and return all pages.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Base URL to start crawling from.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of pages to crawl.',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum crawl depth from the base URL.',
        },
        scrapeOptions: {
          type: 'object',
          description: 'Options for scraping each page (passed to scrape_url).',
        },
        allowBackwardLinks: {
          type: 'boolean',
          description: 'Allow crawling links that point to parent directories.',
        },
        allowExternalLinks: {
          type: 'boolean',
          description: 'Allow crawling links to external domains.',
        },
      },
      required: ['url'],
    },
  },
];

if (!process.env.FIRECRAWL_API_KEY) {
  console.error('FIRECRAWL_API_KEY environment variable is required');
  process.exit(1);
}

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

const server = new Server(
  {
    name: 'firecrawl-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'scrape_url': {
        const { url, ...options } = args as any;
        if (!url) throw new Error('URL is required');
        const result = await firecrawl.scrapeUrl(url, options);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'search': {
        const { query, ...options } = args as any;
        if (!query) throw new Error('Query is required');
        const result = await firecrawl.search(query, options);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'crawl': {
        const { url, ...options } = args as any;
        if (!url) throw new Error('URL is required');
        const { id } = await firecrawl.crawlUrl(url, options);

        const maxTimeout = 300000; // 5 minutes
        const startTime = Date.now();
        let status;
        while (true) {
          status = await firecrawl.checkCrawlStatus(id);
          if (status.status === 'completed') break;
          if (status.status === 'failed') {
            throw new Error(`Crawl failed: ${status.error || 'Unknown error'}`);
          }
          if (Date.now() - startTime > maxTimeout) {
            throw new Error('Crawl timed out after 5 minutes');
          }
          await sleep(2000);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Firecrawl MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});