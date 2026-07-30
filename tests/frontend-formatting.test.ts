import { describe, expect, it } from "bun:test";
// @ts-expect-error — plain JS frontend module, no type declarations
import { createQuickLinks, formatMemory, formatUptime } from "../static/js/containers.js";
// @ts-expect-error — plain JS frontend module, no type declarations
import { escapeHtml } from "../static/js/utils.js";

describe("formatUptime", () => {
  it("returns null for a stopped container", () => {
    expect(formatUptime(0)).toBeNull();
    expect(formatUptime(undefined)).toBeNull();
  });

  it("shows minutes under an hour", () => {
    expect(formatUptime(59)).toBe("0m");
    expect(formatUptime(90 * 60)).toBe("1h 30m");
  });

  it("shows hours and minutes under a day", () => {
    expect(formatUptime(3600)).toBe("1h 0m");
    expect(formatUptime(3600 + 25 * 60)).toBe("1h 25m");
  });

  it("switches to days and hours past 24h, dropping minutes", () => {
    expect(formatUptime(86400)).toBe("1d 0h");
    expect(formatUptime(86400 * 3 + 3600 * 5 + 42 * 60)).toBe("3d 5h");
  });
});

describe("formatMemory", () => {
  it("returns null when the container reports no limit", () => {
    expect(formatMemory(0, 0)).toBeNull();
  });

  it("uses MB below a 1 GB limit", () => {
    expect(formatMemory(128 * 1024 * 1024, 512 * 1024 * 1024)).toBe("128 / 512 MB");
  });

  it("switches to GB at a 1 GB limit", () => {
    expect(formatMemory(512 * 1024 * 1024, 2048 * 1024 * 1024)).toBe("0.5 / 2.0 GB");
  });
});

describe("createQuickLinks", () => {
  const base = {
    status: "running",
    ip: "192.168.1.50",
    service: { port: 8096, name: "Jellyfin", icon: "🎬" },
  };

  it("renders nothing for a stopped container", () => {
    expect(createQuickLinks({ ...base, status: "stopped" })).toBe("");
  });

  it("warns instead of linking when the IP is unknown", () => {
    const html = createQuickLinks({ ...base, ip: "DHCP/Unknown" });
    expect(html).toContain("IP address not detected");
    expect(html).not.toContain("<a href");
  });

  it("links to the service port, plus SSH", () => {
    const html = createQuickLinks(base);
    expect(html).toContain('href="http://192.168.1.50:8096"');
    expect(html).toContain('href="ssh://192.168.1.50:22"');
  });

  it("honours an https service protocol", () => {
    const html = createQuickLinks({ ...base, service: { ...base.service, protocol: "https" } });
    expect(html).toContain('href="https://192.168.1.50:8096"');
  });

  it("treats an unrecognised protocol as http rather than emitting it", () => {
    const html = createQuickLinks({
      ...base,
      service: { ...base.service, protocol: "javascript:" },
    });
    expect(html).toContain('href="http://192.168.1.50:8096"');
    expect(html).not.toContain("javascript:");
  });

  it("falls back to generic ports when the container has no service", () => {
    const html = createQuickLinks({ ...base, service: null });
    expect(html).toContain('href="http://192.168.1.50:80"');
    expect(html).toContain('href="http://192.168.1.50:8080"');
  });

  it("escapes a hostile IP field rather than breaking out of the attribute", () => {
    const html = createQuickLinks({ ...base, ip: '"><img src=x onerror=alert(1)>' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&quot;");
  });
});

describe("escapeHtml (frontend)", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("coerces non-strings instead of throwing", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(null)).toBe("null");
  });
});
