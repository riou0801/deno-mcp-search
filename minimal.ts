/// server.ts — minimal one-off MCP initialize server

const decoder = new TextDecoder();
const encoder = new TextEncoder();

async function readMessage(): Promise<any> {
  let raw = "";
  const buf = new Uint8Array(1024);
  while (!raw.includes("\r\n\r\n")) {
    const n = await Deno.stdin.read(buf);
    if (n === null) throw new Error("EOF");
    raw += decoder.decode(buf.subarray(0, n));
  }
  const match = raw.match(/Content-Length: (\d+)/i);
  if (!match) throw new Error("Missing Content-Length header");
  const length = parseInt(match[1], 10);

  const bodyBuf = new Uint8Array(length);
  let read = 0;
  while (read < length) {
    const n = await Deno.stdin.read(bodyBuf.subarray(read));
    if (n === null) throw new Error("Unexpected EOF");
    read += n;
  }
  return JSON.parse(decoder.decode(bodyBuf));
}

function send(obj: any) {
  const body = JSON.stringify(obj);
  const header = `Content-Length: ${encoder.encode(body).length}\r\n\r\n`;
  Deno.stdout.writeSync(encoder.encode(header + body));
  Deno.stdout.flush(); // ensure it leaves buffer
}

const msg = await readMessage();

if (msg.method === "initialize") {
  send({
    jsonrpc: "2.0",
    id: msg.id,
    result: {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: "MinimalMCP", version: "0.1.0" },
    },
  });
} else {
  send({
    jsonrpc: "2.0",
    id: msg.id,
    error: { code: -32601, message: `Unknown method: ${msg.method}` },
  });
}
