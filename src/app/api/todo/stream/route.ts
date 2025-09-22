import { NextRequest } from "next/server";
import fs from "fs/promises";
import chokidar from "chokidar";
import path from "path";

const filePath = path.resolve(process.cwd(), "todo.md");

let clients = new Set<ReadableStreamDefaultController>();

// Singleton watcher to prevent HMR duplication
let watcher: chokidar.FSWatcher | null = null;
function initWatcher() {
  if (watcher) return;
  watcher = chokidar.watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  watcher.on("change", async () => {
    const stat = await fs.stat(filePath);
    const payload = JSON.stringify({ type: "changed", mtimeMs: stat.mtimeMs });
    for (const client of clients) client.enqueue(`data: ${payload}\n\n`);
  });
}

export async function GET(_req: NextRequest) {
  initWatcher();

  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);

      controller.enqueue(`data: ${JSON.stringify({ type: "hello" })}\n\n`);

      const ping = setInterval(() => controller.enqueue(`: ping\n\n`), 20000);
      return () => {
        clearInterval(ping);
        clients.delete(controller);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
