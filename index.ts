import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";

const ScrapeUrlInputSchema = z.object({
  url: z.string(),
  formats: z
    .array(
      z.enum(["markdown", "html", "rawHtml", "screenshot", "links"])
    )
    .optional(),
  onlyMainContent: z.boolean().optional(),
  waitFor: z.number().optional(),
  actions: z.array(z.any()).optional(),
});

const SearchInputSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
  lang: z.string().optional(),
  country: z.string().optional(),
  scrapeOptions: z.record(z.any()).optional(),
});

const CrawlInputSchema = z.object({
  url: z.string(),
  maxDepth: z.number().optional(),
  limit: z.number().optional(),
  scrapeOptions: z.record(z.any()).optional(),
});

const tools: Tool[] = [
  {
    name: "scrape_url",
    description: "Scrape a single URL and get its content in various formats.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to scrape." },
        formats: {
          type: "array",
          items: {
            type: "string",
            enum: ["markdown", "html", "rawHtml", "screenshot", "links"],
          },
          description: "Formats to include in the output.",
        },
        onlyMainContent: {
          type: "boolean",
          description: "Extract only the main content.",
        },
        waitFor: {
          type: "number",
          description: "Wait for a specified amount of milliseconds before scraping.",
        },
        actions: {
          type: "array",
          items: { type: "object" },
          description: "Array of actions to perform.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "search",
    description: "Search the web for a query and get results.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
        limit: {
          type: "number",
          description: "Maximum number of results to return.",
        },
        lang: {
          type: "string",
          description: "Language code for search results.",
        },
        country: {
          type: "string",
          description: "Country code for search results.",
        },
        scrapeOptions: {
          type: "object",
          description: "Options for scraping each result.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "crawl",
    description: "Crawl a URL and its subpages, handling asynchronous job polling internally.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The base URL to start crawling.",
        },
        maxDepth: {
          type: "number",
          description: "Maximum depth to crawl.",
        },
        limit: {
          type: "number",
          description: "Maximum number of pages to crawl.",
        },
        scrapeOptions: {
          type: "object",
          description: "Options for scraping each page.",
        },
      },
      required: ["url"],
    },
  },
];

const server = new Server(
  {
    name: "firecrawl-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY environment variable is required.");
  }

  const firecrawl = new FirecrawlApp({ apiKey });
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case "scrape_url": {
        const { url, ...options } = ScrapeUrlInputSchema.parse(args);
        result = await firecrawl.scrapeUrl(url, options);
        break;
      }
      case "search": {
        const { query, ...options } = SearchInputSchema.parse(args);
        result = await firecrawl.search(query, options);
        break;
      }
      case "crawl": {
        const { url, ...options } = CrawlInputSchema.parse(args);
        const crawlResponse = await firecrawl.crawlUrl(url, options);

        // Handle job-based crawling
        if (crawlResponse && (crawlResponse as any).id && !(crawlResponse as any).data) {
          const jobId = (crawlResponse as any).id;
          let statusResponse: any;
          do {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            statusResponse = await firecrawl.checkCrawlStatus(jobId);
          } while (
            statusResponse.status === "scraping" ||
            statusResponse.status === "pending"
          );

          if (statusResponse.status === "completed") {
            result = statusResponse;
          } else {
            throw new Error(
              `Crawl job ${jobId} finished with status: ${statusResponse.status}`
            );
          }
        } else {
          result = crawlResponse;
        }
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred";
    return {
      content: [
        {
          type: "text",
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Firecrawl MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});