// ─────────────────────────────────────────────
// NetSpeed.me – Dedicated speedtest backend
// Zero-dependency Node server. Deploy close to your users and point the
// frontend at it via NEXT_PUBLIC_TEST_SERVER_URL.
//
// Usage: node server/speedtest-server.js [port]   (default 4000)
//
// Endpoints (all CORS-enabled):
//   GET  /ping              → empty 200, for latency sampling
//   GET  /download?bytes=N  → streams N incompressible bytes (capped at 1GB)
//   POST /upload            → accepts and discards a binary body
// ─────────────────────────────────────────────

const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.argv[2]) || 4000;
const MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024;
const DEFAULT_DOWNLOAD_BYTES = 50_000_000;

// One random 64KB block, reused for download payloads — incompressible,
// so transparent compression can't inflate the measured speed.
const BLOCK = crypto.randomBytes(65536);

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (url.pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("pong");
  }

  if (url.pathname === "/download") {
    const bytes = Math.min(
      Number(url.searchParams.get("bytes")) || DEFAULT_DOWNLOAD_BYTES,
      MAX_DOWNLOAD_BYTES
    );
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": bytes,
    });

    let sent = 0;
    const write = () => {
      while (sent < bytes) {
        const chunk =
          sent + BLOCK.length <= bytes
            ? BLOCK
            : BLOCK.subarray(0, bytes - sent);
        sent += chunk.length;
        if (!res.write(chunk)) {
          res.once("drain", write); // respect backpressure
          return;
        }
      }
      res.end();
    };
    return write();
  }

  if (url.pathname === "/upload" && req.method === "POST") {
    let received = 0;
    req.on("data", (c) => (received += c.length));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received }));
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`NetSpeed dedicated test server listening on http://localhost:${PORT}`);
});
