/**
 * LeakGuard Scanner Service — WebSocket backend on port 3030.
 *
 * Architecture:
 *   - The Next.js frontend connects via `io("/?XTransformPort=3030")`.
 *   - The frontend emits `scan:start` with `{ url }`.
 *   - This service runs the actual scanTarget() with an onProgress callback
 *     that forwards each stage + finding event back to the frontend via
 *     `scan:stage` and `scan:finding` socket events.
 *   - When the scan finishes, emits `scan:complete` with the full ScanResult.
 *   - The frontend then POSTs the result to /api/scans/save (Next.js) for
 *     persistence — this service has NO database access by design.
 *
 * Path is "/" (required by Caddy for port-forwarding via XTransformPort).
 */
import { createServer } from "http";
import { Server } from "socket.io";
import { scanTarget, type ScanProgressEvent, type ScanResult, type Finding } from "../../src/lib/leak-scanner.ts";

const PORT = 3030;

const httpServer = createServer((_req, res) => {
  // Simple health-check endpoint
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    ok: true,
    service: "leakguard-scanner-service",
    port: PORT,
    uptime: process.uptime(),
  }));
});

const io = new Server(httpServer, {
  // DO NOT change the path — Caddy uses it to forward to the correct port
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

console.log(`[scanner-service] starting on port ${PORT}`);

io.on("connection", (socket) => {
  console.log(`[scanner-service] client connected: ${socket.id}`);

  socket.on("scan:start", async (payload: { url?: string }) => {
    const url = typeof payload?.url === "string" ? payload.url.trim() : "";
    if (!url) {
      socket.emit("scan:error", { error: "Missing 'url' in scan:start payload" });
      return;
    }
    if (url.length > 2048) {
      socket.emit("scan:error", { error: "URL too long (>2048 chars)" });
      return;
    }

    console.log(`[scanner-service] scan:start url="${url}" from ${socket.id}`);
    socket.emit("scan:ack", { url, message: "Scan started" });

    try {
      // Run the actual scan with real-time progress callback.
      // Each event is forwarded to the client via socket.emit.
      await scanTarget(url, (event: ScanProgressEvent) => {
        if (event.type === "stage") {
          socket.emit("scan:stage", {
            stage: event.stage,
            detail: event.detail,
            findingsCount: event.findingsCount,
          });
        } else if (event.type === "finding") {
          socket.emit("scan:finding", { finding: event.finding });
        } else if (event.type === "complete") {
          socket.emit("scan:complete", { result: event.result });
        }
      });
      console.log(`[scanner-service] scan complete for ${socket.id} url="${url}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown scan error";
      console.error(`[scanner-service] scan failed for ${socket.id}:`, msg);
      socket.emit("scan:error", { error: msg });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[scanner-service] client disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[scanner-service] listening on http://localhost:${PORT}`);
});

// Exported for potential unit testing
export { scanTarget };
export type { ScanProgressEvent, ScanResult, Finding };
