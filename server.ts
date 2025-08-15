// server.ts — Web Search MCP Server with registerResource
import {
  McpServer,
  ResourceTemplate,
} from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "npm:zod";
import TurndownService from "npm:turndown";
import { crypto } from "jsr:@std/crypto/crypto";
const turndown = new TurndownService();

// Initialize MCP server
const server = new McpServer({ name: "WebSearchMCP", version: "0.5.0" });

// Define a dynamic resource template for web pages
const webpageTemplate = new ResourceTemplate("webpage://{slug}", {
  list: undefined,
});

server.registerResource(
  "webpage",
  webpageTemplate,
  {
    title: "Web Page Resource",
    description: "Stores web page content in Markdown for LLM use",
  },
  async (uri, { html, title }) => {
    const markdown = turndown.turndown(html);
    return {
      contents: [
        {
          uri: uri.href,
          text: markdown,
          metadata: { title },
        },
      ],
    };
  },
);

// Register search tool
server.registerTool(
  "search",
  {
    title: "Web Search",
    description:
      "Perform DuckDuckGo search and register page content as MCP resources",
    inputSchema: {
      query: z.string(),
      limit: z.number().int().min(1).max(5).optional(),
    },
  },
  async ({ query, limit }, ctx) => {
    const lim = limit ?? 3;
    const q = encodeURIComponent(query);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`);
    const html = await res.text();

    const linkRe =
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const content: any[] = [];
    let m;
    let count = 0;

    while ((m = linkRe.exec(html)) && count < lim) {
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      const url = m[1];
      let pageHtml = "";

      try {
        const pageRes = await fetch(url);
        pageHtml = await pageRes.text();
      } catch {
        pageHtml = "Failed to fetch content";
      }

      // Generate a slug for the URI
      const slug = crypto.randomUUID();

      // Reference the resource via its URI
      const resourceUri = `webpage://${slug}`;

      // Trigger the dynamic resource registration
      await ctx.resources.register(resourceUri, { html: pageHtml, title });

      // Return resource reference
      content.push({
        type: "resource_link",
        uri: resourceUri,
        name: title,
        description: `Search result for "${query}"`,
        metadata: { url },
      });

      count++;
    }

    return { content };
  },
);

// Connect using stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);

console.error(
  "Web Search MCP server running with registerResource and Markdown content...",
);
