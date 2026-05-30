import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig, readServices } from "../src/config.ts";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "proxmox-test-"));
}

describe("readConfig", () => {
  it("returns defaults when config.toml is missing", () => {
    const dir = makeTmpDir();
    const result = readConfig(dir);
    expect(result.proxmox.host).toBe("your-proxmox-ip:8006");
    expect(result.proxmox.ssl_verify).toBe(false);
    expect(result.server.port).toBe(8000);
    expect(result.dashboard.auto_refresh_seconds).toBe(30);
  });

  it("uses PROXMOX_HOST env var in fallback", () => {
    const dir = makeTmpDir();
    process.env.PROXMOX_HOST = "192.168.1.1:8006";
    process.env.PROXMOX_USER = "admin@pam!mytoken";
    process.env.PROXMOX_TOKEN = "secret-token";
    const result = readConfig(dir);
    delete process.env.PROXMOX_HOST;
    delete process.env.PROXMOX_USER;
    delete process.env.PROXMOX_TOKEN;
    expect(result.proxmox.host).toBe("192.168.1.1:8006");
    expect(result.proxmox.user).toBe("admin@pam!mytoken");
    expect(result.proxmox.token).toBe("secret-token");
  });

  it("loads a valid config.toml", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "config.toml"),
      `
[proxmox]
host = "pve:8006"
user = "user@pam!tok"
token = "abc123"
ssl_verify = true

[server]
host = "0.0.0.0"
port = 8080

[dashboard]
auto_refresh_seconds = 60
title = "My Dashboard"
`,
    );
    const result = readConfig(dir);
    expect(result.proxmox.host).toBe("pve:8006");
    expect(result.proxmox.ssl_verify).toBe(true);
    expect(result.server.port).toBe(8080);
    expect(result.dashboard.title).toBe("My Dashboard");
  });
});

describe("readServices", () => {
  it("returns defaults when services.toml is missing", () => {
    const dir = makeTmpDir();
    const result = readServices(dir);
    expect("jellyfin" in result).toBe(true);
    expect(result.jellyfin.port).toBe(8096);
  });

  it("loads a valid services.toml", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "services.toml"),
      `
[services.myapp]
port = 3000
name = "My App"
icon = "🚀"
description = "An app"
`,
    );
    const result = readServices(dir);
    expect("myapp" in result).toBe(true);
    expect(result.myapp.port).toBe(3000);
  });

  it("returns empty object when services key is absent", () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "services.toml"), '[other]\nkey = "value"\n');
    expect(readServices(dir)).toEqual({});
  });
});
