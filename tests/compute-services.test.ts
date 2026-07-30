import { describe, expect, it } from "bun:test";
import type { Container } from "../src/types.ts";
import { computeServices } from "../src/utils.ts";

const MOCK_SERVICE_MAP = {
  jellyfin: {
    port: 8096,
    name: "Jellyfin",
    icon: "🎬",
    description: "Media Server",
    protocol: "http",
  },
};

const MOCK_CONTAINERS: Container[] = [
  {
    vmid: 100,
    name: "jellyfin",
    status: "running",
    node: "pve",
    ip: "192.168.1.100",
    uptime: 3600,
    memory_usage: 512 * 1024 * 1024,
    memory_max: 2048 * 1024 * 1024,
    service: MOCK_SERVICE_MAP.jellyfin,
  },
  {
    vmid: 101,
    name: "navidrome",
    status: "running",
    node: "pve",
    ip: "DHCP/Unknown",
    uptime: 1800,
    memory_usage: 256 * 1024 * 1024,
    memory_max: 1024 * 1024 * 1024,
    service: null,
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

describe("computeServices", () => {
  it("filters to running containers with a known IP and a service port", () => {
    const services = computeServices(MOCK_CONTAINERS);
    expect(services.length).toBe(1);
    expect(services[0].name).toBe("Jellyfin");
    expect(services[0].url).toBe("http://192.168.1.100:8096");
  });

  it("excludes containers with DHCP/Unknown IP", () => {
    const services = computeServices(MOCK_CONTAINERS);
    expect(services.every((s) => !s.url.includes("DHCP"))).toBe(true);
  });

  it("excludes stopped containers", () => {
    const services = computeServices(MOCK_CONTAINERS);
    expect(services.every((s) => s.container_name !== "stopped-ct")).toBe(true);
  });

  it("sorts services alphabetically by name", () => {
    const containers: Container[] = [
      {
        ...MOCK_CONTAINERS[0],
        name: "zebra",
        service: { port: 80, name: "Zebra", icon: "🦓", description: "Z" },
      },
      {
        ...MOCK_CONTAINERS[0],
        name: "alpha",
        ip: "192.168.1.2",
        service: { port: 80, name: "Alpha", icon: "🅰️", description: "A" },
      },
    ];
    const services = computeServices(containers);
    const names = services.map((s) => s.name);
    expect(names).toEqual(
      [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    );
  });

  it("uses https protocol when specified", () => {
    const containers: Container[] = [
      {
        ...MOCK_CONTAINERS[0],
        service: { ...MOCK_SERVICE_MAP.jellyfin, protocol: "https" },
      },
    ];
    const services = computeServices(containers);
    expect(services[0].url).toMatch(/^https:\/\//);
  });

  it("defaults to http when protocol is omitted", () => {
    const containers: Container[] = [
      {
        ...MOCK_CONTAINERS[0],
        service: { port: 8096, name: "Jellyfin", icon: "🎬", description: "Media Server" },
      },
    ];
    const services = computeServices(containers);
    expect(services[0].url).toMatch(/^http:\/\//);
  });
});
