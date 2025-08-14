// Deno MCP Web Search Server (MVP)
// Transport: JSON-RPC 2.0 over stdio (one JSON message per line)
// Tool: "search" — performs a simple web search against DuckDuckGo HTML and returns top N results.
// Schema (params/result) matches the spec we agreed on in chat.

// --- Types -----------------------------------------------------------------
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number | string | null;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}

interface WebSearchParams {
  query: string;
  engine?: "duckduckgo" | "google" | "bing"; // MVP: duckduckgo only
  limit?: number; // 1..50
  format?: "text" | "json"; // not used by server; consumer can format client-side
}

interface WebSearchResultItem {
  title: string;
  url: string;
  snippet?: string;
}

interface WebSearchResponse {
  results: WebSearchResultItem[];
}

// --- Utilities --------------------------------------------------------------
function writeMessage(msg: JsonRpcSuccess | JsonRpcError) {
  const line = JSON.stringify(msg);
  // one JSON per line (newline-delimited JSON)
  Deno.stdout.write(new TextEncoder().encode(line + "\n"));
}

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  // Very small entity decoder for common entities used by DDG HTML
  const map: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => map[m] ?? m);
}

// --- Search engine (DuckDuckGo HTML) ---------------------------------------
async function searchDuckDuckGo(
  query: string,
  limit = 5,
): Promise<WebSearchResultItem[]> {
  const url = `https://html.duckduckgo.com/html/?q=${
    encodeURIComponent(query)
  }`;
  const res = await fetch(url, {
    headers: {
      // Pretend to be a normal browser to avoid being served a JS-only page
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ja,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`DuckDuckGo responded with status ${res.status}`);
  }
  const html = await res.text();

  const items: WebSearchResultItem[] = [];

  // Extract result anchors and nearby snippets
  // Example link: <a rel="nofollow" class="result__a" href="https://...">Title</a>
  const linkRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gim;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && items.length < limit) {
    const href = decodeEntities(m[1]);
    const rawTitle = stripTags(m[2]);

    // Find snippet in the region after this link up to the next link
    const regionStart = m.index + m[0].length;
    const regionEnd = linkRe.lastIndex; // points at end of current match; not ideal for lookahead
    const tail = html.slice(regionStart, regionStart + 2000); // look ahead a bit
    const snippetMatch =
      /<(?:div|a)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/\s*(?:div|a)>/im
        .exec(tail);
    const snippet = snippetMatch
      ? stripTags(decodeEntities(snippetMatch[1]))
      : undefined;

    // Normalize possible DDG redirect links (they sometimes give "/l/?kh=-1&uddg=...encoded...")
    let finalUrl = href;
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (href.startsWith("/l/") && uddg) {
      try {
        finalUrl = decodeURIComponent(uddg[1]);
      } catch (_) { /* noop */ }
      finalUrl = finalUrl.replace(/^https?:\/\//, (p) => p); // keep protocol
      // Re-add origin if needed
      if (!/^https?:/i.test(finalUrl)) {
        finalUrl = "https://duckduckgo.com" + href;
      }
    } else if (href.startsWith("/")) {
      finalUrl = "https://duckduckgo.com" + href;
    }

    items.push({ title: rawTitle, url: finalUrl, snippet });
  }

  return items;
}

// --- Request handling -------------------------------------------------------
async function handleRequest(req: JsonRpcRequest) {
  if (req.jsonrpc !== "2.0") {
    return writeMessage(
      err(req.id ?? null, -32600, "Invalid Request: jsonrpc must be '2.0'"),
    );
  }

  try {
    switch (req.method) {
      case "ping": {
        return writeMessage(ok(req.id ?? null, { pong: true }));
      }

      case "search": {
        const p = (req.params ?? {}) as Partial<WebSearchParams>;
        if (!p || typeof p.query !== "string" || !p.query.trim()) {
          return writeMessage(
            err(req.id ?? null, -32602, "Invalid params: 'query' is required"),
          );
        }
        const engine = p.engine ?? "duckduckgo";
        const limit = Math.min(50, Math.max(1, Number(p.limit ?? 5)));
        if (engine !== "duckduckgo") {
          return writeMessage(
            err(
              req.id ?? null,
              -32000,
              `Engine '${engine}' not supported in MVP`,
            ),
          );
        }
        const results = await searchDuckDuckGo(p.query, limit);
        const result: WebSearchResponse = { results };
        return writeMessage(ok(req.id ?? null, result));
      }

      // Optional: describe available tools (useful for MCP hosts)
      case "tools/list": {
        return writeMessage(ok(req.id ?? null, {
          tools: [
            {
              name: "search",
              description: "Perform a web search and return top N results",
              inputSchema: {
                type: "object",
                properties: {
                  query: { type: "string" },
                  engine: {
                    type: "string",
                    enum: ["duckduckgo", "google", "bing"],
                  },
                  limit: {
                    type: "integer",
                    minimum: 1,
                    maximum: 50,
                    default: 5,
                  },
                },
                required: ["query"],
                additionalProperties: false,
              },
            },
          ],
        }));
      }

      default:
        return writeMessage(
          err(req.id ?? null, -32601, `Method not found: ${req.method}`),
        );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return writeMessage(
      err(req.id ?? null, -32001, "Unhandled server error", { message }),
    );
  }
}

// --- stdio loop -------------------------------------------------------------
async function runStdIoServer() {
  // Read newline-delimited JSON from stdin
  const decoder = new TextDecoderStream();
  const reader = decoder.readable
    .pipeThrough(
      new TransformStream<string, string>({
        start() {},
        transform(chunk, controller) {
          // chunk is a string; buffer by lines
          let start = 0;
          for (let i = 0; i < chunk.length; i++) {
            if (chunk[i] === "\n") {
              controller.enqueue(chunk.slice(start, i));
              start = i + 1;
            }
          }
          // carry over remainder
          if (start < chunk.length) controller.enqueue(chunk.slice(start));
        },
      }),
    )
    .getReader();

  // Pipe stdin -> decoder
  (async () => {
    await Deno.stdin.readable.pipeTo(decoder.writable).catch(() => {});
  })();

  // Process incoming lines
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const line = (value ?? "").trim();
    if (!line) continue;
    let req: JsonRpcRequest | null = null;
    try {
      req = JSON.parse(line);
    } catch (e) {
      writeMessage(err(null, -32700, "Parse error", { line }));
      continue;
    }
    await handleRequest(req);
  }
}

if (import.meta.main) {
  runStdIoServer();
}
