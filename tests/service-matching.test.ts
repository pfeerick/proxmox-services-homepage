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

  describe("overlapping prefixes", () => {
    // Mirrors the real services.toml, where `unifi` is declared before
    // `unifi-os-server` — first-match-wins sent unifi-os-server-* to the
    // UniFi Controller on 8443 instead of UniFi OS on 11443.
    const OVERLAPPING: ServiceMap = {
      unifi: { port: 8443, name: "UniFi Controller", icon: "📶", description: "Network" },
      "unifi-os-server": { port: 11443, name: "UniFi OS", icon: "🖥️", description: "UniFi OS" },
    };

    it("prefers the longest matching prefix over definition order", () => {
      const result = getServiceInfo("unifi-os-server-2", OVERLAPPING);
      expect(result?.name).toBe("UniFi OS");
      expect(result?.port).toBe(11443);
    });

    it("still matches the shorter prefix when the longer one doesn't apply", () => {
      const result = getServiceInfo("unifi-controller-backup", OVERLAPPING);
      expect(result?.name).toBe("UniFi Controller");
      expect(result?.port).toBe(8443);
    });

    it("exact matches still win outright", () => {
      expect(getServiceInfo("unifi", OVERLAPPING)?.name).toBe("UniFi Controller");
      expect(getServiceInfo("unifi-os-server", OVERLAPPING)?.name).toBe("UniFi OS");
    });
  });
});
