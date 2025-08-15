# deno-mcp-search
this is Web Search MCP server, built by deno.  
~~deno builtin method only(no dependency on any npm/jsr package).~~  
this include small client for testing, but not test with llm.

vibe coding with GPT-5

## Web Search MCP Server

A minimal **MCP (Model Context Protocol)** server implemented in **Deno** for simple web searches.
It uses DuckDuckGo to fetch search results and can be called directly from an MCP-compatible client (e.g., VS Code, Cursor).

### 📜 Background

* **MCP (Model Context Protocol)** enables tools and extensions to be invoked from editors or AI assistants in a standardized way.
* By registering a web search feature as an MCP server, you can query the web directly from your chat interface or code editor.
* Using **Deno** simplifies dependency management and provides full TypeScript support.

### 🎯 Goals

* Build a **minimal and educational MCP server** for web search.
* Document the MCP client registration process using `mcp.json`.
* Explore integration with web APIs and output formatting.

### ⚙️ Implementation Overview

* **Runtime**: [Deno](https://deno.com/)
* **Search Engine**: DuckDuckGo (Unofficial API)
* **Transport**: `stdio` for communication with MCP clients
* **Provided Tool**: `search`

  * **Input**: `query` (search term), `limit` (optional number of results)
  * **Output**: JSON with `title`, `url`, and `snippet` for each result

### Directory Structure

```
├── server.ts    # MCP server entry point
├── client.ts    # External dependencies (optional)
└── README.md    # Project documentation
```

### 📌 MCP Client Registration Examples

#### VS Code (`.vscode/mcp.json`)

```jsonc
{
  "servers": [
    {
      "name": "web-search-mcp",
      "command": "deno run -A /path/to/clone/server.ts",
      "transport": "stdio",
      "description": "Simple MCP server for web searches via DuckDuckGo",
      "tools": ["search"]
    }
  ]
}
```

#### Cursor (`.cursor/mcp.json`)

```json
{
  "servers": [
    {
      "name": "web-search-mcp",
      "command": "deno run -A /path/to/clone/server.ts",
      "transport": "stdio",
      "tools": {
        "search": {
          "description": "Perform web search via DuckDuckGo",
          "schema": {
            "type": "object",
            "properties": {
              "query": { "type": "string" },
              "limit": { "type": "integer", "minimum": 1, "maximum": 50 }
            },
            "required": ["query"],
            "additionalProperties": false
          }
        }
      }
    }
  ]
}

```

### 🚀 Future Plans

* Support additional search engines (Google, Bing)
* Format results as Markdown for better readability
* Add caching support
* Implement asynchronous streaming responses from the MCP server

---

📝 **Note**
This project is for educational purposes only and is **not** intended for commercial use or high-load environments.


---

If you want, I can also add a **Usage** section showing how to run the MCP server and test it with a minimal client. That would make the README more hands-on.

