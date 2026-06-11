// ─────────────────────────────────────────────
// NetSpeed.me – Test server registry
//
// To add a server, append an entry here. Every server must expose the
// CORS-enabled endpoints the engine uses:
//   GET  /ping                 → JSON latency probe
//   GET  /download?size=100MB  → streams incompressible bytes
//   POST /upload               → accepts and discards a binary body
// Before each test the engine pings every entry and picks the fastest.
// ─────────────────────────────────────────────

export interface TestServer {
  id: string;
  name: string;
  url: string; // origin, no trailing slash
  region: string;
}

// NEXT_PUBLIC_TEST_SERVER_URL adds a staging/local server to the pool
// (it competes on latency like any other entry).
const CUSTOM_URL = (process.env.NEXT_PUBLIC_TEST_SERVER_URL ?? "").replace(/\/+$/, "");

export const TEST_SERVERS: TestServer[] = [
  {
    id: "hostinger-main",
    name: "NetSpeed Main Server",
    url: "https://speed.netspeed.me",
    region: "Auto",
  },
  ...(CUSTOM_URL
    ? [
        {
          id: "custom",
          name: "Custom Server",
          url: CUSTOM_URL,
          region: "Custom",
        },
      ]
    : []),
];

export function serverHostname(server: TestServer): string {
  try {
    return new URL(server.url).hostname;
  } catch {
    return server.url;
  }
}
