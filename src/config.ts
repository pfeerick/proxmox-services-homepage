import { existsSync, readFileSync, watch } from "node:fs";
import { join } from "node:path";
import type { AppConfig, ServiceMap } from "./types.ts";

export const APP_DIR = join(import.meta.dir, "..");

function defaultConfig(): AppConfig {
  return {
    proxmox: {
      host: process.env.PROXMOX_HOST ?? "your-proxmox-ip:8006",
      user: process.env.PROXMOX_USER ?? "api@pam!dashboard",
      token: process.env.PROXMOX_TOKEN ?? "your-api-token-here",
      ssl_verify: false,
    },
    server: { host: "0.0.0.0", port: 8000 },
    dashboard: { auto_refresh_seconds: 30, title: "Proxmox Container Dashboard" },
  };
}

export function readConfig(dir: string = APP_DIR): AppConfig {
  const path = join(dir, "config.toml");
  if (!existsSync(path)) {
    console.warn("⚠️  config.toml not found — using environment variables or defaults");
    return defaultConfig();
  }
  const text = readFileSync(path, "utf-8");
  return Bun.TOML.parse(text) as unknown as AppConfig;
}

export function readServices(dir: string = APP_DIR): ServiceMap {
  const path = join(dir, "services.toml");
  if (!existsSync(path)) {
    console.warn("⚠️  services.toml not found — using default service definitions");
    return {
      jellyfin: { port: 8096, name: "Jellyfin", icon: "🎬", description: "Media Server" },
      homepage: { port: 3000, name: "Homepage", icon: "🏡", description: "Dashboard" },
    };
  }
  const text = readFileSync(path, "utf-8");
  const parsed = Bun.TOML.parse(text) as { services?: ServiceMap };
  return parsed.services ?? {};
}

export let config: AppConfig = readConfig();
export let serviceMap: ServiceMap = readServices();

let reloadCallback: (() => void) | null = null;

export function onReload(cb: () => void): void {
  reloadCallback = cb;
}

export function reloadConfigs(): void {
  try {
    console.log("🔄 Reloading configuration files...");
    config = readConfig();
    serviceMap = readServices();
    console.log(`✅ Loaded ${Object.keys(serviceMap).length} service definitions`);
  } catch (e) {
    console.error("❌ Error reloading configs:", e);
  }
  reloadCallback?.();
}

export function startFileWatcher(): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(APP_DIR, { persistent: false }, (_, filename) => {
    if (!filename || !["config.toml", "services.toml"].includes(filename)) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`📁 Config file changed: ${filename}`);
      reloadConfigs();
    }, 100);
  });

  console.log("👁️  File watcher started — configs will auto-reload on changes");
}
