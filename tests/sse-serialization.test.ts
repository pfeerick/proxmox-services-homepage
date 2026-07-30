import { describe, expect, it } from "bun:test";
import { serializeSnapshot } from "../src/sse.ts";
import type { Container } from "../src/types.ts";

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
    name: "stopped-ct",
    status: "stopped",
    node: "pve",
    ip: "192.168.1.101",
    uptime: 0,
    memory_usage: 0,
    memory_max: 512 * 1024 * 1024,
    service: null,
  },
];

const TIMESTAMP = "2026-07-30T00:00:00.000Z";

/** Parse an SSE payload into a map of event name -> parsed data. */
function parseEvents(payload: string): Record<string, Record<string, unknown>> {
  const events: Record<string, Record<string, unknown>> = {};
  for (const block of payload.split("\n\n")) {
    const match = block.match(/^event: (\S+)\ndata: (.*)$/s);
    if (match) events[match[1]] = JSON.parse(match[2]);
  }
  return events;
}

describe("serializeSnapshot", () => {
  it("emits a containers event and a services event", () => {
    const events = parseEvents(serializeSnapshot(CONTAINERS, TIMESTAMP));
    expect(Object.keys(events).sort()).toEqual(["containers", "services"]);
  });

  it("reports every container but only the running, addressable services", () => {
    const events = parseEvents(serializeSnapshot(CONTAINERS, TIMESTAMP));
    expect(events.containers.total).toBe(2);
    expect(events.services.total).toBe(1);
  });

  it("stamps both events with the supplied timestamp", () => {
    const events = parseEvents(serializeSnapshot(CONTAINERS, TIMESTAMP));
    expect(events.containers.last_updated).toBe(TIMESTAMP);
    expect(events.services.last_updated).toBe(TIMESTAMP);
  });

  it("terminates the payload so a client can frame both events", () => {
    expect(serializeSnapshot(CONTAINERS, TIMESTAMP).endsWith("\n\n")).toBe(true);
  });

  it("handles an empty snapshot", () => {
    const events = parseEvents(serializeSnapshot([], TIMESTAMP));
    expect(events.containers.total).toBe(0);
    expect(events.services.total).toBe(0);
  });
});
