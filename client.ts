#!/usr/bin/env -S deno run -A
/**
 * 簡易MCPクライアント
 * 使い方:
 *   deno run -A client.ts "検索ワード" [limit]
 */

if (Deno.args.length < 1) {
  console.error("Usage: client.ts <query> [limit]");
  Deno.exit(1);
}

const query = Deno.args[0];
const limit = Number(Deno.args[1]) || 5;

// JSON-RPCリクエストオブジェクト
const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "search",
  params: { query, limit },
};

// サーバープロセスを起動（stdin/stdoutで通信）
const server = new Deno.Command("deno", {
  args: ["run", "-A", "server.ts"], // サーバーファイルのパス
  stdin: "piped",
  stdout: "piped",
});

const child = server.spawn();

// リクエスト送信
const writer = child.stdin.getWriter();
await writer.write(new TextEncoder().encode(JSON.stringify(request) + "\n"));
await writer.close();

// レスポンス読み取り
const output = await new Response(child.stdout).text();
console.log("=== Search Results ===");
try {
  const res = JSON.parse(output.trim());
  console.dir(res, { depth: null });
} catch {
  console.log(output);
}
