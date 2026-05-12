import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
if (!FIRECRAWL_API_KEY) {
  console.error("FIRECRAWL_API_KEY environment variable is required");
  process.exit(1);
}

const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

const server = new McpServer({
  name: "firecrawl-mcp",
  version: "1.0.0",
});

server.tool(
  "scrape_url",
  "Scrape a URL and extract its content in various formats",
  {
    url: z.string().url().describe("The URL to scrape"),
    formats: z
      .array(z.enum(["markdown", "html", "rawHtml", "screenshot", "links"]))
      .optional()
      .describe("Formats to extract (default: markdown)"),
    onlyMainContent: z
      .boolean()
      .optional()
      .describe("Extract only the main content (default: true)"),
    waitFor: z
      .number()
      .int()
      .min(0)
      .max(30000)
      .optional()
      .describe("Wait time in ms before scraping (default: 0)"),
    actions: z
      .array(
        z.object({
          type: z.enum(["wait", "click", "screenshot", "scroll"]),
          selector: z.string().optional(),
          milliseconds: z.number().optional(),
        })
      )
      .optional()
      .describe("Actions to perform before scraping (for dynamic pages)"),
  },
  async (params) => {
    try {
      const result = await firecrawl.scrapeUrl(params.url, {
        formats: params.formats,
        onlyMainContent: params.onlyMainContent ?? true,
        waitFor: params.waitFor ?? 0,
        actions: params.actions,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "search",
  "Search the web and return results including content from top pages",
  {
    query: z.string().min(1).describe("Search query"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of results (default: 10)"),
    pageOptions: z
      .object({
        onlyMainContent: z.boolean().optional(),
        fetchPageContent: z.boolean().optional(),
      })
      .optional()
      .describe("Options for fetching page content"),
  },
  async (params) => {
    try {
      const result = await firecrawl.search(params.query, {
        limit: params.limit ?? 10,
        pageOptions: params.pageOptions,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "crawl",
  "Crawl a website starting from a URL and return all crawled pages",
  {
    url: z.string().url().describe("Starting URL for the crawl"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe("Maximum number of pages to crawl (default: 100)"),
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Maximum crawl depth (default: 3)"),
    scrapeOptions: z
      .object({
        formats: z
          .array(z.enum(["markdown", "html", "rawHtml", "links"]))
          .optional(),
        onlyMainContent: z.boolean().optional(),
      })
      .optional()
      .describe("Options for scraping each page"),
    excludePaths: z
      .array(z.string())
      .optional()
      .describe("URL patterns to exclude from the crawl"),
    includePaths: z
      .array(z.string())
      .optional()
      .describe("URL patterns to include in the crawl"),
  },
  async (params) => {
    try {
      const result = await firecrawl.crawlUrl(params.url, {
        limit: params.limit ?? 100,
        maxDepth: params.maxDepth ?? 3,
        scrapeOptions: params.scrapeOptions,
        excludePaths: params.excludePaths,
        includePaths: params.includePaths,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);