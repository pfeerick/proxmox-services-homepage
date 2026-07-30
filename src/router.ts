import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkHealth, getCache } from "./cache.ts";
import { APP_DIR, config } from "./config.ts";
import { createSSEStream, serializeSnapshot } from "./sse.ts";
import { computeServices, escapeHtml } from "./utils.ts";

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

/** Anything the handler needs from the live server. Absent in tests. */
export interface RequestContext {
  /** Opt this request out of the idle timeout — SSE streams are long-lived. */
  clearTimeout?: () => void;
}

/**
 * The full HTTP surface, as a plain function of a Request.
 *
 * Kept separate from Bun.serve so the routes can be exercised directly in tests
 * without binding a port.
 */
export async function handleRequest(req: Request, ctx: RequestContext = {}): Promise<Response> {
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
    ctx.clearTimeout?.();

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
}
