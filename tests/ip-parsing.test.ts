import { describe, expect, it } from "bun:test";
import { extractIpFromConfig } from "../src/utils.ts";

describe("extractIpFromConfig", () => {
  it("strips subnet from static IP", () => {
    expect(extractIpFromConfig({ net0: "name=eth0,bridge=vmbr0,ip=192.168.1.100/24" })).toBe(
      "192.168.1.100",
    );
  });

  it("returns IP as-is when no subnet present", () => {
    expect(extractIpFromConfig({ net0: "name=eth0,bridge=vmbr0,ip=192.168.1.100" })).toBe(
      "192.168.1.100",
    );
  });

  it("returns null for DHCP (lowercase)", () => {
    expect(extractIpFromConfig({ net0: "name=eth0,bridge=vmbr0,ip=dhcp" })).toBeNull();
  });

  it("returns null for DHCP (uppercase)", () => {
    expect(extractIpFromConfig({ net0: "name=eth0,bridge=vmbr0,ip=DHCP" })).toBeNull();
  });

  it("returns null when no ip= key is present", () => {
    expect(extractIpFromConfig({ net0: "name=eth0,bridge=vmbr0" })).toBeNull();
  });

  it("returns null when no network keys exist", () => {
    expect(extractIpFromConfig({ hostname: "myhost", memory: 512 })).toBeNull();
  });

  it("returns the first interface IP when multiple net keys exist", () => {
    expect(
      extractIpFromConfig({
        net0: "name=eth0,bridge=vmbr0,ip=192.168.1.100/24",
        net1: "name=eth1,bridge=vmbr1,ip=10.0.0.5/24",
      }),
    ).toBe("192.168.1.100");
  });

  it("ignores non-net keys that contain ip-like strings", () => {
    expect(
      extractIpFromConfig({
        hostname: "myhost",
        network: "should-not-match",
        net0: "name=eth0,bridge=vmbr0,ip=10.0.0.1/24",
      }),
    ).toBe("10.0.0.1");
  });
});
