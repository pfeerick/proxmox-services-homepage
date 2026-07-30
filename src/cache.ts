import { config, onReload, serviceMap } from "./config.ts";
import { ProxmoxAPI } from "./proxmox.ts";
import { pushToSubscribers } from "./sse.ts";
import type { Container } from "./types.ts";
import { computeServices } from "./utils.ts";

export interface CacheSnapshot {
  containers: Container[];
  last_updated: string | null;
}

let cache: CacheSnapshot = { containers: [], last_updated: null };

let proxmox = buildProxmox();

function buildProxmox(): ProxmoxAPI {
  return new ProxmoxAPI(
    config.proxmox.host,
    config.proxmox.user,
    config.proxmox.token,
    config.proxmox.ssl_verify,
  );
}

export function getCache(): CacheSnapshot {
  return cache;
}

export async function checkHealth(): Promise<{ ok: boolean; error?: string }> {
  return proxmox.checkConnection();
}

// Resolving this skips the current wait interval and triggers an immediate refresh
let triggerRefresh: (() => void) | null = null;

function waitOrTrigger(seconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    // Both paths go through finish(), which cancels the timer. Without that, a
    // triggered wait left its timeout pending; when it eventually fired it set
    // triggerRefresh back to null — silently disarming the *next* iteration's
    // trigger, so the reload after a triggered one wouldn't refresh immediately.
    const finish = () => {
      clearTimeout(timer);
      triggerRefresh = null;
      resolve();
    };
    const timer = setTimeout(finish, seconds * 1000);
    triggerRefresh = finish;
  });
}

export function requestImmediateRefresh(): void {
  triggerRefresh?.();
}

async function refreshLoop(): Promise<never> {
  while (true) {
    const interval = config.dashboard.auto_refresh_seconds;
    const currentProxy = proxmox;
    const currentServiceMap = serviceMap;

    // A failed poll must not clobber a good snapshot — a transient Proxmox outage
    // would otherwise empty the dashboard until the next successful refresh.
    // An empty-but-successful result is still a real answer, so it does update.
    let containers: Container[];
    try {
      containers = await currentProxy.getContainers(currentServiceMap);
    } catch (e) {
      console.error("Error connecting to Proxmox — keeping last known containers:", e);
      await waitOrTrigger(interval);
      continue;
    }

    const last_updated = new Date().toISOString();
    cache = { containers, last_updated };

    const services = computeServices(containers);
    pushToSubscribers(
      `event: containers\ndata: ${JSON.stringify({ containers, last_updated, total: containers.length })}\n\n` +
        `event: services\ndata: ${JSON.stringify({ services, last_updated, total: services.length })}\n\n`,
    );

    await waitOrTrigger(interval);
  }
}

// Rebuild ProxmoxAPI instance and force a refresh whenever config is reloaded
onReload(() => {
  proxmox = buildProxmox();
  requestImmediateRefresh();
});

// Start the background refresh loop when this module is first imported
refreshLoop().catch((e) => console.error("Cache refresh loop crashed:", e));
