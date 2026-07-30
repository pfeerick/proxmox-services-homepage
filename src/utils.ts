import type { Container, ServiceDefinition, ServiceInfo, ServiceMap } from "./types.ts";

/** Escape a string for safe interpolation into HTML text or a quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Extract a static IP from a Proxmox LXC network config string, or return null. */
export function extractIpFromConfig(lxcConfig: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(lxcConfig)) {
    if (!key.startsWith("net") || typeof value !== "string") continue;
    if (!value.includes("ip=")) continue;
    for (const part of value.split(",")) {
      if (part.trim().startsWith("ip=")) {
        const ipWithSubnet = part.trim().slice(3);
        if (ipWithSubnet.toLowerCase() !== "dhcp") {
          return ipWithSubnet.split("/")[0];
        }
      }
    }
  }
  return null;
}

/**
 * Look up service info for a container: exact name first, then longest prefix.
 *
 * Longest wins because the first match would otherwise be decided by definition
 * order in services.toml — a container named `unifi-os-server-2` matched `unifi`
 * (UniFi Controller, 8443) rather than `unifi-os-server` (UniFi OS, 11443) purely
 * because `unifi` was declared first.
 */
export function getServiceInfo(
  containerName: string,
  serviceMap: ServiceMap,
): ServiceDefinition | null {
  if (containerName in serviceMap) return serviceMap[containerName];

  let bestMatch: string | null = null;
  for (const serviceName of Object.keys(serviceMap)) {
    if (!containerName.startsWith(serviceName)) continue;
    if (bestMatch === null || serviceName.length > bestMatch.length) bestMatch = serviceName;
  }

  return bestMatch === null ? null : serviceMap[bestMatch];
}

/**
 * True if `current` (e.g. "1.3.14") is >= `min`, comparing major.minor.patch numerically.
 *
 * Prerelease and build suffixes are ignored: `Number("14-canary.1")` is NaN, which made
 * every comparison false and had the startup gate reject perfectly good newer Bun builds.
 * "1.4.0-canary.1" is therefore treated as "1.4.0" — precise enough for a minimum check.
 */
export function satisfiesMinVersion(current: string, min: string): boolean {
  const parse = (version: string) =>
    version.split(".").map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isNaN(n) ? 0 : n;
    });
  const currentParts = parse(current);
  const minParts = parse(min);
  for (let i = 0; i < Math.max(currentParts.length, minParts.length); i++) {
    const c = currentParts[i] ?? 0;
    const m = minParts[i] ?? 0;
    if (c !== m) return c > m;
  }
  return true;
}

/** Derive the running-services list from a containers snapshot. */
export function computeServices(containers: Container[]): ServiceInfo[] {
  const services: ServiceInfo[] = [];
  for (const ct of containers) {
    if (ct.status === "running" && ct.ip !== "DHCP/Unknown" && ct.service?.port) {
      const protocol = ct.service.protocol ?? "http";
      services.push({
        name: ct.service.name,
        icon: ct.service.icon,
        url: `${protocol}://${ct.ip}:${ct.service.port}`,
        description: ct.service.description,
        container_name: ct.name,
      });
    }
  }
  return services.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}
