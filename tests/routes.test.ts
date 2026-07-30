import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { setCache } from "../src/cache.ts";
import { config } from "../src/config.ts";
import { handleRequest } from "../src/router.ts";
import type { Container, ServiceInfo } from "../src/types.ts";

// The JSON contract each endpoint promises, so these assertions are type-checked
// rather than reaching into an `unknown`.
interface ContainersResponse {
  containers: Container[];
  last_updated: string;
  total: number;
}
interface ServicesResponse {
  services: ServiceInfo[];
  last_updated: string;
  total: number;
}
interface HealthResponse {
  status: string;
  timestamp: string;
  error?: string;
}

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

const CONTAINERS: Container[] = [
  {
    vmid: 100,
    name: "jellyfin",
    status: "running",
    node: "pve",
    ip: "192.168.1.100",
    uptime: 3600,
    memory_usage: 512 * 1024 * 1024,
    memory_max: 2048 * 1024 * 1024,
    service: { port: 8096, name: "Jellyfin", icon: "🎬", description: "Media Server" },
  },
  {
    vmid: 101,
    name: "no-ip",
    status: "running",
    node: "pve",
    ip: "DHCP/Unknown",
    uptime: 60,
    memory_usage: 0,
    memory_max: 0,
    service: { port: 3000, name: "Nope", icon: "❓", description: "Unreachable" },
  },
  {
    vmid: 102,
    name: "stopped-ct",
    status: "stopped",
    node: "pve",
    ip: "192.168.1.102",
    uptime: 0,
    memory_usage: 0,
    memory_max: 512 * 1024 * 1024,
    service: null,
  },
];

const LAST_UPDATED = "2026-07-30T00:00:00.000Z";

const get = (path: string) => handleRequest(new Request(`http://localhost${path}`));

const originalTitle = config.dashboard.title;

beforeEach(() => {
  setCache({ containers: CONTAINERS, last_updated: LAST_UPDATED });
});

afterEach(() => {
  config.dashboard.title = originalTitle;
  setCache({ containers: [], last_updated: null });
});

describe("GET /api/containers", () => {
  it("returns every container with the snapshot timestamp", async () => {
    const res = await get("/api/containers");
    expect(res.status).toBe(200);

    const body = await json<ContainersResponse>(res);
    expect(body.total).toBe(3);
    expect(body.containers).toHaveLength(3);
    expect(body.last_updated).toBe(LAST_UPDATED);
  });

  it("substitutes a timestamp when the cache has never been populated", async () => {
    setCache({ containers: [], last_updated: null });
    const body = await json<ContainersResponse>(await get("/api/containers"));
    expect(body.total).toBe(0);
    expect(Number.isNaN(Date.parse(body.last_updated))).toBe(false);
  });
});

describe("GET /api/services", () => {
  it("returns only running containers that have an IP and a port", async () => {
    const res = await get("/api/services");
    expect(res.status).toBe(200);

    const body = await json<ServicesResponse>(res);
    expect(body.total).toBe(1);
    expect(body.services[0].name).toBe("Jellyfin");
    expect(body.services[0].url).toBe("http://192.168.1.100:8096");
    expect(body.last_updated).toBe(LAST_UPDATED);
  });

  it("excludes the DHCP/Unknown container even though it has a port", async () => {
    const body = await json<ServicesResponse>(await get("/api/services"));
    expect(body.services.some((s) => s.url.includes("DHCP"))).toBe(false);
  });
});

describe("GET /", () => {
  it("serves HTML with the configured title substituted into the template", async () => {
    config.dashboard.title = "My Homelab";
    const res = await get("/");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");

    const html = await res.text();
    expect(html).toContain("<title>My Homelab</title>");
    expect(html).not.toContain("{{TITLE}}");
    expect(html).not.toContain("{{SCRIPT}}");
  });

  it("escapes HTML in the configured title", async () => {
    config.dashboard.title = "<script>alert(1)</script>";
    const html = await (await get("/")).text();

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("references a script that exists on disk", async () => {
    const html = await (await get("/")).text();
    const match = html.match(/src="\/static\/js\/([\w.]+)"/);
    expect(match).not.toBeNull();

    const script = await get(`/static/js/${match?.[1]}`);
    expect(script.status).toBe(200);
  });
});

describe("GET /static/*", () => {
  it("serves an existing asset", async () => {
    const res = await get("/static/css/dashboard.css");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("--card-shadow");
  });

  it("404s a missing asset", async () => {
    expect((await get("/static/css/nope.css")).status).toBe(404);
  });
});

describe("GET /api/stream", () => {
  it("opens an SSE stream whose first payload carries both events", async () => {
    const res = await get("/api/stream");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");

    const reader = res.body?.getReader();
    const { value } = await (reader as ReadableStreamDefaultReader<Uint8Array>).read();
    const payload = new TextDecoder().decode(value);

    expect(payload).toContain("event: containers");
    expect(payload).toContain("event: services");
    expect(payload).toContain(LAST_UPDATED);

    await reader?.cancel();
  });

  it("clears the idle timeout, since SSE connections are long-lived", async () => {
    let cleared = false;
    const res = await handleRequest(new Request("http://localhost/api/stream"), {
      clearTimeout: () => {
        cleared = true;
      },
    });

    expect(cleared).toBe(true);
    await res.body?.cancel();
  });
});

describe("GET /health", () => {
  // This must be the process's first /health call: checkHealth() caches its probe
  // for 5s and the cache isn't resettable from outside, so a prior call would be
  // served from it and the fetch counter below would read zero.
  it("reports 503 with the error, and reuses one probe across rapid calls", async () => {
    const realFetch = globalThis.fetch;
    let probes = 0;
    globalThis.fetch = (async () => {
      probes++;
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    try {
      const responses = await Promise.all([get("/health"), get("/health"), get("/health")]);

      for (const res of responses) {
        expect(res.status).toBe(503);
        const body = await json<HealthResponse>(res);
        expect(body.status).toBe("unhealthy");
        expect(body.error).toContain("ECONNREFUSED");
      }

      // Three requests, one upstream probe — that's the point of the cache.
      expect(probes).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("unknown routes", () => {
  it("404s", async () => {
    expect((await get("/nope")).status).toBe(404);
    expect((await get("/api/nope")).status).toBe(404);
  });
});
