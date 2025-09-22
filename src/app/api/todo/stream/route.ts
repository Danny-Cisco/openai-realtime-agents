import { NextRequest } from "next/server";
import fs from "fs/promises";
import chokidar from "chokidar";
import path from "path";

const filePath = path.resolve(process.cwd(), "todo.md");

type SafeController = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  closed: boolean;
  close: () => void;
};

let clients = new Set<SafeController>();

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
    const encoded = new TextEncoder().encode(`data: ${payload}\n\n`);

    for (const client of [...clients]) {
      if (client.closed) continue;
      try {
        client.controller.enqueue(encoded);
      } catch (err) {
        console.warn("Stream enqueue failed. Removing client.", err);
        client.closed = true;
        clients.delete(client);
      }
    }
  });
}

export async function GET(_req: NextRequest) {
  initWatcher();

  const encoder = new TextEncoder();
  let pingInterval: NodeJS.Timeout;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const client: SafeController = {
        controller,
        closed: false,
        close: () => {
          clearInterval(pingInterval);
          client.closed = true;
          clients.delete(client);
        },
      };

      clients.add(client);

      // Initial hello message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "hello" })}\n\n`)
      );

      // Start ping
      pingInterval = setInterval(() => {
        try {
          if (!client.closed) {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          }
        } catch (err) {
          console.warn("Ping enqueue failed. Closing client.", err);
          client.close();
        }
      }, 20000);
    },

    cancel() {
      // Cleanup on client disconnect
      for (const client of clients) {
        if (!client.closed) {
          client.close();
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
