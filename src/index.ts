import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkHealth, getCache } from "./cache.ts";
import { APP_DIR, config, readMinBunVersion, startFileWatcher } from "./config.ts";
import { createSSEStream, serializeSnapshot } from "./sse.ts";
import { computeServices, escapeHtml, satisfiesMinVersion } from "./utils.ts";

// Importing cache.ts starts the background refresh loop (side effect at module level)
import "./cache.ts";

const minBunVersion = readMinBunVersion();
if (minBunVersion && !satisfiesMinVersion(Bun.version, minBunVersion)) {
  console.error(
    `❌ Bun ${minBunVersion}+ required (running ${Bun.version}). Update Bun and try again.`,
  );
  process.exit(1);
}

const staticDir = join(APP_DIR, "static");

// Use bundle.js in production if it exists; fall back to app.js for dev
const scriptFile = existsSync(join(staticDir, "js", "bundle.js")) ? "bundle.js" : "app.js";

let indexHtmlCache: string | null = null;

async function serveIndex(): Promise<Response> {
  if (!indexHtmlCache) {
    indexHtmlCache = await Bun.file(join(staticDir, "index.html")).text();
  }
  // The title is operator-supplied config, not user input, but it lands in both
  // <title> and the <h1> — escaping keeps an innocent "<" or quote from breaking
  // the page (or worse) rather than trusting the file to be well-behaved.
  const title = escapeHtml(config.dashboard.title);
  const html = indexHtmlCache.replaceAll("{{TITLE}}", title).replaceAll("{{SCRIPT}}", scriptFile);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

startFileWatcher();

const server = Bun.serve({
  hostname: config.server.host,
  port: config.server.port,

  async fetch(req, server) {
    const { pathname } = new URL(req.url);

    if (pathname === "/") return serveIndex();

    if (pathname.startsWith("/static/")) {
      const file = Bun.file(join(staticDir, pathname.slice("/static/".length)));
      if (await file.exists()) return new Response(file);
      return new Response("Not Found", { status: 404 });
    }

    if (pathname === "/api/containers") {
      const { containers, last_updated } = getCache();
      return Response.json({
        containers,
        last_updated: last_updated ?? new Date().toISOString(),
        total: containers.length,
      });
    }

    if (pathname === "/api/services") {
      const { containers, last_updated } = getCache();
      const services = computeServices(containers);
      return Response.json({
        services,
        last_updated: last_updated ?? new Date().toISOString(),
        total: services.length,
      });
    }

    if (pathname === "/api/stream") {
      // SSE connections are long-lived by design — exempt from Bun's default 10s idle timeout.
      server.timeout(req, 0);

      const { containers, last_updated } = getCache();
      const ts = last_updated ?? new Date().toISOString();

      return new Response(
        createSSEStream(() => serializeSnapshot(containers, ts)),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
          },
        },
      );
    }

    if (pathname === "/health") {
      const { ok, error } = await checkHealth();
      const body: Record<string, unknown> = {
        status: ok ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
      };
      if (error) body.error = error;
      return Response.json(body, { status: ok ? 200 : 503 });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Proxmox Dashboard running at http://${server.hostname}:${server.port}`);
