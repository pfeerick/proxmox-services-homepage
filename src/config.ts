import { existsSync, readFileSync, statSync } from "node:fs";
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

type PartialConfig = {
  [K in keyof AppConfig]?: Partial<AppConfig[K]>;
};

/**
 * Merges a parsed config.toml over the defaults, section by section.
 *
 * A hand-edited config.toml is easy to get wrong — a missing [server] or
 * [dashboard] table used to leave the section `undefined`, and the first
 * property read (e.g. `config.server.host`) threw. Filling the gaps from the
 * defaults keeps the server up on a partial config and reports what was missing.
 */
function mergeConfig(parsed: PartialConfig): AppConfig {
  const defaults = defaultConfig();
  const missing = (Object.keys(defaults) as Array<keyof AppConfig>).filter((key) => !parsed[key]);
  if (missing.length > 0) {
    console.warn(`⚠️  config.toml is missing [${missing.join("], [")}] — using defaults`);
  }
  return {
    proxmox: { ...defaults.proxmox, ...parsed.proxmox },
    server: { ...defaults.server, ...parsed.server },
    dashboard: { ...defaults.dashboard, ...parsed.dashboard },
  };
}

export function readConfig(dir: string = APP_DIR): AppConfig {
  const path = join(dir, "config.toml");
  if (!existsSync(path)) {
    console.warn("⚠️  config.toml not found — using environment variables or defaults");
    return defaultConfig();
  }
  const text = readFileSync(path, "utf-8");
  return mergeConfig(Bun.TOML.parse(text) as PartialConfig);
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

/** Reads the Bun version pinned in .mise.toml, or null if absent/unset. */
export function readMinBunVersion(dir: string = APP_DIR): string | null {
  const path = join(dir, ".mise.toml");
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf-8");
  const parsed = Bun.TOML.parse(text) as { tools?: { bun?: string } };
  return parsed.tools?.bun ?? null;
}

export let config: AppConfig = readConfig();
export let serviceMap: ServiceMap = readServices();

let reloadCallback: (() => void) | null = null;

export function onReload(cb: () => void): void {
  reloadCallback = cb;
}

export function reloadConfigs(): void {
  const previousConfig = config;
  const previousServiceMap = serviceMap;

  try {
    console.log("🔄 Reloading configuration files...");
    config = readConfig();
    serviceMap = readServices();
    console.log(`✅ Loaded ${Object.keys(serviceMap).length} service definitions`);
  } catch (e) {
    console.error("❌ Error reloading configs — keeping the previous configuration:", e);
    config = previousConfig;
    serviceMap = previousServiceMap;
    return;
  }

  // The callback runs outside the block above but still needs guarding: it rebuilds
  // the Proxmox client, which reads the ssl_verify CA file from disk. An unhandled
  // throw here would escape into the watcher's interval callback and take the
  // process down, so a bad reload rolls back instead.
  try {
    reloadCallback?.();
  } catch (e) {
    console.error("❌ Error applying reloaded config — rolling back:", e);
    config = previousConfig;
    serviceMap = previousServiceMap;
    try {
      reloadCallback?.();
    } catch (rollbackError) {
      console.error("❌ Rollback failed:", rollbackError);
    }
  }
}

const WATCH_POLL_INTERVAL_MS = 1000;

// Polls mtimes rather than using fs.watch: many editors (VS Code included) save
// via write-temp-then-rename, which fs.watch's directory-level events can miss
// or deliver late — mtime polling is immune to that regardless of write pattern.
export function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

export function startFileWatcher(): void {
  const configPath = join(APP_DIR, "config.toml");
  const servicesPath = join(APP_DIR, "services.toml");
  let lastConfigMtime = mtimeOf(configPath);
  let lastServicesMtime = mtimeOf(servicesPath);

  setInterval(() => {
    const configMtime = mtimeOf(configPath);
    const servicesMtime = mtimeOf(servicesPath);
    if (configMtime === lastConfigMtime && servicesMtime === lastServicesMtime) return;
    lastConfigMtime = configMtime;
    lastServicesMtime = servicesMtime;
    console.log("📁 Config files changed");
    reloadConfigs();
  }, WATCH_POLL_INTERVAL_MS).unref();

  console.log("👁️  File watcher started — configs will auto-reload on changes");
}
