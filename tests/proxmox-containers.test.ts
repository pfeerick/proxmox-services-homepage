import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ProxmoxAPI } from "../src/proxmox.ts";
import type { ServiceMap } from "../src/types.ts";

const SERVICE_MAP: ServiceMap = {
  jellyfin: { port: 8096, name: "Jellyfin", icon: "🎬", description: "Media Server" },
};

const realFetch = globalThis.fetch;

/** Records every request path, and how many were in flight at once. */
interface FetchRecorder {
  paths: string[];
  maxConcurrent: number;
}

/**
 * Stub `fetch` with a routing table of path-suffix -> JSON body (or an Error to throw).
 * Every response is delayed a tick so overlapping requests are actually observable.
 */
function stubFetch(routes: Record<string, unknown>): FetchRecorder {
  const recorder: FetchRecorder = { paths: [], maxConcurrent: 0 };
  let inFlight = 0;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const path = url.slice(url.indexOf("/api2/json") + "/api2/json".length);
    recorder.paths.push(path);

    inFlight++;
    recorder.maxConcurrent = Math.max(recorder.maxConcurrent, inFlight);
    await Bun.sleep(5);
    inFlight--;

    const match = Object.keys(routes).find((route) => path === route);
    if (match === undefined) return new Response("Not Found", { status: 404 });
    if (routes[match] instanceof Error) throw routes[match];
    return Response.json({ data: routes[match] });
  }) as typeof fetch;

  return recorder;
}

let api: ProxmoxAPI;

beforeEach(() => {
  api = new ProxmoxAPI("pve.example:8006", "user@pam!tok", "secret");
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("getContainers", () => {
  it("returns containers from every node with service info resolved", async () => {
    stubFetch({
      "/nodes": [{ node: "pve1" }, { node: "pve2" }],
      "/nodes/pve1/lxc": [{ vmid: 100, name: "jellyfin", status: "running" }],
      "/nodes/pve2/lxc": [{ vmid: 200, name: "misc", status: "stopped" }],
      "/nodes/pve1/lxc/100/config": { net0: "name=eth0,ip=192.168.1.10/24" },
      "/nodes/pve2/lxc/200/config": { net0: "name=eth0,ip=192.168.1.20/24" },
    });

    const containers = await api.getContainers(SERVICE_MAP);

    expect(containers.map((c) => c.vmid).sort()).toEqual([100, 200]);
    const jellyfin = containers.find((c) => c.vmid === 100);
    expect(jellyfin?.ip).toBe("192.168.1.10");
    expect(jellyfin?.node).toBe("pve1");
    expect(jellyfin?.service?.name).toBe("Jellyfin");
    expect(containers.find((c) => c.vmid === 200)?.service).toBeNull();
  });

  it("fetches container details concurrently rather than one at a time", async () => {
    const recorder = stubFetch({
      "/nodes": [{ node: "pve1" }],
      "/nodes/pve1/lxc": [
        { vmid: 100, name: "a", status: "stopped" },
        { vmid: 101, name: "b", status: "stopped" },
        { vmid: 102, name: "c", status: "stopped" },
      ],
      "/nodes/pve1/lxc/100/config": { net0: "ip=192.168.1.1/24" },
      "/nodes/pve1/lxc/101/config": { net0: "ip=192.168.1.2/24" },
      "/nodes/pve1/lxc/102/config": { net0: "ip=192.168.1.3/24" },
    });

    await api.getContainers(SERVICE_MAP);

    // Serial fetching would never exceed one request in flight.
    expect(recorder.maxConcurrent).toBeGreaterThan(1);
  });

  it("propagates a failure to list nodes so the caller can keep its cache", async () => {
    stubFetch({ "/nodes": new Error("ECONNREFUSED") });
    await expect(api.getContainers(SERVICE_MAP)).rejects.toThrow("ECONNREFUSED");
  });

  it("propagates a failure to list a node's containers", async () => {
    stubFetch({
      "/nodes": [{ node: "pve1" }],
      "/nodes/pve1/lxc": new Error("gateway timeout"),
    });
    await expect(api.getContainers(SERVICE_MAP)).rejects.toThrow("gateway timeout");
  });

  it("tolerates one container's config lookup failing", async () => {
    stubFetch({
      "/nodes": [{ node: "pve1" }],
      "/nodes/pve1/lxc": [
        { vmid: 100, name: "jellyfin", status: "running" },
        { vmid: 101, name: "broken", status: "stopped" },
      ],
      "/nodes/pve1/lxc/100/config": { net0: "name=eth0,ip=192.168.1.10/24" },
      // 101's config is absent from the routing table -> 404 -> best-effort skip
    });

    const containers = await api.getContainers(SERVICE_MAP);

    expect(containers).toHaveLength(2);
    expect(containers.find((c) => c.vmid === 100)?.ip).toBe("192.168.1.10");
    expect(containers.find((c) => c.vmid === 101)?.ip).toBe("DHCP/Unknown");
  });

  it("returns an empty list when a reachable cluster has no containers", async () => {
    stubFetch({ "/nodes": [{ node: "pve1" }], "/nodes/pve1/lxc": [] });
    expect(await api.getContainers(SERVICE_MAP)).toEqual([]);
  });

  it("falls back to CT-<vmid> when a container has no name", async () => {
    stubFetch({
      "/nodes": [{ node: "pve1" }],
      "/nodes/pve1/lxc": [{ vmid: 100, status: "stopped" }],
      "/nodes/pve1/lxc/100/config": { net0: "ip=192.168.1.1/24" },
    });
    expect((await api.getContainers(SERVICE_MAP))[0].name).toBe("CT-100");
  });
});
