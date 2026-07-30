import { config, onReload, serviceMap } from "./config.ts";
import { ProxmoxAPI } from "./proxmox.ts";
import { pushToSubscribers, serializeSnapshot } from "./sse.ts";
import type { Container } from "./types.ts";

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

/** Replace the current snapshot. Written by the refresh loop; seeded by tests. */
export function setCache(snapshot: CacheSnapshot): void {
  cache = snapshot;
}

// /health is unauthenticated, and each call previously hit the Proxmox API — so
// anything hammering the endpoint (an over-eager uptime monitor, or a hostile
// client) turned into the same load against Proxmox. Reuse a recent probe instead.
const HEALTH_PROBE_TTL_MS = 5_000;

interface HealthProbe {
  result: { ok: boolean; error?: string };
  at: number;
}

let lastProbe: HealthProbe | null = null;
let inFlightProbe: Promise<{ ok: boolean; error?: string }> | null = null;

export async function checkHealth(): Promise<{ ok: boolean; error?: string }> {
  if (lastProbe && Date.now() - lastProbe.at < HEALTH_PROBE_TTL_MS) return lastProbe.result;

  // Concurrent callers share one probe rather than each opening their own.
  if (!inFlightProbe) {
    const probe = proxmox.checkConnection();
    inFlightProbe = probe;
    probe
      .then((result) => {
        lastProbe = { result, at: Date.now() };
      })
      .finally(() => {
        if (inFlightProbe === probe) inFlightProbe = null;
      });
  }

  return inFlightProbe;
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
    setCache({ containers, last_updated });

    pushToSubscribers(serializeSnapshot(containers, last_updated));

    await waitOrTrigger(interval);
  }
}

// Rebuild ProxmoxAPI instance and force a refresh whenever config is reloaded
onReload(() => {
  proxmox = buildProxmox();
  // The probe describes the old client's connection — discard it so /health
  // reflects the new credentials straight away.
  lastProbe = null;
  requestImmediateRefresh();
});

let started = false;

/**
 * Start the background refresh loop. Called once from src/index.ts.
 *
 * Deliberately not a module-level side effect: importing this module — directly or
 * transitively, as the router does — would otherwise immediately start polling
 * Proxmox, which makes anything downstream untestable.
 */
export function startRefreshLoop(): void {
  if (started) return;
  started = true;
  refreshLoop().catch((e) => console.error("Cache refresh loop crashed:", e));
}
