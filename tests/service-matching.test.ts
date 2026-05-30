import { describe, expect, it } from "bun:test";
import type { ServiceMap } from "../src/types.ts";
import { getServiceInfo } from "../src/utils.ts";

const MOCK_SERVICE_MAP: ServiceMap = {
  jellyfin: {
    port: 8096,
    name: "Jellyfin",
    icon: "🎬",
    description: "Media Server",
    protocol: "http",
  },
  navidrome: {
    port: 4533,
    name: "Navidrome",
    icon: "🎵",
    description: "Music Server",
    protocol: "http",
  },
};

describe("getServiceInfo", () => {
  it("returns service on exact name match", () => {
    const result = getServiceInfo("jellyfin", MOCK_SERVICE_MAP);
    expect(result?.name).toBe("Jellyfin");
    expect(result?.port).toBe(8096);
  });

  it("returns service on prefix match", () => {
    const result = getServiceInfo("jellyfin-001", MOCK_SERVICE_MAP);
    expect(result?.name).toBe("Jellyfin");
  });

  it("returns service on prefix match with suffix", () => {
    const result = getServiceInfo("navidrome-music", MOCK_SERVICE_MAP);
    expect(result?.name).toBe("Navidrome");
  });

  it("returns null for unknown container", () => {
    expect(getServiceInfo("unknown-service", MOCK_SERVICE_MAP)).toBeNull();
  });

  it("returns null when service map is empty", () => {
    expect(getServiceInfo("jellyfin", {})).toBeNull();
  });
});
