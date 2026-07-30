import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// The change detectors cache their last payload inside the render functions, so
// priming them means actually rendering — which needs a DOM.
GlobalRegistrator.register();

// register() swaps process-wide globals, including Response and Blob. Bun runs test
// files in one process, so leaving it registered breaks later files — the route
// tests read a Response body and got "[object Blob]".
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

// @ts-expect-error — plain JS frontend module, no type declarations
const { hasContainersChanged, renderContainers } = await import("../static/js/containers.js");
// @ts-expect-error — plain JS frontend module, no type declarations
const { hasServicesChanged, renderServices } = await import("../static/js/services.js");

/** The elements the render functions look up by id. */
function mountDom(): void {
  document.body.innerHTML = `
    <div id="stat-total"></div>
    <div id="stat-running"></div>
    <div id="stat-stopped"></div>
    <div id="containers-grid"></div>
    <div id="services-grid"></div>
    <div id="service-count"></div>
    <div id="services-empty"></div>
  `;
}

beforeEach(mountDom);

// These gate whether the DOM is rebuilt on every SSE push. Too narrow a fingerprint
// and the UI silently stops updating; too broad and it re-renders constantly. The
// CHANGELOG records one round of "broaden change-detection fingerprints" already,
// so pin down exactly which fields count.

const container = (over: Record<string, unknown> = {}) => ({
  vmid: 100,
  name: "jellyfin",
  status: "running",
  node: "pve",
  ip: "192.168.1.100",
  uptime: 3600,
  memory_usage: 1024,
  memory_max: 2048,
  service: null,
  ...over,
});

const prime = (containers: unknown[]) => renderContainers({ containers });

describe("hasContainersChanged", () => {
  it("is true on the very first payload, before anything has rendered", () => {
    expect(hasContainersChanged({ containers: [container()] })).toBe(true);
  });

  it("is false when an identical payload arrives again", () => {
    prime([container()]);
    expect(hasContainersChanged({ containers: [container()] })).toBe(false);
  });

  for (const [field, value] of [
    ["status", "stopped"],
    ["ip", "192.168.1.200"],
    ["name", "renamed"],
    ["vmid", 999],
  ] as const) {
    it(`is true when ${field} changes`, () => {
      prime([container()]);
      expect(hasContainersChanged({ containers: [container({ [field]: value })] })).toBe(true);
    });
  }

  it("is true when a container is added", () => {
    prime([container()]);
    expect(hasContainersChanged({ containers: [container(), container({ vmid: 101 })] })).toBe(
      true,
    );
  });

  it("ignores ordering, since the API doesn't guarantee it", () => {
    const a = container({ vmid: 100 });
    const b = container({ vmid: 101 });
    prime([a, b]);
    expect(hasContainersChanged({ containers: [b, a] })).toBe(false);
  });

  it("ignores uptime, which ticks constantly and would force a re-render", () => {
    prime([container({ uptime: 100 })]);
    expect(hasContainersChanged({ containers: [container({ uptime: 200 })] })).toBe(false);
  });
});

const service = (over: Record<string, unknown> = {}) => ({
  name: "Jellyfin",
  icon: "🎬",
  url: "http://192.168.1.100:8096",
  description: "Media Server",
  container_name: "jellyfin",
  ...over,
});

describe("hasServicesChanged", () => {
  const primeServices = (services: unknown[]) => renderServices({ services });

  it("is false when an identical payload arrives again", () => {
    primeServices([service()]);
    expect(hasServicesChanged({ services: [service()] })).toBe(false);
  });

  for (const [field, value] of [
    ["url", "http://192.168.1.100:9999"],
    ["name", "Jellyfin HD"],
    ["icon", "📺"],
    ["description", "Something else"],
    // Rendered into each card's title attribute, so it has to count too.
    ["container_name", "jellyfin-2"],
  ] as const) {
    it(`is true when ${field} changes`, () => {
      primeServices([service()]);
      expect(hasServicesChanged({ services: [service({ [field]: value })] })).toBe(true);
    });
  }

  it("is true when the service count changes", () => {
    primeServices([service()]);
    expect(hasServicesChanged({ services: [service(), service({ name: "Other" })] })).toBe(true);
  });

  it("ignores ordering", () => {
    const a = service({ name: "Alpha", url: "http://a" });
    const b = service({ name: "Beta", url: "http://b" });
    primeServices([a, b]);
    expect(hasServicesChanged({ services: [b, a] })).toBe(false);
  });
});

describe("render output", () => {
  it("renders one card per container and updates the stat counters", () => {
    prime([container(), container({ vmid: 101, status: "stopped" })]);

    expect(document.getElementById("stat-total")?.textContent).toBe("2");
    expect(document.getElementById("stat-running")?.textContent).toBe("1");
    expect(document.getElementById("stat-stopped")?.textContent).toBe("1");
    expect(document.querySelectorAll("#containers-grid .container-card")).toHaveLength(2);
  });

  it("escapes a hostile container name instead of injecting markup", () => {
    prime([container({ name: "<img src=x onerror=alert(1)>" })]);

    const grid = document.getElementById("containers-grid");
    expect(grid?.querySelector("img")).toBeNull();
    expect(grid?.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("shows the empty state when no services are running", () => {
    renderServices({ services: [] });

    expect(document.getElementById("services-empty")?.style.display).toBe("block");
    expect(document.getElementById("service-count")?.style.display).toBe("none");
    expect(document.getElementById("services-grid")?.innerHTML).toBe("");
  });

  it("pluralises the running-service count", () => {
    renderServices({ services: [service()] });
    expect(document.getElementById("service-count")?.textContent).toBe("1 service running");

    renderServices({ services: [service(), service({ name: "Other", url: "http://b" })] });
    expect(document.getElementById("service-count")?.textContent).toBe("2 services running");
  });
});
